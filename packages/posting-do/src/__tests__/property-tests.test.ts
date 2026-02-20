import { describe, it, expect } from 'vitest';
import { assertBalanced, formatAmount, parseAmount, assertSameCurrency, CrossCurrencyError } from '@caricash/shared';
import {
  buildDepositEntries,
  buildWithdrawalEntries,
  buildP2PEntries,
  buildPaymentEntries,
  buildB2BEntries,
  buildReversalEntries,
} from '../index.js';

/**
 * Property-based tests verifying invariants across all journal templates.
 * These ensure that no matter the inputs, the core ledger rules always hold.
 */

// Helper to generate random amounts
function randomAmount(): string {
  const cents = Math.floor(Math.random() * 999999) + 1;
  return formatAmount(BigInt(cents));
}

function randomAccountId(): string {
  return `acct-${Math.random().toString(36).slice(2, 10)}`;
}

describe('property: all journal templates always produce balanced entries', () => {
  const iterations = 50;

  it('deposit entries always balance', () => {
    for (let i = 0; i < iterations; i++) {
      const entries = buildDepositEntries(
        randomAccountId(),
        randomAccountId(),
        randomAmount(),
      );
      expect(() => assertBalanced(entries)).not.toThrow();
    }
  });

  it('withdrawal entries always balance', () => {
    for (let i = 0; i < iterations; i++) {
      const entries = buildWithdrawalEntries(
        randomAccountId(),
        randomAccountId(),
        randomAmount(),
      );
      expect(() => assertBalanced(entries)).not.toThrow();
    }
  });

  it('P2P entries always balance', () => {
    for (let i = 0; i < iterations; i++) {
      const entries = buildP2PEntries(
        randomAccountId(),
        randomAccountId(),
        randomAmount(),
      );
      expect(() => assertBalanced(entries)).not.toThrow();
    }
  });

  it('payment entries always balance', () => {
    for (let i = 0; i < iterations; i++) {
      const entries = buildPaymentEntries(
        randomAccountId(),
        randomAccountId(),
        randomAmount(),
      );
      expect(() => assertBalanced(entries)).not.toThrow();
    }
  });

  it('B2B entries always balance', () => {
    for (let i = 0; i < iterations; i++) {
      const entries = buildB2BEntries(
        randomAccountId(),
        randomAccountId(),
        randomAmount(),
      );
      expect(() => assertBalanced(entries)).not.toThrow();
    }
  });

  it('reversal entries always balance', () => {
    for (let i = 0; i < iterations; i++) {
      const amount = randomAmount();
      const original = [
        { account_id: randomAccountId(), entry_type: 'DR' as const, amount },
        { account_id: randomAccountId(), entry_type: 'CR' as const, amount },
      ];
      const reversed = buildReversalEntries(original);
      expect(() => assertBalanced(reversed)).not.toThrow();
    }
  });

  it('deposit with fee always balances', () => {
    for (let i = 0; i < iterations; i++) {
      const feeAccountId = randomAccountId();
      // Fee must be less than amount
      const amountCents = Math.floor(Math.random() * 99999) + 1000;
      const feeCents = Math.floor(Math.random() * Math.min(amountCents, 1000)) + 1;
      const amount = formatAmount(BigInt(amountCents));
      const fee = formatAmount(BigInt(feeCents));

      const entries = buildDepositEntries(
        randomAccountId(),
        randomAccountId(),
        amount,
        feeAccountId,
        fee,
      );
      expect(() => assertBalanced(entries)).not.toThrow();
    }
  });
});

describe('property: no cross-currency legs in journal entries', () => {
  it('all entries from any template share the same implicit currency', () => {
    // Templates don't carry explicit currency per entry — they operate on a single currency
    // This test verifies the contract: if you build entries for BBD, there's no USD leg
    const entries = buildDepositEntries('acct-1', 'acct-2', '100.00');

    // All entries exist — there's no way to inject a different currency
    // because the template functions don't accept per-entry currencies
    for (const entry of entries) {
      expect(entry).toHaveProperty('account_id');
      expect(entry).toHaveProperty('entry_type');
      expect(entry).toHaveProperty('amount');
      // No 'currency' property on individual entries — currency is on the journal
      expect(entry).not.toHaveProperty('currency');
    }
  });

  it('assertSameCurrency rejects mixed currencies', () => {
    expect(() => assertSameCurrency(['BBD', 'USD'])).toThrow();
  });

  it('assertSameCurrency accepts single currency', () => {
    expect(() => assertSameCurrency(['BBD'])).not.toThrow();
  });
});

describe('property: reversal inverts all entries', () => {
  it('every DR becomes CR and vice versa', () => {
    for (let i = 0; i < 50; i++) {
      const amount = randomAmount();
      const numLegs = Math.floor(Math.random() * 3) + 1;
      const original: { account_id: string; entry_type: 'DR' | 'CR'; amount: string }[] = [];

      // Build balanced original entries
      for (let j = 0; j < numLegs; j++) {
        original.push({ account_id: randomAccountId(), entry_type: 'DR', amount });
        original.push({ account_id: randomAccountId(), entry_type: 'CR', amount });
      }

      const reversed = buildReversalEntries(original);

      expect(reversed.length).toBe(original.length);

      for (let j = 0; j < original.length; j++) {
        expect(reversed[j].amount).toBe(original[j].amount);
        expect(reversed[j].account_id).toBe(original[j].account_id);
        // DR ↔ CR inversion
        if (original[j].entry_type === 'DR') {
          expect(reversed[j].entry_type).toBe('CR');
        } else {
          expect(reversed[j].entry_type).toBe('DR');
        }
      }
    }
  });
});
