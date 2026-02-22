import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
  generateId,
  nowISO,
  ApprovalState,
  ActorType,
  EventName,
  WorkflowState,
  StageDecision,
} from '@caricash/shared';
import type { EventName as EventNameType } from '@caricash/shared';
import {
  getApprovalRequest,
  listApprovalRequests,
  updateApprovalRequest,
  updateApprovalRequestWorkflow,
  insertEvent,
  insertAuditLog,
  getActorById,
  getApprovalPolicyFull,
  insertStageDecision,
  countStageDecisions,
  hasDeciderDecidedStage,
  listStageDecisions,
} from '@caricash/db';
import { approvalRegistry } from '../lib/approval-handlers.js';
import type { ApprovalContext } from '../lib/approval-handlers.js';
import { checkStageAuthorization } from '../lib/policy-engine.js';
// Side-effect: registers all concrete handlers into the registry
import '../lib/approval-handler-impls.js';

export const approvalRoutes = new Hono<{ Bindings: Env }>();

// GET /approvals
approvalRoutes.get('/', async (c) => {
  const status = c.req.query('status');
  const type = c.req.query('type');
  const pageSizeRaw = Number(c.req.query('pageSize') ?? '50');
  const pageSize = Number.isFinite(pageSizeRaw) ? pageSizeRaw : 50;

  try {
    const items = await listApprovalRequests(c.env.DB, {
      state: status || undefined,
      type: type || undefined,
      limit: pageSize,
    });

    return c.json({
      items: items.map((item) => ({
        ...item,
        payload: safeParsePayload(item.payload_json),
      })),
      nextCursor: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message }, 500);
  }
});

// GET /approvals/types — list all registered approval types and their metadata
approvalRoutes.get('/types', (c) => {
  const types = approvalRegistry.types().map((type) => {
    const handler = approvalRegistry.get(type)!;
    return {
      type,
      label: handler.label,
      allowed_checker_roles: handler.allowedCheckerRoles,
      has_approve_handler: !!handler.onApprove,
      has_reject_handler: !!handler.onReject,
    };
  });
  return c.json({ types });
});

// GET /approvals/:id
approvalRoutes.get('/:id', async (c) => {
  const requestId = c.req.param('id');

  try {
    const request = await getApprovalRequest(c.env.DB, requestId);
    if (!request) {
      return c.json({ error: 'Approval request not found' }, 404);
    }

    const handler = approvalRegistry.get(request.type);

    return c.json({
      ...request,
      payload: safeParsePayload(request.payload_json),
      handler_label: handler?.label ?? null,
      allowed_checker_roles: handler?.allowedCheckerRoles ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /approvals/:id/approve — Generic, registry-dispatched approval
// Supports both legacy (single-step) and policy-driven (multi-stage) workflows.
// ─────────────────────────────────────────────────────────────────────
approvalRoutes.post('/:id/approve', async (c) => {
  const requestId = c.req.param('id');
  const body = await c.req.json();
  const { staff_id, reason } = body;
  const correlationId = (body.correlation_id as string) || generateId();

  if (!staff_id) {
    return c.json({ error: 'staff_id is required', correlation_id: correlationId }, 400);
  }

  try {
    // ── Fetch request ────────────────────────────────────────────
    const request = await getApprovalRequest(c.env.DB, requestId);
    if (!request) {
      return c.json({ error: 'Approval request not found', correlation_id: correlationId }, 404);
    }

    if (request.state !== ApprovalState.PENDING) {
      return c.json({ error: `Request is already ${request.state}`, correlation_id: correlationId }, 409);
    }

    // ── Resolve handler ──────────────────────────────────────────
    const handler = approvalRegistry.get(request.type);
    if (!handler) {
      return c.json({
        error: `No approval handler registered for type: ${request.type}`,
        correlation_id: correlationId,
      }, 501);
    }

    // ── Resolve staff actor ──────────────────────────────────────
    const staffActor = await getActorById(c.env.DB, staff_id);
    if (!staffActor || staffActor.type !== ActorType.STAFF) {
      return c.json({ error: 'Staff actor not found', correlation_id: correlationId }, 404);
    }

    const now = nowISO();
    const payload = JSON.parse(request.payload_json) as Record<string, unknown>;
    const reqAny = request as any;
    const policyId: string | null = reqAny.policy_id ?? null;

    // ═════════════════════════════════════════════════════════════
    // POLICY-DRIVEN WORKFLOW (multi-stage)
    // ═════════════════════════════════════════════════════════════
    if (policyId) {
      const policyFull = await getApprovalPolicyFull(c.env.DB, policyId);
      if (!policyFull) {
        return c.json({ error: 'Linked policy not found', correlation_id: correlationId }, 500);
      }

      const currentStage: number = reqAny.current_stage ?? 1;
      const totalStages: number = reqAny.total_stages ?? (policyFull.stages.length || 1);

      // Find the stage definition
      const stageDef = policyFull.stages.find((s) => s.stage_no === currentStage);
      if (!stageDef) {
        return c.json({ error: `Stage ${currentStage} not found in policy`, correlation_id: correlationId }, 400);
      }

      // Check if this decider has already decided this stage
      const alreadyDecided = await hasDeciderDecidedStage(c.env.DB, requestId, currentStage, staff_id);
      if (alreadyDecided) {
        return c.json({ error: 'You have already decided on this stage', correlation_id: correlationId }, 409);
      }

      // Get previous stage decider IDs for exclusion check
      const prevDecisions = await listStageDecisions(c.env.DB, requestId);
      const previousDeciderIds = prevDecisions
        .filter((d) => d.stage_no < currentStage)
        .map((d) => d.decider_id);

      // Check stage authorization using policy engine
      const authResult = await checkStageAuthorization(
        c.env.DB, stageDef, staff_id, staffActor, request.maker_staff_id,
        requestId, currentStage, request.type, now, previousDeciderIds,
      );

      if (!authResult.authorized) {
        return c.json({ error: authResult.reason, correlation_id: correlationId }, 403);
      }

      // Record stage decision
      await insertStageDecision(c.env.DB, {
        id: generateId(),
        request_id: requestId,
        policy_id: policyId,
        stage_no: currentStage,
        decision: StageDecision.APPROVE,
        decider_id: staff_id,
        decider_role: staffActor.staff_role ?? undefined,
        reason: reason ?? undefined,
        decided_at: now,
        created_at: now,
      });

      // Count approvals for this stage
      const approvalCount = await countStageDecisions(c.env.DB, requestId, currentStage, StageDecision.APPROVE);

      // Emit stage decision event
      await insertEvent(c.env.DB, {
        id: generateId(),
        name: EventName.APPROVAL_STAGE_DECIDED as EventNameType,
        entity_type: 'approval_request',
        entity_id: requestId,
        correlation_id: correlationId,
        actor_type: ActorType.STAFF,
        actor_id: staff_id,
        schema_version: 1,
        payload_json: JSON.stringify({
          request_id: requestId, stage_no: currentStage, decision: StageDecision.APPROVE,
          approval_count: approvalCount, min_required: stageDef.min_approvals,
        }),
        created_at: now,
      });

      // Check if stage is complete (enough approvals)
      if (approvalCount >= stageDef.min_approvals) {
        if (currentStage >= totalStages) {
          // ── All stages complete → APPROVED ────────────────────
          await updateApprovalRequestWorkflow(c.env.DB, requestId, {
            current_stage: currentStage,
            workflow_state: WorkflowState.ALL_STAGES_COMPLETE,
          });
          await updateApprovalRequest(c.env.DB, requestId, ApprovalState.APPROVED, staff_id, now);

          // Audit
          await insertAuditLog(c.env.DB, {
            id: generateId(),
            action: handler.auditActions?.onApprove ?? 'APPROVAL_APPROVED',
            actor_type: ActorType.STAFF,
            actor_id: staff_id,
            target_type: 'approval_request',
            target_id: requestId,
            before_json: JSON.stringify({ state: ApprovalState.PENDING, stage: currentStage }),
            after_json: JSON.stringify({ state: ApprovalState.APPROVED, workflow_state: WorkflowState.ALL_STAGES_COMPLETE }),
            correlation_id: correlationId,
            created_at: now,
          });

          // Event
          const eventName = (handler.eventNames?.onApprove ?? EventName.APPROVAL_APPROVED) as EventNameType;
          const event = {
            id: generateId(),
            name: eventName,
            entity_type: 'approval_request',
            entity_id: requestId,
            correlation_id: correlationId,
            actor_type: ActorType.STAFF,
            actor_id: staff_id,
            schema_version: 1,
            payload_json: JSON.stringify({ request_id: requestId, type: request.type, total_stages: totalStages }),
            created_at: now,
          };
          await insertEvent(c.env.DB, event);
          await c.env.EVENTS_QUEUE.send(event);

          // Execute handler side-effects
          let handlerResult = {};
          if (handler.onApprove) {
            const ctx: ApprovalContext = { c, request, payload, staffId: staff_id, staffActor, correlationId, now };
            handlerResult = await handler.onApprove(ctx);
          }

          return c.json({
            request_id: requestId,
            type: request.type,
            state: ApprovalState.APPROVED,
            workflow_state: WorkflowState.ALL_STAGES_COMPLETE,
            current_stage: currentStage,
            total_stages: totalStages,
            handler: handler.label,
            result: handlerResult,
            correlation_id: correlationId,
          });
        } else {
          // ── Stage complete, advance to next stage ─────────────
          const nextStage = currentStage + 1;
          await updateApprovalRequestWorkflow(c.env.DB, requestId, {
            current_stage: nextStage,
            workflow_state: WorkflowState.STAGE_PENDING,
          });

          await insertEvent(c.env.DB, {
            id: generateId(),
            name: EventName.APPROVAL_STAGE_ADVANCED as EventNameType,
            entity_type: 'approval_request',
            entity_id: requestId,
            correlation_id: correlationId,
            actor_type: ActorType.STAFF,
            actor_id: staff_id,
            schema_version: 1,
            payload_json: JSON.stringify({
              request_id: requestId, from_stage: currentStage, to_stage: nextStage,
            }),
            created_at: now,
          });

          return c.json({
            request_id: requestId,
            type: request.type,
            state: ApprovalState.PENDING,
            workflow_state: WorkflowState.STAGE_PENDING,
            current_stage: nextStage,
            total_stages: totalStages,
            stage_completed: currentStage,
            handler: handler.label,
            correlation_id: correlationId,
          });
        }
      }

      // Stage not yet complete — approval recorded but needs more
      return c.json({
        request_id: requestId,
        type: request.type,
        state: ApprovalState.PENDING,
        workflow_state: WorkflowState.STAGE_PENDING,
        current_stage: currentStage,
        total_stages: totalStages,
        stage_approvals: approvalCount,
        stage_required: stageDef.min_approvals,
        handler: handler.label,
        correlation_id: correlationId,
      });
    }

    // ═════════════════════════════════════════════════════════════
    // LEGACY WORKFLOW (single-step, handler-based)
    // ═════════════════════════════════════════════════════════════

    // ── Maker-checker: maker cannot approve their own request ────
    if (request.maker_staff_id === staff_id) {
      return c.json({ error: 'Maker cannot approve their own request', correlation_id: correlationId }, 403);
    }

    // ── Role check ───────────────────────────────────────────────
    if (handler.allowedCheckerRoles.length > 0) {
      if (!handler.allowedCheckerRoles.includes(staffActor.staff_role as string)) {
        return c.json({
          error: `Only ${handler.allowedCheckerRoles.join(', ')} can approve ${handler.label} requests`,
          correlation_id: correlationId,
        }, 403);
      }
    }

    const ctx: ApprovalContext = {
      c, request, payload, staffId: staff_id, staffActor, correlationId, now,
    };

    // ── Custom validation ────────────────────────────────────────
    if (handler.validateApproval) {
      const validationError = await handler.validateApproval(ctx);
      if (validationError) {
        return c.json({ error: validationError, correlation_id: correlationId }, 400);
      }
    }

    // ── Update state to APPROVED ─────────────────────────────────
    await updateApprovalRequest(c.env.DB, requestId, ApprovalState.APPROVED, staff_id, now);

    // ── Audit log ────────────────────────────────────────────────
    const auditAction = handler.auditActions?.onApprove ?? 'APPROVAL_APPROVED';
    await insertAuditLog(c.env.DB, {
      id: generateId(),
      action: auditAction,
      actor_type: ActorType.STAFF,
      actor_id: staff_id,
      target_type: 'approval_request',
      target_id: requestId,
      before_json: JSON.stringify({ state: ApprovalState.PENDING }),
      after_json: JSON.stringify({ state: ApprovalState.APPROVED }),
      correlation_id: correlationId,
      created_at: now,
    });

    // ── Emit event ───────────────────────────────────────────────
    const eventName = (handler.eventNames?.onApprove ?? EventName.APPROVAL_APPROVED) as EventNameType;
    const event = {
      id: generateId(),
      name: eventName,
      entity_type: 'approval_request',
      entity_id: requestId,
      correlation_id: correlationId,
      actor_type: ActorType.STAFF,
      actor_id: staff_id,
      schema_version: 1,
      payload_json: JSON.stringify({ request_id: requestId, type: request.type }),
      created_at: now,
    };
    await insertEvent(c.env.DB, event);
    await c.env.EVENTS_QUEUE.send(event);

    // ── Execute handler side-effects ─────────────────────────────
    let handlerResult = {};
    if (handler.onApprove) {
      handlerResult = await handler.onApprove(ctx);
    }

    return c.json({
      request_id: requestId,
      type: request.type,
      state: ApprovalState.APPROVED,
      handler: handler.label,
      result: handlerResult,
      correlation_id: correlationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /approvals/:id/reject — Generic, registry-dispatched rejection
// Supports both legacy (single-step) and policy-driven (multi-stage) workflows.
// ─────────────────────────────────────────────────────────────────────
approvalRoutes.post('/:id/reject', async (c) => {
  const requestId = c.req.param('id');
  const body = await c.req.json();
  const { staff_id, reason } = body;
  const correlationId = (body.correlation_id as string) || generateId();

  if (!staff_id) {
    return c.json({ error: 'staff_id is required', correlation_id: correlationId }, 400);
  }

  try {
    const request = await getApprovalRequest(c.env.DB, requestId);
    if (!request) {
      return c.json({ error: 'Approval request not found', correlation_id: correlationId }, 404);
    }

    if (request.state !== ApprovalState.PENDING) {
      return c.json({ error: `Request is already ${request.state}`, correlation_id: correlationId }, 409);
    }

    // ── Resolve handler ──────────────────────────────────────────
    const handler = approvalRegistry.get(request.type);

    const now = nowISO();
    const reqAny = request as any;
    const policyId: string | null = reqAny.policy_id ?? null;

    // ═════════════════════════════════════════════════════════════
    // POLICY-DRIVEN WORKFLOW — rejection at any stage rejects the whole request
    // ═════════════════════════════════════════════════════════════
    if (policyId) {
      const policyFull = await getApprovalPolicyFull(c.env.DB, policyId);
      const currentStage: number = reqAny.current_stage ?? 1;
      const totalStages: number = reqAny.total_stages ?? 1;

      const staffActor = await getActorById(c.env.DB, staff_id);
      if (!staffActor) {
        return c.json({ error: 'Staff actor not found', correlation_id: correlationId }, 404);
      }

      // Check if this decider has already decided this stage
      const alreadyDecided = await hasDeciderDecidedStage(c.env.DB, requestId, currentStage, staff_id);
      if (alreadyDecided) {
        return c.json({ error: 'You have already decided on this stage', correlation_id: correlationId }, 409);
      }

      // Optionally check stage authorization if policy available
      if (policyFull) {
        const stageDef = policyFull.stages.find((s) => s.stage_no === currentStage);
        if (stageDef) {
          const prevDecisions = await listStageDecisions(c.env.DB, requestId);
          const previousDeciderIds = prevDecisions
            .filter((d) => d.stage_no < currentStage)
            .map((d) => d.decider_id);

          const authResult = await checkStageAuthorization(
            c.env.DB, stageDef, staff_id, staffActor, request.maker_staff_id,
            requestId, currentStage, request.type, now, previousDeciderIds,
          );

          if (!authResult.authorized) {
            return c.json({ error: authResult.reason, correlation_id: correlationId }, 403);
          }
        }
      }

      // Record stage rejection
      await insertStageDecision(c.env.DB, {
        id: generateId(),
        request_id: requestId,
        policy_id: policyId,
        stage_no: currentStage,
        decision: StageDecision.REJECT,
        decider_id: staff_id,
        decider_role: staffActor.staff_role ?? undefined,
        reason: reason ?? undefined,
        decided_at: now,
        created_at: now,
      });

      // A rejection at any stage rejects the whole request
      await updateApprovalRequestWorkflow(c.env.DB, requestId, {
        workflow_state: WorkflowState.ALL_STAGES_COMPLETE,
      });
      await updateApprovalRequest(c.env.DB, requestId, ApprovalState.REJECTED, staff_id, now);

      // Audit
      await insertAuditLog(c.env.DB, {
        id: generateId(),
        action: handler?.auditActions?.onReject ?? 'APPROVAL_REJECTED',
        actor_type: ActorType.STAFF,
        actor_id: staff_id,
        target_type: 'approval_request',
        target_id: requestId,
        before_json: JSON.stringify({ state: ApprovalState.PENDING, stage: currentStage }),
        after_json: JSON.stringify({ state: ApprovalState.REJECTED, reason }),
        correlation_id: correlationId,
        created_at: now,
      });

      // Event
      const eventName = (handler?.eventNames?.onReject ?? EventName.APPROVAL_REJECTED) as EventNameType;
      const event = {
        id: generateId(),
        name: eventName,
        entity_type: 'approval_request',
        entity_id: requestId,
        correlation_id: correlationId,
        actor_type: ActorType.STAFF,
        actor_id: staff_id,
        schema_version: 1,
        payload_json: JSON.stringify({ request_id: requestId, reason, stage: currentStage }),
        created_at: now,
      };
      await insertEvent(c.env.DB, event);
      await c.env.EVENTS_QUEUE.send(event);

      // Execute handler rejection side-effects
      let handlerResult = {};
      if (handler?.onReject) {
        const payload = JSON.parse(request.payload_json) as Record<string, unknown>;
        handlerResult = await handler.onReject({
          c, request, payload, staffId: staff_id, staffActor, correlationId, now, reason: reason ?? '',
        });
      }

      return c.json({
        request_id: requestId,
        type: request.type,
        state: ApprovalState.REJECTED,
        workflow_state: WorkflowState.ALL_STAGES_COMPLETE,
        rejected_at_stage: currentStage,
        total_stages: totalStages,
        handler: handler?.label ?? null,
        result: handlerResult,
        correlation_id: correlationId,
      });
    }

    // ═════════════════════════════════════════════════════════════
    // LEGACY WORKFLOW (single-step)
    // ═════════════════════════════════════════════════════════════
    await updateApprovalRequest(c.env.DB, requestId, ApprovalState.REJECTED, staff_id, now);

    // ── Audit log ────────────────────────────────────────────────
    const auditAction = handler?.auditActions?.onReject ?? 'APPROVAL_REJECTED';
    await insertAuditLog(c.env.DB, {
      id: generateId(),
      action: auditAction,
      actor_type: ActorType.STAFF,
      actor_id: staff_id,
      target_type: 'approval_request',
      target_id: requestId,
      before_json: JSON.stringify({ state: ApprovalState.PENDING }),
      after_json: JSON.stringify({ state: ApprovalState.REJECTED, reason }),
      correlation_id: correlationId,
      created_at: now,
    });

    // ── Emit event ───────────────────────────────────────────────
    const eventName = (handler?.eventNames?.onReject ?? EventName.APPROVAL_REJECTED) as EventNameType;
    const event = {
      id: generateId(),
      name: eventName,
      entity_type: 'approval_request',
      entity_id: requestId,
      correlation_id: correlationId,
      actor_type: ActorType.STAFF,
      actor_id: staff_id,
      schema_version: 1,
      payload_json: JSON.stringify({ request_id: requestId, reason }),
      created_at: now,
    };
    await insertEvent(c.env.DB, event);
    await c.env.EVENTS_QUEUE.send(event);

    // ── Execute handler rejection side-effects ───────────────────
    let handlerResult = {};
    if (handler?.onReject) {
      const payload = JSON.parse(request.payload_json) as Record<string, unknown>;
      const staffActor = await getActorById(c.env.DB, staff_id);
      if (staffActor) {
        handlerResult = await handler.onReject({
          c, request, payload, staffId: staff_id, staffActor, correlationId, now, reason: reason ?? '',
        });
      }
    }

    return c.json({
      request_id: requestId,
      type: request.type,
      state: ApprovalState.REJECTED,
      handler: handler?.label ?? null,
      result: handlerResult,
      correlation_id: correlationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});

function safeParsePayload(payloadJson: string): unknown {
  try {
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}
