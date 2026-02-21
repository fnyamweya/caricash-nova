/**
 * @caricash/db — D1 database helpers for CariCash Nova
 *
 * The `db` parameter in all functions is a Cloudflare D1Database instance.
 * Typed as `any` here to avoid a hard dependency on @cloudflare/workers-types.
 */
import type {
  Actor,
  ActorLookup,
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
      `INSERT INTO actors (id, type, state, name, first_name, middle_name, last_name, display_name, email, msisdn, agent_code, store_code, staff_code, staff_role, parent_actor_id, kyc_state, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)`,
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
