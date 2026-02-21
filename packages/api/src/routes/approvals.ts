import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
  generateId,
  nowISO,
  ApprovalState,
  ApprovalType,
  ActorType,
  StaffRole,
  TxnType,
  EventName,
} from '@caricash/shared';
import type { PostTransactionCommand } from '@caricash/shared';
import {
  getApprovalRequest,
  updateApprovalRequest,
  insertEvent,
  insertAuditLog,
  getActorById,
  getOrCreateLedgerAccount,
  initAccountBalance,
  getAccountBalance,
  upsertAccountBalance,
} from '@caricash/db';
import { buildReversalEntries } from '@caricash/posting-do';
import type { Entry } from '@caricash/posting-do';
import { postTransaction, getBalance } from '../lib/posting-client.js';

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
    let manualAdjustmentResult;
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

    if (request.type === ApprovalType.MANUAL_ADJUSTMENT_REQUESTED) {
      const payload = JSON.parse(request.payload_json) as {
        operation?: string;
        amount: string;
        currency: string;
        reason: string;
        reference?: string | null;
        idempotency_key: string;
        correlation_id?: string;
      };

      if (payload.operation !== 'SUSPENSE_FUNDING') {
        return c.json({ error: 'Unsupported manual adjustment payload', correlation_id: correlationId }, 400);
      }

      const adjustmentCurrency = payload.currency as 'BBD' | 'USD';

      const checker = await getActorById(c.env.DB, staff_id);
      if (!checker || checker.type !== ActorType.STAFF) {
        return c.json({ error: 'Staff actor not found', correlation_id: correlationId }, 404);
      }
      if (checker.staff_role !== StaffRole.FINANCE) {
        return c.json({ error: 'Only FINANCE staff can approve suspense funding', correlation_id: correlationId }, 403);
      }

      const sourceAccount = await getOrCreateLedgerAccount(c.env.DB, ActorType.STAFF, 'TREASURY', 'SUSPENSE', adjustmentCurrency);
      const destinationAccount = await getOrCreateLedgerAccount(c.env.DB, ActorType.STAFF, 'SYSTEM', 'SUSPENSE', adjustmentCurrency);

      await initAccountBalance(c.env.DB, sourceAccount.id, adjustmentCurrency);
      await initAccountBalance(c.env.DB, destinationAccount.id, adjustmentCurrency);

      const sourceBefore = await getAccountBalance(c.env.DB, sourceAccount.id);
      const destBefore = await getAccountBalance(c.env.DB, destinationAccount.id);

      const command: PostTransactionCommand = {
        idempotency_key: `suspense-fund:${requestId}:${payload.idempotency_key}`,
        correlation_id: correlationId,
        txn_type: TxnType.MANUAL_ADJUSTMENT,
        currency: adjustmentCurrency,
        entries: [
          {
            account_id: sourceAccount.id,
            entry_type: 'DR',
            amount: payload.amount,
            description: `Treasury suspense funding source${payload.reference ? ` (${payload.reference})` : ''}`,
          },
          {
            account_id: destinationAccount.id,
            entry_type: 'CR',
            amount: payload.amount,
            description: `System suspense funded: ${payload.reason}`,
          },
        ],
        description: `SUSPENSE_FUNDING ${payload.amount} ${payload.currency} - ${payload.reason}`,
        actor_type: ActorType.STAFF,
        actor_id: staff_id,
      };

      const domainKey = `ops:suspense:${adjustmentCurrency}`;
      manualAdjustmentResult = await postTransaction(c.env, domainKey, command);

      const sourceAfter = await getBalance(c.env, domainKey, sourceAccount.id);
      const destAfter = await getBalance(c.env, domainKey, destinationAccount.id);

      await upsertAccountBalance(c.env.DB, {
        account_id: sourceAccount.id,
        actual_balance: sourceAfter.balance,
        available_balance: sourceAfter.balance,
        hold_amount: sourceBefore?.hold_amount ?? '0.00',
        pending_credits: sourceBefore?.pending_credits ?? '0.00',
        last_journal_id: manualAdjustmentResult.journal_id,
        currency: adjustmentCurrency,
        updated_at: now,
      });
      await upsertAccountBalance(c.env.DB, {
        account_id: destinationAccount.id,
        actual_balance: destAfter.balance,
        available_balance: destAfter.balance,
        hold_amount: destBefore?.hold_amount ?? '0.00',
        pending_credits: destBefore?.pending_credits ?? '0.00',
        last_journal_id: manualAdjustmentResult.journal_id,
        currency: adjustmentCurrency,
        updated_at: now,
      });

      const adjustmentEvent = {
        id: generateId(),
        name: EventName.MANUAL_ADJUSTMENT_POSTED,
        entity_type: 'journal',
        entity_id: manualAdjustmentResult.journal_id,
        correlation_id: correlationId,
        causation_id: requestId,
        actor_type: ActorType.STAFF,
        actor_id: staff_id,
        schema_version: 1,
        payload_json: JSON.stringify({
          operation: 'SUSPENSE_FUNDING',
          amount: payload.amount,
          currency: adjustmentCurrency,
          reason: payload.reason,
          reference: payload.reference ?? null,
          source_account_id: sourceAccount.id,
          destination_account_id: destinationAccount.id,
          journal_id: manualAdjustmentResult.journal_id,
        }),
        created_at: now,
      };
      await insertEvent(c.env.DB, adjustmentEvent);
      await c.env.EVENTS_QUEUE.send(adjustmentEvent);
    }

    return c.json({
      request_id: requestId,
      state: ApprovalState.APPROVED,
      reversal: reversalResult ?? null,
      manual_adjustment: manualAdjustmentResult ?? null,
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
