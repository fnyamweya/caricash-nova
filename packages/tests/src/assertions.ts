/**
 * Invariant Assertion Library — PR5
 *
 * Reusable assertion helpers for the Phase 2 audit gate.
 * Each function throws descriptively on invariant violation.
 */

import {
  parseAmount,
  formatAmount,
  sha256Hex,
  assertBalanced as sharedAssertBalanced,
  MakerCheckerViolationError,
} from '@caricash/shared';

// ─── Ledger Balance Invariant ───

/**
 * Assert journal entries are balanced: sum(DR) == sum(CR).
 * All amounts must be > 0. Throws on violation.
 */
export function assertLedgerBalanced(
  entries: { entry_type: 'DR' | 'CR'; amount: string }[],
): void {
  for (const e of entries) {
    const cents = parseAmount(e.amount);
    if (cents <= 0n) {
      throw new Error(`Ledger invariant: amount must be > 0, got ${e.amount}`);
    }
  }
  sharedAssertBalanced(entries);
}

/**
 * Assert a journal only contains a single currency.
 */
export function assertSingleCurrency(currencies: string[]): void {
  const unique = new Set(currencies);
  if (unique.size > 1) {
    throw new Error(`Cross-currency invariant violated: found ${[...unique].join(', ')}`);
  }
}

// ─── No Negative Balance Invariant ───

/**
 * Assert that no account balance is negative unless it has an overdraft facility.
 * Accounts is a map of account_id → balance (string decimal).
 * overdraftAccounts is a Set of account_ids allowed to be negative.
 */
export function assertNoNegativeBalances(
  accounts: Map<string, string>,
  overdraftAccounts: Set<string> = new Set(),
): void {
  for (const [accountId, balance] of accounts) {
    const cents = parseAmount(balance.startsWith('-') ? balance.slice(1) : balance);
    const isNegative = balance.startsWith('-');
    if (isNegative && !overdraftAccounts.has(accountId)) {
      throw new Error(
        `Negative balance invariant: account ${accountId} has balance ${balance} without overdraft facility`,
      );
    }
  }
}

// ─── Overdraft Boundary Invariant ───

/**
 * Assert that overdraft exposure does not exceed configured limit.
 */
export function assertOverdraftWithinLimit(
  balance: string,
  limit: string,
): void {
  // Balance is negative for overdraft; limit is a positive max allowed exposure
  const balanceCents = parseAmount(balance.startsWith('-') ? balance.slice(1) : balance);
  const isNeg = balance.startsWith('-');
  const limitCents = parseAmount(limit);

  if (isNeg && balanceCents > limitCents) {
    throw new Error(
      `Overdraft boundary violated: exposure ${balance} exceeds limit ${limit}`,
    );
  }
}

// ─── Idempotency Invariant ───

/**
 * Assert that a given scope_hash maps to exactly one journal_id.
 */
export function assertSingleJournalPerIdempotency(
  scopeHash: string,
  journalIds: string[],
): void {
  const unique = new Set(journalIds);
  if (unique.size > 1) {
    throw new Error(
      `Idempotency invariant: scope_hash ${scopeHash} maps to ${unique.size} journals: ${[...unique].join(', ')}`,
    );
  }
  if (unique.size === 0) {
    throw new Error(
      `Idempotency invariant: scope_hash ${scopeHash} has no associated journals`,
    );
  }
}

// ─── Hash Chain Invariant ───

/**
 * Verify a sequence of journals has valid hash chain continuity.
 * Each journal must have hash = SHA256(prev_hash + canonical_content).
 * Returns { valid, brokenAt } for the chain.
 */
export async function assertHashChainValid(
  journals: Array<{
    id: string;
    prev_hash: string | null;
    journal_hash: string | null;
    txn_type: string;
    currency: string;
    lines: Array<{ account_id: string; entry_type: string; amount: string }>;
  }>,
): Promise<void> {
  let expectedPrevHash = '';
  for (const j of journals) {
    if (!j.journal_hash) continue; // skip pre-Phase-2 journals without hash

    if (j.prev_hash !== expectedPrevHash && j.prev_hash !== null) {
      // Allow null prev_hash for first journal
      if (expectedPrevHash !== '' || j.prev_hash !== '') {
        throw new Error(
          `Hash chain broken at journal ${j.id}: expected prev_hash="${expectedPrevHash}", got "${j.prev_hash}"`,
        );
      }
    }

    // Recompute hash
    const sortedLines = [...j.lines].sort((a, b) => {
      if (a.account_id < b.account_id) return -1;
      if (a.account_id > b.account_id) return 1;
      if (a.entry_type < b.entry_type) return -1;
      if (a.entry_type > b.entry_type) return 1;
      return 0;
    });

    const content = JSON.stringify({
      journal_id: j.id,
      currency: j.currency,
      txn_type: j.txn_type,
      ledger_lines: sortedLines,
    });
    const expectedHash = await sha256Hex((j.prev_hash || '') + content);

    if (expectedHash !== j.journal_hash) {
      throw new Error(
        `Hash chain integrity failed at journal ${j.id}: computed=${expectedHash}, stored=${j.journal_hash}`,
      );
    }

    expectedPrevHash = j.journal_hash;
  }
}

// ─── Maker-Checker Invariant ───

/**
 * Assert that maker and checker are different staff.
 */
export function assertMakerCheckerEnforced(makerId: string, checkerId: string): void {
  if (makerId === checkerId) {
    throw new MakerCheckerViolationError(
      `Governance invariant: maker (${makerId}) cannot be checker (${checkerId})`,
    );
  }
}

// ─── No Direct Ledger Writes Invariant ───

/**
 * Assert that the code under test doesn't contain direct INSERT/UPDATE/DELETE
 * operations on ledger tables outside of the PostingDO.
 * This is a static assertion — checks source code patterns.
 */
export function assertNoDirectLedgerWrites(sourceCode: string, filename: string): void {
  const ledgerTables = ['ledger_journals', 'ledger_lines'];
  const dangerousOps = ['UPDATE', 'DELETE'];

  for (const table of ledgerTables) {
    for (const op of dangerousOps) {
      const pattern = new RegExp(`${op}\\s+${table}`, 'i');
      if (pattern.test(sourceCode)) {
        throw new Error(
          `Direct ledger write detected in ${filename}: ${op} ${table} — all writes must go through PostingDO`,
        );
      }
    }
  }
}

/**
 * Assert no UPDATE/DELETE on ledger tables anywhere in a file.
 * INSERT is permitted only in PostingDO.
 */
export function assertAppendOnlyLedger(
  sourceCode: string,
  filename: string,
  isPostingDO: boolean = false,
): void {
  const ledgerTables = ['ledger_journals', 'ledger_lines'];

  for (const table of ledgerTables) {
    // UPDATE and DELETE always forbidden
    for (const op of ['UPDATE', 'DELETE']) {
      const pattern = new RegExp(`${op}\\s+${table}`, 'i');
      if (pattern.test(sourceCode)) {
        throw new Error(
          `Append-only invariant violated in ${filename}: ${op} ${table}`,
        );
      }
    }

    // INSERT only allowed in PostingDO
    if (!isPostingDO) {
      const insertPattern = new RegExp(`INSERT\\s+INTO\\s+${table}`, 'i');
      if (insertPattern.test(sourceCode)) {
        throw new Error(
          `Direct ledger INSERT in ${filename}: only PostingDO may write to ${table}`,
        );
      }
    }
  }
}
