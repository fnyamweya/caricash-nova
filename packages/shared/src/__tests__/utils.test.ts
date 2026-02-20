import { describe, it, expect } from 'vitest';
import { parseAmount, formatAmount, assertBalanced } from '../utils.js';
import { UnbalancedJournalError } from '../errors.js';

describe('parseAmount', () => {
  it('parses "100.00" → 10000n', () => {
    expect(parseAmount('100.00')).toBe(10000n);
  });

  it('parses "0.50" → 50n', () => {
    expect(parseAmount('0.50')).toBe(50n);
  });

  it('parses "1000" (no decimals) → 100000n', () => {
    expect(parseAmount('1000')).toBe(100000n);
  });

  it('parses "0.01" → 1n', () => {
    expect(parseAmount('0.01')).toBe(1n);
  });

  it('parses "0.1" (one decimal) → 10n', () => {
    expect(parseAmount('0.1')).toBe(10n);
  });

  it('throws on negative amount', () => {
    expect(() => parseAmount('-10.00')).toThrow('Invalid amount format');
  });

  it('throws on letters', () => {
    expect(() => parseAmount('abc')).toThrow('Invalid amount format');
  });

  it('throws on too many decimals', () => {
    expect(() => parseAmount('1.234')).toThrow('Invalid amount format');
  });

  it('throws on empty string', () => {
    expect(() => parseAmount('')).toThrow('Invalid amount format');
  });
});

describe('formatAmount', () => {
  it('formats 10000n → "100.00"', () => {
    expect(formatAmount(10000n)).toBe('100.00');
  });

  it('formats 50n → "0.50"', () => {
    expect(formatAmount(50n)).toBe('0.50');
  });

  it('formats 0n → "0.00"', () => {
    expect(formatAmount(0n)).toBe('0.00');
  });

  it('formats 1n → "0.01"', () => {
    expect(formatAmount(1n)).toBe('0.01');
  });

  it('formats negative cents', () => {
    expect(formatAmount(-500n)).toBe('-5.00');
  });
});

describe('assertBalanced', () => {
  it('passes when DR == CR', () => {
    const entries = [
      { entry_type: 'DR' as const, amount: '100.00' },
      { entry_type: 'CR' as const, amount: '100.00' },
    ];
    expect(() => assertBalanced(entries)).not.toThrow();
  });

  it('passes with multiple entries summing to equal DR and CR', () => {
    const entries = [
      { entry_type: 'DR' as const, amount: '50.00' },
      { entry_type: 'DR' as const, amount: '50.00' },
      { entry_type: 'CR' as const, amount: '75.00' },
      { entry_type: 'CR' as const, amount: '25.00' },
    ];
    expect(() => assertBalanced(entries)).not.toThrow();
  });

  it('throws UnbalancedJournalError when DR != CR', () => {
    const entries = [
      { entry_type: 'DR' as const, amount: '100.00' },
      { entry_type: 'CR' as const, amount: '99.99' },
    ];
    expect(() => assertBalanced(entries)).toThrow(UnbalancedJournalError);
  });

  it('throws when only DR entries exist', () => {
    const entries = [
      { entry_type: 'DR' as const, amount: '50.00' },
    ];
    expect(() => assertBalanced(entries)).toThrow(UnbalancedJournalError);
  });

  it('passes with empty entries (0 == 0)', () => {
    expect(() => assertBalanced([])).not.toThrow();
  });
});

describe('property: random amounts balance check', () => {
  it('DR == CR passes for random amounts', () => {
    for (let i = 0; i < 50; i++) {
      const cents = Math.floor(Math.random() * 999999) + 1;
      const amount = formatAmount(BigInt(cents));
      const entries = [
        { entry_type: 'DR' as const, amount },
        { entry_type: 'CR' as const, amount },
      ];
      expect(() => assertBalanced(entries)).not.toThrow();
    }
  });

  it('DR != CR fails for random amounts', () => {
    for (let i = 0; i < 50; i++) {
      const drCents = Math.floor(Math.random() * 999999) + 1;
      // Ensure CR differs
      const crCents = drCents + 1;
      const drAmount = formatAmount(BigInt(drCents));
      const crAmount = formatAmount(BigInt(crCents));
      const entries = [
        { entry_type: 'DR' as const, amount: drAmount },
        { entry_type: 'CR' as const, amount: crAmount },
      ];
      expect(() => assertBalanced(entries)).toThrow(UnbalancedJournalError);
    }
  });
});
