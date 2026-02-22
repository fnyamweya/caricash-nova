import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
  generateId,
  nowISO,
  ApprovalState,
  ActorType,
  EventName,
} from '@caricash/shared';
import {
  getApprovalRequest,
  listApprovalRequests,
  updateApprovalRequest,
  insertEvent,
  insertAuditLog,
  getActorById,
} from '@caricash/db';
import { approvalRegistry } from '../lib/approval-handlers.js';
import type { ApprovalContext } from '../lib/approval-handlers.js';
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
// ─────────────────────────────────────────────────────────────────────
approvalRoutes.post('/:id/approve', async (c) => {
  const requestId = c.req.param('id');
  const body = await c.req.json();
  const { staff_id } = body;
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

    // ── Maker-checker: maker cannot approve their own request ────
    if (request.maker_staff_id === staff_id) {
      return c.json({ error: 'Maker cannot approve their own request', correlation_id: correlationId }, 403);
    }

    // ── Resolve handler ──────────────────────────────────────────
    const handler = approvalRegistry.get(request.type);
    if (!handler) {
      return c.json({
        error: `No approval handler registered for type: ${request.type}`,
        correlation_id: correlationId,
      }, 501);
    }

    // ── Role check ───────────────────────────────────────────────
    if (handler.allowedCheckerRoles.length > 0) {
      const staffActor = await getActorById(c.env.DB, staff_id);
      if (!staffActor || staffActor.type !== ActorType.STAFF) {
        return c.json({ error: 'Staff actor not found', correlation_id: correlationId }, 404);
      }
      if (!handler.allowedCheckerRoles.includes(staffActor.staff_role as string)) {
        return c.json({
          error: `Only ${handler.allowedCheckerRoles.join(', ')} can approve ${handler.label} requests`,
          correlation_id: correlationId,
        }, 403);
      }
    }

    const now = nowISO();
    const payload = JSON.parse(request.payload_json) as Record<string, unknown>;

    // Resolve staff actor (may already have been fetched above for role check)
    const staffActor = await getActorById(c.env.DB, staff_id);
    if (!staffActor) {
      return c.json({ error: 'Staff actor not found', correlation_id: correlationId }, 404);
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
    const eventName = (handler.eventNames?.onApprove ?? EventName.APPROVAL_APPROVED) as EventName;
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
    const eventName = (handler?.eventNames?.onReject ?? EventName.APPROVAL_REJECTED) as EventName;
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
