import { describe, it, expect } from 'vitest';
import {
  assertBalanced,
  assertSameCurrency,
  parseAmount,
  formatAmount,
  UnbalancedJournalError,
  InsufficientFundsError,
} from '@caricash/shared';
import { buildDepositEntries, buildReversalEntries } from '../journal-templates.js';

describe('posting: idempotency logic', () => {
  it('same idempotency key returns same cached result', () => {
    // Simulate an in-memory idempotency store
    const idempotencyStore = new Map<string, { journal_id: string; state: string }>();
    const key = 'deposit-txn-001';
    const firstResult = { journal_id: 'journal-abc', state: 'POSTED' };
    idempotencyStore.set(key, firstResult);

    // Second call with same key returns cached result
    const cached = idempotencyStore.get(key);
    expect(cached).toEqual(firstResult);

    // Third call also returns the same
    const cached2 = idempotencyStore.get(key);
    expect(cached2).toBe(cached);
  });

  it('different idempotency keys produce independent results', () => {
    const store = new Map<string, { journal_id: string }>();
    store.set('key-1', { journal_id: 'j-1' });
    store.set('key-2', { journal_id: 'j-2' });

    expect(store.get('key-1')!.journal_id).toBe('j-1');
    expect(store.get('key-2')!.journal_id).toBe('j-2');
  });
});

describe('posting: cross-currency rejection', () => {
  it('rejects entries with mixed currencies', () => {
    expect(() => assertSameCurrency(['BBD', 'USD'])).toThrow('Cross-currency postings are not permitted');
  });

  it('accepts entries with same currency', () => {
    expect(() => assertSameCurrency(['BBD', 'BBD'])).not.toThrow();
  });
});

describe('posting: balanced journal enforcement', () => {
  it('accepts balanced deposit entries', () => {
    const entries = buildDepositEntries('agent-float', 'customer-wallet', '250.00');
    expect(() => assertBalanced(entries)).not.toThrow();
  });

  it('rejects manually crafted unbalanced entries', () => {
    const unbalanced = [
      { entry_type: 'DR' as const, amount: '100.00' },
      { entry_type: 'CR' as const, amount: '50.00' },
    ];
    expect(() => assertBalanced(unbalanced)).toThrow(UnbalancedJournalError);
  });

  it('reversal entries remain balanced', () => {
    const original = buildDepositEntries('agent-float', 'customer-wallet', '100.00', 'fee-acct', '5.00');
    const reversed = buildReversalEntries(original);
    expect(() => assertBalanced(reversed)).not.toThrow();
  });
});

describe('posting: insufficient funds check logic', () => {
  it('detects insufficient balance for DR', () => {
    // Simulate balance check: account has 50.00, needs 100.00
    const balanceCents = parseAmount('50.00');
    const requiredCents = parseAmount('100.00');
    const hasSufficientFunds = balanceCents >= requiredCents;
    expect(hasSufficientFunds).toBe(false);
  });

  it('passes when balance covers DR amount', () => {
    const balanceCents = parseAmount('200.00');
    const requiredCents = parseAmount('100.00');
    const hasSufficientFunds = balanceCents >= requiredCents;
    expect(hasSufficientFunds).toBe(true);
  });

  it('passes when balance exactly equals DR amount', () => {
    const balanceCents = parseAmount('100.00');
    const requiredCents = parseAmount('100.00');
    const hasSufficientFunds = balanceCents >= requiredCents;
    expect(hasSufficientFunds).toBe(true);
  });

  it('aggregates multiple DR entries for same account', () => {
    const entries = [
      { account_id: 'acct-1', entry_type: 'DR' as const, amount: '60.00' },
      { account_id: 'acct-1', entry_type: 'DR' as const, amount: '50.00' },
      { account_id: 'acct-2', entry_type: 'CR' as const, amount: '110.00' },
    ];

    // Aggregate DR per account
    const drByAccount = new Map<string, bigint>();
    for (const e of entries.filter((e) => e.entry_type === 'DR')) {
      const current = drByAccount.get(e.account_id) ?? 0n;
      drByAccount.set(e.account_id, current + parseAmount(e.amount));
    }

    expect(drByAccount.get('acct-1')).toBe(11000n); // 60.00 + 50.00 = 110.00 = 11000 cents
    expect(formatAmount(drByAccount.get('acct-1')!)).toBe('110.00');
  });

  it('InsufficientFundsError has correct name', () => {
    const err = new InsufficientFundsError('Account X has balance 0.00 but needs 100.00');
    expect(err.name).toBe('InsufficientFundsError');
    expect(err.message).toContain('Account X');
  });
});
