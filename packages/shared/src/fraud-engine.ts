import { FraudDecision, FraudContextType, FraudSeverity, FraudSignalType } from './enums.js';
import type { FraudRule } from './types.js';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface FraudSignalInput {
  signal_type: string;
  severity: string;
  payload?: Record<string, unknown>;
}

export interface FraudEvaluationContext {
  context_type: string;
  context_id: string;
  actor_type: string;
  actor_id: string;
  amount: string;
  currency: string;
  signals: FraudSignalInput[];
  metadata?: Record<string, unknown>;
}

export interface FraudEvaluationResult {
  decision: string;
  matched_rules: { rule_id: string; name: string; action: string; severity: string }[];
  reasons: string[];
}

interface Condition {
  field: string;
  op: string;
  value: unknown;
}

// ── Decision priority ───────────────────────────────────────────────────────

const DECISION_PRIORITY: Record<string, number> = {
  [FraudDecision.FREEZE]: 5,
  [FraudDecision.BLOCK]: 4,
  [FraudDecision.HOLD]: 3,
  [FraudDecision.STEP_UP]: 2,
  [FraudDecision.ALLOW]: 1,
};

/** Returns numeric priority for a fraud decision (higher = more restrictive). */
export function getDecisionPriority(decision: string): number {
  return DECISION_PRIORITY[decision] ?? 0;
}

// ── Field resolution ────────────────────────────────────────────────────────

/**
 * Resolves a condition field name to its value from the evaluation context.
 *
 * Supported fields:
 * - `amount`       → numeric value from context.amount
 * - `currency`     → context.currency string
 * - `actor_type`   → context.actor_type string
 * - `signals`      → string[] of signal_type values from context.signals
 * - `signal_count` → number of signals
 * - `hour_of_day`  → UTC hour from metadata.timestamp, or current UTC hour
 * - `metadata.*`   → value from context.metadata by key (e.g. `metadata.foo`)
 */
function resolveField(field: string, context: FraudEvaluationContext): unknown {
  switch (field) {
    case 'amount':
      return Number(context.amount);
    case 'currency':
      return context.currency;
    case 'actor_type':
      return context.actor_type;
    case 'signals':
      return context.signals.map((s) => s.signal_type);
    case 'signal_count':
      return context.signals.length;
    case 'hour_of_day': {
      const ts = context.metadata?.timestamp;
      if (ts) {
        return new Date(ts as string | number).getUTCHours();
      }
      return new Date().getUTCHours();
    }
    default:
      if (field.startsWith('metadata.')) {
        const key = field.slice('metadata.'.length);
        return context.metadata?.[key];
      }
      return undefined;
  }
}

// ── Condition evaluator ─────────────────────────────────────────────────────

/** Evaluates a single condition against the given context. */
export function evaluateCondition(condition: Condition, context: FraudEvaluationContext): boolean {
  const resolved = resolveField(condition.field, context);
  const { op, value } = condition;

  switch (op) {
    case 'eq':
      return resolved === value || String(resolved) === String(value);
    case 'neq':
      return resolved !== value && String(resolved) !== String(value);
    case 'gt':
      return Number(resolved) > Number(value);
    case 'gte':
      return Number(resolved) >= Number(value);
    case 'lt':
      return Number(resolved) < Number(value);
    case 'lte':
      return Number(resolved) <= Number(value);
    case 'contains':
      if (Array.isArray(resolved)) {
        return resolved.includes(value as string);
      }
      return String(resolved).includes(String(value));
    case 'between': {
      if (!Array.isArray(value) || value.length !== 2) return false;
      const num = Number(resolved);
      return num >= Number(value[0]) && num <= Number(value[1]);
    }
    case 'in':
      if (Array.isArray(value)) {
        return value.some((v) => String(v) === String(resolved));
      }
      return false;
    default:
      return false;
  }
}

// ── Rule evaluator ──────────────────────────────────────────────────────────

/** Evaluates a set of fraud rules against a context and returns the result. */
export function evaluateFraudRules(
  context: FraudEvaluationContext,
  rules: FraudRule[],
): FraudEvaluationResult {
  const applicable = rules
    .filter((r) => r.enabled)
    .filter((r) => r.applies_to_context === context.context_type || r.applies_to_context === 'ALL')
    .sort((a, b) => a.priority - b.priority);

  const matched_rules: FraudEvaluationResult['matched_rules'] = [];
  const reasons: string[] = [];

  for (const rule of applicable) {
    let conditions: Condition[];
    try {
      conditions = JSON.parse(rule.conditions_json) as Condition[];
    } catch {
      // Skip rules with malformed conditions_json
      continue;
    }

    const allMatch = conditions.every((cond) => evaluateCondition(cond, context));
    if (allMatch) {
      matched_rules.push({
        rule_id: rule.id,
        name: rule.name,
        action: rule.action,
        severity: rule.severity,
      });
      reasons.push(`Rule "${rule.name}" matched → ${rule.action}`);
    }
  }

  let decision: string = FraudDecision.ALLOW;
  for (const mr of matched_rules) {
    if (getDecisionPriority(mr.action) > getDecisionPriority(decision)) {
      decision = mr.action;
    }
  }

  return { decision, matched_rules, reasons };
}

// ── Default rules ───────────────────────────────────────────────────────────

export const DEFAULT_FRAUD_RULES: Omit<FraudRule, 'id' | 'version_id'>[] = [
  {
    name: 'Large single transaction',
    applies_to_context: FraudContextType.TXN,
    severity: FraudSeverity.WARN,
    action: FraudDecision.HOLD,
    conditions_json: JSON.stringify([
      { field: 'amount', op: 'gt', value: '50000' },
      { field: 'currency', op: 'eq', value: 'BBD' },
    ]),
    priority: 10,
    enabled: true,
  },
  {
    name: 'Very large transaction',
    applies_to_context: FraudContextType.TXN,
    severity: FraudSeverity.CRITICAL,
    action: FraudDecision.BLOCK,
    conditions_json: JSON.stringify([
      { field: 'amount', op: 'gt', value: '100000' },
      { field: 'currency', op: 'eq', value: 'BBD' },
    ]),
    priority: 5,
    enabled: true,
  },
  {
    name: 'New device detected',
    applies_to_context: 'ALL',
    severity: FraudSeverity.INFO,
    action: FraudDecision.STEP_UP,
    conditions_json: JSON.stringify([
      { field: 'signals', op: 'contains', value: FraudSignalType.NEW_DEVICE },
    ]),
    priority: 20,
    enabled: true,
  },
  {
    name: 'Device mismatch',
    applies_to_context: 'ALL',
    severity: FraudSeverity.WARN,
    action: FraudDecision.HOLD,
    conditions_json: JSON.stringify([
      { field: 'signals', op: 'contains', value: FraudSignalType.DEVICE_MISMATCH },
    ]),
    priority: 15,
    enabled: true,
  },
  {
    name: 'Multiple accounts on same device',
    applies_to_context: 'ALL',
    severity: FraudSeverity.CRITICAL,
    action: FraudDecision.FREEZE,
    conditions_json: JSON.stringify([
      { field: 'signals', op: 'contains', value: FraudSignalType.MULTI_ACCOUNT_DEVICE },
    ]),
    priority: 1,
    enabled: true,
  },
  {
    name: 'Rapid cash-in/out pattern',
    applies_to_context: FraudContextType.TXN,
    severity: FraudSeverity.WARN,
    action: FraudDecision.HOLD,
    conditions_json: JSON.stringify([
      { field: 'signals', op: 'contains', value: FraudSignalType.RAPID_CASH_IN_OUT },
    ]),
    priority: 12,
    enabled: true,
  },
  {
    name: 'High payout frequency',
    applies_to_context: FraudContextType.PAYOUT,
    severity: FraudSeverity.WARN,
    action: FraudDecision.HOLD,
    conditions_json: JSON.stringify([
      { field: 'signals', op: 'contains', value: FraudSignalType.HIGH_PAYOUT_FREQUENCY },
    ]),
    priority: 14,
    enabled: true,
  },
  {
    name: 'Beneficiary change before payout',
    applies_to_context: FraudContextType.PAYOUT,
    severity: FraudSeverity.WARN,
    action: FraudDecision.HOLD,
    conditions_json: JSON.stringify([
      { field: 'signals', op: 'contains', value: FraudSignalType.BENEFICIARY_CHANGE_PRE_PAYOUT },
    ]),
    priority: 13,
    enabled: true,
  },
  {
    name: 'Repeated payout failures',
    applies_to_context: FraudContextType.PAYOUT,
    severity: FraudSeverity.CRITICAL,
    action: FraudDecision.BLOCK,
    conditions_json: JSON.stringify([
      { field: 'signals', op: 'contains', value: FraudSignalType.REPEATED_PAYOUT_FAILURE },
    ]),
    priority: 6,
    enabled: true,
  },
  {
    name: 'Unusual hour activity',
    applies_to_context: 'ALL',
    severity: FraudSeverity.INFO,
    action: FraudDecision.STEP_UP,
    conditions_json: JSON.stringify([
      { field: 'hour_of_day', op: 'between', value: [0, 5] },
    ]),
    priority: 25,
    enabled: true,
  },
  {
    name: 'Velocity spike detected',
    applies_to_context: FraudContextType.TXN,
    severity: FraudSeverity.WARN,
    action: FraudDecision.HOLD,
    conditions_json: JSON.stringify([
      { field: 'signals', op: 'contains', value: FraudSignalType.VELOCITY_SPIKE },
    ]),
    priority: 11,
    enabled: true,
  },
  {
    name: 'Dormant account reactivation',
    applies_to_context: 'ALL',
    severity: FraudSeverity.INFO,
    action: FraudDecision.STEP_UP,
    conditions_json: JSON.stringify([
      { field: 'signals', op: 'contains', value: FraudSignalType.DORMANT_REACTIVATION },
    ]),
    priority: 22,
    enabled: true,
  },
  {
    name: 'Split transaction pattern',
    applies_to_context: FraudContextType.TXN,
    severity: FraudSeverity.WARN,
    action: FraudDecision.HOLD,
    conditions_json: JSON.stringify([
      { field: 'signals', op: 'contains', value: FraudSignalType.SPLIT_TXN_PATTERN },
    ]),
    priority: 16,
    enabled: true,
  },
  {
    name: 'Round amount pattern with high frequency',
    applies_to_context: FraudContextType.TXN,
    severity: FraudSeverity.INFO,
    action: FraudDecision.STEP_UP,
    conditions_json: JSON.stringify([
      { field: 'signals', op: 'contains', value: FraudSignalType.ROUND_AMOUNT_PATTERN },
      { field: 'signal_count', op: 'gte', value: 2 },
    ]),
    priority: 24,
    enabled: true,
  },
  {
    name: 'Critical severity signal present',
    applies_to_context: 'ALL',
    severity: FraudSeverity.CRITICAL,
    action: FraudDecision.BLOCK,
    conditions_json: JSON.stringify([
      { field: 'signal_count', op: 'gte', value: 1 },
      { field: 'metadata.has_critical_signal', op: 'eq', value: true },
    ]),
    priority: 3,
    enabled: true,
  },
  {
    name: 'Geo anomaly detected',
    applies_to_context: 'ALL',
    severity: FraudSeverity.WARN,
    action: FraudDecision.HOLD,
    conditions_json: JSON.stringify([
      { field: 'signals', op: 'contains', value: FraudSignalType.GEO_ANOMALY },
    ]),
    priority: 17,
    enabled: true,
  },
];
