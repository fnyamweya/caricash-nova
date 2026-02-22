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
  MerchantStore,
  StorePaymentNode,
  CustomerProfile,
  MerchantProfile,
  AgentProfile,
  StaffProfile,
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
  ApprovalPolicy,
  ApprovalPolicyCondition,
  ApprovalPolicyStage,
  ApprovalPolicyBinding,
  ApprovalStageDecision,
  ApprovalDelegation,
  ApprovalPolicyDecision,
  ApprovalPolicyFull,
  ApprovalTypeConfig,
  ApprovalEndpointBinding,
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
      `INSERT INTO actors (id, type, state, name, msisdn, agent_code, agent_type, store_code, staff_code, staff_role, parent_actor_id, kyc_state, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
    )
    .bind(
      actor.id,
      actor.type,
      actor.state,
      actor.name,
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

  // Write profile fields to type-specific profile table
  await insertActorProfile(db, actor);
}

// ---------------------------------------------------------------------------
// Actor Profiles — type-specific profile CRUD
// ---------------------------------------------------------------------------

/**
 * Dual-write helper: inserts a row in the appropriate profile table based on actor type.
 * Called automatically by insertActor(). Also usable standalone for backfills.
 */
async function insertActorProfile(db: D1Database, actor: Actor): Promise<void> {
  const type = actor.type as string;
  if (type === 'CUSTOMER') {
    await db
      .prepare(
        `INSERT OR IGNORE INTO customer_profiles (actor_id, first_name, middle_name, last_name, display_name, email, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
      .bind(
        actor.id,
        actor.first_name ?? null,
        actor.middle_name ?? null,
        actor.last_name ?? null,
        actor.display_name ?? null,
        actor.email ?? null,
        actor.created_at,
        actor.updated_at,
      )
      .run();
  } else if (type === 'MERCHANT') {
    await db
      .prepare(
        `INSERT OR IGNORE INTO merchant_profiles (actor_id, first_name, middle_name, last_name, display_name, email, parent_actor_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      )
      .bind(
        actor.id,
        actor.first_name ?? null,
        actor.middle_name ?? null,
        actor.last_name ?? null,
        actor.display_name ?? null,
        actor.email ?? null,
        actor.parent_actor_id ?? null,
        actor.created_at,
        actor.updated_at,
      )
      .run();
  } else if (type === 'AGENT') {
    if (actor.agent_code) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO agent_profiles (actor_id, first_name, middle_name, last_name, display_name, agent_code, agent_type, msisdn, parent_actor_id, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
        )
        .bind(
          actor.id,
          actor.first_name ?? null,
          actor.middle_name ?? null,
          actor.last_name ?? null,
          actor.display_name ?? null,
          actor.agent_code,
          actor.agent_type ?? 'STANDARD',
          actor.msisdn ?? null,
          actor.parent_actor_id ?? null,
          actor.created_at,
          actor.updated_at,
        )
        .run();
    }
  } else if (type === 'STAFF') {
    if (actor.staff_code) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO staff_profiles (actor_id, first_name, middle_name, last_name, display_name, staff_code, staff_role, email, msisdn, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
        )
        .bind(
          actor.id,
          actor.first_name ?? null,
          actor.middle_name ?? null,
          actor.last_name ?? null,
          actor.display_name ?? null,
          actor.staff_code,
          actor.staff_role ?? 'SUPPORT',
          actor.email ?? null,
          actor.msisdn ?? null,
          actor.created_at,
          actor.updated_at,
        )
        .run();
    }
  }
}

export async function getCustomerProfile(db: D1Database, actorId: string): Promise<CustomerProfile | null> {
  return (await db.prepare('SELECT * FROM customer_profiles WHERE actor_id = ?1').bind(actorId).first()) as CustomerProfile | null;
}

export async function getMerchantProfile(db: D1Database, actorId: string): Promise<MerchantProfile | null> {
  return (await db.prepare('SELECT * FROM merchant_profiles WHERE actor_id = ?1').bind(actorId).first()) as MerchantProfile | null;
}

export async function getAgentProfile(db: D1Database, actorId: string): Promise<AgentProfile | null> {
  return (await db.prepare('SELECT * FROM agent_profiles WHERE actor_id = ?1').bind(actorId).first()) as AgentProfile | null;
}

export async function getStaffProfile(db: D1Database, actorId: string): Promise<StaffProfile | null> {
  return (await db.prepare('SELECT * FROM staff_profiles WHERE actor_id = ?1').bind(actorId).first()) as StaffProfile | null;
}

export async function getAgentProfileByCode(db: D1Database, agentCode: string): Promise<AgentProfile | null> {
  return (await db.prepare('SELECT * FROM agent_profiles WHERE agent_code = ?1').bind(agentCode).first()) as AgentProfile | null;
}

export async function getStaffProfileByCode(db: D1Database, staffCode: string): Promise<StaffProfile | null> {
  return (await db.prepare('SELECT * FROM staff_profiles WHERE staff_code = ?1').bind(staffCode).first()) as StaffProfile | null;
}

export async function updateCustomerProfile(
  db: D1Database,
  actorId: string,
  fields: { first_name?: string; middle_name?: string; last_name?: string; display_name?: string; preferred_name?: string; email?: string },
): Promise<void> {
  const sets: string[] = [];
  const values: (string | null)[] = [];
  let paramIdx = 1;

  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) {
      sets.push(`${key} = ?${paramIdx++}`);
      values.push(val);
    }
  }
  if (sets.length === 0) return;

  sets.push(`updated_at = ?${paramIdx++}`);
  values.push(new Date().toISOString());
  values.push(actorId);

  await db
    .prepare(`UPDATE customer_profiles SET ${sets.join(', ')} WHERE actor_id = ?${paramIdx}`)
    .bind(...values)
    .run();
}

export async function updateMerchantProfile(
  db: D1Database,
  actorId: string,
  fields: { first_name?: string; middle_name?: string; last_name?: string; display_name?: string; email?: string; parent_actor_id?: string },
): Promise<void> {
  const sets: string[] = [];
  const values: (string | null)[] = [];
  let paramIdx = 1;

  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) {
      sets.push(`${key} = ?${paramIdx++}`);
      values.push(val);
    }
  }
  if (sets.length === 0) return;

  sets.push(`updated_at = ?${paramIdx++}`);
  values.push(new Date().toISOString());
  values.push(actorId);

  await db
    .prepare(`UPDATE merchant_profiles SET ${sets.join(', ')} WHERE actor_id = ?${paramIdx}`)
    .bind(...values)
    .run();
}

export async function updateStaffProfile(
  db: D1Database,
  actorId: string,
  fields: { first_name?: string; middle_name?: string; last_name?: string; display_name?: string; staff_role?: string; email?: string; msisdn?: string; department?: string },
): Promise<void> {
  const sets: string[] = [];
  const values: (string | null)[] = [];
  let paramIdx = 1;

  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) {
      sets.push(`${key} = ?${paramIdx++}`);
      values.push(val);
    }
  }
  if (sets.length === 0) return;

  sets.push(`updated_at = ?${paramIdx++}`);
  values.push(new Date().toISOString());
  values.push(actorId);

  await db
    .prepare(`UPDATE staff_profiles SET ${sets.join(', ')} WHERE actor_id = ?${paramIdx}`)
    .bind(...values)
    .run();
}

export async function updateAgentProfile(
  db: D1Database,
  actorId: string,
  fields: { first_name?: string; middle_name?: string; last_name?: string; display_name?: string; owner_name?: string; msisdn?: string; parent_actor_id?: string },
): Promise<void> {
  const sets: string[] = [];
  const values: (string | null)[] = [];
  let paramIdx = 1;

  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) {
      sets.push(`${key} = ?${paramIdx++}`);
      values.push(val);
    }
  }
  if (sets.length === 0) return;

  sets.push(`updated_at = ?${paramIdx++}`);
  values.push(new Date().toISOString());
  values.push(actorId);

  await db
    .prepare(`UPDATE agent_profiles SET ${sets.join(', ')} WHERE actor_id = ?${paramIdx}`)
    .bind(...values)
    .run();
}

// ---------------------------------------------------------------------------
// Actor Queries (core actors table)
// ---------------------------------------------------------------------------

/**
 * Enrich a core Actor object with profile data from the appropriate
 * type-specific profile table. Name fields on the Actor that come from
 * the actors table are overwritten by profile table values (source of truth).
 */
async function enrichActorWithProfile(db: D1Database, actor: Actor): Promise<Actor> {
  const t = actor.type as string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let profile: any = null;
  if (t === 'CUSTOMER') profile = await getCustomerProfile(db, actor.id);
  else if (t === 'MERCHANT') profile = await getMerchantProfile(db, actor.id);
  else if (t === 'AGENT') profile = await getAgentProfile(db, actor.id);
  else if (t === 'STAFF') profile = await getStaffProfile(db, actor.id);

  if (profile) {
    const a = actor as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const key of ['first_name', 'middle_name', 'last_name', 'display_name', 'email'] as const) {
      if (profile[key] !== undefined && profile[key] !== null) {
        a[key] = profile[key];
      }
    }
  }
  return actor;
}

/**
 * Batch-enrich a list of actors with profile data.
 * Groups actors by type and fetches all profiles in one query per type.
 */
async function enrichActorsWithProfiles(db: D1Database, actors: Actor[]): Promise<Actor[]> {
  if (actors.length === 0) return actors;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profileMap = new Map<string, any>();

  // Group actor IDs by type
  const byType: Record<string, string[]> = {};
  for (const a of actors) {
    const t = a.type as string;
    (byType[t] ??= []).push(a.id);
  }

  // Batch fetch profiles per type
  for (const [type, ids] of Object.entries(byType)) {
    const table =
      type === 'CUSTOMER' ? 'customer_profiles' :
        type === 'MERCHANT' ? 'merchant_profiles' :
          type === 'AGENT' ? 'agent_profiles' :
            type === 'STAFF' ? 'staff_profiles' : null;
    if (!table || ids.length === 0) continue;

    // D1 doesn't support array bind; use IN with individual placeholders
    const placeholders = ids.map((_, i) => `?${i + 1}`).join(',');
    const res = await db
      .prepare(`SELECT * FROM ${table} WHERE actor_id IN (${placeholders})`)
      .bind(...ids)
      .all();
    for (const row of (res.results ?? []) as any[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
      profileMap.set(row.actor_id as string, row);
    }
  }

  // Merge profile data into actors
  for (const actor of actors) {
    const profile = profileMap.get(actor.id);
    if (profile) {
      const a = actor as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const key of ['first_name', 'middle_name', 'last_name', 'display_name', 'email'] as const) {
        if (profile[key] !== undefined && profile[key] !== null) {
          a[key] = profile[key];
        }
      }
    }
  }
  return actors;
}

/** @deprecated Use getActorByMsisdnAndType instead — untyped lookup doesn't enforce type safety. */
export async function getActorByMsisdn(db: D1Database, msisdn: string): Promise<Actor | null> {
  const actor = (await db.prepare('SELECT * FROM actors WHERE msisdn = ?1').bind(msisdn).first()) as Actor | null;
  return actor ? enrichActorWithProfile(db, actor) : null;
}

export async function getActorByMsisdnAndType(db: D1Database, msisdn: string, actorType: string): Promise<Actor | null> {
  const actor = (await db.prepare('SELECT * FROM actors WHERE msisdn = ?1 AND type = ?2').bind(msisdn, actorType).first()) as Actor | null;
  return actor ? enrichActorWithProfile(db, actor) : null;
}

export async function getActorByAgentCode(db: D1Database, code: string): Promise<Actor | null> {
  const actor = (await db.prepare('SELECT * FROM actors WHERE agent_code = ?1').bind(code).first()) as Actor | null;
  return actor ? enrichActorWithProfile(db, actor) : null;
}

export async function getActorByStoreCode(db: D1Database, code: string): Promise<Actor | null> {
  const actor = (await db.prepare('SELECT * FROM actors WHERE store_code = ?1').bind(code).first()) as Actor | null;
  return actor ? enrichActorWithProfile(db, actor) : null;
}

export async function getActorByStaffCode(db: D1Database, code: string): Promise<Actor | null> {
  const actor = (await db.prepare('SELECT * FROM actors WHERE staff_code = ?1').bind(code).first()) as Actor | null;
  return actor ? enrichActorWithProfile(db, actor) : null;
}

export async function listActiveStaffByRole(db: D1Database, role: string): Promise<Actor[]> {
  const res = await db
    .prepare("SELECT * FROM actors WHERE type = 'STAFF' AND staff_role = ?1 AND state = 'ACTIVE' ORDER BY created_at ASC")
    .bind(role)
    .all();
  return enrichActorsWithProfiles(db, (res.results ?? []) as Actor[]);
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
  return enrichActorsWithProfiles(db, (res.results ?? []) as Actor[]);
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

  return enrichActorsWithProfiles(db, (res.results ?? []) as Actor[]);
}

export async function getStaffActorById(db: D1Database, id: string): Promise<Actor | null> {
  const actor = (await db
    .prepare("SELECT * FROM actors WHERE id = ?1 AND type = 'STAFF'")
    .bind(id)
    .first()) as Actor | null;
  return actor ? enrichActorWithProfile(db, actor) : null;
}

export async function updateStaffActor(
  db: D1Database,
  staffId: string,
  fields: { name?: string; email?: string; staff_role?: string; state?: string; first_name?: string; middle_name?: string; last_name?: string; display_name?: string; msisdn?: string; department?: string },
): Promise<void> {
  // Only core actor fields go to the actors table (email is now in profile only)
  const sets: string[] = [];
  const values: (string | null)[] = [];
  let paramIdx = 1;

  if (fields.name !== undefined) {
    sets.push(`name = ?${paramIdx++}`);
    values.push(fields.name);
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

  // Dual-write to staff_profiles
  const profileFields: Parameters<typeof updateStaffProfile>[2] = {};
  if (fields.staff_role !== undefined) profileFields.staff_role = fields.staff_role;
  if (fields.email !== undefined) profileFields.email = fields.email;
  // Forward name fields to the profile table when present
  if (fields.first_name !== undefined) profileFields.first_name = fields.first_name;
  if (fields.middle_name !== undefined) profileFields.middle_name = fields.middle_name;
  if (fields.last_name !== undefined) profileFields.last_name = fields.last_name;
  if (fields.display_name !== undefined) profileFields.display_name = fields.display_name;
  if (fields.msisdn !== undefined) profileFields.msisdn = fields.msisdn;
  if (fields.department !== undefined) profileFields.department = fields.department;
  if (Object.keys(profileFields).length > 0) {
    await updateStaffProfile(db, staffId, profileFields);
  }
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
// Sources name fields from profile tables (source of truth).
// ---------------------------------------------------------------------------

const ACTOR_CORE_LOOKUP = 'a.id, a.type, a.state, a.name';

export async function lookupActorByMsisdn(db: D1Database, msisdn: string, actorType?: string): Promise<ActorLookup | null> {
  if (actorType) {
    const profileTable =
      actorType === 'CUSTOMER' ? 'customer_profiles' :
        actorType === 'MERCHANT' ? 'merchant_profiles' :
          actorType === 'AGENT' ? 'agent_profiles' :
            actorType === 'STAFF' ? 'staff_profiles' : null;
    if (profileTable) {
      return (await db.prepare(
        `SELECT ${ACTOR_CORE_LOOKUP}, p.first_name, p.middle_name, p.last_name, p.display_name
         FROM actors a LEFT JOIN ${profileTable} p ON a.id = p.actor_id
         WHERE a.msisdn = ?1 AND a.type = ?2`,
      ).bind(msisdn, actorType).first()) as ActorLookup | null;
    }
  }
  // No type specified — use COALESCE across all profile tables
  return (await db.prepare(
    `SELECT ${ACTOR_CORE_LOOKUP},
       COALESCE(cp.first_name, mp.first_name, ap.first_name, sp.first_name) as first_name,
       COALESCE(cp.middle_name, mp.middle_name, ap.middle_name, sp.middle_name) as middle_name,
       COALESCE(cp.last_name, mp.last_name, ap.last_name, sp.last_name) as last_name,
       COALESCE(cp.display_name, mp.display_name, ap.display_name, sp.display_name) as display_name
     FROM actors a
     LEFT JOIN customer_profiles cp ON a.id = cp.actor_id
     LEFT JOIN merchant_profiles mp ON a.id = mp.actor_id
     LEFT JOIN agent_profiles ap ON a.id = ap.actor_id
     LEFT JOIN staff_profiles sp ON a.id = sp.actor_id
     WHERE a.msisdn = ?1`,
  ).bind(msisdn).first()) as ActorLookup | null;
}

export async function lookupActorByStoreCode(db: D1Database, storeCode: string): Promise<ActorLookup | null> {
  return (await db.prepare(
    `SELECT ${ACTOR_CORE_LOOKUP}, p.first_name, p.middle_name, p.last_name, p.display_name
     FROM actors a LEFT JOIN merchant_profiles p ON a.id = p.actor_id
     WHERE a.store_code = ?1`,
  ).bind(storeCode).first()) as ActorLookup | null;
}

export async function lookupActorByAgentCode(db: D1Database, agentCode: string): Promise<ActorLookup | null> {
  return (await db.prepare(
    `SELECT ${ACTOR_CORE_LOOKUP}, p.first_name, p.middle_name, p.last_name, p.display_name
     FROM actors a LEFT JOIN agent_profiles p ON a.id = p.actor_id
     WHERE a.agent_code = ?1`,
  ).bind(agentCode).first()) as ActorLookup | null;
}

export async function getActorById(db: D1Database, id: string): Promise<Actor | null> {
  const actor = (await db.prepare('SELECT * FROM actors WHERE id = ?1').bind(id).first()) as Actor | null;
  return actor ? enrichActorWithProfile(db, actor) : null;
}

export async function updateActorProfile(
  db: D1Database,
  actorId: string,
  fields: { first_name?: string; middle_name?: string; last_name?: string; display_name?: string; email?: string; name?: string },
): Promise<void> {
  // Only `name` lives on the core actors table now; profile fields go to profile tables.
  if (fields.name !== undefined) {
    const now = new Date().toISOString();
    await db
      .prepare('UPDATE actors SET name = ?1, updated_at = ?2 WHERE id = ?3')
      .bind(fields.name, now, actorId)
      .run();
  }

  // Write profile fields to type-specific tables (best-effort — only the matching profile table has a row)
  const nameFields: { first_name?: string; middle_name?: string; last_name?: string; display_name?: string; email?: string } = {};
  if (fields.first_name !== undefined) nameFields.first_name = fields.first_name;
  if (fields.middle_name !== undefined) nameFields.middle_name = fields.middle_name;
  if (fields.last_name !== undefined) nameFields.last_name = fields.last_name;
  if (fields.display_name !== undefined) nameFields.display_name = fields.display_name;
  if (fields.email !== undefined) nameFields.email = fields.email;
  if (Object.keys(nameFields).length > 0) {
    await Promise.allSettled([
      updateCustomerProfile(db, actorId, nameFields),
      updateMerchantProfile(db, actorId, nameFields),
      updateAgentProfile(db, actorId, nameFields),
      updateStaffProfile(db, actorId, nameFields),
    ]);
  }
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
  return enrichActorsWithProfiles(db, (res.results ?? []) as Actor[]);
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
  return enrichActorsWithProfiles(db, (res.results ?? []) as Actor[]);
}

// ---------------------------------------------------------------------------
// Merchant Stores (new first-class table)
// ---------------------------------------------------------------------------

function parseMerchantStoreRow(row: Record<string, unknown>): MerchantStore {
  return {
    id: row.id as string,
    merchant_id: row.merchant_id as string,
    name: row.name as string,
    legal_name: (row.legal_name as string) || undefined,
    store_code: row.store_code as string,
    is_primary: row.is_primary === 1 || row.is_primary === true,
    location: row.location ? (typeof row.location === 'string' ? JSON.parse(row.location) : row.location as Record<string, unknown>) : null,
    status: (row.status as MerchantStore['status']) || 'active',
    kyc_profile: (row.kyc_profile as string) || null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function insertMerchantStore(db: D1Database, store: MerchantStore): Promise<void> {
  await db
    .prepare(
      `INSERT INTO merchant_stores (id, merchant_id, name, legal_name, store_code, is_primary, location, status, kyc_profile, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
    )
    .bind(
      store.id,
      store.merchant_id,
      store.name,
      store.legal_name ?? null,
      store.store_code,
      store.is_primary ? 1 : 0,
      store.location ? JSON.stringify(store.location) : null,
      store.status,
      store.kyc_profile ?? null,
      store.created_at,
      store.updated_at,
    )
    .run();
}

export async function getMerchantStoreById(db: D1Database, storeId: string): Promise<MerchantStore | null> {
  const row = await db
    .prepare(`SELECT * FROM merchant_stores WHERE id = ?1`)
    .bind(storeId)
    .first();
  return row ? parseMerchantStoreRow(row as Record<string, unknown>) : null;
}

export async function getMerchantStoreByCode(db: D1Database, storeCode: string): Promise<MerchantStore | null> {
  const row = await db
    .prepare(`SELECT * FROM merchant_stores WHERE store_code = ?1`)
    .bind(storeCode)
    .first();
  return row ? parseMerchantStoreRow(row as Record<string, unknown>) : null;
}

export async function listMerchantStores(
  db: D1Database,
  merchantId: string,
  filters?: { status?: string; limit?: number; offset?: number },
): Promise<MerchantStore[]> {
  let query = `SELECT * FROM merchant_stores WHERE merchant_id = ?1`;
  const binds: unknown[] = [merchantId];
  let idx = 2;
  if (filters?.status) {
    query += ` AND status = ?${idx}`;
    binds.push(filters.status);
    idx++;
  }
  query += ` ORDER BY is_primary DESC, created_at ASC`;
  if (filters?.limit) {
    query += ` LIMIT ?${idx}`;
    binds.push(filters.limit);
    idx++;
  }
  if (filters?.offset) {
    query += ` OFFSET ?${idx}`;
    binds.push(filters.offset);
  }
  const res = await db.prepare(query).bind(...binds).all();
  return ((res.results ?? []) as Record<string, unknown>[]).map(parseMerchantStoreRow);
}

export async function updateMerchantStore(
  db: D1Database,
  storeId: string,
  fields: Partial<Pick<MerchantStore, 'name' | 'legal_name' | 'is_primary' | 'location' | 'status' | 'kyc_profile'>>,
): Promise<void> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  let idx = 1;

  if (fields.name !== undefined) { sets.push(`name = ?${idx}`); binds.push(fields.name); idx++; }
  if (fields.legal_name !== undefined) { sets.push(`legal_name = ?${idx}`); binds.push(fields.legal_name); idx++; }
  if (fields.is_primary !== undefined) { sets.push(`is_primary = ?${idx}`); binds.push(fields.is_primary ? 1 : 0); idx++; }
  if (fields.location !== undefined) { sets.push(`location = ?${idx}`); binds.push(JSON.stringify(fields.location)); idx++; }
  if (fields.status !== undefined) { sets.push(`status = ?${idx}`); binds.push(fields.status); idx++; }
  if (fields.kyc_profile !== undefined) { sets.push(`kyc_profile = ?${idx}`); binds.push(fields.kyc_profile); idx++; }

  if (sets.length === 0) return;
  sets.push(`updated_at = ?${idx}`);
  binds.push(new Date().toISOString());
  idx++;
  binds.push(storeId);

  await db
    .prepare(`UPDATE merchant_stores SET ${sets.join(', ')} WHERE id = ?${idx}`)
    .bind(...binds)
    .run();
}

// ---------------------------------------------------------------------------
// Store Payment Nodes
// ---------------------------------------------------------------------------

function parsePaymentNodeRow(row: Record<string, unknown>): StorePaymentNode {
  return {
    id: row.id as string,
    store_id: row.store_id as string,
    store_node_name: row.store_node_name as string,
    store_node_code: row.store_node_code as string,
    description: (row.description as string) || undefined,
    status: (row.status as StorePaymentNode['status']) || 'active',
    is_primary: row.is_primary === 1 || row.is_primary === true,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function insertStorePaymentNode(db: D1Database, node: StorePaymentNode): Promise<void> {
  await db
    .prepare(
      `INSERT INTO store_payment_nodes (id, store_id, store_node_name, store_node_code, description, status, is_primary, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    )
    .bind(
      node.id,
      node.store_id,
      node.store_node_name,
      node.store_node_code,
      node.description ?? null,
      node.status,
      node.is_primary ? 1 : 0,
      node.created_at,
      node.updated_at,
    )
    .run();
}

export async function getStorePaymentNodeById(db: D1Database, nodeId: string): Promise<StorePaymentNode | null> {
  const row = await db
    .prepare(`SELECT * FROM store_payment_nodes WHERE id = ?1`)
    .bind(nodeId)
    .first();
  return row ? parsePaymentNodeRow(row as Record<string, unknown>) : null;
}

export async function listStorePaymentNodes(
  db: D1Database,
  storeId: string,
  filters?: { status?: string },
): Promise<StorePaymentNode[]> {
  let query = `SELECT * FROM store_payment_nodes WHERE store_id = ?1`;
  const binds: unknown[] = [storeId];
  if (filters?.status) {
    query += ` AND status = ?2`;
    binds.push(filters.status);
  }
  query += ` ORDER BY is_primary DESC, created_at ASC`;
  const res = await db.prepare(query).bind(...binds).all();
  return ((res.results ?? []) as Record<string, unknown>[]).map(parsePaymentNodeRow);
}

export async function updateStorePaymentNode(
  db: D1Database,
  nodeId: string,
  fields: Partial<Pick<StorePaymentNode, 'store_node_name' | 'store_node_code' | 'description' | 'status' | 'is_primary'>>,
): Promise<void> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  let idx = 1;

  if (fields.store_node_name !== undefined) { sets.push(`store_node_name = ?${idx}`); binds.push(fields.store_node_name); idx++; }
  if (fields.store_node_code !== undefined) { sets.push(`store_node_code = ?${idx}`); binds.push(fields.store_node_code); idx++; }
  if (fields.description !== undefined) { sets.push(`description = ?${idx}`); binds.push(fields.description); idx++; }
  if (fields.status !== undefined) { sets.push(`status = ?${idx}`); binds.push(fields.status); idx++; }
  if (fields.is_primary !== undefined) { sets.push(`is_primary = ?${idx}`); binds.push(fields.is_primary ? 1 : 0); idx++; }

  if (sets.length === 0) return;
  sets.push(`updated_at = ?${idx}`);
  binds.push(new Date().toISOString());
  idx++;
  binds.push(nodeId);

  await db
    .prepare(`UPDATE store_payment_nodes SET ${sets.join(', ')} WHERE id = ?${idx}`)
    .bind(...binds)
    .run();
}

export async function deleteStorePaymentNode(db: D1Database, nodeId: string): Promise<void> {
  await db.prepare(`DELETE FROM store_payment_nodes WHERE id = ?1`).bind(nodeId).run();
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

// ===========================================================================
// Approval Policies
// ===========================================================================

export async function insertApprovalPolicy(db: D1Database, p: ApprovalPolicy): Promise<void> {
  await db.prepare(
    `INSERT INTO approval_policies
       (id, name, description, approval_type, priority, version, state, valid_from, valid_to, time_constraints_json, expiry_minutes, escalation_minutes, escalation_group_json, created_by, updated_by, created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)`,
  ).bind(
    p.id, p.name, p.description ?? null, p.approval_type ?? null, p.priority, p.version, p.state,
    p.valid_from ?? null, p.valid_to ?? null, p.time_constraints_json ?? null,
    p.expiry_minutes ?? null, p.escalation_minutes ?? null, p.escalation_group_json ?? null,
    p.created_by, p.updated_by ?? null, p.created_at, p.updated_at,
  ).run();
}

export async function getApprovalPolicy(db: D1Database, id: string): Promise<ApprovalPolicy | null> {
  return (await db.prepare('SELECT * FROM approval_policies WHERE id = ?1').bind(id).first()) as ApprovalPolicy | null;
}

export async function listApprovalPolicies(
  db: D1Database,
  filters?: { state?: string; approval_type?: string; limit?: number },
): Promise<ApprovalPolicy[]> {
  const where: string[] = [];
  const values: (string | number)[] = [];
  let idx = 1;
  if (filters?.state) { where.push(`state = ?${idx++}`); values.push(filters.state); }
  if (filters?.approval_type) { where.push(`approval_type = ?${idx++}`); values.push(filters.approval_type); }
  const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 200);
  values.push(limit);
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const res = await db.prepare(
    `SELECT * FROM approval_policies ${whereSql} ORDER BY priority ASC, created_at DESC LIMIT ?${idx}`,
  ).bind(...values).all();
  return (res.results ?? []) as ApprovalPolicy[];
}

export async function updateApprovalPolicy(
  db: D1Database,
  id: string,
  updates: Partial<Pick<ApprovalPolicy, 'name' | 'description' | 'approval_type' | 'priority' | 'state' | 'valid_from' | 'valid_to' | 'time_constraints_json' | 'expiry_minutes' | 'escalation_minutes' | 'escalation_group_json' | 'updated_by' | 'updated_at'>>,
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  for (const [key, value] of Object.entries(updates)) {
    sets.push(`${key} = ?${idx++}`);
    values.push(value ?? null);
  }
  if (sets.length === 0) return;
  values.push(id);
  await db.prepare(`UPDATE approval_policies SET ${sets.join(', ')} WHERE id = ?${idx}`).bind(...values).run();
}

export async function deleteApprovalPolicy(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM approval_policies WHERE id = ?1').bind(id).run();
}

/** Get a full policy with conditions, stages, and bindings */
export async function getApprovalPolicyFull(db: D1Database, id: string): Promise<ApprovalPolicyFull | null> {
  const policy = await getApprovalPolicy(db, id);
  if (!policy) return null;
  const [conditions, stages, bindings] = await Promise.all([
    listPolicyConditions(db, id),
    listPolicyStages(db, id),
    listPolicyBindings(db, id),
  ]);
  return { ...policy, conditions, stages, bindings };
}

/** List all ACTIVE policies ordered by priority for evaluation */
export async function listActivePolicies(db: D1Database, approvalType?: string): Promise<ApprovalPolicy[]> {
  if (approvalType) {
    const res = await db.prepare(
      `SELECT * FROM approval_policies WHERE state = 'ACTIVE' AND (approval_type = ?1 OR approval_type IS NULL) ORDER BY priority ASC`,
    ).bind(approvalType).all();
    return (res.results ?? []) as ApprovalPolicy[];
  }
  const res = await db.prepare(
    `SELECT * FROM approval_policies WHERE state = 'ACTIVE' ORDER BY priority ASC`,
  ).all();
  return (res.results ?? []) as ApprovalPolicy[];
}

// ===========================================================================
// Policy Conditions
// ===========================================================================

export async function insertPolicyCondition(db: D1Database, c: ApprovalPolicyCondition): Promise<void> {
  await db.prepare(
    `INSERT INTO approval_policy_conditions (id, policy_id, field, operator, value_json, created_at)
     VALUES (?1,?2,?3,?4,?5,?6)`,
  ).bind(c.id, c.policy_id, c.field, c.operator, c.value_json, c.created_at).run();
}

export async function listPolicyConditions(db: D1Database, policyId: string): Promise<ApprovalPolicyCondition[]> {
  const res = await db.prepare('SELECT * FROM approval_policy_conditions WHERE policy_id = ?1').bind(policyId).all();
  return (res.results ?? []) as ApprovalPolicyCondition[];
}

export async function deletePolicyConditions(db: D1Database, policyId: string): Promise<void> {
  await db.prepare('DELETE FROM approval_policy_conditions WHERE policy_id = ?1').bind(policyId).run();
}

// ===========================================================================
// Policy Stages
// ===========================================================================

export async function insertPolicyStage(db: D1Database, s: ApprovalPolicyStage): Promise<void> {
  await db.prepare(
    `INSERT INTO approval_policy_stages
       (id, policy_id, stage_no, min_approvals, roles_json, actor_ids_json, exclude_maker, exclude_previous_approvers, timeout_minutes, escalation_roles_json, escalation_actor_ids_json, created_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`,
  ).bind(
    s.id, s.policy_id, s.stage_no, s.min_approvals,
    s.roles_json ?? null, s.actor_ids_json ?? null,
    s.exclude_maker, s.exclude_previous_approvers,
    s.timeout_minutes ?? null, s.escalation_roles_json ?? null, s.escalation_actor_ids_json ?? null,
    s.created_at,
  ).run();
}

export async function listPolicyStages(db: D1Database, policyId: string): Promise<ApprovalPolicyStage[]> {
  const res = await db.prepare('SELECT * FROM approval_policy_stages WHERE policy_id = ?1 ORDER BY stage_no ASC').bind(policyId).all();
  return (res.results ?? []) as ApprovalPolicyStage[];
}

export async function deletePolicyStages(db: D1Database, policyId: string): Promise<void> {
  await db.prepare('DELETE FROM approval_policy_stages WHERE policy_id = ?1').bind(policyId).run();
}

// ===========================================================================
// Policy Bindings
// ===========================================================================

export async function insertPolicyBinding(db: D1Database, b: ApprovalPolicyBinding): Promise<void> {
  await db.prepare(
    `INSERT INTO approval_policy_bindings (id, policy_id, binding_type, binding_value_json, created_at)
     VALUES (?1,?2,?3,?4,?5)`,
  ).bind(b.id, b.policy_id, b.binding_type, b.binding_value_json, b.created_at).run();
}

export async function listPolicyBindings(db: D1Database, policyId: string): Promise<ApprovalPolicyBinding[]> {
  const res = await db.prepare('SELECT * FROM approval_policy_bindings WHERE policy_id = ?1').bind(policyId).all();
  return (res.results ?? []) as ApprovalPolicyBinding[];
}

export async function deletePolicyBindings(db: D1Database, policyId: string): Promise<void> {
  await db.prepare('DELETE FROM approval_policy_bindings WHERE policy_id = ?1').bind(policyId).run();
}

// ===========================================================================
// Stage Decisions
// ===========================================================================

export async function insertStageDecision(db: D1Database, d: ApprovalStageDecision): Promise<void> {
  await db.prepare(
    `INSERT INTO approval_stage_decisions (id, request_id, policy_id, stage_no, decision, decider_id, decider_role, reason, decided_at, created_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
  ).bind(
    d.id, d.request_id, d.policy_id, d.stage_no, d.decision,
    d.decider_id, d.decider_role ?? null, d.reason ?? null,
    d.decided_at, d.created_at,
  ).run();
}

export async function listStageDecisions(db: D1Database, requestId: string): Promise<ApprovalStageDecision[]> {
  const res = await db.prepare(
    'SELECT * FROM approval_stage_decisions WHERE request_id = ?1 ORDER BY stage_no ASC, decided_at ASC',
  ).bind(requestId).all();
  return (res.results ?? []) as ApprovalStageDecision[];
}

export async function countStageDecisions(db: D1Database, requestId: string, stageNo: number, decision?: string): Promise<number> {
  const sql = decision
    ? 'SELECT COUNT(*) as cnt FROM approval_stage_decisions WHERE request_id = ?1 AND stage_no = ?2 AND decision = ?3'
    : 'SELECT COUNT(*) as cnt FROM approval_stage_decisions WHERE request_id = ?1 AND stage_no = ?2';
  const stmt = decision
    ? db.prepare(sql).bind(requestId, stageNo, decision)
    : db.prepare(sql).bind(requestId, stageNo);
  const row = await stmt.first() as { cnt: number } | null;
  return row?.cnt ?? 0;
}

export async function hasDeciderDecidedStage(db: D1Database, requestId: string, stageNo: number, deciderId: string): Promise<boolean> {
  const row = await db.prepare(
    'SELECT 1 FROM approval_stage_decisions WHERE request_id = ?1 AND stage_no = ?2 AND decider_id = ?3 LIMIT 1',
  ).bind(requestId, stageNo, deciderId).first();
  return !!row;
}

// ===========================================================================
// Delegations
// ===========================================================================

export async function insertDelegation(db: D1Database, d: ApprovalDelegation): Promise<void> {
  await db.prepare(
    `INSERT INTO approval_delegations (id, delegator_id, delegate_id, approval_type, valid_from, valid_to, reason, state, created_by, created_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
  ).bind(
    d.id, d.delegator_id, d.delegate_id, d.approval_type ?? null,
    d.valid_from, d.valid_to, d.reason ?? null, d.state, d.created_by, d.created_at,
  ).run();
}

export async function getDelegation(db: D1Database, id: string): Promise<ApprovalDelegation | null> {
  return (await db.prepare('SELECT * FROM approval_delegations WHERE id = ?1').bind(id).first()) as ApprovalDelegation | null;
}

export async function listActiveDelegationsForDelegate(
  db: D1Database,
  delegateId: string,
  approvalType?: string,
  now?: string,
): Promise<ApprovalDelegation[]> {
  const ts = now ?? new Date().toISOString();
  if (approvalType) {
    const res = await db.prepare(
      `SELECT * FROM approval_delegations
       WHERE delegate_id = ?1 AND state = 'ACTIVE'
         AND valid_from <= ?2 AND valid_to >= ?2
         AND (approval_type = ?3 OR approval_type IS NULL)
       ORDER BY created_at DESC`,
    ).bind(delegateId, ts, approvalType).all();
    return (res.results ?? []) as ApprovalDelegation[];
  }
  const res = await db.prepare(
    `SELECT * FROM approval_delegations
     WHERE delegate_id = ?1 AND state = 'ACTIVE'
       AND valid_from <= ?2 AND valid_to >= ?2
     ORDER BY created_at DESC`,
  ).bind(delegateId, ts).all();
  return (res.results ?? []) as ApprovalDelegation[];
}

export async function listDelegations(
  db: D1Database,
  filters?: { delegator_id?: string; delegate_id?: string; state?: string; limit?: number },
): Promise<ApprovalDelegation[]> {
  const where: string[] = [];
  const values: (string | number)[] = [];
  let idx = 1;
  if (filters?.delegator_id) { where.push(`delegator_id = ?${idx++}`); values.push(filters.delegator_id); }
  if (filters?.delegate_id) { where.push(`delegate_id = ?${idx++}`); values.push(filters.delegate_id); }
  if (filters?.state) { where.push(`state = ?${idx++}`); values.push(filters.state); }
  const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 200);
  values.push(limit);
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const res = await db.prepare(
    `SELECT * FROM approval_delegations ${whereSql} ORDER BY created_at DESC LIMIT ?${idx}`,
  ).bind(...values).all();
  return (res.results ?? []) as ApprovalDelegation[];
}

export async function revokeDelegation(db: D1Database, id: string, revokedBy: string, revokedAt: string): Promise<void> {
  await db.prepare(
    `UPDATE approval_delegations SET state = 'REVOKED', revoked_by = ?1, revoked_at = ?2 WHERE id = ?3`,
  ).bind(revokedBy, revokedAt, id).run();
}

// ===========================================================================
// Policy Decisions (audit trail)
// ===========================================================================

export async function insertPolicyDecision(db: D1Database, d: ApprovalPolicyDecision): Promise<void> {
  await db.prepare(
    `INSERT INTO approval_policy_decisions (id, request_id, evaluation_json, matched_policy_id, total_stages, created_at)
     VALUES (?1,?2,?3,?4,?5,?6)`,
  ).bind(d.id, d.request_id, d.evaluation_json, d.matched_policy_id ?? null, d.total_stages, d.created_at).run();
}

export async function getPolicyDecision(db: D1Database, requestId: string): Promise<ApprovalPolicyDecision | null> {
  return (await db.prepare(
    'SELECT * FROM approval_policy_decisions WHERE request_id = ?1 ORDER BY created_at DESC LIMIT 1',
  ).bind(requestId).first()) as ApprovalPolicyDecision | null;
}

// ===========================================================================
// Approval request workflow extensions
// ===========================================================================

export async function updateApprovalRequestWorkflow(
  db: D1Database,
  requestId: string,
  updates: { policy_id?: string; current_stage?: number; total_stages?: number; workflow_state?: string },
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  for (const [key, value] of Object.entries(updates)) {
    sets.push(`${key} = ?${idx++}`);
    values.push(value ?? null);
  }
  if (sets.length === 0) return;
  values.push(requestId);
  await db.prepare(`UPDATE approval_requests SET ${sets.join(', ')} WHERE id = ?${idx}`).bind(...values).run();
}

// ===========================================================================
// Approval Type Configs
// ===========================================================================

export async function insertApprovalTypeConfig(db: D1Database, config: ApprovalTypeConfig): Promise<void> {
  await db.prepare(
    `INSERT INTO approval_type_configs
       (type_key, label, description, default_checker_roles_json, require_reason, has_code_handler, auto_policy_id, enabled, created_by, created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`,
  ).bind(
    config.type_key, config.label, config.description ?? null,
    config.default_checker_roles_json ?? null, config.require_reason,
    config.has_code_handler, config.auto_policy_id ?? null,
    config.enabled, config.created_by ?? null,
    config.created_at, config.updated_at,
  ).run();
}

export async function getApprovalTypeConfig(db: D1Database, typeKey: string): Promise<ApprovalTypeConfig | null> {
  return (await db.prepare(
    'SELECT * FROM approval_type_configs WHERE type_key = ?1',
  ).bind(typeKey).first()) as ApprovalTypeConfig | null;
}

export async function listApprovalTypeConfigs(
  db: D1Database,
  opts?: { enabled_only?: boolean },
): Promise<ApprovalTypeConfig[]> {
  const where = opts?.enabled_only ? ' WHERE enabled = 1' : '';
  const { results } = await db.prepare(
    `SELECT * FROM approval_type_configs${where} ORDER BY type_key`,
  ).all();
  return (results ?? []) as ApprovalTypeConfig[];
}

export async function updateApprovalTypeConfig(
  db: D1Database,
  typeKey: string,
  updates: Partial<Pick<ApprovalTypeConfig, 'label' | 'description' | 'default_checker_roles_json' | 'require_reason' | 'has_code_handler' | 'auto_policy_id' | 'enabled'>>,
  updatedAt: string,
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  for (const [key, value] of Object.entries(updates)) {
    sets.push(`${key} = ?${idx++}`);
    values.push(value ?? null);
  }
  if (sets.length === 0) return;
  sets.push(`updated_at = ?${idx++}`);
  values.push(updatedAt);
  values.push(typeKey);
  await db.prepare(
    `UPDATE approval_type_configs SET ${sets.join(', ')} WHERE type_key = ?${idx}`,
  ).bind(...values).run();
}

export async function deleteApprovalTypeConfig(db: D1Database, typeKey: string): Promise<void> {
  await db.prepare('DELETE FROM approval_type_configs WHERE type_key = ?1').bind(typeKey).run();
}

// ===========================================================================
// Approval Endpoint Bindings
// ===========================================================================

export async function insertEndpointBinding(db: D1Database, binding: ApprovalEndpointBinding): Promise<void> {
  await db.prepare(
    `INSERT INTO approval_endpoint_bindings
       (id, route_pattern, http_method, approval_type, description, extract_payload_json, enabled, created_by, created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
  ).bind(
    binding.id, binding.route_pattern, binding.http_method.toUpperCase(),
    binding.approval_type, binding.description ?? null,
    binding.extract_payload_json ?? null, binding.enabled,
    binding.created_by ?? null, binding.created_at, binding.updated_at,
  ).run();
}

export async function getEndpointBinding(db: D1Database, id: string): Promise<ApprovalEndpointBinding | null> {
  return (await db.prepare(
    'SELECT * FROM approval_endpoint_bindings WHERE id = ?1',
  ).bind(id).first()) as ApprovalEndpointBinding | null;
}

export async function findEndpointBinding(
  db: D1Database,
  routePattern: string,
  httpMethod: string,
): Promise<ApprovalEndpointBinding | null> {
  return (await db.prepare(
    'SELECT * FROM approval_endpoint_bindings WHERE route_pattern = ?1 AND http_method = ?2 AND enabled = 1',
  ).bind(routePattern, httpMethod.toUpperCase()).first()) as ApprovalEndpointBinding | null;
}

export async function listEndpointBindings(
  db: D1Database,
  opts?: { approval_type?: string; enabled_only?: boolean },
): Promise<ApprovalEndpointBinding[]> {
  const clauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (opts?.approval_type) {
    clauses.push(`approval_type = ?${idx++}`);
    values.push(opts.approval_type);
  }
  if (opts?.enabled_only) {
    clauses.push('enabled = 1');
  }
  const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
  const { results } = await db.prepare(
    `SELECT * FROM approval_endpoint_bindings${where} ORDER BY route_pattern, http_method`,
  ).bind(...values).all();
  return (results ?? []) as ApprovalEndpointBinding[];
}

export async function updateEndpointBinding(
  db: D1Database,
  id: string,
  updates: Partial<Pick<ApprovalEndpointBinding, 'route_pattern' | 'http_method' | 'approval_type' | 'description' | 'extract_payload_json' | 'enabled'>>,
  updatedAt: string,
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  for (const [key, value] of Object.entries(updates)) {
    const v = key === 'http_method' && typeof value === 'string' ? value.toUpperCase() : value;
    sets.push(`${key} = ?${idx++}`);
    values.push(v ?? null);
  }
  if (sets.length === 0) return;
  sets.push(`updated_at = ?${idx++}`);
  values.push(updatedAt);
  values.push(id);
  await db.prepare(
    `UPDATE approval_endpoint_bindings SET ${sets.join(', ')} WHERE id = ?${idx}`,
  ).bind(...values).run();
}

export async function deleteEndpointBinding(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM approval_endpoint_bindings WHERE id = ?1').bind(id).run();
}

