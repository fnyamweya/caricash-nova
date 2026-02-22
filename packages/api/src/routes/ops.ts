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
  AccountType,
  StaffRole,
  EventName,
  ErrorCode,
  suspenseFundRequestSchema,
} from '@caricash/shared';
import {
  getJournalById,
  getJournalLines,
  getJournalsInRange,
  insertApprovalRequest,
  getApprovalRequest,
  updateApprovalRequest,
  listApprovalRequests,
  getOverdraftFacility,
  insertOverdraftFacility,
  updateOverdraftFacility,
  getReconciliationFindings,
  getReconciliationRuns,
  insertEvent,
  insertAuditLog,
  getActorById,
  listActiveStaffByRole,
  getLedgerAccount,
  getAccountBalance,
  // V2 Accounting
  getChartOfAccounts,
  getChartOfAccountByCode,
  insertChartOfAccount,
  getAccountInstance,
  listAccountInstancesByOwner,
  updateAccountInstanceStatus,
  listAccountingPeriods,
  checkOverlappingPeriod,
  getAccountingPeriod,
  updateAccountingPeriodStatus,
  insertAccountingPeriod,
  getTrialBalance,
  getGLDetail,
  getAccountStatement,
  getSubledgerRollup,
  getSubledgerAccountsByParent,
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
// POST /ops/float/suspense/fund
// ---------------------------------------------------------------------------
opsRoutes.post('/float/suspense/fund', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) {
    return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  }

  const body = await c.req.json();
  const parsed = suspenseFundRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', code: ErrorCode.VALIDATION_ERROR, issues: parsed.error.issues }, 400);
  }

  const maker = await getActorById(c.env.DB, staffId);
  if (!maker || maker.type !== ActorType.STAFF) {
    return c.json({ error: 'Staff actor not found', code: ErrorCode.ACTOR_NOT_FOUND }, 404);
  }
  if (maker.staff_role !== StaffRole.SUPER_ADMIN && maker.staff_role !== StaffRole.ADMIN) {
    return c.json({ error: 'Only SUPER_ADMIN or ADMIN can request suspense funding', code: ErrorCode.FORBIDDEN }, 403);
  }

  const financeReviewers = await listActiveStaffByRole(c.env.DB, StaffRole.FINANCE);
  if (financeReviewers.length === 0) {
    return c.json({ error: 'No active FINANCE reviewer is available', code: ErrorCode.MAKER_CHECKER_REQUIRED }, 409);
  }

  const correlationId = (body.correlation_id as string) || generateId();
  const now = nowISO();
  const requestId = generateId();
  const { amount, currency, reason, reference, idempotency_key } = parsed.data;

  const payload = {
    operation: 'SUSPENSE_FUNDING',
    amount,
    currency,
    reason,
    reference: reference ?? null,
    idempotency_key,
    source_account: {
      owner_type: ActorType.STAFF,
      owner_id: 'TREASURY',
      account_type: 'SUSPENSE',
    },
    destination_account: {
      owner_type: ActorType.STAFF,
      owner_id: 'SYSTEM',
      account_type: 'SUSPENSE',
    },
    requester: {
      staff_id: maker.id,
      staff_role: maker.staff_role,
    },
    approval_target_role: StaffRole.FINANCE,
    finance_reviewer_ids: financeReviewers.map((reviewer) => reviewer.id),
    correlation_id: correlationId,
    requested_at: now,
  };

  await insertApprovalRequest(c.env.DB, {
    id: requestId,
    type: ApprovalType.MANUAL_ADJUSTMENT_REQUESTED,
    payload_json: JSON.stringify(payload),
    maker_staff_id: maker.id,
    state: ApprovalState.PENDING,
    created_at: now,
  });

  await insertEvent(c.env.DB, {
    id: generateId(),
    name: EventName.MANUAL_ADJUSTMENT_REQUESTED,
    entity_type: 'approval_request',
    entity_id: requestId,
    correlation_id: correlationId,
    actor_type: ActorType.STAFF,
    actor_id: maker.id,
    schema_version: 1,
    payload_json: JSON.stringify(payload),
    created_at: now,
  });

  await insertAuditLog(c.env.DB, {
    id: generateId(),
    action: 'SUSPENSE_FUNDING_REQUESTED',
    actor_type: ActorType.STAFF,
    actor_id: maker.id,
    target_type: 'approval_request',
    target_id: requestId,
    after_json: JSON.stringify(payload),
    correlation_id: correlationId,
    created_at: now,
  });

  return c.json({
    request_id: requestId,
    type: ApprovalType.MANUAL_ADJUSTMENT_REQUESTED,
    state: ApprovalState.PENDING,
    approval_target_role: StaffRole.FINANCE,
    finance_reviewers: financeReviewers.map((reviewer) => ({
      id: reviewer.id,
      name: reviewer.name,
      staff_code: reviewer.staff_code,
      staff_role: reviewer.staff_role,
    })),
    details: payload,
    correlation_id: correlationId,
  }, 201);
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

// ===========================================================================
// Merchant Withdrawal — Maker-Checker (OPERATIONS role)
// ===========================================================================

// ---------------------------------------------------------------------------
// POST /ops/merchant-withdrawal/request
// Allows staff to request a merchant fund withdrawal.
// Requires OPERATIONS or ADMIN role. Creates an approval request that must
// be approved by a *different* OPERATIONS staff member (maker-checker).
// ---------------------------------------------------------------------------
opsRoutes.post('/merchant-withdrawal/request', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) {
    return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  }

  const body = await c.req.json();
  const { merchant_id, amount, currency, reason, reference, idempotency_key } = body;
  const correlationId = (body.correlation_id as string) || generateId();

  if (!merchant_id || !amount || !currency) {
    return c.json({ error: 'merchant_id, amount, and currency are required', code: ErrorCode.MISSING_REQUIRED_FIELD }, 400);
  }

  if (parseFloat(amount) <= 0) {
    return c.json({ error: 'Amount must be positive', code: ErrorCode.VALIDATION_ERROR }, 400);
  }

  const maker = await getActorById(c.env.DB, staffId);
  if (!maker || maker.type !== ActorType.STAFF) {
    return c.json({ error: 'Staff actor not found', code: ErrorCode.ACTOR_NOT_FOUND }, 404);
  }

  // Only OPERATIONS, ADMIN, or SUPER_ADMIN can request merchant withdrawals
  const allowedRoles: readonly string[] = [StaffRole.OPERATIONS, StaffRole.ADMIN, StaffRole.SUPER_ADMIN];
  if (!allowedRoles.includes(maker.staff_role as string)) {
    return c.json({ error: 'Only OPERATIONS, ADMIN, or SUPER_ADMIN can request merchant withdrawals', code: ErrorCode.FORBIDDEN }, 403);
  }

  // Verify merchant exists
  const merchant = await getActorById(c.env.DB, merchant_id);
  if (!merchant || merchant.type !== ActorType.MERCHANT) {
    return c.json({ error: 'Merchant not found', code: ErrorCode.ACTOR_NOT_FOUND }, 404);
  }

  // Check merchant has sufficient balance
  const walletAccount = await getLedgerAccount(c.env.DB, ActorType.MERCHANT, merchant_id, AccountType.WALLET, currency);
  if (!walletAccount) {
    return c.json({ error: 'Merchant wallet not found', code: ErrorCode.ACCOUNT_NOT_FOUND }, 404);
  }

  const balance = await getAccountBalance(c.env.DB, walletAccount.id);
  if (!balance || parseFloat(balance.available_balance) < parseFloat(amount)) {
    return c.json({
      error: 'Insufficient funds',
      code: ErrorCode.INSUFFICIENT_FUNDS,
      available_balance: balance?.available_balance ?? '0.00',
    }, 400);
  }

  // Find OPERATIONS reviewers (excluding the maker)
  const opsReviewers = await listActiveStaffByRole(c.env.DB, StaffRole.OPERATIONS);
  const eligibleReviewers = opsReviewers.filter((r) => r.id !== staffId);
  if (eligibleReviewers.length === 0) {
    return c.json({ error: 'No eligible OPERATIONS reviewer available (maker-checker requires a different staff member)', code: ErrorCode.MAKER_CHECKER_REQUIRED }, 409);
  }

  const now = nowISO();
  const requestId = generateId();

  const payload = {
    operation: 'MERCHANT_WITHDRAWAL',
    merchant_id,
    merchant_name: merchant.name,
    wallet_account_id: walletAccount.id,
    amount,
    currency,
    reason: reason ?? null,
    reference: reference ?? null,
    idempotency_key: idempotency_key ?? generateId(),
    requester: {
      staff_id: maker.id,
      staff_role: maker.staff_role,
      name: maker.name,
    },
    approval_target_role: StaffRole.OPERATIONS,
    eligible_reviewer_ids: eligibleReviewers.map((r) => r.id),
    balance_at_request: balance.available_balance,
    correlation_id: correlationId,
    requested_at: now,
  };

  await insertApprovalRequest(c.env.DB, {
    id: requestId,
    type: ApprovalType.MERCHANT_WITHDRAWAL_REQUESTED,
    payload_json: JSON.stringify(payload),
    maker_staff_id: maker.id,
    state: ApprovalState.PENDING,
    created_at: now,
  });

  await insertEvent(c.env.DB, {
    id: generateId(),
    name: EventName.MERCHANT_WITHDRAWAL_REQUESTED,
    entity_type: 'approval_request',
    entity_id: requestId,
    correlation_id: correlationId,
    actor_type: ActorType.STAFF,
    actor_id: maker.id,
    schema_version: 1,
    payload_json: JSON.stringify(payload),
    created_at: now,
  });

  await insertAuditLog(c.env.DB, {
    id: generateId(),
    action: 'MERCHANT_WITHDRAWAL_REQUESTED',
    actor_type: ActorType.STAFF,
    actor_id: maker.id,
    target_type: 'actor',
    target_id: merchant_id,
    after_json: JSON.stringify(payload),
    correlation_id: correlationId,
    created_at: now,
  });

  return c.json({
    request_id: requestId,
    type: ApprovalType.MERCHANT_WITHDRAWAL_REQUESTED,
    state: ApprovalState.PENDING,
    merchant_id,
    amount,
    currency,
    approval_target_role: StaffRole.OPERATIONS,
    eligible_reviewers: eligibleReviewers.map((r) => ({ id: r.id, name: r.name, staff_code: r.staff_code })),
    correlation_id: correlationId,
  }, 201);
});

// ---------------------------------------------------------------------------
// POST /ops/merchant-withdrawal/:id/approve
// OPERATIONS staff (different from maker) approves the withdrawal.
// On approval, posts the transaction via PostingDO.
// ---------------------------------------------------------------------------
opsRoutes.post('/merchant-withdrawal/:id/approve', async (c) => {
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

  if (request.type !== ApprovalType.MERCHANT_WITHDRAWAL_REQUESTED) {
    return c.json({ error: 'Not a merchant withdrawal request', code: ErrorCode.VALIDATION_ERROR }, 400);
  }

  if (request.state !== ApprovalState.PENDING) {
    return c.json({ error: `Request is already ${request.state}`, code: ErrorCode.APPROVAL_ALREADY_DECIDED }, 409);
  }

  // Maker-checker enforcement
  if (request.maker_staff_id === staffId) {
    return c.json({ error: 'Maker cannot approve their own request', code: ErrorCode.MAKER_CHECKER_VIOLATION }, 403);
  }

  // Verify checker has OPERATIONS role
  const checker = await getActorById(c.env.DB, staffId);
  if (!checker || checker.type !== ActorType.STAFF) {
    return c.json({ error: 'Staff actor not found', code: ErrorCode.ACTOR_NOT_FOUND }, 404);
  }
  if (checker.staff_role !== StaffRole.OPERATIONS && checker.staff_role !== StaffRole.SUPER_ADMIN) {
    return c.json({ error: 'Only OPERATIONS or SUPER_ADMIN can approve merchant withdrawals', code: ErrorCode.FORBIDDEN }, 403);
  }

  const now = nowISO();
  const payload = JSON.parse(request.payload_json) as {
    merchant_id: string;
    wallet_account_id: string;
    amount: string;
    currency: string;
    idempotency_key: string;
    correlation_id: string;
  };

  // Approve the request
  await updateApprovalRequest(c.env.DB, requestId, ApprovalState.APPROVED, staffId, now);

  // Post the withdrawal transaction via PostingDO
  const doId = c.env.POSTING_DO.idFromName('singleton');
  const stub = c.env.POSTING_DO.get(doId);
  const postingRes = await stub.fetch('https://do/post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotency_key: payload.idempotency_key,
      correlation_id: correlationId,
      txn_type: 'WITHDRAWAL',
      currency: payload.currency,
      entries: [
        {
          account_id: payload.wallet_account_id,
          entry_type: 'DR',
          amount: payload.amount,
          description: `Merchant withdrawal - ${payload.merchant_id}`,
        },
        {
          owner_type: ActorType.STAFF,
          owner_id: 'SETTLEMENT',
          account_type: 'SUSPENSE',
          entry_type: 'CR',
          amount: payload.amount,
          description: `Merchant withdrawal payout - ${payload.merchant_id}`,
        },
      ],
      description: `Approved merchant withdrawal for ${payload.merchant_id}`,
      actor_type: ActorType.STAFF,
      actor_id: staffId,
    }),
  });

  const postingResult = await postingRes.json() as Record<string, unknown>;

  // Audit log
  await insertAuditLog(c.env.DB, {
    id: generateId(),
    action: 'MERCHANT_WITHDRAWAL_APPROVED',
    actor_type: ActorType.STAFF,
    actor_id: staffId,
    target_type: 'actor',
    target_id: payload.merchant_id,
    before_json: JSON.stringify({ state: ApprovalState.PENDING }),
    after_json: JSON.stringify({ state: ApprovalState.APPROVED, posting: postingResult }),
    correlation_id: correlationId,
    created_at: now,
  });

  // Emit event
  await insertEvent(c.env.DB, {
    id: generateId(),
    name: EventName.MERCHANT_WITHDRAWAL_APPROVED,
    entity_type: 'approval_request',
    entity_id: requestId,
    correlation_id: correlationId,
    actor_type: ActorType.STAFF,
    actor_id: staffId,
    schema_version: 1,
    payload_json: JSON.stringify({
      request_id: requestId,
      merchant_id: payload.merchant_id,
      amount: payload.amount,
      currency: payload.currency,
      posting_result: postingResult,
    }),
    created_at: now,
  });

  return c.json({
    request_id: requestId,
    state: ApprovalState.APPROVED,
    posting: postingResult,
    correlation_id: correlationId,
  });
});

// ---------------------------------------------------------------------------
// POST /ops/merchant-withdrawal/:id/reject
// ---------------------------------------------------------------------------
opsRoutes.post('/merchant-withdrawal/:id/reject', async (c) => {
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

  if (request.type !== ApprovalType.MERCHANT_WITHDRAWAL_REQUESTED) {
    return c.json({ error: 'Not a merchant withdrawal request', code: ErrorCode.VALIDATION_ERROR }, 400);
  }

  if (request.state !== ApprovalState.PENDING) {
    return c.json({ error: `Request is already ${request.state}`, code: ErrorCode.APPROVAL_ALREADY_DECIDED }, 409);
  }

  const now = nowISO();
  await updateApprovalRequest(c.env.DB, requestId, ApprovalState.REJECTED, staffId, now);

  const payload = JSON.parse(request.payload_json) as { merchant_id: string; amount: string; currency: string };

  // Audit log
  await insertAuditLog(c.env.DB, {
    id: generateId(),
    action: 'MERCHANT_WITHDRAWAL_REJECTED',
    actor_type: ActorType.STAFF,
    actor_id: staffId,
    target_type: 'actor',
    target_id: payload.merchant_id,
    before_json: JSON.stringify({ state: ApprovalState.PENDING }),
    after_json: JSON.stringify({ state: ApprovalState.REJECTED, reason }),
    correlation_id: correlationId,
    created_at: now,
  });

  // Emit event
  await insertEvent(c.env.DB, {
    id: generateId(),
    name: EventName.MERCHANT_WITHDRAWAL_REJECTED,
    entity_type: 'approval_request',
    entity_id: requestId,
    correlation_id: correlationId,
    actor_type: ActorType.STAFF,
    actor_id: staffId,
    schema_version: 1,
    payload_json: JSON.stringify({ request_id: requestId, merchant_id: payload.merchant_id, reason }),
    created_at: now,
  });

  return c.json({
    request_id: requestId,
    state: ApprovalState.REJECTED,
    reason,
    correlation_id: correlationId,
  });
});

// ---------------------------------------------------------------------------
// GET /ops/merchant-withdrawal/requests - list withdrawal requests
// ---------------------------------------------------------------------------
opsRoutes.get('/merchant-withdrawal/requests', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) {
    return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  }

  const state = c.req.query('state');
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50;

  const requests = await listApprovalRequests(c.env.DB, {
    type: ApprovalType.MERCHANT_WITHDRAWAL_REQUESTED,
    state,
    limit,
  });

  const enriched = requests.map((r) => {
    const payload = JSON.parse(r.payload_json) as Record<string, unknown>;
    return {
      id: r.id,
      state: r.state,
      maker_staff_id: r.maker_staff_id,
      checker_staff_id: r.checker_staff_id,
      merchant_id: payload.merchant_id,
      merchant_name: payload.merchant_name,
      amount: payload.amount,
      currency: payload.currency,
      reason: payload.reason,
      created_at: r.created_at,
      decided_at: r.decided_at,
    };
  });

  return c.json({ requests: enriched, count: enriched.length });
});

// ===========================================================================
// V2 Accounting — Chart of Accounts
// ===========================================================================

// GET /ops/accounting/coa?include_inactive=true&account_class=ASSET
opsRoutes.get('/accounting/coa', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);

  const includeInactive = c.req.query('include_inactive') === 'true';
  const accountClass = c.req.query('account_class');

  const accounts = await getChartOfAccounts(c.env.DB, { includeInactive, accountClass });

  // Build class summary
  const classSummary: Record<string, number> = {};
  for (const acc of accounts) {
    classSummary[String(acc.account_class)] = (classSummary[String(acc.account_class)] ?? 0) + 1;
  }

  return c.json({
    accounts,
    count: accounts.length,
    class_summary: classSummary,
  });
});

// GET /ops/accounting/coa/:code
opsRoutes.get('/accounting/coa/:code', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  const code = c.req.param('code');
  const account = await getChartOfAccountByCode(c.env.DB, code);
  if (!account) return c.json({ error: 'Chart of account not found', code: ErrorCode.NOT_FOUND }, 404);
  return c.json(account);
});

// POST /ops/accounting/coa
opsRoutes.post('/accounting/coa', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  const body = await c.req.json();
  const now = nowISO();
  const coa = {
    code: body.code,
    name: body.name,
    account_class: body.account_class,
    normal_balance: body.normal_balance,
    parent_code: body.parent_code ?? null,
    description: body.description ?? null,
    ifrs_mapping: body.ifrs_mapping ?? null,
    is_header: body.is_header ?? false,
    active_from: body.active_from ?? now,
    active_to: body.active_to ?? null,
    created_at: now,
    updated_at: now,
  };
  if (!coa.code || !coa.name || !coa.account_class || !coa.normal_balance) {
    return c.json({ error: 'code, name, account_class, normal_balance are required', code: ErrorCode.MISSING_REQUIRED_FIELD }, 400);
  }
  await insertChartOfAccount(c.env.DB, coa);
  await insertAuditLog(c.env.DB, {
    id: generateId(), action: 'COA_CREATED', actor_type: ActorType.STAFF, actor_id: staffId,
    target_type: 'chart_of_accounts', target_id: coa.code, after_json: JSON.stringify(coa),
    correlation_id: generateId(), created_at: now,
  });
  return c.json(coa, 201);
});

// ===========================================================================
// V2 Accounting — Account Instances
// ===========================================================================

// GET /ops/accounting/instances/:id
opsRoutes.get('/accounting/instances/:id', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  const instance = await getAccountInstance(c.env.DB, c.req.param('id'));
  if (!instance) return c.json({ error: 'Account instance not found', code: ErrorCode.NOT_FOUND }, 404);
  return c.json(instance);
});

// GET /ops/accounting/instances?owner_type=...&owner_id=...&currency=...
opsRoutes.get('/accounting/instances', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  const ownerType = c.req.query('owner_type');
  const ownerId = c.req.query('owner_id');
  if (!ownerType || !ownerId) return c.json({ error: 'owner_type and owner_id are required', code: ErrorCode.MISSING_REQUIRED_FIELD }, 400);
  const currency = c.req.query('currency');
  const instances = await listAccountInstancesByOwner(c.env.DB, ownerType, ownerId, currency);
  return c.json({ instances, count: instances.length });
});

// POST /ops/accounting/instances/:id/freeze
opsRoutes.post('/accounting/instances/:id/freeze', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  const id = c.req.param('id');
  const instance = await getAccountInstance(c.env.DB, id);
  if (!instance) return c.json({ error: 'Account instance not found', code: ErrorCode.NOT_FOUND }, 404);
  await updateAccountInstanceStatus(c.env.DB, id, 'FROZEN');
  await insertAuditLog(c.env.DB, {
    id: generateId(), action: 'ACCOUNT_FROZEN', actor_type: ActorType.STAFF, actor_id: staffId,
    target_type: 'account_instance', target_id: id, before_json: JSON.stringify({ status: instance.status }),
    after_json: JSON.stringify({ status: 'FROZEN' }), correlation_id: generateId(), created_at: nowISO(),
  });
  return c.json({ id, status: 'FROZEN' });
});

// POST /ops/accounting/instances/:id/close
opsRoutes.post('/accounting/instances/:id/close', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  const id = c.req.param('id');
  const instance = await getAccountInstance(c.env.DB, id);
  if (!instance) return c.json({ error: 'Account instance not found', code: ErrorCode.NOT_FOUND }, 404);
  const now = nowISO();
  await updateAccountInstanceStatus(c.env.DB, id, 'CLOSED', now);
  await insertAuditLog(c.env.DB, {
    id: generateId(), action: 'ACCOUNT_CLOSED', actor_type: ActorType.STAFF, actor_id: staffId,
    target_type: 'account_instance', target_id: id, before_json: JSON.stringify({ status: instance.status }),
    after_json: JSON.stringify({ status: 'CLOSED' }), correlation_id: generateId(), created_at: now,
  });
  return c.json({ id, status: 'CLOSED', closed_at: now });
});

// ===========================================================================
// V2 Accounting — Accounting Periods
// ===========================================================================

// GET /ops/accounting/periods?status=OPEN&limit=50&offset=0
opsRoutes.get('/accounting/periods', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);

  const status = c.req.query('status');
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;
  const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!, 10) : undefined;

  const periods = await listAccountingPeriods(c.env.DB, { status, limit, offset });

  // Identify the currently active period (OPEN, covering today)
  const today = nowISO().slice(0, 10);
  const currentPeriod = periods.find(
    (p) => p.status === 'OPEN' && p.start_date.slice(0, 10) <= today && p.end_date.slice(0, 10) > today,
  );

  // Status summary
  const statusSummary: Record<string, number> = {};
  for (const p of periods) {
    statusSummary[String(p.status)] = (statusSummary[String(p.status)] ?? 0) + 1;
  }

  return c.json({
    periods,
    count: periods.length,
    current_period_id: currentPeriod?.id ?? null,
    status_summary: statusSummary,
  });
});

// GET /ops/accounting/periods/:id
opsRoutes.get('/accounting/periods/:id', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  const period = await getAccountingPeriod(c.env.DB, c.req.param('id'));
  if (!period) return c.json({ error: 'Accounting period not found', code: ErrorCode.NOT_FOUND }, 404);
  return c.json(period);
});

// POST /ops/accounting/periods
opsRoutes.post('/accounting/periods', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  const body = await c.req.json();
  const now = nowISO();
  if (!body.name || !body.start_date || !body.end_date) {
    return c.json({ error: 'name, start_date, end_date are required', code: ErrorCode.MISSING_REQUIRED_FIELD }, 400);
  }

  // Validate start < end
  if (body.start_date >= body.end_date) {
    return c.json({ error: 'start_date must be before end_date', code: ErrorCode.VALIDATION_ERROR }, 400);
  }

  // Check for overlapping periods
  const overlap = await checkOverlappingPeriod(c.env.DB, body.start_date, body.end_date);
  if (overlap) {
    return c.json({
      error: `Overlapping period exists: ${overlap.name} (${overlap.start_date} – ${overlap.end_date})`,
      code: ErrorCode.PERIOD_CLOSED,
      overlapping_period_id: overlap.id,
    }, 409);
  }

  const period = {
    id: generateId(),
    name: body.name,
    start_date: body.start_date,
    end_date: body.end_date,
    status: 'OPEN' as const,
    closed_by: undefined as string | undefined,
    closed_at: undefined as string | undefined,
    created_at: now,
    updated_at: now,
  };
  await insertAccountingPeriod(c.env.DB, period);
  await insertAuditLog(c.env.DB, {
    id: generateId(), action: 'PERIOD_CREATED', actor_type: ActorType.STAFF, actor_id: staffId,
    target_type: 'accounting_period', target_id: period.id, after_json: JSON.stringify(period),
    correlation_id: generateId(), created_at: now,
  });
  return c.json(period, 201);
});

// POST /ops/accounting/periods/:id/close
opsRoutes.post('/accounting/periods/:id/close', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  const id = c.req.param('id');
  const period = await getAccountingPeriod(c.env.DB, id);
  if (!period) return c.json({ error: 'Accounting period not found', code: ErrorCode.NOT_FOUND }, 404);
  if (period.status !== 'OPEN') return c.json({ error: `Period is already ${period.status}`, code: ErrorCode.PERIOD_CLOSED }, 409);
  await updateAccountingPeriodStatus(c.env.DB, id, 'CLOSED', staffId);
  await insertAuditLog(c.env.DB, {
    id: generateId(), action: 'PERIOD_CLOSED', actor_type: ActorType.STAFF, actor_id: staffId,
    target_type: 'accounting_period', target_id: id, before_json: JSON.stringify({ status: 'OPEN' }),
    after_json: JSON.stringify({ status: 'CLOSED' }), correlation_id: generateId(), created_at: nowISO(),
  });
  return c.json({ id, status: 'CLOSED' });
});

// POST /ops/accounting/periods/:id/lock
opsRoutes.post('/accounting/periods/:id/lock', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  const id = c.req.param('id');
  const period = await getAccountingPeriod(c.env.DB, id);
  if (!period) return c.json({ error: 'Accounting period not found', code: ErrorCode.NOT_FOUND }, 404);
  if (period.status !== 'CLOSED') return c.json({ error: 'Period must be CLOSED before it can be LOCKED', code: ErrorCode.PERIOD_CLOSED }, 409);
  await updateAccountingPeriodStatus(c.env.DB, id, 'LOCKED', staffId);
  return c.json({ id, status: 'LOCKED' });
});

// ===========================================================================
// V2 Accounting — Reporting
// ===========================================================================

// GET /ops/accounting/reports/trial-balance?currency=BBD&from=...&to=...&period_id=...
opsRoutes.get('/accounting/reports/trial-balance', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);

  const currency = c.req.query('currency');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const periodId = c.req.query('period_id');

  const rows = await getTrialBalance(c.env.DB, { currency, from, to, periodId });

  // Compute totals and balance check
  let totalDebitMinor = 0;
  let totalCreditMinor = 0;
  for (const row of rows) {
    totalDebitMinor += Number(row.total_debit_minor) || 0;
    totalCreditMinor += Number(row.total_credit_minor) || 0;
  }

  const netDifference = totalDebitMinor - totalCreditMinor;
  const balanced = Math.abs(netDifference) === 0;

  // Add formatted amounts (minor units → major units)
  const formattedRows = rows.map((row) => ({
    ...row,
    total_debit: ((Number(row.total_debit_minor) || 0) / 100).toFixed(2),
    total_credit: ((Number(row.total_credit_minor) || 0) / 100).toFixed(2),
    net_balance: ((Number(row.net_balance_minor) || 0) / 100).toFixed(2),
  }));

  return c.json({
    rows: formattedRows,
    count: rows.length,
    summary: {
      total_debit_minor: totalDebitMinor,
      total_credit_minor: totalCreditMinor,
      total_debit: (totalDebitMinor / 100).toFixed(2),
      total_credit: (totalCreditMinor / 100).toFixed(2),
      net_difference_minor: netDifference,
      net_difference: (netDifference / 100).toFixed(2),
      balanced,
      currency: currency ?? 'ALL',
    },
    filters: {
      currency: currency ?? null,
      from: from ?? null,
      to: to ?? null,
      period_id: periodId ?? null,
    },
    generated_at: nowISO(),
  });
});

// GET /ops/accounting/reports/gl-detail?currency=...&from=...&to=...&coa_code=...&limit=...
opsRoutes.get('/accounting/reports/gl-detail', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  const rows = await getGLDetail(c.env.DB, {
    currency: c.req.query('currency'),
    from: c.req.query('from'),
    to: c.req.query('to'),
    coa_code: c.req.query('coa_code'),
    limit: c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined,
  });
  return c.json({ rows, count: rows.length });
});

// GET /ops/accounting/reports/account-statement/:instance_id?from=...&to=...&limit=...
opsRoutes.get('/accounting/reports/account-statement/:instance_id', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  const rows = await getAccountStatement(
    c.env.DB,
    c.req.param('instance_id'),
    c.req.query('from'),
    c.req.query('to'),
    c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined,
  );
  return c.json({ rows, count: rows.length });
});

// GET /ops/accounting/reports/subledger-rollup/:parent_actor_id?currency=...
opsRoutes.get('/accounting/reports/subledger-rollup/:parent_actor_id', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  const rows = await getSubledgerRollup(c.env.DB, c.req.param('parent_actor_id'), c.req.query('currency'));
  return c.json({ rows, count: rows.length });
});

// GET /ops/accounting/subledgers/:parent_actor_id
opsRoutes.get('/accounting/subledgers/:parent_actor_id', async (c) => {
  const staffId = await requireStaff(c);
  if (!staffId) return c.json({ error: 'Staff authentication required', code: ErrorCode.UNAUTHORIZED }, 401);
  const subs = await getSubledgerAccountsByParent(c.env.DB, c.req.param('parent_actor_id'));
  return c.json({ subledgers: subs, count: subs.length });
});
