import { describe, it, expect } from 'vitest';
import {
  buildDepositEntries,
  buildWithdrawalEntries,
  buildP2PEntries,
  buildPaymentEntries,
  buildB2BEntries,
  buildReversalEntries,
} from '../journal-templates.js';
import type { Entry } from '../journal-templates.js';
import { assertBalanced } from '@caricash/shared';

function sumByType(entries: Entry[], type: 'DR' | 'CR'): bigint {
  return entries
    .filter((e) => e.entry_type === type)
    .reduce((sum, e) => {
      const [whole, frac = ''] = e.amount.split('.');
      return sum + BigInt(whole + frac.padEnd(2, '0'));
    }, 0n);
}

describe('buildDepositEntries', () => {
  it('generates balanced entries (DR agent float, CR customer wallet)', () => {
    const entries = buildDepositEntries('agent-float', 'customer-wallet', '100.00');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ account_id: 'agent-float', entry_type: 'DR', amount: '100.00' });
    expect(entries[1]).toMatchObject({ account_id: 'customer-wallet', entry_type: 'CR', amount: '100.00' });
    expect(() => assertBalanced(entries)).not.toThrow();
  });

  it('includes fee entries when fee is provided', () => {
    const entries = buildDepositEntries('agent-float', 'customer-wallet', '100.00', 'fee-acct', '5.00');
    expect(entries).toHaveLength(4);
    // Fee: DR customer wallet, CR fee account
    expect(entries[2]).toMatchObject({ account_id: 'customer-wallet', entry_type: 'DR', amount: '5.00' });
    expect(entries[3]).toMatchObject({ account_id: 'fee-acct', entry_type: 'CR', amount: '5.00' });
    expect(() => assertBalanced(entries)).not.toThrow();
  });

  it('skips fee entries when feeAmount is "0.00"', () => {
    const entries = buildDepositEntries('agent-float', 'customer-wallet', '100.00', 'fee-acct', '0.00');
    expect(entries).toHaveLength(2);
  });

  it('includes commission entries', () => {
    const commissions = [
      { feeRevenueAccountId: 'fee-rev', agentCommissionAccountId: 'agent-comm', amount: '2.00' },
    ];
    const entries = buildDepositEntries('agent-float', 'customer-wallet', '100.00', 'fee-acct', '5.00', commissions);
    expect(entries).toHaveLength(6);
    // Commission: DR fee revenue, CR agent commission
    expect(entries[4]).toMatchObject({ account_id: 'fee-rev', entry_type: 'DR', amount: '2.00' });
    expect(entries[5]).toMatchObject({ account_id: 'agent-comm', entry_type: 'CR', amount: '2.00' });
    expect(() => assertBalanced(entries)).not.toThrow();
  });
});

describe('buildWithdrawalEntries', () => {
  it('generates balanced entries', () => {
    const entries = buildWithdrawalEntries('customer-wallet', 'agent-float', '200.00');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ account_id: 'customer-wallet', entry_type: 'DR', amount: '200.00' });
    expect(entries[1]).toMatchObject({ account_id: 'agent-float', entry_type: 'CR', amount: '200.00' });
    expect(() => assertBalanced(entries)).not.toThrow();
  });

  it('includes fee and commission entries when provided', () => {
    const commissions = [
      { feeRevenueAccountId: 'fee-rev', agentCommissionAccountId: 'agent-comm', amount: '1.50' },
    ];
    const entries = buildWithdrawalEntries('customer-wallet', 'agent-float', '200.00', 'fee-acct', '10.00', commissions);
    expect(entries).toHaveLength(6);
    expect(() => assertBalanced(entries)).not.toThrow();
  });
});

describe('buildP2PEntries', () => {
  it('generates balanced entries', () => {
    const entries = buildP2PEntries('sender-wallet', 'receiver-wallet', '50.00');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ account_id: 'sender-wallet', entry_type: 'DR', amount: '50.00' });
    expect(entries[1]).toMatchObject({ account_id: 'receiver-wallet', entry_type: 'CR', amount: '50.00' });
    expect(() => assertBalanced(entries)).not.toThrow();
  });

  it('includes fee entries', () => {
    const entries = buildP2PEntries('sender-wallet', 'receiver-wallet', '50.00', 'fee-acct', '1.00');
    expect(entries).toHaveLength(4);
    expect(() => assertBalanced(entries)).not.toThrow();
  });
});

describe('buildPaymentEntries', () => {
  it('generates balanced entries', () => {
    const entries = buildPaymentEntries('customer-wallet', 'merchant-wallet', '75.00');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ account_id: 'customer-wallet', entry_type: 'DR', amount: '75.00' });
    expect(entries[1]).toMatchObject({ account_id: 'merchant-wallet', entry_type: 'CR', amount: '75.00' });
    expect(() => assertBalanced(entries)).not.toThrow();
  });

  it('includes fee entries', () => {
    const entries = buildPaymentEntries('customer-wallet', 'merchant-wallet', '75.00', 'fee-acct', '3.50');
    expect(entries).toHaveLength(4);
    expect(() => assertBalanced(entries)).not.toThrow();
  });
});

describe('buildB2BEntries', () => {
  it('generates balanced entries', () => {
    const entries = buildB2BEntries('sender-merchant', 'receiver-merchant', '500.00');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ account_id: 'sender-merchant', entry_type: 'DR', amount: '500.00' });
    expect(entries[1]).toMatchObject({ account_id: 'receiver-merchant', entry_type: 'CR', amount: '500.00' });
    expect(() => assertBalanced(entries)).not.toThrow();
  });

  it('includes fee entries', () => {
    const entries = buildB2BEntries('sender-merchant', 'receiver-merchant', '500.00', 'fee-acct', '25.00');
    expect(entries).toHaveLength(4);
    expect(() => assertBalanced(entries)).not.toThrow();
  });
});

describe('buildReversalEntries', () => {
  it('reverses DR→CR and CR→DR', () => {
    const original: Entry[] = [
      { account_id: 'acct-a', entry_type: 'DR', amount: '100.00', description: 'Deposit from agent' },
      { account_id: 'acct-b', entry_type: 'CR', amount: '100.00', description: 'Deposit to wallet' },
    ];
    const reversed = buildReversalEntries(original);
    expect(reversed).toHaveLength(2);
    expect(reversed[0]).toMatchObject({ account_id: 'acct-a', entry_type: 'CR', amount: '100.00' });
    expect(reversed[1]).toMatchObject({ account_id: 'acct-b', entry_type: 'DR', amount: '100.00' });
  });

  it('preserves balance after reversal', () => {
    const original: Entry[] = [
      { account_id: 'a', entry_type: 'DR', amount: '50.00' },
      { account_id: 'b', entry_type: 'CR', amount: '30.00' },
      { account_id: 'c', entry_type: 'CR', amount: '20.00' },
    ];
    const reversed = buildReversalEntries(original);
    expect(() => assertBalanced(reversed)).not.toThrow();
  });

  it('adds "Reversal:" prefix to descriptions', () => {
    const original: Entry[] = [
      { account_id: 'a', entry_type: 'DR', amount: '10.00', description: 'Payment sent' },
    ];
    const reversed = buildReversalEntries(original);
    expect(reversed[0].description).toBe('Reversal: Payment sent');
  });
});

describe('all templates: sum(DR) == sum(CR)', () => {
  const templates = [
    { name: 'deposit', fn: () => buildDepositEntries('a', 'b', '123.45') },
    { name: 'withdrawal', fn: () => buildWithdrawalEntries('a', 'b', '123.45') },
    { name: 'P2P', fn: () => buildP2PEntries('a', 'b', '123.45') },
    { name: 'payment', fn: () => buildPaymentEntries('a', 'b', '123.45') },
    { name: 'B2B', fn: () => buildB2BEntries('a', 'b', '123.45') },
  ];

  for (const { name, fn } of templates) {
    it(`${name}: sum(DR) == sum(CR)`, () => {
      const entries = fn();
      expect(sumByType(entries, 'DR')).toBe(sumByType(entries, 'CR'));
    });
  }
});
