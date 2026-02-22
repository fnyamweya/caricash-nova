/**
 * @caricash/db — D1 database helpers for CariCash Nova
 *
 * The `db` parameter in all functions is a Cloudflare D1Database instance.
 * Typed as `any` here to avoid a hard dependency on @cloudflare/workers-types.
 */
import type {
  Actor,
  ActorLookup,
  AgentUser,
  MerchantUser,
  LedgerAccount,
  LedgerJournal,
  LedgerLine,
  ApprovalRequest,
  Event,
  AuditLog,
  IdempotencyRecord,
  FeeRule,
  CommissionRule,
  RegistrationMetadata,
  AccountBalance,
  FloatOperation,
  KycProfile,
  KycRequirement,
  ChartOfAccount,
  AccountInstance,
  AccountingPeriod,
  PostingBatch,
  SubledgerAccount,
  DailyBalanceSnapshot,
  TrialBalanceRow,
  GLDetailRow,
  AccountStatementRow,
  SubledgerRollupRow,
} from '@caricash/shared';

// D1Database from @cloudflare/workers-types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

/** Auth types (not in shared — local to DB layer) */
export interface Pin {
  id: string;
  actor_id: string;
  pin_hash: string;
  salt: string;
  failed_attempts: number;
  locked_until?: string;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  actor_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
}

export interface CodeReservation {
  id: string;
  code_type: 'AGENT' | 'STORE';
  code_value: string;
  reserved_by_actor_id?: string;
  status: 'RESERVED' | 'USED' | 'EXPIRED';
  expires_at: string;
  used_by_actor_id?: string;
  used_at?: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------

export async function insertActor(db: D1Database, actor: Actor): Promise<void> {
  await db
    .prepare(
      `INSERT INTO actors (id, type, state, name, first_name, middle_name, last_name, display_name, email, msisdn, agent_code, agent_type, store_code, staff_code, staff_role, parent_actor_id, kyc_state, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`,
    )
    .bind(
      actor.id,
      actor.type,
      actor.state,
      actor.name,
      actor.first_name ?? null,
      actor.middle_name ?? null,
      actor.last_name ?? null,
      actor.display_name ?? null,
      actor.email ?? null,
      actor.msisdn ?? null,
      actor.agent_code ?? null,
      actor.agent_type ?? null,
      actor.store_code ?? null,
      actor.staff_code ?? null,
      actor.staff_role ?? null,
      actor.parent_actor_id ?? null,
      actor.kyc_state,
      actor.created_at,
      actor.updated_at,
    )
    .run();
}

export async function getActorByMsisdn(db: D1Database, msisdn: string): Promise<Actor | null> {
  return (await db.prepare('SELECT * FROM actors WHERE msisdn = ?1').bind(msisdn).first()) as Actor | null;
}

export async function getActorByMsisdnAndType(db: D1Database, msisdn: string, actorType: string): Promise<Actor | null> {
  return (await db.prepare('SELECT * FROM actors WHERE msisdn = ?1 AND type = ?2').bind(msisdn, actorType).first()) as Actor | null;
}

export async function getActorByAgentCode(db: D1Database, code: string): Promise<Actor | null> {
  return (await db.prepare('SELECT * FROM actors WHERE agent_code = ?1').bind(code).first()) as Actor | null;
}

export async function getActorByStoreCode(db: D1Database, code: string): Promise<Actor | null> {
  return (await db.prepare('SELECT * FROM actors WHERE store_code = ?1').bind(code).first()) as Actor | null;
}

export async function getActorByStaffCode(db: D1Database, code: string): Promise<Actor | null> {
  return (await db.prepare('SELECT * FROM actors WHERE staff_code = ?1').bind(code).first()) as Actor | null;
}

export async function listActiveStaffByRole(db: D1Database, role: string): Promise<Actor[]> {
  const res = await db
    .prepare("SELECT * FROM actors WHERE type = 'STAFF' AND staff_role = ?1 AND state = 'ACTIVE' ORDER BY created_at ASC")
    .bind(role)
    .all();
  return (res.results ?? []) as Actor[];
}

export async function listStaffActors(
  db: D1Database,
  filters?: { state?: string; staff_role?: string },
): Promise<Actor[]> {
  const where: string[] = ["type = 'STAFF'"];
  const values: string[] = [];
  let paramIdx = 1;

  if (filters?.state) {
    where.push(`state = ?${paramIdx++}`);
    values.push(filters.state);
  }
  if (filters?.staff_role) {
    where.push(`staff_role = ?${paramIdx++}`);
    values.push(filters.staff_role);
  }

  const res = await db
    .prepare(`SELECT * FROM actors WHERE ${where.join(' AND ')} ORDER BY created_at DESC`)
    .bind(...values)
    .all();
  return (res.results ?? []) as Actor[];
}

export async function listActors(
  db: D1Database,
  filters?: { type?: string; state?: string; parent_actor_id?: string; limit?: number; offset?: number },
): Promise<Actor[]> {
  const where: string[] = [];
  const values: (string | number)[] = [];
  let paramIdx = 1;

  if (filters?.type) {
    where.push(`type = ?${paramIdx++}`);
    values.push(filters.type);
  }
  if (filters?.state) {
    where.push(`state = ?${paramIdx++}`);
    values.push(filters.state);
  }
  if (filters?.parent_actor_id) {
    where.push(`parent_actor_id = ?${paramIdx++}`);
    values.push(filters.parent_actor_id);
  }

  const limit = filters?.limit ?? 200;
  const offset = filters?.offset ?? 0;

  values.push(limit);
  const limitParam = paramIdx++;
  values.push(offset);
  const offsetParam = paramIdx++;

  const res = await db
    .prepare(
      `SELECT *
       FROM actors
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC
       LIMIT ?${limitParam} OFFSET ?${offsetParam}`,
    )
    .bind(...values)
    .all();

  return (res.results ?? []) as Actor[];
}

export async function getStaffActorById(db: D1Database, id: string): Promise<Actor | null> {
  return (await db
    .prepare("SELECT * FROM actors WHERE id = ?1 AND type = 'STAFF'")
    .bind(id)
    .first()) as Actor | null;
}

export async function updateStaffActor(
  db: D1Database,
  staffId: string,
  fields: { name?: string; email?: string; staff_role?: string; state?: string },
): Promise<void> {
  const sets: string[] = [];
  const values: (string | null)[] = [];
  let paramIdx = 1;

  if (fields.name !== undefined) {
    sets.push(`name = ?${paramIdx++}`);
    values.push(fields.name);
  }
  if (fields.email !== undefined) {
    sets.push(`email = ?${paramIdx++}`);
    values.push(fields.email);
  }
  if (fields.staff_role !== undefined) {
    sets.push(`staff_role = ?${paramIdx++}`);
    values.push(fields.staff_role);
  }
  if (fields.state !== undefined) {
    sets.push(`state = ?${paramIdx++}`);
    values.push(fields.state);
  }

  sets.push(`updated_at = ?${paramIdx++}`);
  values.push(new Date().toISOString());
  values.push(staffId);

  await db
    .prepare(`UPDATE actors SET ${sets.join(', ')} WHERE id = ?${paramIdx} AND type = 'STAFF'`)
    .bind(...values)
    .run();
}

// ---------------------------------------------------------------------------
// Auth — PINs
// ---------------------------------------------------------------------------

export async function insertPin(db: D1Database, pin: Pin): Promise<void> {
  await db
    .prepare(
      `INSERT INTO pins (id, actor_id, pin_hash, salt, failed_attempts, locked_until, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(
      pin.id,
      pin.actor_id,
      pin.pin_hash,
      pin.salt,
      pin.failed_attempts,
      pin.locked_until ?? null,
      pin.created_at,
      pin.updated_at,
    )
    .run();
}

export async function getPinByActorId(db: D1Database, actorId: string): Promise<Pin | null> {
  return (await db.prepare('SELECT * FROM pins WHERE actor_id = ?1').bind(actorId).first()) as Pin | null;
}

export async function updatePinFailedAttempts(
  db: D1Database,
  pinId: string,
  attempts: number,
  lockedUntil?: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE pins SET failed_attempts = ?1, locked_until = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?3`,
    )
    .bind(attempts, lockedUntil ?? null, pinId)
    .run();
}

// ---------------------------------------------------------------------------
// Auth — Sessions
// ---------------------------------------------------------------------------

export async function insertSession(db: D1Database, session: Session): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sessions (id, actor_id, token_hash, expires_at, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    )
    .bind(session.id, session.actor_id, session.token_hash, session.expires_at, session.created_at)
    .run();
}

// ---------------------------------------------------------------------------
// Ledger — Accounts
// ---------------------------------------------------------------------------

export async function insertLedgerAccount(db: D1Database, account: LedgerAccount): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ledger_accounts (id, owner_type, owner_id, account_type, currency, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(
      account.id,
      account.owner_type,
      account.owner_id,
      account.account_type,
      account.currency,
      account.created_at,
    )
    .run();
}

export async function getLedgerAccount(
  db: D1Database,
  ownerType: string,
  ownerId: string,
  accountType: string,
  currency: string,
): Promise<LedgerAccount | null> {
  return (await db
    .prepare(
      'SELECT * FROM ledger_accounts WHERE owner_type = ?1 AND owner_id = ?2 AND account_type = ?3 AND currency = ?4',
    )
    .bind(ownerType, ownerId, accountType, currency)
    .first()) as LedgerAccount | null;
}

export async function getOrCreateLedgerAccount(
  db: D1Database,
  ownerType: string,
  ownerId: string,
  accountType: string,
  currency: string,
): Promise<LedgerAccount> {
  const existing = await getLedgerAccount(db, ownerType, ownerId, accountType, currency);
  if (existing) return existing;

  const now = new Date().toISOString();
  // crypto.randomUUID() is available in Cloudflare Workers runtime
  const g = globalThis as Record<string, unknown>;
  const id = g.crypto
    ? (g.crypto as { randomUUID(): string }).randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const account: LedgerAccount = {
    id,
    owner_type: ownerType as LedgerAccount['owner_type'],
    owner_id: ownerId,
    account_type: accountType as LedgerAccount['account_type'],
    currency: currency as LedgerAccount['currency'],
    created_at: now,
  };
  await insertLedgerAccount(db, account);
  return account;
}

// ---------------------------------------------------------------------------
// Ledger — Journals
// ---------------------------------------------------------------------------

export async function insertLedgerJournal(db: D1Database, journal: LedgerJournal): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ledger_journals (id, txn_type, currency, correlation_id, idempotency_key, state, fee_version_id, commission_version_id, description, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    )
    .bind(
      journal.id,
      journal.txn_type,
      journal.currency,
      journal.correlation_id,
      journal.idempotency_key,
      journal.state,
      journal.fee_version_id ?? null,
      journal.commission_version_id ?? null,
      journal.description,
      journal.created_at,
    )
    .run();
}

export async function getJournalByIdempotencyKey(
  db: D1Database,
  key: string,
): Promise<LedgerJournal | null> {
  return (await db
    .prepare('SELECT * FROM ledger_journals WHERE idempotency_key = ?1')
    .bind(key)
    .first()) as LedgerJournal | null;
}

// ---------------------------------------------------------------------------
// Ledger — Lines
// ---------------------------------------------------------------------------

export async function insertLedgerLine(db: D1Database, line: LedgerLine): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ledger_lines (id, journal_id, account_id, entry_type, amount, description, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
    .bind(
      line.id,
      line.journal_id,
      line.account_id,
      line.entry_type,
      line.amount,
      line.description ?? null,
      line.created_at,
    )
    .run();
}

/** Calculates balance from ledger_lines: sum(CR) - sum(DR) */
export async function getBalance(db: D1Database, accountId: string): Promise<string> {
  const row = (await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN entry_type = 'CR' THEN CAST(amount AS REAL) ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN entry_type = 'DR' THEN CAST(amount AS REAL) ELSE 0 END), 0) AS balance
       FROM ledger_lines WHERE account_id = ?1`,
    )
    .bind(accountId)
    .first()) as { balance: number } | null;
  return (row?.balance ?? 0).toFixed(2);
}

// ---------------------------------------------------------------------------
// Governance — Approval Requests
// ---------------------------------------------------------------------------

export async function insertApprovalRequest(
  db: D1Database,
  request: ApprovalRequest,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO approval_requests (id, type, payload_json, maker_staff_id, checker_staff_id, state, created_at, decided_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(
      request.id,
      request.type,
      request.payload_json,
      request.maker_staff_id,
      request.checker_staff_id ?? null,
      request.state,
      request.created_at,
      request.decided_at ?? null,
    )
    .run();
}

export async function getApprovalRequest(
  db: D1Database,
  id: string,
): Promise<ApprovalRequest | null> {
  return (await db.prepare('SELECT * FROM approval_requests WHERE id = ?1').bind(id).first()) as ApprovalRequest | null;
}

export async function listApprovalRequests(
  db: D1Database,
  filters?: { state?: string; type?: string; limit?: number },
): Promise<ApprovalRequest[]> {
  const where: string[] = [];
  const values: (string | number)[] = [];
  let paramIdx = 1;

  if (filters?.state) {
    where.push(`state = ?${paramIdx++}`);
    values.push(filters.state);
  }

  if (filters?.type) {
    where.push(`type = ?${paramIdx++}`);
    values.push(filters.type);
  }

  const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 200);
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  values.push(limit);

  const res = await db
    .prepare(
      `SELECT *
       FROM approval_requests
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT ?${paramIdx}`,
    )
    .bind(...values)
    .all();

  return (res.results ?? []) as ApprovalRequest[];
}

export async function updateApprovalRequest(
  db: D1Database,
  id: string,
  state: string,
  checkerStaffId: string,
  decidedAt: string,
): Promise<void> {
  await db
    .prepare('UPDATE approval_requests SET state = ?1, checker_staff_id = ?2, decided_at = ?3 WHERE id = ?4')
    .bind(state, checkerStaffId, decidedAt, id)
    .run();
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function insertEvent(db: D1Database, event: Event): Promise<void> {
  await db
    .prepare(
      `INSERT INTO events (id, name, entity_type, entity_id, correlation_id, causation_id, actor_type, actor_id, schema_version, payload_json, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
    )
    .bind(
      event.id,
      event.name,
      event.entity_type,
      event.entity_id,
      event.correlation_id,
      event.causation_id ?? null,
      event.actor_type,
      event.actor_id,
      event.schema_version,
      event.payload_json,
      event.created_at,
    )
    .run();
}

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------

export async function insertAuditLog(db: D1Database, log: AuditLog): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_log (id, action, actor_type, actor_id, target_type, target_id, before_json, after_json, ip, device, correlation_id, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
    )
    .bind(
      log.id,
      log.action,
      log.actor_type,
      log.actor_id,
      log.target_type,
      log.target_id,
      log.before_json ?? null,
      log.after_json ?? null,
      log.ip ?? null,
      log.device ?? null,
      log.correlation_id,
      log.created_at,
    )
    .run();
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

export async function getIdempotencyRecord(
  db: D1Database,
  scope: string,
  key: string,
): Promise<IdempotencyRecord | null> {
  return (await db
    .prepare('SELECT * FROM idempotency_records WHERE scope = ?1 AND idempotency_key = ?2')
    .bind(scope, key)
    .first()) as IdempotencyRecord | null;
}

export async function getIdempotencyRecordByScopeHash(
  db: D1Database,
  scopeHash: string,
): Promise<IdempotencyRecord | null> {
  return (await db
    .prepare('SELECT * FROM idempotency_records WHERE scope_hash = ?1')
    .bind(scopeHash)
    .first()) as IdempotencyRecord | null;
}

export async function insertIdempotencyRecord(
  db: D1Database,
  record: IdempotencyRecord,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO idempotency_records (id, scope, idempotency_key, result_json, created_at, expires_at, payload_hash, scope_hash)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(
      record.id,
      record.scope,
      record.idempotency_key,
      record.result_json,
      record.created_at,
      record.expires_at,
      record.payload_hash ?? null,
      record.scope_hash ?? null,
    )
    .run();
}

/** Find IN_PROGRESS idempotency records older than a given cutoff.
 * Note: Uses LIKE on result_json because idempotency_records does not have a
 * dedicated status column. For <100k users this is acceptable. Consider adding
 * a status column for production scale optimization. */
export async function getStaleInProgressRecords(
  db: D1Database,
  cutoffIso: string,
): Promise<IdempotencyRecord[]> {
  const res = await db
    .prepare(
      `SELECT * FROM idempotency_records WHERE result_json LIKE '%IN_PROGRESS%' AND created_at < ?1 ORDER BY created_at ASC`,
    )
    .bind(cutoffIso)
    .all();
  return (res.results ?? []) as IdempotencyRecord[];
}

/** Update idempotency record result_json (for repair completion). */
export async function updateIdempotencyResult(
  db: D1Database,
  id: string,
  resultJson: string,
): Promise<void> {
  await db
    .prepare(`UPDATE idempotency_records SET result_json = ?1 WHERE id = ?2`)
    .bind(resultJson, id)
    .run();
}

// ---------------------------------------------------------------------------
// Overdraft Facilities
// ---------------------------------------------------------------------------

export interface OverdraftFacility {
  id: string;
  account_id: string;
  limit_amount: string;
  currency: string;
  state: string;
  maker_staff_id: string;
  checker_staff_id?: string;
  approved_at?: string;
  expires_at?: string;
  created_at: string;
}

export async function insertOverdraftFacility(db: D1Database, facility: OverdraftFacility): Promise<void> {
  await db
    .prepare(
      `INSERT INTO overdraft_facilities (id, account_id, limit_amount, currency, state, maker_staff_id, checker_staff_id, approved_at, expires_at, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    )
    .bind(
      facility.id,
      facility.account_id,
      facility.limit_amount,
      facility.currency,
      facility.state,
      facility.maker_staff_id,
      facility.checker_staff_id ?? null,
      facility.approved_at ?? null,
      facility.expires_at ?? null,
      facility.created_at,
    )
    .run();
}

export async function getOverdraftFacility(db: D1Database, id: string): Promise<OverdraftFacility | null> {
  return (await db.prepare('SELECT * FROM overdraft_facilities WHERE id = ?1').bind(id).first()) as OverdraftFacility | null;
}

export async function getActiveOverdraftForAccount(db: D1Database, accountId: string): Promise<OverdraftFacility | null> {
  return (await db
    .prepare("SELECT * FROM overdraft_facilities WHERE account_id = ?1 AND state = 'ACTIVE' ORDER BY created_at DESC LIMIT 1")
    .bind(accountId)
    .first()) as OverdraftFacility | null;
}

export async function updateOverdraftFacility(
  db: D1Database,
  id: string,
  state: string,
  checkerStaffId: string,
  approvedAt?: string,
): Promise<void> {
  await db
    .prepare('UPDATE overdraft_facilities SET state = ?1, checker_staff_id = ?2, approved_at = ?3 WHERE id = ?4')
    .bind(state, checkerStaffId, approvedAt ?? null, id)
    .run();
}

// ---------------------------------------------------------------------------
// Wallet Balances (materialized)
// ---------------------------------------------------------------------------

export interface WalletBalance {
  account_id: string;
  balance: string;
  last_journal_id?: string;
  updated_at: string;
}

export async function getWalletBalance(db: D1Database, accountId: string): Promise<WalletBalance | null> {
  return (await db.prepare('SELECT * FROM wallet_balances WHERE account_id = ?1').bind(accountId).first()) as WalletBalance | null;
}

export async function upsertWalletBalance(db: D1Database, wb: WalletBalance): Promise<void> {
  await db
    .prepare(
      `INSERT INTO wallet_balances (account_id, balance, last_journal_id, updated_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(account_id) DO UPDATE SET balance = ?2, last_journal_id = ?3, updated_at = ?4`,
    )
    .bind(wb.account_id, wb.balance, wb.last_journal_id ?? null, wb.updated_at)
    .run();
}

// ---------------------------------------------------------------------------
// Reconciliation Findings
// ---------------------------------------------------------------------------

export interface ReconciliationFinding {
  id: string;
  account_id: string;
  expected_balance: string;
  actual_balance: string;
  discrepancy: string;
  severity: string;
  status: string;
  run_id: string;
  created_at: string;
  currency?: string;
}

export async function insertReconciliationFinding(db: D1Database, finding: ReconciliationFinding): Promise<void> {
  await db
    .prepare(
      `INSERT INTO reconciliation_findings (id, account_id, expected_balance, actual_balance, discrepancy, severity, status, run_id, created_at, currency)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    )
    .bind(
      finding.id,
      finding.account_id,
      finding.expected_balance,
      finding.actual_balance,
      finding.discrepancy,
      finding.severity,
      finding.status,
      finding.run_id,
      finding.created_at,
      finding.currency ?? 'BBD',
    )
    .run();
}

export async function getReconciliationFindings(
  db: D1Database,
  status?: string,
): Promise<ReconciliationFinding[]> {
  if (status) {
    const res = await db
      .prepare('SELECT * FROM reconciliation_findings WHERE status = ?1 ORDER BY created_at DESC')
      .bind(status)
      .all();
    return (res.results ?? []) as ReconciliationFinding[];
  }
  const res = await db
    .prepare('SELECT * FROM reconciliation_findings ORDER BY created_at DESC')
    .all();
  return (res.results ?? []) as ReconciliationFinding[];
}

// ---------------------------------------------------------------------------
// Reconciliation Runs
// ---------------------------------------------------------------------------

export interface ReconciliationRun {
  id: string;
  started_at: string;
  finished_at?: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  accounts_checked?: number;
  mismatches_found?: number;
  summary_json?: string;
  triggered_by?: string;
  correlation_id?: string;
}

export async function insertReconciliationRun(db: D1Database, run: ReconciliationRun): Promise<void> {
  await db
    .prepare(
      `INSERT INTO reconciliation_runs (id, started_at, finished_at, status, accounts_checked, mismatches_found, summary_json, triggered_by, correlation_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    )
    .bind(
      run.id,
      run.started_at,
      run.finished_at ?? null,
      run.status,
      run.accounts_checked ?? 0,
      run.mismatches_found ?? 0,
      run.summary_json ?? null,
      run.triggered_by ?? null,
      run.correlation_id ?? null,
    )
    .run();
}

export async function updateReconciliationRun(
  db: D1Database,
  id: string,
  status: 'COMPLETED' | 'FAILED',
  finishedAt: string,
  accountsChecked: number,
  mismatchesFound: number,
  summaryJson?: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE reconciliation_runs SET status = ?1, finished_at = ?2, accounts_checked = ?3, mismatches_found = ?4, summary_json = ?5 WHERE id = ?6`,
    )
    .bind(status, finishedAt, accountsChecked, mismatchesFound, summaryJson ?? null, id)
    .run();
}

export async function getReconciliationRuns(db: D1Database, limit: number = 50): Promise<ReconciliationRun[]> {
  const res = await db
    .prepare('SELECT * FROM reconciliation_runs ORDER BY started_at DESC LIMIT ?1')
    .bind(limit)
    .all();
  return (res.results ?? []) as ReconciliationRun[];
}

export async function getReconciliationRunById(db: D1Database, id: string): Promise<ReconciliationRun | null> {
  return (await db.prepare('SELECT * FROM reconciliation_runs WHERE id = ?1').bind(id).first()) as ReconciliationRun | null;
}

// ---------------------------------------------------------------------------
// Ledger — Journals (extended queries)
// ---------------------------------------------------------------------------

export async function getJournalById(db: D1Database, id: string): Promise<LedgerJournal | null> {
  return (await db.prepare('SELECT * FROM ledger_journals WHERE id = ?1').bind(id).first()) as LedgerJournal | null;
}

export async function getJournalLines(db: D1Database, journalId: string): Promise<LedgerLine[]> {
  const res = await db
    .prepare('SELECT * FROM ledger_lines WHERE journal_id = ?1 ORDER BY created_at')
    .bind(journalId)
    .all();
  return (res.results ?? []) as LedgerLine[];
}

export async function getAllAccounts(db: D1Database): Promise<LedgerAccount[]> {
  const res = await db.prepare('SELECT * FROM ledger_accounts').all();
  return (res.results ?? []) as LedgerAccount[];
}

/** Gets all journals in order, optionally filtered by date range */
export async function getJournalsInRange(
  db: D1Database,
  from?: string,
  to?: string,
): Promise<LedgerJournal[]> {
  let query = 'SELECT * FROM ledger_journals';
  const params: string[] = [];
  const conditions: string[] = [];

  if (from) {
    conditions.push(`created_at >= ?${params.length + 1}`);
    params.push(from);
  }
  if (to) {
    conditions.push(`created_at <= ?${params.length + 1}`);
    params.push(to);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY created_at ASC';

  const stmt = db.prepare(query);
  const res = await (params.length > 0 ? stmt.bind(...params) : stmt).all();
  return (res.results ?? []) as LedgerJournal[];
}

// ---------------------------------------------------------------------------
// Configuration — Fee Rules
// ---------------------------------------------------------------------------

/** Gets fee rules from the latest APPROVED version effective at `timestamp`. */
export async function getActiveFeeRules(
  db: D1Database,
  txnType: string,
  currency: string,
  timestamp: string,
): Promise<FeeRule[]> {
  const res = await db
    .prepare(
      `SELECT fr.* FROM fee_rules fr
       JOIN fee_matrix_versions fmv ON fr.version_id = fmv.id
       WHERE fmv.state = 'APPROVED'
         AND fmv.effective_from <= ?1
         AND fr.txn_type = ?2
         AND fr.currency = ?3
       ORDER BY fmv.effective_from DESC`,
    )
    .bind(timestamp, txnType, currency)
    .all();
  return (res.results ?? []) as FeeRule[];
}

// ---------------------------------------------------------------------------
// Configuration — Commission Rules
// ---------------------------------------------------------------------------

/** Gets commission rules from the latest APPROVED version effective at `timestamp`. */
export async function getActiveCommissionRules(
  db: D1Database,
  txnType: string,
  currency: string,
  timestamp: string,
): Promise<CommissionRule[]> {
  const res = await db
    .prepare(
      `SELECT cr.* FROM commission_rules cr
       JOIN commission_matrix_versions cmv ON cr.version_id = cmv.id
       WHERE cmv.state = 'APPROVED'
         AND cmv.effective_from <= ?1
         AND cr.txn_type = ?2
         AND cr.currency = ?3
       ORDER BY cmv.effective_from DESC`,
    )
    .bind(timestamp, txnType, currency)
    .all();
  return (res.results ?? []) as CommissionRule[];
}

// ---------------------------------------------------------------------------
// Actor Lookup (safe — returns minimal data for recipient verification)
// ---------------------------------------------------------------------------

const ACTOR_LOOKUP_FIELDS = 'id, type, state, name, first_name, middle_name, last_name, display_name';

export async function lookupActorByMsisdn(db: D1Database, msisdn: string): Promise<ActorLookup | null> {
  return (await db.prepare(`SELECT ${ACTOR_LOOKUP_FIELDS} FROM actors WHERE msisdn = ?1`).bind(msisdn).first()) as ActorLookup | null;
}

export async function lookupActorByStoreCode(db: D1Database, storeCode: string): Promise<ActorLookup | null> {
  return (await db.prepare(`SELECT ${ACTOR_LOOKUP_FIELDS} FROM actors WHERE store_code = ?1`).bind(storeCode).first()) as ActorLookup | null;
}

export async function lookupActorByAgentCode(db: D1Database, agentCode: string): Promise<ActorLookup | null> {
  return (await db.prepare(`SELECT ${ACTOR_LOOKUP_FIELDS} FROM actors WHERE agent_code = ?1`).bind(agentCode).first()) as ActorLookup | null;
}

export async function getActorById(db: D1Database, id: string): Promise<Actor | null> {
  return (await db.prepare('SELECT * FROM actors WHERE id = ?1').bind(id).first()) as Actor | null;
}

export async function updateActorProfile(
  db: D1Database,
  actorId: string,
  fields: { first_name?: string; middle_name?: string; last_name?: string; display_name?: string; email?: string; name?: string },
): Promise<void> {
  const sets: string[] = [];
  const values: (string | null)[] = [];
  let paramIdx = 1;

  if (fields.first_name !== undefined) {
    sets.push(`first_name = ?${paramIdx++}`);
    values.push(fields.first_name);
  }
  if (fields.middle_name !== undefined) {
    sets.push(`middle_name = ?${paramIdx++}`);
    values.push(fields.middle_name);
  }
  if (fields.last_name !== undefined) {
    sets.push(`last_name = ?${paramIdx++}`);
    values.push(fields.last_name);
  }
  if (fields.display_name !== undefined) {
    sets.push(`display_name = ?${paramIdx++}`);
    values.push(fields.display_name);
  }
  if (fields.email !== undefined) {
    sets.push(`email = ?${paramIdx++}`);
    values.push(fields.email);
  }
  if (fields.name !== undefined) {
    sets.push(`name = ?${paramIdx++}`);
    values.push(fields.name);
  }

  sets.push(`updated_at = ?${paramIdx++}`);
  values.push(new Date().toISOString());
  values.push(actorId);

  await db
    .prepare(`UPDATE actors SET ${sets.join(', ')} WHERE id = ?${paramIdx}`)
    .bind(...values)
    .run();
}

// ---------------------------------------------------------------------------
// Merchant Users
// ---------------------------------------------------------------------------

export async function insertMerchantUser(db: D1Database, user: MerchantUser & { pin_hash?: string; salt?: string }): Promise<void> {
  await db
    .prepare(
      `INSERT INTO merchant_users (id, actor_id, msisdn, name, role, pin_hash, salt, state, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    )
    .bind(
      user.id,
      user.actor_id,
      user.msisdn,
      user.name,
      user.role,
      user.pin_hash ?? null,
      user.salt ?? null,
      user.state,
      user.created_at,
      user.updated_at,
    )
    .run();
}

export async function insertAgentUser(db: D1Database, user: AgentUser & { pin_hash?: string; salt?: string; failed_attempts?: number; locked_until?: string }): Promise<void> {
  await db
    .prepare(
      `INSERT INTO agent_users (id, actor_id, msisdn, name, role, pin_hash, salt, state, failed_attempts, locked_until, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
    )
    .bind(
      user.id,
      user.actor_id,
      user.msisdn,
      user.name,
      user.role,
      user.pin_hash ?? null,
      user.salt ?? null,
      user.state,
      user.failed_attempts ?? 0,
      user.locked_until ?? null,
      user.created_at,
      user.updated_at,
    )
    .run();
}

/** Look up an agent user by agent actor ID + phone number (used for login). */
export async function getAgentUserByActorAndMsisdn(
  db: D1Database,
  actorId: string,
  msisdn: string,
): Promise<(AgentUser & { pin_hash: string; salt: string; failed_attempts: number; locked_until: string | null }) | null> {
  return (await db
    .prepare(
      `SELECT id, actor_id, msisdn, name, role, state, pin_hash, salt, failed_attempts, locked_until, created_at, updated_at
       FROM agent_users
       WHERE actor_id = ?1 AND msisdn = ?2 AND state = 'ACTIVE'`,
    )
    .bind(actorId, msisdn)
    .first()) as (AgentUser & { pin_hash: string; salt: string; failed_attempts: number; locked_until: string | null }) | null;
}

/** Update failed_attempts / locked_until on an agent_user row (for auth lockout). */
export async function updateAgentUserFailedAttempts(
  db: D1Database,
  agentUserId: string,
  attempts: number,
  lockedUntil?: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE agent_users SET failed_attempts = ?1, locked_until = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?3`,
    )
    .bind(attempts, lockedUntil ?? null, agentUserId)
    .run();
}

export async function getMerchantUsers(db: D1Database, actorId: string): Promise<MerchantUser[]> {
  const res = await db
    .prepare("SELECT id, actor_id, msisdn, name, role, state, created_at, updated_at FROM merchant_users WHERE actor_id = ?1 AND state != 'REMOVED' ORDER BY created_at ASC")
    .bind(actorId)
    .all();
  return (res.results ?? []) as MerchantUser[];
}

export async function getMerchantUserById(db: D1Database, userId: string): Promise<MerchantUser | null> {
  return (await db
    .prepare('SELECT id, actor_id, msisdn, name, role, state, created_at, updated_at FROM merchant_users WHERE id = ?1')
    .bind(userId)
    .first()) as MerchantUser | null;
}

/** Look up a merchant user by store actor ID + phone number (used for login). */
export async function getMerchantUserByActorAndMsisdn(
  db: D1Database,
  actorId: string,
  msisdn: string,
): Promise<(MerchantUser & { pin_hash: string; salt: string; failed_attempts: number; locked_until: string | null }) | null> {
  return (await db
    .prepare(
      `SELECT id, actor_id, msisdn, name, role, state, pin_hash, salt, failed_attempts, locked_until, created_at, updated_at
       FROM merchant_users
       WHERE actor_id = ?1 AND msisdn = ?2 AND state = 'ACTIVE'`,
    )
    .bind(actorId, msisdn)
    .first()) as (MerchantUser & { pin_hash: string; salt: string; failed_attempts: number; locked_until: string | null }) | null;
}

/** Update failed_attempts / locked_until on a merchant_user row (for auth lockout). */
export async function updateMerchantUserFailedAttempts(
  db: D1Database,
  merchantUserId: string,
  attempts: number,
  lockedUntil?: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE merchant_users SET failed_attempts = ?1, locked_until = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?3`,
    )
    .bind(attempts, lockedUntil ?? null, merchantUserId)
    .run();
}

export async function updateMerchantUser(
  db: D1Database,
  userId: string,
  fields: { name?: string; role?: string; state?: string },
): Promise<void> {
  const sets: string[] = [];
  const values: (string | null)[] = [];
  let paramIdx = 1;

  if (fields.name !== undefined) {
    sets.push(`name = ?${paramIdx++}`);
    values.push(fields.name);
  }
  if (fields.role !== undefined) {
    sets.push(`role = ?${paramIdx++}`);
    values.push(fields.role);
  }
  if (fields.state !== undefined) {
    sets.push(`state = ?${paramIdx++}`);
    values.push(fields.state);
  }

  sets.push(`updated_at = ?${paramIdx++}`);
  values.push(new Date().toISOString());
  values.push(userId);

  await db
    .prepare(`UPDATE merchant_users SET ${sets.join(', ')} WHERE id = ?${paramIdx}`)
    .bind(...values)
    .run();
}

// ---------------------------------------------------------------------------
// Merchant Store Hierarchy (closure table)
// ---------------------------------------------------------------------------

import type { MerchantStoreClosure } from '@caricash/shared';

/** Insert the self-referencing closure row (depth 0) for a new merchant store. */
export async function initMerchantStoreClosure(db: D1Database, actorId: string): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO merchant_store_closure (ancestor_id, descendant_id, depth) VALUES (?1, ?2, 0)`,
    )
    .bind(actorId, actorId)
    .run();
}

/**
 * Link a child store under a parent store.
 * Copies every ancestor of the parent and creates a link to the child at depth+1.
 */
export async function linkMerchantStoreBranch(
  db: D1Database,
  parentActorId: string,
  childActorId: string,
): Promise<void> {
  // Ensure self-rows exist
  await initMerchantStoreClosure(db, parentActorId);
  await initMerchantStoreClosure(db, childActorId);

  // Insert (ancestor, child, depth_to_parent + 1) for every ancestor of the parent
  await db
    .prepare(
      `INSERT OR IGNORE INTO merchant_store_closure (ancestor_id, descendant_id, depth)
       SELECT ancestor_id, ?1, depth + 1
       FROM merchant_store_closure
       WHERE descendant_id = ?2`,
    )
    .bind(childActorId, parentActorId)
    .run();
}

/** Get all descendant store actor IDs for a given ancestor (excluding self). */
export async function getMerchantDescendants(db: D1Database, actorId: string): Promise<Actor[]> {
  const res = await db
    .prepare(
      `SELECT a.* FROM actors a
       JOIN merchant_store_closure c ON a.id = c.descendant_id
       WHERE c.ancestor_id = ?1 AND c.depth > 0
       ORDER BY c.depth ASC`,
    )
    .bind(actorId)
    .all();
  return (res.results ?? []) as Actor[];
}

/** Get all ancestor store actor IDs for a given descendant (excluding self). */
export async function getMerchantAncestors(db: D1Database, actorId: string): Promise<Actor[]> {
  const res = await db
    .prepare(
      `SELECT a.* FROM actors a
       JOIN merchant_store_closure c ON a.id = c.ancestor_id
       WHERE c.descendant_id = ?1 AND c.depth > 0
       ORDER BY c.depth ASC`,
    )
    .bind(actorId)
    .all();
  return (res.results ?? []) as Actor[];
}

// ---------------------------------------------------------------------------
// Registration Metadata
// ---------------------------------------------------------------------------

export async function insertRegistrationMetadata(db: D1Database, meta: RegistrationMetadata): Promise<void> {
  await db
    .prepare(
      `INSERT INTO registration_metadata (
        id, actor_id, registration_type, registered_by_actor_id, registered_by_actor_type,
        channel, device_type, device_info, ip_address, geo_location,
        actor_snapshot_json, referral_code, campaign_id, utm_source, utm_medium, utm_campaign,
        terms_accepted_at, privacy_accepted_at, marketing_opt_in,
        verification_json, metadata_json, started_at, completed_at, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25)`,
    )
    .bind(
      meta.id,
      meta.actor_id,
      meta.registration_type,
      meta.registered_by_actor_id ?? null,
      meta.registered_by_actor_type ?? null,
      meta.channel ?? null,
      meta.device_type ?? null,
      meta.device_info ?? null,
      meta.ip_address ?? null,
      meta.geo_location ?? null,
      meta.actor_snapshot_json,
      meta.referral_code ?? null,
      meta.campaign_id ?? null,
      meta.utm_source ?? null,
      meta.utm_medium ?? null,
      meta.utm_campaign ?? null,
      meta.terms_accepted_at ?? null,
      meta.privacy_accepted_at ?? null,
      meta.marketing_opt_in ? 1 : 0,
      meta.verification_json ?? '{}',
      meta.metadata_json ?? '{}',
      meta.started_at,
      meta.completed_at ?? null,
      meta.created_at,
      meta.updated_at,
    )
    .run();
}

export async function getRegistrationMetadataByActorId(db: D1Database, actorId: string): Promise<RegistrationMetadata | null> {
  return (await db.prepare('SELECT * FROM registration_metadata WHERE actor_id = ?1').bind(actorId).first()) as RegistrationMetadata | null;
}

// ---------------------------------------------------------------------------
// Account Balances (actual & available)
// ---------------------------------------------------------------------------

export async function getAccountBalance(db: D1Database, accountId: string): Promise<AccountBalance | null> {
  return (await db.prepare('SELECT * FROM account_balances WHERE account_id = ?1').bind(accountId).first()) as AccountBalance | null;
}

export async function upsertAccountBalance(db: D1Database, bal: AccountBalance): Promise<void> {
  await db
    .prepare(
      `INSERT INTO account_balances (account_id, actual_balance, available_balance, hold_amount, pending_credits, last_journal_id, currency, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT(account_id) DO UPDATE SET
         actual_balance = ?2,
         available_balance = ?3,
         hold_amount = ?4,
         pending_credits = ?5,
         last_journal_id = ?6,
         updated_at = ?8`,
    )
    .bind(
      bal.account_id,
      bal.actual_balance,
      bal.available_balance,
      bal.hold_amount,
      bal.pending_credits,
      bal.last_journal_id ?? null,
      bal.currency,
      bal.updated_at,
    )
    .run();
}

export async function getAccountBalancesByOwner(
  db: D1Database,
  ownerType: string,
  ownerId: string,
  currency: string,
): Promise<AccountBalance[]> {
  const res = await db
    .prepare(
      `SELECT ab.* FROM account_balances ab
       JOIN ledger_accounts la ON ab.account_id = la.id
       WHERE la.owner_type = ?1 AND la.owner_id = ?2 AND la.currency = ?3`,
    )
    .bind(ownerType, ownerId, currency)
    .all();
  return (res.results ?? []) as AccountBalance[];
}

/** Initialize account_balances row for a newly created ledger account */
export async function initAccountBalance(db: D1Database, accountId: string, currency: string): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO account_balances (account_id, actual_balance, available_balance, hold_amount, pending_credits, currency, updated_at)
       VALUES (?1, '0.00', '0.00', '0.00', '0.00', ?2, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
    )
    .bind(accountId, currency)
    .run();
}

// ---------------------------------------------------------------------------
// Float Operations
// ---------------------------------------------------------------------------

export async function insertFloatOperation(db: D1Database, op: FloatOperation): Promise<void> {
  await db
    .prepare(
      `INSERT INTO float_operations (
        id, agent_actor_id, agent_account_id, staff_actor_id,
        operation_type, amount, currency, journal_id,
        balance_before, balance_after, available_before, available_after,
        requires_approval, approval_id, reason, reference,
        idempotency_key, correlation_id, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`,
    )
    .bind(
      op.id,
      op.agent_actor_id,
      op.agent_account_id,
      op.staff_actor_id,
      op.operation_type,
      op.amount,
      op.currency,
      op.journal_id ?? null,
      op.balance_before,
      op.balance_after,
      op.available_before,
      op.available_after,
      op.requires_approval ? 1 : 0,
      op.approval_id ?? null,
      op.reason ?? null,
      op.reference ?? null,
      op.idempotency_key,
      op.correlation_id,
      op.created_at,
    )
    .run();
}

export async function getFloatOperationsByAgent(db: D1Database, agentActorId: string, limit: number = 50): Promise<FloatOperation[]> {
  const res = await db
    .prepare('SELECT * FROM float_operations WHERE agent_actor_id = ?1 ORDER BY created_at DESC LIMIT ?2')
    .bind(agentActorId, limit)
    .all();
  return (res.results ?? []) as FloatOperation[];
}

export async function getFloatOperationByIdempotencyKey(db: D1Database, key: string): Promise<FloatOperation | null> {
  return (await db.prepare('SELECT * FROM float_operations WHERE idempotency_key = ?1').bind(key).first()) as FloatOperation | null;
}

// ---------------------------------------------------------------------------
// Code Reservations
// ---------------------------------------------------------------------------

export async function getCodeReservation(
  db: D1Database,
  codeType: 'AGENT' | 'STORE',
  codeValue: string,
): Promise<CodeReservation | null> {
  return (await db
    .prepare('SELECT * FROM code_reservations WHERE code_type = ?1 AND code_value = ?2')
    .bind(codeType, codeValue)
    .first()) as CodeReservation | null;
}

export async function getActiveCodeReservation(
  db: D1Database,
  codeType: 'AGENT' | 'STORE',
  codeValue: string,
  nowIso: string,
): Promise<CodeReservation | null> {
  return (await db
    .prepare(
      `SELECT * FROM code_reservations
       WHERE code_type = ?1
         AND code_value = ?2
         AND status = 'RESERVED'
         AND expires_at > ?3`,
    )
    .bind(codeType, codeValue, nowIso)
    .first()) as CodeReservation | null;
}

export async function reserveCode(
  db: D1Database,
  reservation: Pick<CodeReservation, 'id' | 'code_type' | 'code_value' | 'status' | 'expires_at' | 'created_at' | 'updated_at'> & {
    reserved_by_actor_id?: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO code_reservations (
        id, code_type, code_value, reserved_by_actor_id, status, expires_at, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(
      reservation.id,
      reservation.code_type,
      reservation.code_value,
      reservation.reserved_by_actor_id ?? null,
      reservation.status,
      reservation.expires_at,
      reservation.created_at,
      reservation.updated_at,
    )
    .run();
}

export async function expireCodeReservations(db: D1Database, nowIso: string): Promise<void> {
  await db
    .prepare(
      `UPDATE code_reservations
       SET status = 'EXPIRED', updated_at = ?1
       WHERE status = 'RESERVED' AND expires_at <= ?1`,
    )
    .bind(nowIso)
    .run();
}

export async function markCodeReservationUsed(
  db: D1Database,
  codeType: 'AGENT' | 'STORE',
  codeValue: string,
  usedByActorId: string,
  nowIso: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE code_reservations
       SET status = 'USED', used_by_actor_id = ?1, used_at = ?2, updated_at = ?2
       WHERE code_type = ?3 AND code_value = ?4 AND status = 'RESERVED'`,
    )
    .bind(usedByActorId, nowIso, codeType, codeValue)
    .run();
}

// ---------------------------------------------------------------------------
// KYC Profiles + Requirements
// ---------------------------------------------------------------------------

export async function ensureKycProfile(
  db: D1Database,
  profile: Pick<KycProfile, 'id' | 'actor_id' | 'actor_type' | 'status' | 'created_at' | 'updated_at'>,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO kyc_profiles (id, actor_id, actor_type, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(profile.id, profile.actor_id, profile.actor_type, profile.status, profile.created_at, profile.updated_at)
    .run();
}

export async function getKycProfileByActorId(db: D1Database, actorId: string): Promise<KycProfile | null> {
  return (await db.prepare('SELECT * FROM kyc_profiles WHERE actor_id = ?1').bind(actorId).first()) as KycProfile | null;
}

export async function upsertKycProfile(db: D1Database, profile: KycProfile): Promise<void> {
  await db
    .prepare(
      `INSERT INTO kyc_profiles (
        id, actor_id, actor_type, status, verification_level, submitted_at, reviewed_at,
        reviewer_actor_id, documents_json, metadata_json, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
      ON CONFLICT(actor_id) DO UPDATE SET
        actor_type = excluded.actor_type,
        status = excluded.status,
        verification_level = excluded.verification_level,
        submitted_at = excluded.submitted_at,
        reviewed_at = excluded.reviewed_at,
        reviewer_actor_id = excluded.reviewer_actor_id,
        documents_json = excluded.documents_json,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at`,
    )
    .bind(
      profile.id,
      profile.actor_id,
      profile.actor_type,
      profile.status,
      profile.verification_level ?? null,
      profile.submitted_at ?? null,
      profile.reviewed_at ?? null,
      profile.reviewer_actor_id ?? null,
      profile.documents_json ?? '{}',
      profile.metadata_json ?? '{}',
      profile.created_at,
      profile.updated_at,
    )
    .run();
}

export async function listKycRequirementsByActorType(db: D1Database, actorType: string): Promise<KycRequirement[]> {
  const res = await db
    .prepare('SELECT * FROM kyc_requirements WHERE actor_type = ?1 ORDER BY requirement_code ASC')
    .bind(actorType)
    .all();
  return (res.results ?? []) as KycRequirement[];
}

// ===========================================================================
// V2 Accounting — Chart of Accounts
// ===========================================================================

export async function getChartOfAccounts(
  db: D1Database,
  opts: { includeInactive?: boolean; accountClass?: string } = {},
): Promise<ChartOfAccount[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (!opts.includeInactive) {
    clauses.push(`(active_to IS NULL OR active_to > strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
  }
  if (opts.accountClass) {
    clauses.push(`account_class = ?${idx++}`);
    params.push(opts.accountClass);
  }

  const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
  const sql = `SELECT *, (SELECT name FROM chart_of_accounts p WHERE p.code = chart_of_accounts.parent_code) AS parent_name FROM chart_of_accounts${where} ORDER BY code ASC`;
  const res = params.length > 0
    ? await db.prepare(sql).bind(...params).all()
    : await db.prepare(sql).all();

  return ((res.results ?? []) as Record<string, unknown>[]).map((row) => ({
    ...row,
    is_header: Boolean(row.is_header),
  })) as ChartOfAccount[];
}

export async function getChartOfAccountByCode(db: D1Database, code: string): Promise<ChartOfAccount | null> {
  return (await db.prepare('SELECT * FROM chart_of_accounts WHERE code = ?1').bind(code).first()) as ChartOfAccount | null;
}

export async function insertChartOfAccount(db: D1Database, coa: ChartOfAccount): Promise<void> {
  await db
    .prepare(
      `INSERT INTO chart_of_accounts (code, name, account_class, normal_balance, parent_code, description, ifrs_mapping, is_header, active_from, active_to, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
    )
    .bind(
      coa.code, coa.name, coa.account_class, coa.normal_balance,
      coa.parent_code ?? null, coa.description ?? null, coa.ifrs_mapping ?? null,
      coa.is_header ? 1 : 0, coa.active_from, coa.active_to ?? null,
      coa.created_at, coa.updated_at,
    )
    .run();
}

// ===========================================================================
// V2 Accounting — Account Instances
// ===========================================================================

export async function getAccountInstance(db: D1Database, id: string): Promise<AccountInstance | null> {
  return (await db.prepare('SELECT * FROM account_instances WHERE id = ?1').bind(id).first()) as AccountInstance | null;
}

export async function getAccountInstanceByOwner(
  db: D1Database,
  ownerType: string,
  ownerId: string,
  coaCode: string,
  currency: string,
): Promise<AccountInstance | null> {
  return (await db
    .prepare('SELECT * FROM account_instances WHERE owner_type = ?1 AND owner_id = ?2 AND coa_code = ?3 AND currency = ?4')
    .bind(ownerType, ownerId, coaCode, currency)
    .first()) as AccountInstance | null;
}

export async function getAccountInstanceByLegacyId(db: D1Database, legacyAccountId: string): Promise<AccountInstance | null> {
  return (await db
    .prepare('SELECT * FROM account_instances WHERE legacy_account_id = ?1')
    .bind(legacyAccountId)
    .first()) as AccountInstance | null;
}

export async function insertAccountInstance(db: D1Database, ai: AccountInstance): Promise<void> {
  await db
    .prepare(
      `INSERT INTO account_instances (id, coa_code, owner_type, owner_id, currency, status, opened_at, closed_at, parent_instance_id, legacy_account_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
    )
    .bind(
      ai.id, ai.coa_code, ai.owner_type, ai.owner_id, ai.currency,
      ai.status, ai.opened_at, ai.closed_at ?? null,
      ai.parent_instance_id ?? null, ai.legacy_account_id ?? null,
      ai.created_at, ai.updated_at,
    )
    .run();
}

export async function updateAccountInstanceStatus(db: D1Database, id: string, status: string, closedAt?: string): Promise<void> {
  await db
    .prepare("UPDATE account_instances SET status = ?1, closed_at = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?3")
    .bind(status, closedAt ?? null, id)
    .run();
}

export async function listAccountInstancesByOwner(
  db: D1Database,
  ownerType: string,
  ownerId: string,
  currency?: string,
): Promise<AccountInstance[]> {
  const sql = currency
    ? "SELECT * FROM account_instances WHERE owner_type = ?1 AND owner_id = ?2 AND currency = ?3 AND status = 'OPEN' ORDER BY coa_code ASC"
    : "SELECT * FROM account_instances WHERE owner_type = ?1 AND owner_id = ?2 AND status = 'OPEN' ORDER BY coa_code ASC";
  const stmt = currency
    ? db.prepare(sql).bind(ownerType, ownerId, currency)
    : db.prepare(sql).bind(ownerType, ownerId);
  const res = await stmt.all();
  return (res.results ?? []) as AccountInstance[];
}

// ===========================================================================
// V2 Accounting — Accounting Periods
// ===========================================================================

export async function getAccountingPeriodForDate(db: D1Database, dateIso: string): Promise<AccountingPeriod | null> {
  return (await db
    .prepare("SELECT * FROM accounting_periods WHERE start_date <= ?1 AND end_date > ?1 AND status IN ('OPEN','CLOSING') LIMIT 1")
    .bind(dateIso)
    .first()) as AccountingPeriod | null;
}

export async function getAccountingPeriod(db: D1Database, id: string): Promise<AccountingPeriod | null> {
  return (await db.prepare('SELECT * FROM accounting_periods WHERE id = ?1').bind(id).first()) as AccountingPeriod | null;
}

export async function listAccountingPeriods(
  db: D1Database,
  opts: { status?: string; limit?: number; offset?: number } = {},
): Promise<AccountingPeriod[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (opts.status) {
    clauses.push(`status = ?${idx++}`);
    params.push(opts.status);
  }

  const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;
  const sql = `SELECT * FROM accounting_periods${where} ORDER BY start_date DESC LIMIT ?${idx++} OFFSET ?${idx}`;
  params.push(limit, offset);

  const res = await db.prepare(sql).bind(...params).all();
  return (res.results ?? []) as AccountingPeriod[];
}

export async function checkOverlappingPeriod(
  db: D1Database,
  startDate: string,
  endDate: string,
  excludeId?: string,
): Promise<AccountingPeriod | null> {
  const sql = excludeId
    ? 'SELECT * FROM accounting_periods WHERE start_date < ?2 AND end_date > ?1 AND id != ?3 LIMIT 1'
    : 'SELECT * FROM accounting_periods WHERE start_date < ?2 AND end_date > ?1 LIMIT 1';
  const stmt = excludeId
    ? db.prepare(sql).bind(startDate, endDate, excludeId)
    : db.prepare(sql).bind(startDate, endDate);
  return (await stmt.first()) as AccountingPeriod | null;
}

export async function updateAccountingPeriodStatus(
  db: D1Database,
  id: string,
  status: string,
  closedBy?: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare("UPDATE accounting_periods SET status = ?1, closed_by = ?2, closed_at = ?3, updated_at = ?4 WHERE id = ?5")
    .bind(status, closedBy ?? null, status === 'CLOSED' || status === 'LOCKED' ? now : null, now, id)
    .run();
}

export async function insertAccountingPeriod(db: D1Database, period: AccountingPeriod): Promise<void> {
  await db
    .prepare(
      `INSERT INTO accounting_periods (id, name, start_date, end_date, status, closed_by, closed_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    )
    .bind(period.id, period.name, period.start_date, period.end_date, period.status, period.closed_by ?? null, period.closed_at ?? null, period.created_at, period.updated_at)
    .run();
}

// ===========================================================================
// V2 Accounting — Posting Batches
// ===========================================================================

export async function insertPostingBatch(db: D1Database, batch: PostingBatch): Promise<void> {
  await db
    .prepare(
      `INSERT INTO posting_batches (id, source_system, source_doc_type, source_doc_id, description, status, journal_count, created_by, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    )
    .bind(batch.id, batch.source_system, batch.source_doc_type ?? null, batch.source_doc_id ?? null, batch.description ?? null, batch.status, batch.journal_count, batch.created_by ?? null, batch.created_at)
    .run();
}

export async function getPostingBatch(db: D1Database, id: string): Promise<PostingBatch | null> {
  return (await db.prepare('SELECT * FROM posting_batches WHERE id = ?1').bind(id).first()) as PostingBatch | null;
}

// ===========================================================================
// V2 Accounting — Sub-Ledger Accounts
// ===========================================================================

export async function insertSubledgerAccount(db: D1Database, sla: SubledgerAccount): Promise<void> {
  await db
    .prepare(
      `INSERT INTO subledger_accounts (id, parent_actor_id, child_actor_id, account_instance_id, relationship_type, effective_from, effective_to, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(sla.id, sla.parent_actor_id, sla.child_actor_id, sla.account_instance_id, sla.relationship_type, sla.effective_from, sla.effective_to ?? null, sla.created_at)
    .run();
}

export async function getSubledgerAccountsByParent(db: D1Database, parentActorId: string): Promise<SubledgerAccount[]> {
  const res = await db
    .prepare("SELECT * FROM subledger_accounts WHERE parent_actor_id = ?1 AND effective_to IS NULL ORDER BY created_at ASC")
    .bind(parentActorId)
    .all();
  return (res.results ?? []) as SubledgerAccount[];
}

export async function getSubledgerAccountsByChild(db: D1Database, childActorId: string): Promise<SubledgerAccount[]> {
  const res = await db
    .prepare("SELECT * FROM subledger_accounts WHERE child_actor_id = ?1 AND effective_to IS NULL ORDER BY created_at ASC")
    .bind(childActorId)
    .all();
  return (res.results ?? []) as SubledgerAccount[];
}

// ===========================================================================
// V2 Accounting — Daily Balance Snapshots
// ===========================================================================

export async function insertDailyBalanceSnapshot(db: D1Database, snap: DailyBalanceSnapshot): Promise<void> {
  await db
    .prepare(
      `INSERT INTO daily_balance_snapshots (id, account_instance_id, snapshot_date, opening_balance_minor, debit_total_minor, credit_total_minor, closing_balance_minor, journal_count, currency, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
       ON CONFLICT(account_instance_id, snapshot_date) DO UPDATE SET
         opening_balance_minor = ?4, debit_total_minor = ?5, credit_total_minor = ?6,
         closing_balance_minor = ?7, journal_count = ?8`,
    )
    .bind(snap.id, snap.account_instance_id, snap.snapshot_date, snap.opening_balance_minor, snap.debit_total_minor, snap.credit_total_minor, snap.closing_balance_minor, snap.journal_count, snap.currency, snap.created_at)
    .run();
}

export async function getDailyBalanceSnapshots(
  db: D1Database,
  accountInstanceId: string,
  fromDate?: string,
  toDate?: string,
): Promise<DailyBalanceSnapshot[]> {
  let sql = 'SELECT * FROM daily_balance_snapshots WHERE account_instance_id = ?1';
  const params: unknown[] = [accountInstanceId];
  if (fromDate) { sql += ' AND snapshot_date >= ?2'; params.push(fromDate); }
  if (toDate) { sql += ` AND snapshot_date <= ?${params.length + 1}`; params.push(toDate); }
  sql += ' ORDER BY snapshot_date ASC';
  const res = await db.prepare(sql).bind(...params).all();
  return (res.results ?? []) as DailyBalanceSnapshot[];
}

// ===========================================================================
// V2 Accounting — Reporting Views
// ===========================================================================

export async function getTrialBalance(
  db: D1Database,
  opts: { currency?: string; from?: string; to?: string; periodId?: string } = {},
): Promise<TrialBalanceRow[]> {
  // If date range or period filters are given, use a custom query instead of the view
  if (opts.from || opts.to || opts.periodId) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts.currency) { clauses.push(`ai.currency = ?${idx++}`); params.push(opts.currency); }
    if (opts.from) { clauses.push(`lj.created_at >= ?${idx++}`); params.push(opts.from); }
    if (opts.to) { clauses.push(`lj.created_at <= ?${idx++}`); params.push(opts.to); }
    if (opts.periodId) { clauses.push(`lj.accounting_period_id = ?${idx++}`); params.push(opts.periodId); }

    const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
    const sql = `SELECT
        coa.code AS coa_code,
        coa.name AS account_name,
        coa.account_class,
        coa.normal_balance,
        ai.currency,
        COALESCE(SUM(ll.debit_amount_minor), 0) AS total_debit_minor,
        COALESCE(SUM(ll.credit_amount_minor), 0) AS total_credit_minor,
        COALESCE(SUM(ll.debit_amount_minor), 0) - COALESCE(SUM(ll.credit_amount_minor), 0) AS net_balance_minor
      FROM chart_of_accounts coa
      JOIN account_instances ai ON ai.coa_code = coa.code AND ai.status = 'OPEN'
      LEFT JOIN ledger_lines ll ON ll.account_instance_id = ai.id
      LEFT JOIN ledger_journals lj ON lj.id = ll.journal_id
      ${where}
      GROUP BY coa.code, coa.name, coa.account_class, coa.normal_balance, ai.currency`;

    const res = params.length > 0
      ? await db.prepare(sql).bind(...params).all()
      : await db.prepare(sql).all();
    return (res.results ?? []) as TrialBalanceRow[];
  }

  // Default: use the materialised view
  const sql = opts.currency
    ? 'SELECT * FROM v_trial_balance WHERE currency = ?1 ORDER BY coa_code ASC'
    : 'SELECT * FROM v_trial_balance ORDER BY coa_code ASC';
  const stmt = opts.currency ? db.prepare(sql).bind(opts.currency) : db.prepare(sql);
  const res = await stmt.all();
  return (res.results ?? []) as TrialBalanceRow[];
}

export async function getGLDetail(
  db: D1Database,
  filters?: { currency?: string; from?: string; to?: string; coa_code?: string; limit?: number },
): Promise<GLDetailRow[]> {
  let sql = 'SELECT * FROM v_gl_detail WHERE 1=1';
  const params: unknown[] = [];
  let idx = 1;
  if (filters?.currency) { sql += ` AND currency = ?${idx++}`; params.push(filters.currency); }
  if (filters?.from) { sql += ` AND posted_at >= ?${idx++}`; params.push(filters.from); }
  if (filters?.to) { sql += ` AND posted_at <= ?${idx++}`; params.push(filters.to); }
  if (filters?.coa_code) { sql += ` AND coa_code = ?${idx++}`; params.push(filters.coa_code); }
  sql += ` ORDER BY posted_at DESC, line_number ASC LIMIT ?${idx}`;
  params.push(filters?.limit ?? 500);
  const res = await db.prepare(sql).bind(...params).all();
  return (res.results ?? []) as GLDetailRow[];
}

export async function getAccountStatement(
  db: D1Database,
  accountInstanceId: string,
  from?: string,
  to?: string,
  limit?: number,
): Promise<AccountStatementRow[]> {
  let sql = 'SELECT * FROM v_account_statement WHERE account_instance_id = ?1';
  const params: unknown[] = [accountInstanceId];
  let idx = 2;
  if (from) { sql += ` AND posted_at >= ?${idx++}`; params.push(from); }
  if (to) { sql += ` AND posted_at <= ?${idx++}`; params.push(to); }
  sql += ` ORDER BY posted_at DESC, line_number ASC LIMIT ?${idx}`;
  params.push(limit ?? 200);
  const res = await db.prepare(sql).bind(...params).all();
  return (res.results ?? []) as AccountStatementRow[];
}

export async function getSubledgerRollup(db: D1Database, parentActorId: string, currency?: string): Promise<SubledgerRollupRow[]> {
  const sql = currency
    ? 'SELECT * FROM v_subledger_rollup WHERE parent_actor_id = ?1 AND currency = ?2'
    : 'SELECT * FROM v_subledger_rollup WHERE parent_actor_id = ?1';
  const stmt = currency ? db.prepare(sql).bind(parentActorId, currency) : db.prepare(sql).bind(parentActorId);
  const res = await stmt.all();
  return (res.results ?? []) as SubledgerRollupRow[];
}

