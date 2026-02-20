/**
 * PostingDO — Durable Object for serialized posting.
 *
 * Each instance handles a single posting domain: {owner_type, owner_id, currency}.
 * `blockConcurrencyWhile` serializes access to prevent race conditions on balance checks.
 *
 * Phase 2 enhancements:
 * - Strict idempotency with scope_hash + payload_hash conflict detection
 * - Enhanced receipt format with fees/commissions
 * - Initiator tracking on journals
 * - Overdraft facility support
 */

import {
  generateId,
  assertBalanced,
  assertSameCurrency,
  parseAmount,
  formatAmount,
  nowISO,
  computeScopeHash,
  computePayloadHash,
  TxnState,
  EventName,
  ErrorCode,
  InsufficientFundsError,
  UnbalancedJournalError,
  IdempotencyConflictError,
} from '@caricash/shared';
import type { PostTransactionCommand, PostTransactionResult, PostingReceipt, LedgerJournal, LedgerLine, Event, IdempotencyRecord } from '@caricash/shared';
import {
  getJournalByIdempotencyKey,
  getBalance,
  getIdempotencyRecordByScopeHash,
  insertIdempotencyRecord,
  getActiveOverdraftForAccount,
} from '@caricash/db';

// Re-export journal templates and calculators for consumers
export { buildDepositEntries, buildWithdrawalEntries, buildP2PEntries, buildPaymentEntries, buildB2BEntries, buildReversalEntries } from './journal-templates.js';
export type { Entry, CommissionEntry } from './journal-templates.js';
export { calculateFee } from './fee-calculator.js';
export type { FeeResult } from './fee-calculator.js';
export { calculateCommission } from './commission-calculator.js';
export type { CommissionResult } from './commission-calculator.js';

interface Env {
  DB: D1Database;
  POSTING_DO: DurableObjectNamespace;
}

interface ErrorBody {
  error: string;
  code: string;
  name: string;
  correlation_id?: string;
}

export class PostingDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === '/post' && request.method === 'POST') {
        return await this.handlePost(request);
      }
      if (url.pathname === '/balance' && request.method === 'GET') {
        return await this.handleGetBalance(url);
      }
      return Response.json({ error: 'Not Found', code: ErrorCode.NOT_FOUND, name: 'NotFoundError' }, { status: 404 });
    } catch (error) {
      return PostingDO.errorResponse(error);
    }
  }

  // -------------------------------------------------------------------------
  // POST /post — atomic double-entry posting with strict idempotency
  // -------------------------------------------------------------------------

  private async handlePost(request: Request): Promise<Response> {
    const command: PostTransactionCommand = await request.json();

    let result!: PostTransactionResult;
    await this.state.blockConcurrencyWhile(async () => {
      result = await this.postTransaction(command);
    });

    return Response.json(result, { status: 201 });
  }

  private async postTransaction(command: PostTransactionCommand): Promise<PostTransactionResult> {
    const db = this.env.DB;

    // 1. Compute scope_hash and payload_hash for strict idempotency
    const scopeHash = await computeScopeHash(
      command.actor_id,
      command.txn_type,
      command.idempotency_key,
    );
    const payloadHash = await computePayloadHash({
      entries: command.entries,
      currency: command.currency,
      description: command.description,
    });

    // 2. Check idempotency record by scope_hash
    const existingIdem = await getIdempotencyRecordByScopeHash(db, scopeHash);
    if (existingIdem) {
      // Conflict detection: same scope_hash but different payload
      if (existingIdem.payload_hash && existingIdem.payload_hash !== payloadHash) {
        throw new IdempotencyConflictError(
          `Idempotency key "${command.idempotency_key}" already used with different payload`,
        );
      }
      // Same payload → return stored result
      const storedResult = JSON.parse(existingIdem.result_json) as PostTransactionResult;
      return storedResult;
    }

    // 3. Also check by journal idempotency_key (backward compat)
    const existingJournal = await getJournalByIdempotencyKey(db, command.idempotency_key);
    if (existingJournal) {
      return PostingDO.journalToResult(existingJournal, command.entries);
    }

    // 4. Cross-currency guard
    assertSameCurrency([command.currency]);

    // 5. Double-entry balance check
    assertBalanced(command.entries);

    // 6. Sufficient-funds check for every DR entry (with overdraft facility support)
    await this.assertSufficientFunds(db, command.entries);

    // 7. Build journal + lines + event
    const now = nowISO();
    const journalId = generateId();

    const journal: LedgerJournal = {
      id: journalId,
      txn_type: command.txn_type,
      currency: command.currency,
      correlation_id: command.correlation_id,
      idempotency_key: command.idempotency_key,
      state: TxnState.POSTED,
      fee_version_id: command.fee_version_id,
      commission_version_id: command.commission_version_id,
      description: command.description,
      created_at: now,
      initiator_actor_id: command.actor_id,
    };

    const lines: LedgerLine[] = command.entries.map((e) => ({
      id: generateId(),
      journal_id: journalId,
      account_id: e.account_id,
      entry_type: e.entry_type,
      amount: e.amount,
      description: e.description,
      created_at: now,
    }));

    const event: Event = {
      id: generateId(),
      name: EventName.TXN_POSTED,
      entity_type: 'journal',
      entity_id: journalId,
      correlation_id: command.correlation_id,
      causation_id: journalId,
      actor_type: command.actor_type,
      actor_id: command.actor_id,
      schema_version: 1,
      payload_json: JSON.stringify({ journal_id: journalId, txn_type: command.txn_type }),
      created_at: now,
    };

    // Build the result
    const result: PostTransactionResult = {
      journal_id: journalId,
      state: TxnState.POSTED,
      entries: command.entries,
      created_at: now,
    };

    // Build idempotency record
    const idemRecord: IdempotencyRecord = {
      id: generateId(),
      scope: `${command.actor_id}:${command.txn_type}`,
      idempotency_key: command.idempotency_key,
      result_json: JSON.stringify(result),
      created_at: now,
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
      payload_hash: payloadHash,
      scope_hash: scopeHash,
    };

    // 8. Atomic write — D1 batch guarantees all-or-nothing
    const stmts: D1PreparedStatement[] = [];

    stmts.push(
      db
        .prepare(
          `INSERT INTO ledger_journals (id, txn_type, currency, correlation_id, idempotency_key, state, fee_version_id, commission_version_id, description, created_at, initiator_actor_id)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
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
          journal.initiator_actor_id ?? null,
        ),
    );

    for (const line of lines) {
      stmts.push(
        db
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
          ),
      );
    }

    stmts.push(
      db
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
        ),
    );

    // Insert idempotency record in same batch
    stmts.push(
      db
        .prepare(
          `INSERT INTO idempotency_records (id, scope, idempotency_key, result_json, created_at, expires_at, payload_hash, scope_hash)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
        )
        .bind(
          idemRecord.id,
          idemRecord.scope,
          idemRecord.idempotency_key,
          idemRecord.result_json,
          idemRecord.created_at,
          idemRecord.expires_at,
          idemRecord.payload_hash ?? null,
          idemRecord.scope_hash ?? null,
        ),
    );

    await db.batch(stmts);

    return result;
  }

  // -------------------------------------------------------------------------
  // GET /balance?account_id=...
  // -------------------------------------------------------------------------

  private async handleGetBalance(url: URL): Promise<Response> {
    const accountId = url.searchParams.get('account_id');
    if (!accountId) {
      return Response.json({ error: 'account_id query parameter is required', code: ErrorCode.MISSING_REQUIRED_FIELD, name: 'ValidationError' }, { status: 400 });
    }

    const balance = await getBalance(this.env.DB, accountId);
    return Response.json({ account_id: accountId, balance });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * For each DR entry, verify the account has sufficient balance.
   * Balance = sum(CR) - sum(DR) from existing ledger_lines.
   * Supports overdraft facilities: if an active overdraft exists, the effective limit is extended.
   */
  private async assertSufficientFunds(
    db: D1Database,
    entries: PostTransactionCommand['entries'],
  ): Promise<void> {
    const drEntries = entries.filter((e) => e.entry_type === 'DR');
    // Aggregate DR amounts per account in case the same account appears multiple times
    const drByAccount = new Map<string, bigint>();
    for (const e of drEntries) {
      const current = drByAccount.get(e.account_id) ?? 0n;
      drByAccount.set(e.account_id, current + parseAmount(e.amount));
    }

    for (const [accountId, requiredCents] of drByAccount) {
      const balanceStr = await getBalance(db, accountId);
      const balanceCents = parseAmount(balanceStr.replace('-', ''));
      const isNegative = balanceStr.startsWith('-');
      const effectiveBalance = isNegative ? -balanceCents : balanceCents;

      // Check for overdraft facility
      let overdraftLimit = 0n;
      try {
        const facility = await getActiveOverdraftForAccount(db, accountId);
        if (facility) {
          overdraftLimit = parseAmount(facility.limit_amount);
        }
      } catch (err) {
        // Only suppress "no such table" errors (pre-migration); re-throw others
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('no such table')) {
          throw err;
        }
      }

      if (effectiveBalance + overdraftLimit < requiredCents) {
        throw new InsufficientFundsError(
          `Account ${accountId} has balance ${balanceStr} but needs ${formatAmount(requiredCents)}`,
        );
      }
    }
  }

  private static journalToResult(
    journal: LedgerJournal,
    entries: PostTransactionCommand['entries'],
  ): PostTransactionResult {
    return {
      journal_id: journal.id,
      state: journal.state,
      entries,
      created_at: journal.created_at,
    };
  }

  private static errorResponse(error: unknown): Response {
    if (error instanceof IdempotencyConflictError) {
      return Response.json(
        { error: error.message, code: ErrorCode.DUPLICATE_IDEMPOTENCY_CONFLICT, name: error.name } satisfies ErrorBody,
        { status: 409 },
      );
    }
    if (error instanceof InsufficientFundsError) {
      return Response.json(
        { error: error.message, code: ErrorCode.INSUFFICIENT_FUNDS, name: error.name } satisfies ErrorBody,
        { status: 409 },
      );
    }
    if (error instanceof UnbalancedJournalError) {
      return Response.json(
        { error: error.message, code: ErrorCode.UNBALANCED_JOURNAL, name: error.name } satisfies ErrorBody,
        { status: 422 },
      );
    }
    if (error instanceof Error && error.message.includes('Cross-currency')) {
      return Response.json(
        { error: error.message, code: ErrorCode.CROSS_CURRENCY_NOT_ALLOWED, name: 'CrossCurrencyError' } satisfies ErrorBody,
        { status: 422 },
      );
    }
    if (error instanceof Error) {
      return Response.json(
        { error: error.message, code: ErrorCode.INTERNAL_ERROR, name: error.name } satisfies ErrorBody,
        { status: 500 },
      );
    }
    return Response.json(
      { error: 'Internal Server Error', code: ErrorCode.INTERNAL_ERROR, name: 'Error' } satisfies ErrorBody,
      { status: 500 },
    );
  }
}

export default {
  async fetch() {
    return new Response('PostingDO worker — requests should be routed to the Durable Object', { status: 200 });
  },
};
