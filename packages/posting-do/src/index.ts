/**
 * PostingDO — Durable Object for serialized posting.
 *
 * Each instance handles a single posting domain: {owner_type, owner_id, currency}.
 * `blockConcurrencyWhile` serializes access to prevent race conditions on balance checks.
 */

import {
  generateId,
  assertBalanced,
  assertSameCurrency,
  parseAmount,
  formatAmount,
  nowISO,
  TxnState,
  EventName,
  InsufficientFundsError,
  UnbalancedJournalError,
} from '@caricash/shared';
import type { PostTransactionCommand, PostTransactionResult, LedgerJournal, LedgerLine, Event } from '@caricash/shared';
import { getJournalByIdempotencyKey, getBalance, insertLedgerJournal, insertLedgerLine, insertEvent } from '@caricash/db';

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
  name: string;
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
      return Response.json({ error: 'Not Found' }, { status: 404 });
    } catch (error) {
      return PostingDO.errorResponse(error);
    }
  }

  // -------------------------------------------------------------------------
  // POST /post — atomic double-entry posting
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

    // 1. Idempotency — if this key already posted a journal, return cached result
    const existing = await getJournalByIdempotencyKey(db, command.idempotency_key);
    if (existing) {
      return PostingDO.journalToResult(existing, command.entries);
    }

    // 2. Cross-currency guard
    assertSameCurrency([command.currency]);

    // 3. Double-entry balance check
    assertBalanced(command.entries);

    // 4. Sufficient-funds check for every DR entry
    await this.assertSufficientFunds(db, command.entries);

    // 5. Build journal + lines + event
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

    // 6. Atomic write — D1 batch guarantees all-or-nothing
    const stmts: D1PreparedStatement[] = [];

    stmts.push(
      db
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

    await db.batch(stmts);

    return {
      journal_id: journalId,
      state: TxnState.POSTED,
      entries: command.entries,
      created_at: now,
    };
  }

  // -------------------------------------------------------------------------
  // GET /balance?account_id=...
  // -------------------------------------------------------------------------

  private async handleGetBalance(url: URL): Promise<Response> {
    const accountId = url.searchParams.get('account_id');
    if (!accountId) {
      return Response.json({ error: 'account_id query parameter is required' }, { status: 400 });
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

      if (effectiveBalance < requiredCents) {
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
    if (error instanceof InsufficientFundsError) {
      return Response.json({ error: error.message, name: error.name } satisfies ErrorBody, { status: 409 });
    }
    if (error instanceof UnbalancedJournalError) {
      return Response.json({ error: error.message, name: error.name } satisfies ErrorBody, { status: 422 });
    }
    if (error instanceof Error) {
      return Response.json({ error: error.message, name: error.name } satisfies ErrorBody, { status: 500 });
    }
    return Response.json({ error: 'Internal Server Error', name: 'Error' } satisfies ErrorBody, { status: 500 });
  }
}

export default {
  async fetch() {
    return new Response('PostingDO worker — requests should be routed to the Durable Object', { status: 200 });
  },
};
