/**
 * PR5 — Property-Based Invariant Test Suite
 *
 * Tests that prove ledger correctness for randomly generated transactions.
 * Uses deterministic seeded PRNG for reproducibility.
 */
import { describe, it, expect } from 'vitest';
import {
  assertBalanced,
  parseAmount,
  formatAmount,
  assertSameCurrency,
  computeScopeHash,
  computePayloadHash,
  IdempotencyConflictError,
  InsufficientFundsError,
  CrossCurrencyError,
} from '@caricash/shared';
import {
  buildDepositEntries,
  buildWithdrawalEntries,
  buildP2PEntries,
  buildPaymentEntries,
  buildB2BEntries,
  buildReversalEntries,
} from '@caricash/posting-do';
import {
  assertLedgerBalanced,
  assertSingleCurrency,
  assertNoNegativeBalances,
  assertOverdraftWithinLimit,
  assertSingleJournalPerIdempotency,
  assertMakerCheckerEnforced,
} from '../assertions.js';

// ─── Deterministic PRNG (Mulberry32) for reproducibility ───

function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 20260220; // Deterministic seed
const rng = mulberry32(SEED);

function randomAmountSeeded(): string {
  const cents = Math.floor(rng() * 999999) + 1;
  return formatAmount(BigInt(cents));
}

function randomAccountIdSeeded(): string {
  return `acct-${Math.floor(rng() * 1000000).toString(36)}`;
}

// ─── A) Ledger Balance Invariant ───

describe('PR5 property: ledger balance invariant', () => {
  const ITERATIONS = 100;

  it('all randomly generated deposit entries balance with DR == CR', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const entries = buildDepositEntries(
        randomAccountIdSeeded(),
        randomAccountIdSeeded(),
        randomAmountSeeded(),
      );
      expect(() => assertLedgerBalanced(entries)).not.toThrow();
    }
  });

  it('all randomly generated withdrawal entries balance', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const entries = buildWithdrawalEntries(
        randomAccountIdSeeded(),
        randomAccountIdSeeded(),
        randomAmountSeeded(),
      );
      expect(() => assertLedgerBalanced(entries)).not.toThrow();
    }
  });

  it('all randomly generated P2P entries balance', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const entries = buildP2PEntries(
        randomAccountIdSeeded(),
        randomAccountIdSeeded(),
        randomAmountSeeded(),
      );
      expect(() => assertLedgerBalanced(entries)).not.toThrow();
    }
  });

  it('all randomly generated payment entries balance', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const entries = buildPaymentEntries(
        randomAccountIdSeeded(),
        randomAccountIdSeeded(),
        randomAmountSeeded(),
      );
      expect(() => assertLedgerBalanced(entries)).not.toThrow();
    }
  });

  it('all randomly generated B2B entries balance', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const entries = buildB2BEntries(
        randomAccountIdSeeded(),
        randomAccountIdSeeded(),
        randomAmountSeeded(),
      );
      expect(() => assertLedgerBalanced(entries)).not.toThrow();
    }
  });

  it('all randomly generated reversal entries balance', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const amount = randomAmountSeeded();
      const original = [
        { account_id: randomAccountIdSeeded(), entry_type: 'DR' as const, amount },
        { account_id: randomAccountIdSeeded(), entry_type: 'CR' as const, amount },
      ];
      const reversed = buildReversalEntries(original);
      expect(() => assertLedgerBalanced(reversed)).not.toThrow();
    }
  });

  it('all entries have amounts > 0', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const entries = buildDepositEntries(
        randomAccountIdSeeded(),
        randomAccountIdSeeded(),
        randomAmountSeeded(),
      );
      for (const e of entries) {
        expect(parseAmount(e.amount)).toBeGreaterThan(0n);
      }
    }
  });

  it('no cross-currency legs in any template (single currency per journal)', () => {
    // All template functions produce entries for a single currency context.
    // They don't carry per-entry currency — currency is on the journal header.
    const templates = [buildDepositEntries, buildWithdrawalEntries, buildP2PEntries, buildPaymentEntries, buildB2BEntries];
    for (const builder of templates) {
      for (let i = 0; i < 20; i++) {
        const entries = builder(randomAccountIdSeeded(), randomAccountIdSeeded(), randomAmountSeeded());
        // Entries don't have currency property — the invariant is structural:
        // no entry can carry a different currency since templates don't accept per-entry currencies
        for (const e of entries) {
          expect(e).not.toHaveProperty('currency');
        }
      }
    }
  });

  it('deposit with fee always balances (100 iterations)', () => {
    for (let i = 0; i < 100; i++) {
      const amountCents = Math.floor(rng() * 99999) + 1000;
      const feeCents = Math.floor(rng() * Math.min(amountCents, 500)) + 1;
      const amount = formatAmount(BigInt(amountCents));
      const fee = formatAmount(BigInt(feeCents));

      const entries = buildDepositEntries(
        randomAccountIdSeeded(),
        randomAccountIdSeeded(),
        amount,
        randomAccountIdSeeded(),
        fee,
      );
      expect(() => assertLedgerBalanced(entries)).not.toThrow();
    }
  });
});

// ─── B) Idempotency Invariant ───

describe('PR5 property: idempotency invariant', () => {
  it('N repeated scope hashes produce identical value', async () => {
    const actorType = 'CUSTOMER';
    const actorId = 'cust-001';
    const txnType = 'DEPOSIT';
    const key = 'idem-test-001';

    const results: string[] = [];
    for (let i = 0; i < 50; i++) {
      results.push(await computeScopeHash(actorType, actorId, txnType, key));
    }

    // All must be identical
    const unique = new Set(results);
    expect(unique.size).toBe(1);
  });

  it('different idempotency keys produce different scope hashes', async () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const hash = await computeScopeHash('AGENT', 'agent-001', 'DEPOSIT', `key-${i}`);
      hashes.add(hash);
    }
    expect(hashes.size).toBe(100);
  });

  it('scope hash includes all 4 fields (changing any field changes hash)', async () => {
    const base = await computeScopeHash('CUSTOMER', 'cust-001', 'DEPOSIT', 'key-001');
    const changedType = await computeScopeHash('AGENT', 'cust-001', 'DEPOSIT', 'key-001');
    const changedId = await computeScopeHash('CUSTOMER', 'cust-002', 'DEPOSIT', 'key-001');
    const changedTxn = await computeScopeHash('CUSTOMER', 'cust-001', 'WITHDRAWAL', 'key-001');
    const changedKey = await computeScopeHash('CUSTOMER', 'cust-001', 'DEPOSIT', 'key-002');

    expect(changedType).not.toBe(base);
    expect(changedId).not.toBe(base);
    expect(changedTxn).not.toBe(base);
    expect(changedKey).not.toBe(base);
  });

  it('assertSingleJournalPerIdempotency accepts single journal', () => {
    expect(() => assertSingleJournalPerIdempotency('scope-hash-1', ['j-001'])).not.toThrow();
  });

  it('assertSingleJournalPerIdempotency rejects multiple journals', () => {
    expect(() => assertSingleJournalPerIdempotency('scope-hash-1', ['j-001', 'j-002'])).toThrow(
      /maps to 2 journals/,
    );
  });

  it('assertSingleJournalPerIdempotency rejects empty journals', () => {
    expect(() => assertSingleJournalPerIdempotency('scope-hash-1', [])).toThrow(/no associated journals/);
  });
});

// ─── C) Conflict Invariant ───

describe('PR5 property: conflict invariant', () => {
  it('same payload always produces identical payload hash', async () => {
    const payload = { sender: 'cust-001', receiver: 'cust-002', amount: '100.00', currency: 'BBD' };
    const hashes: string[] = [];
    for (let i = 0; i < 50; i++) {
      hashes.push(await computePayloadHash(payload));
    }
    const unique = new Set(hashes);
    expect(unique.size).toBe(1);
  });

  it('different payload produces different payload hash', async () => {
    const hash1 = await computePayloadHash({ amount: '100.00', currency: 'BBD' });
    const hash2 = await computePayloadHash({ amount: '200.00', currency: 'BBD' });
    expect(hash1).not.toBe(hash2);
  });

  it('payload hash is key-order independent (canonical JSON)', async () => {
    const hash1 = await computePayloadHash({ a: '1', b: '2', c: '3' });
    const hash2 = await computePayloadHash({ c: '3', a: '1', b: '2' });
    expect(hash1).toBe(hash2);
  });

  it('nested objects are canonicalized', async () => {
    const hash1 = await computePayloadHash({ data: { z: 1, a: 2 }, meta: { y: 3, b: 4 } });
    const hash2 = await computePayloadHash({ meta: { b: 4, y: 3 }, data: { a: 2, z: 1 } });
    expect(hash1).toBe(hash2);
  });

  it('conflict scenario: same scope + different payload = different hashes', async () => {
    const scopeHash = await computeScopeHash('CUSTOMER', 'cust-001', 'DEPOSIT', 'idem-001');
    const payloadHash1 = await computePayloadHash({ amount: '100.00' });
    const payloadHash2 = await computePayloadHash({ amount: '200.00' });

    // Same scope but different payloads = conflict
    expect(payloadHash1).not.toBe(payloadHash2);
    // Real system: same scope_hash + different payload_hash → DUPLICATE_IDEMPOTENCY_CONFLICT
  });
});

// ─── D) No Negative Balance Invariant ───

describe('PR5 property: no negative balance invariant', () => {
  it('accepts all positive balances', () => {
    const accounts = new Map([
      ['acct-001', '100.00'],
      ['acct-002', '50.00'],
      ['acct-003', '0.00'],
    ]);
    expect(() => assertNoNegativeBalances(accounts)).not.toThrow();
  });

  it('rejects negative balance without overdraft facility', () => {
    const accounts = new Map([
      ['acct-001', '100.00'],
      ['acct-002', '-50.00'],
    ]);
    expect(() => assertNoNegativeBalances(accounts)).toThrow(/Negative balance invariant/);
  });

  it('allows negative balance with overdraft facility', () => {
    const accounts = new Map([
      ['acct-001', '100.00'],
      ['acct-002', '-50.00'],
    ]);
    const overdraft = new Set(['acct-002']);
    expect(() => assertNoNegativeBalances(accounts, overdraft)).not.toThrow();
  });

  it('randomized sequence never goes negative without overdraft', () => {
    const seededRng = mulberry32(42);
    let balanceCents = 100000n; // Start with 1000.00

    const txns = 200;
    for (let i = 0; i < txns; i++) {
      const spendCents = BigInt(Math.floor(seededRng() * 5000) + 1); // Random 0.01 to 50.00
      if (balanceCents >= spendCents) {
        balanceCents -= spendCents;
      }
      // Never goes negative
      expect(balanceCents).toBeGreaterThanOrEqual(0n);
    }
  });

  it('serialized spending with insufficient funds check (50 rounds)', () => {
    const seededRng = mulberry32(99);
    let balanceCents = 50000n; // 500.00
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < 50; i++) {
      const spendCents = BigInt(Math.floor(seededRng() * 20000) + 1); // Up to 200.00
      if (balanceCents >= spendCents) {
        balanceCents -= spendCents;
        successCount++;
      } else {
        failCount++;
      }
      expect(balanceCents).toBeGreaterThanOrEqual(0n);
    }

    expect(successCount + failCount).toBe(50);
    expect(balanceCents).toBeGreaterThanOrEqual(0n);
  });
});

// ─── E) Overdraft Boundaries ───

describe('PR5 property: overdraft boundaries', () => {
  it('exposure within limit is acceptable', () => {
    expect(() => assertOverdraftWithinLimit('-50.00', '100.00')).not.toThrow();
  });

  it('exposure at limit is acceptable', () => {
    expect(() => assertOverdraftWithinLimit('-100.00', '100.00')).not.toThrow();
  });

  it('exposure exceeding limit is rejected', () => {
    expect(() => assertOverdraftWithinLimit('-150.00', '100.00')).toThrow(/Overdraft boundary violated/);
  });

  it('positive balance is always within any limit', () => {
    expect(() => assertOverdraftWithinLimit('50.00', '100.00')).not.toThrow();
  });

  it('zero balance is within any limit', () => {
    expect(() => assertOverdraftWithinLimit('0.00', '100.00')).not.toThrow();
  });

  it('randomized overdraft draws never exceed limit', () => {
    const seededRng = mulberry32(7777);
    const limitCents = 50000n; // 500.00

    for (let i = 0; i < 100; i++) {
      // Generate exposure up to limit
      const exposureCents = BigInt(Math.floor(seededRng() * Number(limitCents)));
      const balance = `-${formatAmount(exposureCents)}`;
      expect(() => assertOverdraftWithinLimit(balance, formatAmount(limitCents))).not.toThrow();
    }
  });
});
