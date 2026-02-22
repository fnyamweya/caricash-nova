import { describe, it, expect, vi } from 'vitest';
import {
  evaluateFraudRules,
  evaluateCondition,
  getDecisionPriority,
  DEFAULT_FRAUD_RULES,
} from '../fraud-engine.js';
import type { FraudEvaluationContext, FraudSignalInput } from '../fraud-engine.js';
import { createCircuitBreaker, CircuitBreakerOpenError } from '../circuit-breaker.js';
import { withRetry } from '../retry.js';
import { computeWebhookIdempotencyKey, parseWebhookPayload } from '../citibank-webhook.js';
import {
  BankAccountPurpose,
  ExternalTransferStatus,
  FraudDecision,
  SettlementSchedule,
  PayoutStatus,
  FraudSignalType,
  FraudContextType,
  FraudSeverity,
  CircuitBreakerState,
} from '../enums.js';
import type { FraudRule } from '../types.js';
import type { RetryConfig } from '../types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<FraudEvaluationContext> = {}): FraudEvaluationContext {
  return {
    context_type: FraudContextType.TXN,
    context_id: 'txn-001',
    actor_type: 'CUSTOMER',
    actor_id: 'actor-001',
    amount: '100.00',
    currency: 'BBD',
    signals: [],
    metadata: {},
    ...overrides,
  };
}

function makeRule(overrides: Partial<FraudRule> = {}): FraudRule {
  return {
    id: 'rule-001',
    version_id: 'v1',
    name: 'Test Rule',
    applies_to_context: FraudContextType.TXN,
    severity: FraudSeverity.WARN,
    action: FraudDecision.HOLD,
    conditions_json: JSON.stringify([{ field: 'amount', op: 'gt', value: '50000' }]),
    priority: 10,
    enabled: true,
    ...overrides,
  };
}

const RETRY_CONFIG: RetryConfig = {
  max_attempts: 3,
  base_delay_ms: 1,
  max_delay_ms: 2,
  backoff_multiplier: 1,
};

// ── 1. Fraud Engine Tests ────────────────────────────────────────────────────

describe('Fraud Engine', () => {
  describe('evaluateFraudRules', () => {
    it('returns ALLOW when no rules match', () => {
      const ctx = makeContext({ amount: '10.00' });
      const rules = [makeRule()];
      const result = evaluateFraudRules(ctx, rules);
      expect(result.decision).toBe(FraudDecision.ALLOW);
      expect(result.matched_rules).toHaveLength(0);
    });

    it('returns BLOCK on very large transaction (>100000)', () => {
      const ctx = makeContext({ amount: '150000' });
      const rules: FraudRule[] = DEFAULT_FRAUD_RULES.map((r, i) => ({
        ...r,
        id: `rule-${i}`,
        version_id: 'v1',
      }));
      const result = evaluateFraudRules(ctx, rules);
      expect(result.decision).toBe(FraudDecision.BLOCK);
    });

    it('returns HOLD on large transaction (>50000 but ≤100000)', () => {
      const ctx = makeContext({ amount: '75000' });
      const rules: FraudRule[] = DEFAULT_FRAUD_RULES.map((r, i) => ({
        ...r,
        id: `rule-${i}`,
        version_id: 'v1',
      }));
      const result = evaluateFraudRules(ctx, rules);
      expect(result.decision).toBe(FraudDecision.HOLD);
    });

    it('returns STEP_UP on new device signal', () => {
      const ctx = makeContext({
        signals: [{ signal_type: FraudSignalType.NEW_DEVICE, severity: FraudSeverity.INFO }],
      });
      const rules: FraudRule[] = DEFAULT_FRAUD_RULES.map((r, i) => ({
        ...r,
        id: `rule-${i}`,
        version_id: 'v1',
      }));
      const result = evaluateFraudRules(ctx, rules);
      expect(result.decision).toBe(FraudDecision.STEP_UP);
    });

    it('picks most restrictive decision when multiple signals match (FREEZE wins over HOLD)', () => {
      const ctx = makeContext({
        signals: [
          { signal_type: FraudSignalType.DEVICE_MISMATCH, severity: FraudSeverity.WARN },
          { signal_type: FraudSignalType.MULTI_ACCOUNT_DEVICE, severity: FraudSeverity.CRITICAL },
        ],
      });
      const rules: FraudRule[] = DEFAULT_FRAUD_RULES.map((r, i) => ({
        ...r,
        id: `rule-${i}`,
        version_id: 'v1',
      }));
      const result = evaluateFraudRules(ctx, rules);
      expect(result.decision).toBe(FraudDecision.FREEZE);
      expect(result.matched_rules.length).toBeGreaterThanOrEqual(2);
    });

    it('processes rules by priority ordering (lower priority value = higher precedence)', () => {
      const lowPriority = makeRule({
        id: 'low',
        priority: 100,
        action: FraudDecision.HOLD,
        conditions_json: JSON.stringify([{ field: 'amount', op: 'gt', value: '0' }]),
      });
      const highPriority = makeRule({
        id: 'high',
        priority: 1,
        action: FraudDecision.BLOCK,
        conditions_json: JSON.stringify([{ field: 'amount', op: 'gt', value: '0' }]),
      });
      const ctx = makeContext({ amount: '10' });
      const result = evaluateFraudRules(ctx, [lowPriority, highPriority]);
      // Both match; BLOCK is more restrictive
      expect(result.decision).toBe(FraudDecision.BLOCK);
      expect(result.matched_rules[0].rule_id).toBe('high');
    });

    it('returns ALLOW for empty rules array', () => {
      const ctx = makeContext();
      const result = evaluateFraudRules(ctx, []);
      expect(result.decision).toBe(FraudDecision.ALLOW);
      expect(result.matched_rules).toHaveLength(0);
      expect(result.reasons).toHaveLength(0);
    });

    it('skips disabled rules', () => {
      const rule = makeRule({
        enabled: false,
        conditions_json: JSON.stringify([{ field: 'amount', op: 'gt', value: '0' }]),
      });
      const result = evaluateFraudRules(makeContext(), [rule]);
      expect(result.decision).toBe(FraudDecision.ALLOW);
    });
  });

  describe('evaluateCondition', () => {
    const ctx = makeContext({ amount: '5000', currency: 'BBD' });

    it('evaluates eq operator', () => {
      expect(evaluateCondition({ field: 'currency', op: 'eq', value: 'BBD' }, ctx)).toBe(true);
      expect(evaluateCondition({ field: 'currency', op: 'eq', value: 'USD' }, ctx)).toBe(false);
    });

    it('evaluates gt operator', () => {
      expect(evaluateCondition({ field: 'amount', op: 'gt', value: '1000' }, ctx)).toBe(true);
      expect(evaluateCondition({ field: 'amount', op: 'gt', value: '9999' }, ctx)).toBe(false);
    });

    it('evaluates lt operator', () => {
      expect(evaluateCondition({ field: 'amount', op: 'lt', value: '10000' }, ctx)).toBe(true);
      expect(evaluateCondition({ field: 'amount', op: 'lt', value: '100' }, ctx)).toBe(false);
    });

    it('evaluates between operator', () => {
      expect(evaluateCondition({ field: 'amount', op: 'between', value: [1000, 10000] }, ctx)).toBe(true);
      expect(evaluateCondition({ field: 'amount', op: 'between', value: [6000, 10000] }, ctx)).toBe(false);
    });

    it('evaluates contains operator on signals array', () => {
      const ctxWithSignals = makeContext({
        signals: [{ signal_type: FraudSignalType.NEW_DEVICE, severity: FraudSeverity.INFO }],
      });
      expect(
        evaluateCondition({ field: 'signals', op: 'contains', value: FraudSignalType.NEW_DEVICE }, ctxWithSignals),
      ).toBe(true);
      expect(
        evaluateCondition({ field: 'signals', op: 'contains', value: FraudSignalType.GEO_ANOMALY }, ctxWithSignals),
      ).toBe(false);
    });
  });

  describe('getDecisionPriority', () => {
    it('FREEZE has the highest priority', () => {
      expect(getDecisionPriority(FraudDecision.FREEZE)).toBe(5);
    });

    it('returns 0 for unknown decision', () => {
      expect(getDecisionPriority('UNKNOWN')).toBe(0);
    });

    it('priority ordering is ALLOW < STEP_UP < HOLD < BLOCK < FREEZE', () => {
      const allow = getDecisionPriority(FraudDecision.ALLOW);
      const stepUp = getDecisionPriority(FraudDecision.STEP_UP);
      const hold = getDecisionPriority(FraudDecision.HOLD);
      const block = getDecisionPriority(FraudDecision.BLOCK);
      const freeze = getDecisionPriority(FraudDecision.FREEZE);
      expect(allow).toBeLessThan(stepUp);
      expect(stepUp).toBeLessThan(hold);
      expect(hold).toBeLessThan(block);
      expect(block).toBeLessThan(freeze);
    });
  });

  describe('DEFAULT_FRAUD_RULES', () => {
    it('has at least 15 rules', () => {
      expect(DEFAULT_FRAUD_RULES.length).toBeGreaterThanOrEqual(15);
    });

    it('all rules have valid action values', () => {
      const validActions = new Set(Object.values(FraudDecision));
      for (const rule of DEFAULT_FRAUD_RULES) {
        expect(validActions.has(rule.action as FraudDecision)).toBe(true);
      }
    });

    it('all rules have conditions_json that parse as valid JSON arrays', () => {
      for (const rule of DEFAULT_FRAUD_RULES) {
        const parsed = JSON.parse(rule.conditions_json);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.length).toBeGreaterThan(0);
      }
    });

    it('all conditions use supported operators only', () => {
      const supportedOps = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'between', 'in']);
      for (const rule of DEFAULT_FRAUD_RULES) {
        const conditions = JSON.parse(rule.conditions_json) as { op: string }[];
        for (const cond of conditions) {
          expect(supportedOps.has(cond.op)).toBe(true);
        }
      }
    });
  });
});

// ── 2. Circuit Breaker Tests ─────────────────────────────────────────────────

describe('Circuit Breaker', () => {
  const defaultConfig = {
    failure_threshold: 3,
    reset_timeout_ms: 100,
    window_ms: 5000,
    half_open_max_attempts: 1,
  };

  it('starts in CLOSED state', () => {
    const cb = createCircuitBreaker(defaultConfig);
    expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
  });

  it('opens after failure threshold is reached', async () => {
    const cb = createCircuitBreaker(defaultConfig);
    const fail = () => Promise.reject(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => {});
    }
    expect(cb.getState()).toBe(CircuitBreakerState.OPEN);
  });

  it('rejects calls when OPEN', async () => {
    const cb = createCircuitBreaker(defaultConfig);
    const fail = () => Promise.reject(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => {});
    }

    await expect(cb.execute(() => Promise.resolve('ok'))).rejects.toThrow(CircuitBreakerOpenError);
  });

  it('transitions to HALF_OPEN after reset timeout', async () => {
    const cb = createCircuitBreaker({ ...defaultConfig, reset_timeout_ms: 50 });
    const fail = () => Promise.reject(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => {});
    }
    expect(cb.getState()).toBe(CircuitBreakerState.OPEN);

    await new Promise((r) => setTimeout(r, 60));
    expect(cb.getState()).toBe(CircuitBreakerState.HALF_OPEN);
  });

  it('closes on success in HALF_OPEN state', async () => {
    const cb = createCircuitBreaker({ ...defaultConfig, reset_timeout_ms: 50 });
    const fail = () => Promise.reject(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => {});
    }

    await new Promise((r) => setTimeout(r, 60));
    expect(cb.getState()).toBe(CircuitBreakerState.HALF_OPEN);

    await cb.execute(() => Promise.resolve('ok'));
    expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
  });
});

// ── 3. Retry Tests ───────────────────────────────────────────────────────────

describe('withRetry', () => {
  it('succeeds on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, RETRY_CONFIG);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on transient failure then succeeds', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw new Error('transient');
      return 'recovered';
    };
    const result = await withRetry(fn, RETRY_CONFIG);
    expect(result).toBe('recovered');
    expect(calls).toBe(3);
  });

  it('throws after max attempts exhausted', async () => {
    const fn = () => Promise.reject(new Error('persistent'));
    await expect(withRetry(fn, RETRY_CONFIG)).rejects.toThrow('persistent');
  });

  it('throws immediately on permanent error', async () => {
    const fn = vi.fn().mockImplementation(() => {
      const err = new TypeError('bad type');
      throw err;
    });
    await expect(withRetry(fn, RETRY_CONFIG)).rejects.toThrow(TypeError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ── 4. Webhook Verification Tests ────────────────────────────────────────────

describe('Webhook Verification', () => {
  const samplePayload = {
    bank_transfer_id: 'bt-001',
    client_reference: 'ref-001',
    status: 'SETTLED',
    amount: '5000.00',
    currency: 'BBD',
    from_account_id: 'acc-from',
    to_account_id: 'acc-to',
    occurred_at: '2025-01-01T00:00:00Z',
  };

  it('computeWebhookIdempotencyKey produces correct format', () => {
    const key = computeWebhookIdempotencyKey(samplePayload);
    expect(key).toBe('bt-001:SETTLED');
  });

  it('idempotency key is deterministic (same input → same output)', () => {
    const k1 = computeWebhookIdempotencyKey(samplePayload);
    const k2 = computeWebhookIdempotencyKey(samplePayload);
    expect(k1).toBe(k2);
  });

  it('parseWebhookPayload parses valid JSON', () => {
    const parsed = parseWebhookPayload(JSON.stringify(samplePayload));
    expect(parsed.bank_transfer_id).toBe('bt-001');
    expect(parsed.status).toBe('SETTLED');
  });

  it('parseWebhookPayload throws on invalid JSON', () => {
    expect(() => parseWebhookPayload('not-json')).toThrow();
  });
});

// ── 5. Enum Completeness Tests ───────────────────────────────────────────────

describe('Enum Completeness', () => {
  it('BankAccountPurpose has all 9 values', () => {
    const values = Object.values(BankAccountPurpose);
    expect(values).toHaveLength(9);
    expect(values).toContain('CUSTOMER_DEPOSITS_HOLDING');
    expect(values).toContain('MERCHANT_PAYOUTS_CLEARING');
    expect(values).toContain('SUSPENSE');
    expect(values).toContain('OPERATIONS');
  });

  it('ExternalTransferStatus has all 6 values', () => {
    const values = Object.values(ExternalTransferStatus);
    expect(values).toHaveLength(6);
    expect(values).toContain('CREATED');
    expect(values).toContain('PENDING');
    expect(values).toContain('SETTLED');
    expect(values).toContain('FAILED');
    expect(values).toContain('CANCELLED');
    expect(values).toContain('REVERSED');
  });

  it('FraudDecision has all 5 values', () => {
    const values = Object.values(FraudDecision);
    expect(values).toHaveLength(5);
    expect(values).toContain('ALLOW');
    expect(values).toContain('BLOCK');
    expect(values).toContain('STEP_UP');
    expect(values).toContain('HOLD');
    expect(values).toContain('FREEZE');
  });

  it('SettlementSchedule has T0, T1, T2', () => {
    const values = Object.values(SettlementSchedule);
    expect(values).toHaveLength(3);
    expect(values).toContain('T0');
    expect(values).toContain('T1');
    expect(values).toContain('T2');
  });

  it('PayoutStatus has all 6 values', () => {
    const values = Object.values(PayoutStatus);
    expect(values).toHaveLength(6);
    expect(values).toContain('REQUESTED');
    expect(values).toContain('APPROVED');
    expect(values).toContain('PENDING');
    expect(values).toContain('SETTLED');
    expect(values).toContain('FAILED');
    expect(values).toContain('CANCELLED');
  });
});
