/**
 * Policy Evaluation Engine
 *
 * Evaluates approval policies against request context to determine:
 *  - Which policy applies (first match by priority)
 *  - How many stages / approvals are required
 *  - Who can approve at each stage
 *  - Time window / delegation checks
 *
 * Used by:
 *  - Request creation: attach matching policy + set up workflow stages
 *  - Approve/reject: validate checker is authorized per current stage
 *  - Simulation: dry-run policy matching without creating a request
 *  - Explain: show why a specific policy was matched
 */

import type {
    ApprovalPolicy,
    ApprovalPolicyCondition,
    ApprovalPolicyStage,
    ApprovalPolicyBinding,
    ApprovalPolicyFull,
    PolicyEvaluationResult,
    ApprovalDelegation,
    Actor,
} from '@caricash/shared';
import {
    listActivePolicies,
    listPolicyConditions,
    listPolicyStages,
    listPolicyBindings,
    listActiveDelegationsForDelegate,
} from '@caricash/db';

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

/** Context provided to the policy engine for matching */
export interface PolicyEvalContext {
    /** The approval type being created */
    approval_type: string;
    /** The maker (requester) */
    maker_actor?: Actor;
    /** Parsed payload of the approval request */
    payload: Record<string, unknown>;
    /** Current ISO timestamp */
    now: string;
}

/** Result for a single policy evaluation */
interface SinglePolicyResult {
    policy_id: string;
    policy_name: string;
    matched: boolean;
    reasons: string[];
}

// ═══════════════════════════════════════════════════════════════════════
// Condition evaluation
// ═══════════════════════════════════════════════════════════════════════

/**
 * Resolve a field path from the evaluation context.
 * Supports dotted paths like "payload.merchant_id" and top-level fields
 * like "amount", "currency", "actor_type".
 */
function resolveField(ctx: PolicyEvalContext, field: string): unknown {
    // Top-level request context fields
    if (field === 'approval_type') return ctx.approval_type;
    if (field === 'actor_type') return ctx.maker_actor?.type;
    if (field === 'actor_id') return ctx.maker_actor?.id;
    if (field === 'staff_role') return ctx.maker_actor?.staff_role;

    // Payload fields (with optional "payload." prefix)
    const payloadField = field.startsWith('payload.') ? field.slice(8) : field;
    return getNestedValue(ctx.payload, payloadField);
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
        if (current === null || current === undefined || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

function evaluateCondition(ctx: PolicyEvalContext, condition: ApprovalPolicyCondition): { matched: boolean; reason: string } {
    const fieldValue = resolveField(ctx, condition.field);
    let compareValue: unknown;
    try {
        compareValue = JSON.parse(condition.value_json);
    } catch {
        return { matched: false, reason: `Invalid value_json for condition ${condition.id}` };
    }

    const op = condition.operator;

    if (op === 'exists') {
        const exists = fieldValue !== undefined && fieldValue !== null;
        const expectExists = compareValue === true || compareValue === 'true';
        const matched = exists === expectExists;
        return { matched, reason: matched ? `${condition.field} exists=${exists}` : `${condition.field} exists=${exists}, expected ${expectExists}` };
    }

    if (fieldValue === undefined || fieldValue === null) {
        return { matched: false, reason: `${condition.field} is null/undefined` };
    }

    const fv = typeof fieldValue === 'number' ? fieldValue : String(fieldValue);
    const cv = typeof compareValue === 'number' ? compareValue : (typeof compareValue === 'string' ? compareValue : compareValue);

    switch (op) {
        case 'eq':
            return fv === cv
                ? { matched: true, reason: `${condition.field} == ${cv}` }
                : { matched: false, reason: `${condition.field} (${fv}) != ${cv}` };

        case 'neq':
            return fv !== cv
                ? { matched: true, reason: `${condition.field} != ${cv}` }
                : { matched: false, reason: `${condition.field} (${fv}) == ${cv}` };

        case 'gt': {
            const a = Number(fv), b = Number(cv);
            return a > b
                ? { matched: true, reason: `${condition.field} (${a}) > ${b}` }
                : { matched: false, reason: `${condition.field} (${a}) <= ${b}` };
        }

        case 'gte': {
            const a = Number(fv), b = Number(cv);
            return a >= b
                ? { matched: true, reason: `${condition.field} (${a}) >= ${b}` }
                : { matched: false, reason: `${condition.field} (${a}) < ${b}` };
        }

        case 'lt': {
            const a = Number(fv), b = Number(cv);
            return a < b
                ? { matched: true, reason: `${condition.field} (${a}) < ${b}` }
                : { matched: false, reason: `${condition.field} (${a}) >= ${b}` };
        }

        case 'lte': {
            const a = Number(fv), b = Number(cv);
            return a <= b
                ? { matched: true, reason: `${condition.field} (${a}) <= ${b}` }
                : { matched: false, reason: `${condition.field} (${a}) > ${b}` };
        }

        case 'in': {
            const arr = Array.isArray(compareValue) ? compareValue : [compareValue];
            const matched = arr.includes(String(fv)) || arr.includes(Number(fv));
            return matched
                ? { matched: true, reason: `${condition.field} in [${arr.join(',')}]` }
                : { matched: false, reason: `${condition.field} (${fv}) not in [${arr.join(',')}]` };
        }

        case 'not_in': {
            const arr = Array.isArray(compareValue) ? compareValue : [compareValue];
            const matched = !arr.includes(String(fv)) && !arr.includes(Number(fv));
            return matched
                ? { matched: true, reason: `${condition.field} not in [${arr.join(',')}]` }
                : { matched: false, reason: `${condition.field} (${fv}) in [${arr.join(',')}]` };
        }

        case 'contains': {
            const matched = String(fv).includes(String(cv));
            return matched
                ? { matched: true, reason: `${condition.field} contains '${cv}'` }
                : { matched: false, reason: `${condition.field} does not contain '${cv}'` };
        }

        case 'regex': {
            try {
                const re = new RegExp(String(cv));
                const matched = re.test(String(fv));
                return matched
                    ? { matched: true, reason: `${condition.field} matches /${cv}/` }
                    : { matched: false, reason: `${condition.field} does not match /${cv}/` };
            } catch {
                return { matched: false, reason: `Invalid regex: ${cv}` };
            }
        }

        case 'between': {
            const arr = Array.isArray(compareValue) ? compareValue : [];
            if (arr.length !== 2) return { matched: false, reason: `between requires [min, max], got ${JSON.stringify(compareValue)}` };
            const n = Number(fv), min = Number(arr[0]), max = Number(arr[1]);
            const matched = n >= min && n <= max;
            return matched
                ? { matched: true, reason: `${condition.field} (${n}) between [${min}, ${max}]` }
                : { matched: false, reason: `${condition.field} (${n}) not between [${min}, ${max}]` };
        }

        default:
            return { matched: false, reason: `Unknown operator: ${op}` };
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Time window checks
// ═══════════════════════════════════════════════════════════════════════

function checkTimeConstraints(policy: ApprovalPolicy, now: string): { ok: boolean; reason: string } {
    // Check validity window
    if (policy.valid_from && now < policy.valid_from) {
        return { ok: false, reason: `Policy not yet valid (valid_from: ${policy.valid_from})` };
    }
    if (policy.valid_to && now > policy.valid_to) {
        return { ok: false, reason: `Policy expired (valid_to: ${policy.valid_to})` };
    }

    // Check time constraints JSON if present
    if (!policy.time_constraints_json) return { ok: true, reason: 'No time constraints' };

    try {
        const tc = JSON.parse(policy.time_constraints_json) as {
            weekdays?: number[];
            active_from_time?: string;
            active_to_time?: string;
            blackout_dates?: string[];
        };

        const d = new Date(now);
        const dayOfWeek = d.getUTCDay() || 7; // 1=Mon ... 7=Sun (ISO style)

        if (tc.weekdays && tc.weekdays.length > 0 && !tc.weekdays.includes(dayOfWeek)) {
            return { ok: false, reason: `Day ${dayOfWeek} not in allowed weekdays [${tc.weekdays.join(',')}]` };
        }

        const timeStr = now.slice(11, 16); // HH:MM
        if (tc.active_from_time && timeStr < tc.active_from_time) {
            return { ok: false, reason: `Current time ${timeStr} before active window ${tc.active_from_time}` };
        }
        if (tc.active_to_time && timeStr > tc.active_to_time) {
            return { ok: false, reason: `Current time ${timeStr} after active window ${tc.active_to_time}` };
        }

        const dateStr = now.slice(0, 10); // YYYY-MM-DD
        if (tc.blackout_dates && tc.blackout_dates.includes(dateStr)) {
            return { ok: false, reason: `Date ${dateStr} is a blackout date` };
        }

        return { ok: true, reason: 'Time constraints satisfied' };
    } catch {
        return { ok: true, reason: 'Invalid time_constraints_json — ignored' };
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Binding checks
// ═══════════════════════════════════════════════════════════════════════

function checkBindings(bindings: ApprovalPolicyBinding[], ctx: PolicyEvalContext): { ok: boolean; reason: string } {
    if (bindings.length === 0) return { ok: true, reason: 'No bindings (applies to all)' };

    // ANY binding matching is sufficient (OR logic)
    for (const binding of bindings) {
        let bv: Record<string, unknown>;
        try { bv = JSON.parse(binding.binding_value_json); } catch { continue; }

        switch (binding.binding_type) {
            case 'all':
                return { ok: true, reason: 'Universal binding' };
            case 'actor':
                if (bv.actor_id && ctx.maker_actor?.id === bv.actor_id) return { ok: true, reason: `Actor binding matched: ${bv.actor_id}` };
                break;
            case 'actor_type':
                if (bv.actor_type && ctx.maker_actor?.type === bv.actor_type) return { ok: true, reason: `Actor type binding matched: ${bv.actor_type}` };
                break;
            case 'role':
                if (bv.role && ctx.maker_actor?.staff_role === bv.role) return { ok: true, reason: `Role binding matched: ${bv.role}` };
                break;
            case 'currency':
                if (bv.currency && ctx.payload.currency === bv.currency) return { ok: true, reason: `Currency binding matched: ${bv.currency}` };
                break;
            case 'hierarchy':
                // Check if maker is in the hierarchy (parent_id match)
                if (bv.parent_id && ctx.payload.parent_id === bv.parent_id) return { ok: true, reason: `Hierarchy binding matched` };
                if (bv.parent_id && ctx.payload.merchant_id === bv.parent_id) return { ok: true, reason: `Hierarchy binding matched (merchant)` };
                break;
            case 'business_unit':
                if (bv.unit_id && ctx.payload.business_unit === bv.unit_id) return { ok: true, reason: `Business unit binding matched` };
                break;
        }
    }

    return { ok: false, reason: 'No binding matched the request context' };
}

// ═══════════════════════════════════════════════════════════════════════
// Main evaluation
// ═══════════════════════════════════════════════════════════════════════

/**
 * Evaluate a single policy against the request context.
 * Returns whether it matched and the reasons.
 */
async function evaluateSinglePolicy(
    db: unknown,
    policy: ApprovalPolicy,
    ctx: PolicyEvalContext,
): Promise<SinglePolicyResult> {
    const reasons: string[] = [];

    // 1. Check approval type match
    if (policy.approval_type && policy.approval_type !== ctx.approval_type) {
        reasons.push(`Type mismatch: policy=${policy.approval_type}, request=${ctx.approval_type}`);
        return { policy_id: policy.id, policy_name: policy.name, matched: false, reasons };
    }

    // 2. Check time constraints
    const timeCheck = checkTimeConstraints(policy, ctx.now);
    if (!timeCheck.ok) {
        reasons.push(timeCheck.reason);
        return { policy_id: policy.id, policy_name: policy.name, matched: false, reasons };
    }
    reasons.push(timeCheck.reason);

    // 3. Check bindings
    const bindings = await listPolicyBindings(db as any, policy.id);
    const bindingCheck = checkBindings(bindings, ctx);
    if (!bindingCheck.ok) {
        reasons.push(bindingCheck.reason);
        return { policy_id: policy.id, policy_name: policy.name, matched: false, reasons };
    }
    reasons.push(bindingCheck.reason);

    // 4. Check conditions (all must match — AND logic)
    const conditions = await listPolicyConditions(db as any, policy.id);
    for (const condition of conditions) {
        const result = evaluateCondition(ctx, condition);
        reasons.push(result.reason);
        if (!result.matched) {
            return { policy_id: policy.id, policy_name: policy.name, matched: false, reasons };
        }
    }

    return { policy_id: policy.id, policy_name: policy.name, matched: true, reasons };
}

/**
 * Evaluate all active policies and return the first match (by priority).
 * Returns full evaluation result with all policies evaluated for transparency.
 */
export async function evaluatePolicies(
    db: unknown,
    ctx: PolicyEvalContext,
): Promise<PolicyEvaluationResult> {
    const policies = await listActivePolicies(db as any, ctx.approval_type);
    const allEvaluated: SinglePolicyResult[] = [];
    let matchedPolicy: ApprovalPolicy | null = null;
    let matchedStages: ApprovalPolicyStage[] = [];

    for (const policy of policies) {
        const result = await evaluateSinglePolicy(db, policy, ctx);
        allEvaluated.push(result);

        if (result.matched && !matchedPolicy) {
            matchedPolicy = policy;
            matchedStages = await listPolicyStages(db as any, policy.id);
        }
    }

    if (!matchedPolicy) {
        return {
            matched: false,
            total_stages: 1,
            stages: [],
            reasons: ['No active policy matched the request context'],
            all_evaluated: allEvaluated,
        };
    }

    const stages = matchedStages.map((s) => ({
        stage_no: s.stage_no,
        min_approvals: s.min_approvals,
        allowed_roles: safeParseArray(s.roles_json),
        allowed_actors: safeParseArray(s.actor_ids_json),
        timeout_minutes: s.timeout_minutes,
    }));

    return {
        matched: true,
        policy_id: matchedPolicy.id,
        policy_name: matchedPolicy.name,
        total_stages: stages.length || 1,
        stages,
        reasons: allEvaluated.find((e) => e.policy_id === matchedPolicy!.id)?.reasons ?? [],
        all_evaluated: allEvaluated,
    };
}

// ═══════════════════════════════════════════════════════════════════════
// Stage authorization check
// ═══════════════════════════════════════════════════════════════════════

export interface StageAuthResult {
    authorized: boolean;
    reason: string;
    delegation?: ApprovalDelegation;
}

/**
 * Check if a given actor is authorized to decide at the current stage.
 * Considers: stage roles, stage actor_ids, maker≠checker, previous approver exclusion, delegation.
 */
export async function checkStageAuthorization(
    db: unknown,
    stage: ApprovalPolicyStage,
    deciderId: string,
    deciderActor: Actor,
    makerId: string,
    requestId: string,
    stageNo: number,
    approvalType: string,
    now: string,
    previousDeciderIds: string[],
): Promise<StageAuthResult> {
    // Maker ≠ checker
    if (stage.exclude_maker && deciderId === makerId) {
        return { authorized: false, reason: 'Maker cannot approve their own request' };
    }

    // Previous approver exclusion
    if (stage.exclude_previous_approvers && previousDeciderIds.includes(deciderId)) {
        return { authorized: false, reason: 'Already decided in a previous stage' };
    }

    // Check allowed roles
    const allowedRoles = safeParseArray(stage.roles_json);
    const allowedActors = safeParseArray(stage.actor_ids_json);

    // Direct authorization
    const roleOk = allowedRoles.length === 0 || allowedRoles.includes(deciderActor.staff_role as string);
    const actorOk = allowedActors.length === 0 || allowedActors.includes(deciderId);

    if (roleOk && actorOk) {
        if (allowedRoles.length > 0 && !allowedRoles.includes(deciderActor.staff_role as string)) {
            // actorOk was true but roleOk was from empty list — this is fine, actor override
        }
        return { authorized: true, reason: 'Direct authorization' };
    }

    // Check delegation
    const delegations = await listActiveDelegationsForDelegate(db as any, deciderId, approvalType, now);
    for (const delegation of delegations) {
        // The delegate inherits the delegator's authorization
        // Check if delegator would have been authorized
        const delegatorRoleOk = allowedRoles.length === 0 || allowedRoles.includes(delegation.delegator_id); // simplified
        if (delegatorRoleOk) {
            return { authorized: true, reason: `Delegated by ${delegation.delegator_id}`, delegation };
        }
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(deciderActor.staff_role as string)) {
        return { authorized: false, reason: `Role ${deciderActor.staff_role} not in allowed roles [${allowedRoles.join(',')}]` };
    }

    if (allowedActors.length > 0 && !allowedActors.includes(deciderId)) {
        return { authorized: false, reason: `Actor ${deciderId} not in allowed actors [${allowedActors.join(',')}]` };
    }

    return { authorized: false, reason: 'Not authorized for this stage' };
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function safeParseArray(json?: string | null): string[] {
    if (!json) return [];
    try {
        const parsed = JSON.parse(json);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}
