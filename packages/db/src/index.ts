/**
 * @caricash/db — D1 database helpers for CariCash Nova
 *
 * The `db` parameter in all functions is a Cloudflare D1Database instance.
 * Typed as `any` here to avoid a hard dependency on @cloudflare/workers-types.
 */
import type {
  Actor,
  LedgerAccount,
  LedgerJournal,
  LedgerLine,
  ApprovalRequest,
  Event,
  AuditLog,
  IdempotencyRecord,
  FeeRule,
  CommissionRule,
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

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------

export async function insertActor(db: D1Database, actor: Actor): Promise<void> {
  await db
    .prepare(
      `INSERT INTO actors (id, type, state, name, msisdn, agent_code, store_code, staff_code, kyc_state, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
    )
    .bind(
      actor.id,
      actor.type,
      actor.state,
      actor.name,
      actor.msisdn ?? null,
      actor.agent_code ?? null,
      actor.store_code ?? null,
      actor.staff_code ?? null,
      actor.kyc_state,
      actor.created_at,
      actor.updated_at,
    )
    .run();
}

export async function getActorByMsisdn(db: D1Database, msisdn: string): Promise<Actor | null> {
  return (await db.prepare('SELECT * FROM actors WHERE msisdn = ?1').bind(msisdn).first()) as Actor | null;
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

export async function insertIdempotencyRecord(
  db: D1Database,
  record: IdempotencyRecord,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO idempotency_records (id, scope, idempotency_key, result_json, created_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(
      record.id,
      record.scope,
      record.idempotency_key,
      record.result_json,
      record.created_at,
      record.expires_at,
    )
    .run();
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
