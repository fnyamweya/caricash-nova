/**
 * Ops routes — staff-only operational endpoints.
 * Provides ledger inspection, reconciliation, repair, and overdraft management.
 */
import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
  generateId,
  nowISO,
  ApprovalState,
  ApprovalType,
  ActorType,
  EventName,
  ErrorCode,
} from '@caricash/shared';
import {
  getJournalById,
  getJournalLines,
  getJournalsInRange,
  insertApprovalRequest,
  getApprovalRequest,
  updateApprovalRequest,
  getOverdraftFacility,
  insertOverdraftFacility,
  updateOverdraftFacility,
  getReconciliationFindings,
  getReconciliationRuns,
  insertEvent,
  insertAuditLog,
  getActorByStaffCode,
} from '@caricash/db';

export const opsRoutes = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// Staff auth middleware (placeholder — production must verify via session/JWT)
// TODO: Replace with proper auth verification against sessions/actors table.
// Current implementation trusts X-Staff-Id header for development only.
// ---------------------------------------------------------------------------
async function requireStaff(c: any): Promise<string | null> {
  // IMPORTANT: In production, this must verify the staff session token
  // against the sessions table and check that the actor is type=STAFF.
  const staffId = c.req.header('X-Staff-Id');
  if (!staffId) {
    return null;
  }
  return staffId;
}

// ---------------------------------------------------------------------------
// GET /ops/ledger/journal/:id
// ---------------------------------------------------------------------------
opsRoutes.get('/ledger/journal/:id', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) {
    return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  }

  const journalId = c.req.param('id');
  const journal = await getJournalById(c.env.DB, journalId);
  if (!journal) {
    return c.json({ error: 'Journal not found', code: ErrorCode.JOURNAL_NOT_FOUND }, 404);
  }

  const lines = await getJournalLines(c.env.DB, journalId);

  return c.json({ journal, lines });
});

// ---------------------------------------------------------------------------
// GET /ops/ledger/verify?from=...&to=...
// ---------------------------------------------------------------------------
opsRoutes.get('/ledger/verify', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) {
    return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  }

  const from = c.req.query('from');
  const to = c.req.query('to');

  // Import integrity check dynamically to avoid circular deps
  const { verifyJournalIntegrity } = await import('@caricash/jobs');
  const result = await verifyJournalIntegrity(c.env.DB, from, to);

  // Audit log
  const correlationId = generateId();
  await insertAuditLog(c.env.DB, {
    id: generateId(),
    action: 'LEDGER_INTEGRITY_CHECK',
    actor_type: ActorType.STAFF,
    actor_id: staffId,
    target_type: 'ledger',
    target_id: 'all',
    correlation_id: correlationId,
    created_at: nowISO(),
  });

  return c.json(result);
});

// ---------------------------------------------------------------------------
// POST /ops/reconciliation/run
// ---------------------------------------------------------------------------
opsRoutes.post('/reconciliation/run', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) {
    return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  }

  const { runReconciliation } = await import('@caricash/jobs');
  const result = await runReconciliation(c.env.DB, staffId);

  // Audit log
  await insertAuditLog(c.env.DB, {
    id: generateId(),
    action: 'RECONCILIATION_RUN',
    actor_type: ActorType.STAFF,
    actor_id: staffId,
    target_type: 'reconciliation',
    target_id: result.run_id,
    correlation_id: result.run_id,
    created_at: nowISO(),
  });

  return c.json(result);
});

// ---------------------------------------------------------------------------
// GET /ops/reconciliation/findings
// ---------------------------------------------------------------------------
opsRoutes.get('/reconciliation/findings', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) {
    return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  }

  const status = c.req.query('status');
  const findings = await getReconciliationFindings(c.env.DB, status);

  return c.json({ findings, count: findings.length });
});

// ---------------------------------------------------------------------------
// GET /ops/reconciliation/runs
// ---------------------------------------------------------------------------
opsRoutes.get('/reconciliation/runs', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) {
    return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  }

  const runs = await getReconciliationRuns(c.env.DB);

  return c.json({ runs, count: runs.length });
});

// ---------------------------------------------------------------------------
// POST /ops/repair/idempotency/:journal_id
// ---------------------------------------------------------------------------
opsRoutes.post('/repair/idempotency/:journal_id', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) {
    return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  }

  const journalId = c.req.param('journal_id');
  const correlationId = generateId();

  // Verify journal exists
  const journal = await getJournalById(c.env.DB, journalId);
  if (!journal) {
    return c.json({ error: 'Journal not found', code: ErrorCode.JOURNAL_NOT_FOUND }, 404);
  }

  // Run targeted idempotency repair for this specific journal
  const { repairSingleJournalIdempotency } = await import('@caricash/jobs');
  const result = await repairSingleJournalIdempotency(c.env.DB, journalId);

  // Audit log
  await insertAuditLog(c.env.DB, {
    id: generateId(),
    action: 'REPAIR_IDEMPOTENCY',
    actor_type: ActorType.STAFF,
    actor_id: staffId,
    target_type: 'journal',
    target_id: journalId,
    after_json: JSON.stringify({ repaired: result.repaired }),
    correlation_id: correlationId,
    created_at: nowISO(),
  });

  return c.json({
    journal_id: journalId,
    ...result,
    correlation_id: correlationId,
  });
});

// ---------------------------------------------------------------------------
// POST /ops/repair/state/:journal_id
// ---------------------------------------------------------------------------
opsRoutes.post('/repair/state/:journal_id', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) {
    return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  }

  const journalId = c.req.param('journal_id');
  const correlationId = generateId();

  // Verify journal exists
  const journal = await getJournalById(c.env.DB, journalId);
  if (!journal) {
    return c.json({ error: 'Journal not found', code: ErrorCode.JOURNAL_NOT_FOUND }, 404);
  }

  // Run targeted state repair for this specific journal's idempotency record
  const { repairSingleJournalState } = await import('@caricash/jobs');
  const result = await repairSingleJournalState(c.env.DB, journalId);

  // Audit log
  await insertAuditLog(c.env.DB, {
    id: generateId(),
    action: 'REPAIR_STATE',
    actor_type: ActorType.STAFF,
    actor_id: staffId,
    target_type: 'journal',
    target_id: journalId,
    after_json: JSON.stringify({ repaired: result.repaired }),
    correlation_id: correlationId,
    created_at: nowISO(),
  });

  return c.json({
    journal_id: journalId,
    ...result,
    correlation_id: correlationId,
  });
});

// ---------------------------------------------------------------------------
// POST /ops/overdraft/request
// ---------------------------------------------------------------------------
opsRoutes.post('/overdraft/request', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) {
    return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  }

  const body = await c.req.json();
  const { account_id, limit_amount, currency, correlation_id: corrId } = body;
  const correlationId = (corrId as string) || generateId();

  if (!account_id || !limit_amount || !currency) {
    return c.json({ error: 'account_id, limit_amount, and currency are required', code: ErrorCode.MISSING_REQUIRED_FIELD }, 400);
  }

  const now = nowISO();
  const facilityId = generateId();
  const requestId = generateId();

  // Create the overdraft facility in PENDING state
  await insertOverdraftFacility(c.env.DB, {
    id: facilityId,
    account_id,
    limit_amount,
    currency,
    state: 'PENDING',
    maker_staff_id: staffId,
    created_at: now,
  });

  // Create maker-checker approval request
  await insertApprovalRequest(c.env.DB, {
    id: requestId,
    type: ApprovalType.OVERDRAFT_FACILITY_REQUESTED,
    payload_json: JSON.stringify({ facility_id: facilityId, account_id, limit_amount, currency }),
    maker_staff_id: staffId,
    state: ApprovalState.PENDING,
    created_at: now,
  });

  // Emit event
  await insertEvent(c.env.DB, {
    id: generateId(),
    name: EventName.OVERDRAFT_FACILITY_CREATED,
    entity_type: 'overdraft_facility',
    entity_id: facilityId,
    correlation_id: correlationId,
    actor_type: ActorType.STAFF,
    actor_id: staffId,
    schema_version: 1,
    payload_json: JSON.stringify({ facility_id: facilityId, request_id: requestId }),
    created_at: now,
  });

  return c.json({
    facility_id: facilityId,
    request_id: requestId,
    state: 'PENDING',
    correlation_id: correlationId,
  }, 201);
});

// ---------------------------------------------------------------------------
// POST /ops/overdraft/:id/approve
// ---------------------------------------------------------------------------
opsRoutes.post('/overdraft/:id/approve', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) {
    return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  }

  const requestId = c.req.param('id');
  const body = await c.req.json();
  const correlationId = (body.correlation_id as string) || generateId();

  const request = await getApprovalRequest(c.env.DB, requestId);
  if (!request) {
    return c.json({ error: 'Approval request not found', code: ErrorCode.APPROVAL_NOT_FOUND }, 404);
  }

  if (request.state !== ApprovalState.PENDING) {
    return c.json({ error: `Request is already ${request.state}`, code: ErrorCode.APPROVAL_ALREADY_DECIDED }, 409);
  }

  // Maker-checker enforcement — maker cannot approve their own request
  if (request.maker_staff_id === staffId) {
    return c.json({ error: 'Maker cannot approve their own request', code: ErrorCode.MAKER_CHECKER_VIOLATION }, 403);
  }

  const now = nowISO();
  await updateApprovalRequest(c.env.DB, requestId, ApprovalState.APPROVED, staffId, now);

  // Activate the overdraft facility
  const payload = JSON.parse(request.payload_json) as { facility_id: string };
  await updateOverdraftFacility(c.env.DB, payload.facility_id, 'ACTIVE', staffId, now);

  // Audit log with before/after
  await insertAuditLog(c.env.DB, {
    id: generateId(),
    action: 'OVERDRAFT_APPROVED',
    actor_type: ActorType.STAFF,
    actor_id: staffId,
    target_type: 'overdraft_facility',
    target_id: payload.facility_id,
    before_json: JSON.stringify({ state: 'PENDING' }),
    after_json: JSON.stringify({ state: 'ACTIVE' }),
    correlation_id: correlationId,
    created_at: now,
  });

  // Emit event
  await insertEvent(c.env.DB, {
    id: generateId(),
    name: EventName.OVERDRAFT_FACILITY_APPROVED,
    entity_type: 'overdraft_facility',
    entity_id: payload.facility_id,
    correlation_id: correlationId,
    actor_type: ActorType.STAFF,
    actor_id: staffId,
    schema_version: 1,
    payload_json: JSON.stringify({ facility_id: payload.facility_id, request_id: requestId }),
    created_at: now,
  });

  return c.json({
    request_id: requestId,
    state: ApprovalState.APPROVED,
    correlation_id: correlationId,
  });
});

// ---------------------------------------------------------------------------
// POST /ops/overdraft/:id/reject
// ---------------------------------------------------------------------------
opsRoutes.post('/overdraft/:id/reject', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) {
    return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  }

  const requestId = c.req.param('id');
  const body = await c.req.json();
  const correlationId = (body.correlation_id as string) || generateId();
  const reason = body.reason || '';

  const request = await getApprovalRequest(c.env.DB, requestId);
  if (!request) {
    return c.json({ error: 'Approval request not found', code: ErrorCode.APPROVAL_NOT_FOUND }, 404);
  }

  if (request.state !== ApprovalState.PENDING) {
    return c.json({ error: `Request is already ${request.state}`, code: ErrorCode.APPROVAL_ALREADY_DECIDED }, 409);
  }

  const now = nowISO();
  await updateApprovalRequest(c.env.DB, requestId, ApprovalState.REJECTED, staffId, now);

  // Reject the overdraft facility
  const payload = JSON.parse(request.payload_json) as { facility_id: string };
  await updateOverdraftFacility(c.env.DB, payload.facility_id, 'REJECTED', staffId);

  // Audit log with before/after
  await insertAuditLog(c.env.DB, {
    id: generateId(),
    action: 'OVERDRAFT_REJECTED',
    actor_type: ActorType.STAFF,
    actor_id: staffId,
    target_type: 'overdraft_facility',
    target_id: payload.facility_id,
    before_json: JSON.stringify({ state: 'PENDING' }),
    after_json: JSON.stringify({ state: 'REJECTED', reason }),
    correlation_id: correlationId,
    created_at: now,
  });

  // Emit rejection event
  await insertEvent(c.env.DB, {
    id: generateId(),
    name: EventName.OVERDRAFT_FACILITY_REJECTED,
    entity_type: 'overdraft_facility',
    entity_id: payload.facility_id,
    correlation_id: correlationId,
    actor_type: ActorType.STAFF,
    actor_id: staffId,
    schema_version: 1,
    payload_json: JSON.stringify({ facility_id: payload.facility_id, request_id: requestId, reason }),
    created_at: now,
  });

  return c.json({
    request_id: requestId,
    state: ApprovalState.REJECTED,
    correlation_id: correlationId,
  });
});
