/**
 * Approval Policy Routes
 *
 * Admin endpoints for managing approval policies, workflows, delegations.
 * Also includes simulation and explain endpoints.
 *
 * Mounted at /approvals/policies, /approvals/delegations, etc.
 */
import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
    generateId,
    nowISO,
    PolicyState,
    ActorType,
    EventName,
} from '@caricash/shared';
import type { EventName as EventNameType } from '@caricash/shared';
import {
    insertApprovalPolicy,
    getApprovalPolicy,
    getApprovalPolicyFull,
    listApprovalPolicies,
    updateApprovalPolicy,
    deleteApprovalPolicy,
    insertPolicyCondition,
    deletePolicyConditions,
    insertPolicyStage,
    deletePolicyStages,
    insertPolicyBinding,
    deletePolicyBindings,
    listPolicyStages,
    insertDelegation,
    getDelegation,
    listDelegations,
    revokeDelegation,
    getApprovalRequest,
    getPolicyDecision,
    listStageDecisions,
    insertEvent,
    insertAuditLog,
    getActorById,
} from '@caricash/db';
import { evaluatePolicies } from '../lib/policy-engine.js';
import type { PolicyEvalContext } from '../lib/policy-engine.js';

export const policyRoutes = new Hono<{ Bindings: Env }>();

// ═══════════════════════════════════════════════════════════════════════
// Policy CRUD
// ═══════════════════════════════════════════════════════════════════════

// POST /approvals/policies — create a new policy
policyRoutes.post('/', async (c) => {
    const body = await c.req.json();
    const {
        name, description, approval_type, priority, valid_from, valid_to,
        time_constraints, expiry_minutes, escalation_minutes, escalation_group,
        conditions, stages, bindings, staff_id,
    } = body;

    if (!name || !staff_id) {
        return c.json({ error: 'name and staff_id are required' }, 400);
    }

    const now = nowISO();
    const policyId = generateId();

    await insertApprovalPolicy(c.env.DB, {
        id: policyId,
        name,
        description: description ?? undefined,
        approval_type: approval_type ?? undefined,
        priority: priority ?? 100,
        version: 1,
        state: PolicyState.DRAFT,
        valid_from: valid_from ?? undefined,
        valid_to: valid_to ?? undefined,
        time_constraints_json: time_constraints ? JSON.stringify(time_constraints) : undefined,
        expiry_minutes: expiry_minutes ?? undefined,
        escalation_minutes: escalation_minutes ?? undefined,
        escalation_group_json: escalation_group ? JSON.stringify(escalation_group) : undefined,
        created_by: staff_id,
        created_at: now,
        updated_at: now,
    });

    // Insert conditions
    if (Array.isArray(conditions)) {
        for (const cond of conditions) {
            await insertPolicyCondition(c.env.DB, {
                id: generateId(),
                policy_id: policyId,
                field: cond.field,
                operator: cond.operator,
                value_json: typeof cond.value === 'string' ? cond.value : JSON.stringify(cond.value),
                created_at: now,
            });
        }
    }

    // Insert stages
    if (Array.isArray(stages)) {
        for (let i = 0; i < stages.length; i++) {
            const s = stages[i];
            await insertPolicyStage(c.env.DB, {
                id: generateId(),
                policy_id: policyId,
                stage_no: s.stage_no ?? i + 1,
                min_approvals: s.min_approvals ?? 1,
                roles_json: s.roles ? JSON.stringify(s.roles) : undefined,
                actor_ids_json: s.actor_ids ? JSON.stringify(s.actor_ids) : undefined,
                exclude_maker: s.exclude_maker ?? 1,
                exclude_previous_approvers: s.exclude_previous_approvers ?? 0,
                timeout_minutes: s.timeout_minutes ?? undefined,
                escalation_roles_json: s.escalation_roles ? JSON.stringify(s.escalation_roles) : undefined,
                escalation_actor_ids_json: s.escalation_actor_ids ? JSON.stringify(s.escalation_actor_ids) : undefined,
                created_at: now,
            });
        }
    }

    // Insert bindings
    if (Array.isArray(bindings)) {
        for (const b of bindings) {
            await insertPolicyBinding(c.env.DB, {
                id: generateId(),
                policy_id: policyId,
                binding_type: b.binding_type ?? 'all',
                binding_value_json: typeof b.binding_value === 'string' ? b.binding_value : JSON.stringify(b.binding_value ?? {}),
                created_at: now,
            });
        }
    }

    // Audit + event
    const correlationId = generateId();
    await insertAuditLog(c.env.DB, {
        id: generateId(),
        action: 'APPROVAL_POLICY_CREATED',
        actor_type: ActorType.STAFF,
        actor_id: staff_id,
        target_type: 'approval_policy',
        target_id: policyId,
        after_json: JSON.stringify({ name, approval_type, priority }),
        correlation_id: correlationId,
        created_at: now,
    });

    await insertEvent(c.env.DB, {
        id: generateId(),
        name: EventName.APPROVAL_POLICY_CREATED as EventNameType,
        entity_type: 'approval_policy',
        entity_id: policyId,
        correlation_id: correlationId,
        actor_type: ActorType.STAFF,
        actor_id: staff_id,
        schema_version: 1,
        payload_json: JSON.stringify({ policy_id: policyId, name }),
        created_at: now,
    });

    const full = await getApprovalPolicyFull(c.env.DB, policyId);
    return c.json(full, 201);
});

// GET /approvals/policies — list policies
policyRoutes.get('/', async (c) => {
    const state = c.req.query('state');
    const approval_type = c.req.query('approval_type');
    const limit = Number(c.req.query('limit') ?? '50');

    const items = await listApprovalPolicies(c.env.DB, {
        state: state || undefined,
        approval_type: approval_type || undefined,
        limit,
    });

    return c.json({ items, count: items.length });
});

// GET /approvals/policies/:id — get policy with conditions/stages/bindings
policyRoutes.get('/:id', async (c) => {
    const id = c.req.param('id');
    const full = await getApprovalPolicyFull(c.env.DB, id);
    if (!full) return c.json({ error: 'Policy not found' }, 404);
    return c.json(full);
});

// PATCH /approvals/policies/:id — update policy
policyRoutes.patch('/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { staff_id } = body;
    if (!staff_id) return c.json({ error: 'staff_id is required' }, 400);

    const existing = await getApprovalPolicy(c.env.DB, id);
    if (!existing) return c.json({ error: 'Policy not found' }, 404);

    if (existing.state === PolicyState.ARCHIVED) {
        return c.json({ error: 'Cannot modify an archived policy' }, 409);
    }

    const now = nowISO();
    const updates: Record<string, unknown> = { updated_by: staff_id, updated_at: now };

    const allowedFields = ['name', 'description', 'approval_type', 'priority', 'valid_from', 'valid_to', 'expiry_minutes', 'escalation_minutes'];
    for (const field of allowedFields) {
        if (body[field] !== undefined) updates[field] = body[field];
    }
    if (body.time_constraints !== undefined) updates.time_constraints_json = JSON.stringify(body.time_constraints);
    if (body.escalation_group !== undefined) updates.escalation_group_json = JSON.stringify(body.escalation_group);

    await updateApprovalPolicy(c.env.DB, id, updates as any);

    // Replace conditions if provided
    if (Array.isArray(body.conditions)) {
        await deletePolicyConditions(c.env.DB, id);
        for (const cond of body.conditions) {
            await insertPolicyCondition(c.env.DB, {
                id: generateId(),
                policy_id: id,
                field: cond.field,
                operator: cond.operator,
                value_json: typeof cond.value === 'string' ? cond.value : JSON.stringify(cond.value),
                created_at: now,
            });
        }
    }

    // Replace stages if provided
    if (Array.isArray(body.stages)) {
        await deletePolicyStages(c.env.DB, id);
        for (let i = 0; i < body.stages.length; i++) {
            const s = body.stages[i];
            await insertPolicyStage(c.env.DB, {
                id: generateId(),
                policy_id: id,
                stage_no: s.stage_no ?? i + 1,
                min_approvals: s.min_approvals ?? 1,
                roles_json: s.roles ? JSON.stringify(s.roles) : undefined,
                actor_ids_json: s.actor_ids ? JSON.stringify(s.actor_ids) : undefined,
                exclude_maker: s.exclude_maker ?? 1,
                exclude_previous_approvers: s.exclude_previous_approvers ?? 0,
                timeout_minutes: s.timeout_minutes ?? undefined,
                escalation_roles_json: s.escalation_roles ? JSON.stringify(s.escalation_roles) : undefined,
                escalation_actor_ids_json: s.escalation_actor_ids ? JSON.stringify(s.escalation_actor_ids) : undefined,
                created_at: now,
            });
        }
    }

    // Replace bindings if provided
    if (Array.isArray(body.bindings)) {
        await deletePolicyBindings(c.env.DB, id);
        for (const b of body.bindings) {
            await insertPolicyBinding(c.env.DB, {
                id: generateId(),
                policy_id: id,
                binding_type: b.binding_type ?? 'all',
                binding_value_json: typeof b.binding_value === 'string' ? b.binding_value : JSON.stringify(b.binding_value ?? {}),
                created_at: now,
            });
        }
    }

    // Audit
    await insertAuditLog(c.env.DB, {
        id: generateId(),
        action: 'APPROVAL_POLICY_UPDATED',
        actor_type: ActorType.STAFF,
        actor_id: staff_id,
        target_type: 'approval_policy',
        target_id: id,
        before_json: JSON.stringify({ state: existing.state, version: existing.version }),
        after_json: JSON.stringify(updates),
        correlation_id: generateId(),
        created_at: now,
    });

    const full = await getApprovalPolicyFull(c.env.DB, id);
    return c.json(full);
});

// DELETE /approvals/policies/:id
policyRoutes.delete('/:id', async (c) => {
    const id = c.req.param('id');
    const existing = await getApprovalPolicy(c.env.DB, id);
    if (!existing) return c.json({ error: 'Policy not found' }, 404);

    if (existing.state === PolicyState.ACTIVE) {
        return c.json({ error: 'Cannot delete an active policy; deactivate first' }, 409);
    }

    await deleteApprovalPolicy(c.env.DB, id);
    return c.json({ deleted: true, policy_id: id });
});

// ═══════════════════════════════════════════════════════════════════════
// Activation / Deactivation
// ═══════════════════════════════════════════════════════════════════════

// POST /approvals/policies/:id/activate
policyRoutes.post('/:id/activate', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { staff_id } = body;
    if (!staff_id) return c.json({ error: 'staff_id is required' }, 400);

    const existing = await getApprovalPolicy(c.env.DB, id);
    if (!existing) return c.json({ error: 'Policy not found' }, 404);

    if (existing.state === PolicyState.ACTIVE) {
        return c.json({ error: 'Policy is already active' }, 409);
    }

    // Validate: must have at least one stage
    const stages = await listPolicyStages(c.env.DB, id);
    if (stages.length === 0) {
        return c.json({ error: 'Policy must have at least one stage before activation' }, 400);
    }

    const now = nowISO();
    await updateApprovalPolicy(c.env.DB, id, {
        state: PolicyState.ACTIVE,
        version: existing.version + 1,
        updated_by: staff_id,
        updated_at: now,
    } as any);

    const correlationId = generateId();
    await insertAuditLog(c.env.DB, {
        id: generateId(),
        action: 'APPROVAL_POLICY_ACTIVATED',
        actor_type: ActorType.STAFF,
        actor_id: staff_id,
        target_type: 'approval_policy',
        target_id: id,
        before_json: JSON.stringify({ state: existing.state }),
        after_json: JSON.stringify({ state: PolicyState.ACTIVE }),
        correlation_id: correlationId,
        created_at: now,
    });

    await insertEvent(c.env.DB, {
        id: generateId(),
        name: EventName.APPROVAL_POLICY_ACTIVATED as EventNameType,
        entity_type: 'approval_policy',
        entity_id: id,
        correlation_id: correlationId,
        actor_type: ActorType.STAFF,
        actor_id: staff_id,
        schema_version: 1,
        payload_json: JSON.stringify({ policy_id: id, version: existing.version + 1 }),
        created_at: now,
    });

    return c.json({ policy_id: id, state: PolicyState.ACTIVE, version: existing.version + 1 });
});

// POST /approvals/policies/:id/deactivate
policyRoutes.post('/:id/deactivate', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { staff_id } = body;
    if (!staff_id) return c.json({ error: 'staff_id is required' }, 400);

    const existing = await getApprovalPolicy(c.env.DB, id);
    if (!existing) return c.json({ error: 'Policy not found' }, 404);

    const now = nowISO();
    await updateApprovalPolicy(c.env.DB, id, {
        state: PolicyState.INACTIVE,
        updated_by: staff_id,
        updated_at: now,
    } as any);

    await insertAuditLog(c.env.DB, {
        id: generateId(),
        action: 'APPROVAL_POLICY_DEACTIVATED',
        actor_type: ActorType.STAFF,
        actor_id: staff_id,
        target_type: 'approval_policy',
        target_id: id,
        before_json: JSON.stringify({ state: existing.state }),
        after_json: JSON.stringify({ state: PolicyState.INACTIVE }),
        correlation_id: generateId(),
        created_at: now,
    });

    return c.json({ policy_id: id, state: PolicyState.INACTIVE });
});

// ═══════════════════════════════════════════════════════════════════════
// Simulation
// ═══════════════════════════════════════════════════════════════════════

// POST /approvals/policies/simulate — dry-run policy evaluation
policyRoutes.post('/simulate', async (c) => {
    const body = await c.req.json();
    const { approval_type, payload, maker_id } = body;

    if (!approval_type) {
        return c.json({ error: 'approval_type is required' }, 400);
    }

    let makerActor = undefined;
    if (maker_id) {
        makerActor = await getActorById(c.env.DB, maker_id) ?? undefined;
    }

    const ctx: PolicyEvalContext = {
        approval_type,
        maker_actor: makerActor,
        payload: payload ?? {},
        now: nowISO(),
    };

    const result = await evaluatePolicies(c.env.DB, ctx);

    return c.json({
        simulation: true,
        ...result,
    });
});

// ═══════════════════════════════════════════════════════════════════════
// Explain — why was this policy matched for a request?
// ═══════════════════════════════════════════════════════════════════════

// GET /approvals/requests/:id/policy-decision
policyRoutes.get('/requests/:id/policy-decision', async (c) => {
    const requestId = c.req.param('id');

    const request = await getApprovalRequest(c.env.DB, requestId);
    if (!request) return c.json({ error: 'Approval request not found' }, 404);

    const decision = await getPolicyDecision(c.env.DB, requestId);
    const stageDecisions = await listStageDecisions(c.env.DB, requestId);

    return c.json({
        request_id: requestId,
        request_type: request.type,
        request_state: request.state,
        policy_id: (request as any).policy_id ?? decision?.matched_policy_id ?? null,
        current_stage: (request as any).current_stage ?? 1,
        total_stages: (request as any).total_stages ?? decision?.total_stages ?? 1,
        workflow_state: (request as any).workflow_state ?? null,
        policy_decision: decision ? {
            evaluation: safeParseJson(decision.evaluation_json),
            matched_policy_id: decision.matched_policy_id,
            total_stages: decision.total_stages,
            created_at: decision.created_at,
        } : null,
        stage_decisions: stageDecisions.map((d) => ({
            stage_no: d.stage_no,
            decision: d.decision,
            decider_id: d.decider_id,
            decider_role: d.decider_role,
            reason: d.reason,
            decided_at: d.decided_at,
        })),
    });
});

// ═══════════════════════════════════════════════════════════════════════
// Delegations
// ═══════════════════════════════════════════════════════════════════════

export const delegationRoutes = new Hono<{ Bindings: Env }>();

// POST /approvals/delegations — create delegation
delegationRoutes.post('/', async (c) => {
    const body = await c.req.json();
    const { delegator_id, delegate_id, approval_type, valid_from, valid_to, reason, staff_id } = body;

    if (!delegator_id || !delegate_id || !valid_from || !valid_to || !staff_id) {
        return c.json({ error: 'delegator_id, delegate_id, valid_from, valid_to, and staff_id are required' }, 400);
    }

    if (delegator_id === delegate_id) {
        return c.json({ error: 'Cannot delegate to self' }, 400);
    }

    const now = nowISO();
    const delegationId = generateId();

    await insertDelegation(c.env.DB, {
        id: delegationId,
        delegator_id,
        delegate_id,
        approval_type: approval_type ?? undefined,
        valid_from,
        valid_to,
        reason: reason ?? undefined,
        state: 'ACTIVE',
        created_by: staff_id,
        created_at: now,
    });

    const correlationId = generateId();
    await insertAuditLog(c.env.DB, {
        id: generateId(),
        action: 'APPROVAL_DELEGATION_CREATED',
        actor_type: ActorType.STAFF,
        actor_id: staff_id,
        target_type: 'approval_delegation',
        target_id: delegationId,
        after_json: JSON.stringify({ delegator_id, delegate_id, valid_from, valid_to }),
        correlation_id: correlationId,
        created_at: now,
    });

    await insertEvent(c.env.DB, {
        id: generateId(),
        name: EventName.APPROVAL_DELEGATION_CREATED as EventNameType,
        entity_type: 'approval_delegation',
        entity_id: delegationId,
        correlation_id: correlationId,
        actor_type: ActorType.STAFF,
        actor_id: staff_id,
        schema_version: 1,
        payload_json: JSON.stringify({ delegation_id: delegationId, delegator_id, delegate_id }),
        created_at: now,
    });

    return c.json({ id: delegationId, delegator_id, delegate_id, valid_from, valid_to, state: 'ACTIVE' }, 201);
});

// GET /approvals/delegations — list delegations
delegationRoutes.get('/', async (c) => {
    const delegator_id = c.req.query('delegator_id');
    const delegate_id = c.req.query('delegate_id');
    const state = c.req.query('state');

    const items = await listDelegations(c.env.DB, {
        delegator_id: delegator_id || undefined,
        delegate_id: delegate_id || undefined,
        state: state || undefined,
    });

    return c.json({ items, count: items.length });
});

// POST /approvals/delegations/:id/revoke
delegationRoutes.post('/:id/revoke', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { staff_id } = body;
    if (!staff_id) return c.json({ error: 'staff_id is required' }, 400);

    const existing = await getDelegation(c.env.DB, id);
    if (!existing) return c.json({ error: 'Delegation not found' }, 404);

    if (existing.state !== 'ACTIVE') {
        return c.json({ error: `Delegation is already ${existing.state}` }, 409);
    }

    const now = nowISO();
    await revokeDelegation(c.env.DB, id, staff_id, now);

    await insertAuditLog(c.env.DB, {
        id: generateId(),
        action: 'APPROVAL_DELEGATION_REVOKED',
        actor_type: ActorType.STAFF,
        actor_id: staff_id,
        target_type: 'approval_delegation',
        target_id: id,
        before_json: JSON.stringify({ state: 'ACTIVE' }),
        after_json: JSON.stringify({ state: 'REVOKED' }),
        correlation_id: generateId(),
        created_at: now,
    });

    return c.json({ id, state: 'REVOKED' });
});

function safeParseJson(json: string): unknown {
    try { return JSON.parse(json); } catch { return null; }
}
