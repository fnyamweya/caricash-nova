import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
  generateId,
  nowISO,
  ApprovalState,
  ApprovalType,
  ActorType,
  TxnType,
  EventName,
} from '@caricash/shared';
import type { PostTransactionCommand } from '@caricash/shared';
import {
  getApprovalRequest,
  updateApprovalRequest,
  insertEvent,
  insertAuditLog,
} from '@caricash/db';
import { buildReversalEntries } from '@caricash/posting-do';
import type { Entry } from '@caricash/posting-do';
import { postTransaction } from '../lib/posting-client.js';

export const approvalRoutes = new Hono<{ Bindings: Env }>();

// POST /approvals/:id/approve
approvalRoutes.post('/:id/approve', async (c) => {
  const requestId = c.req.param('id');
  const body = await c.req.json();
  const { staff_id } = body;
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

    // Maker-checker: maker cannot approve their own request
    if (request.maker_staff_id === staff_id) {
      return c.json({ error: 'Maker cannot approve their own request', correlation_id: correlationId }, 403);
    }

    const now = nowISO();
    await updateApprovalRequest(c.env.DB, requestId, ApprovalState.APPROVED, staff_id, now);

    // Audit log
    await insertAuditLog(c.env.DB, {
      id: generateId(),
      action: 'APPROVAL_APPROVED',
      actor_type: ActorType.STAFF,
      actor_id: staff_id,
      target_type: 'approval_request',
      target_id: requestId,
      before_json: JSON.stringify({ state: ApprovalState.PENDING }),
      after_json: JSON.stringify({ state: ApprovalState.APPROVED }),
      correlation_id: correlationId,
      created_at: now,
    });

    // Emit APPROVAL_APPROVED event
    const approvalEvent = {
      id: generateId(),
      name: EventName.APPROVAL_APPROVED,
      entity_type: 'approval_request',
      entity_id: requestId,
      correlation_id: correlationId,
      actor_type: ActorType.STAFF,
      actor_id: staff_id,
      schema_version: 1,
      payload_json: JSON.stringify({ request_id: requestId, type: request.type }),
      created_at: now,
    };
    await insertEvent(c.env.DB, approvalEvent);
    await c.env.EVENTS_QUEUE.send(approvalEvent);

    // If reversal, execute the reversal posting
    let reversalResult;
    if (request.type === ApprovalType.REVERSAL_REQUESTED) {
      const payload = JSON.parse(request.payload_json) as {
        original_journal_id: string;
        reason: string;
        idempotency_key: string;
      };

      // Fetch original journal lines to build reversal entries
      const linesResult = await c.env.DB
        .prepare('SELECT account_id, entry_type, amount, description FROM ledger_lines WHERE journal_id = ?1')
        .bind(payload.original_journal_id)
        .all();

      const originalEntries: Entry[] = (linesResult.results ?? []).map((l: Record<string, unknown>) => ({
        account_id: l.account_id as string,
        entry_type: l.entry_type as 'DR' | 'CR',
        amount: l.amount as string,
        description: l.description as string | undefined,
      }));

      const reversalEntries = buildReversalEntries(originalEntries);

      // Fetch original journal for currency
      const originalJournal = await c.env.DB
        .prepare('SELECT * FROM ledger_journals WHERE id = ?1')
        .bind(payload.original_journal_id)
        .first() as { currency: string; txn_type: string } | null;

      if (!originalJournal) {
        return c.json({ error: 'Original journal not found', correlation_id: correlationId }, 404);
      }

      const reversalCommand: PostTransactionCommand = {
        idempotency_key: `reversal:${payload.idempotency_key}`,
        correlation_id: correlationId,
        txn_type: TxnType.REVERSAL,
        currency: originalJournal.currency as PostTransactionCommand['currency'],
        entries: reversalEntries,
        description: `Reversal of ${payload.original_journal_id}: ${payload.reason}`,
        actor_type: ActorType.STAFF,
        actor_id: staff_id,
      };

      const domainKey = `REVERSAL:${payload.original_journal_id}`;
      reversalResult = await postTransaction(c.env, domainKey, reversalCommand);

      // Emit REVERSAL_POSTED event
      const reversalEvent = {
        id: generateId(),
        name: EventName.REVERSAL_POSTED,
        entity_type: 'journal',
        entity_id: reversalResult.journal_id,
        correlation_id: correlationId,
        causation_id: requestId,
        actor_type: ActorType.STAFF,
        actor_id: staff_id,
        schema_version: 1,
        payload_json: JSON.stringify({
          original_journal_id: payload.original_journal_id,
          reversal_journal_id: reversalResult.journal_id,
        }),
        created_at: nowISO(),
      };
      await insertEvent(c.env.DB, reversalEvent);
      await c.env.EVENTS_QUEUE.send(reversalEvent);
    }

    return c.json({
      request_id: requestId,
      state: ApprovalState.APPROVED,
      reversal: reversalResult ?? null,
      correlation_id: correlationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});

// POST /approvals/:id/reject
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

    const now = nowISO();
    await updateApprovalRequest(c.env.DB, requestId, ApprovalState.REJECTED, staff_id, now);

    // Audit log
    await insertAuditLog(c.env.DB, {
      id: generateId(),
      action: 'APPROVAL_REJECTED',
      actor_type: ActorType.STAFF,
      actor_id: staff_id,
      target_type: 'approval_request',
      target_id: requestId,
      before_json: JSON.stringify({ state: ApprovalState.PENDING }),
      after_json: JSON.stringify({ state: ApprovalState.REJECTED, reason }),
      correlation_id: correlationId,
      created_at: now,
    });

    // Emit APPROVAL_REJECTED event
    const event = {
      id: generateId(),
      name: EventName.APPROVAL_REJECTED,
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

    return c.json({
      request_id: requestId,
      state: ApprovalState.REJECTED,
      correlation_id: correlationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});
