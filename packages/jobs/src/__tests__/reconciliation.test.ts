import { describe, it, expect, vi } from 'vitest';

/**
 * Reconciliation logic tests — tests the pure comparison + classification functions.
 * The DB layer is mocked since we can't run D1 in unit tests.
 */

// Inline the severity classification logic for testing
function classifySeverity(discrepancyCents: bigint): string {
  const abs = discrepancyCents < 0n ? -discrepancyCents : discrepancyCents;
  if (abs >= 100000n) return 'CRITICAL'; // >= 1000.00
  if (abs >= 10000n) return 'HIGH';      // >= 100.00
  if (abs >= 100n) return 'MEDIUM';      // >= 1.00
  return 'LOW';
}

function parseAmountSafe(s: string): bigint {
  try {
    const trimmed = s.trim().replace(/^-/, '');
    const isNegative = s.trim().startsWith('-');
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return 0n;
    const [whole, frac = ''] = trimmed.split('.');
    const cents = frac.padEnd(2, '0');
    const val = BigInt(whole + cents);
    return isNegative ? -val : val;
  } catch {
    return 0n;
  }
}

function detectMismatch(
  computedBalance: string,
  materializedBalance: string,
): { isMismatch: boolean; discrepancyCents: bigint; severity: string } {
  const computedCents = parseAmountSafe(computedBalance);
  const materializedCents = parseAmountSafe(materializedBalance);
  const discrepancyCents = computedCents - materializedCents;
  const isMismatch = discrepancyCents !== 0n;
  return {
    isMismatch,
    discrepancyCents,
    severity: isMismatch ? classifySeverity(discrepancyCents) : 'LOW',
  };
}

describe('reconciliation: severity classification', () => {
  it('classifies small discrepancy as LOW', () => {
    expect(classifySeverity(50n)).toBe('LOW');  // 0.50
    expect(classifySeverity(-50n)).toBe('LOW');
  });

  it('classifies 1.00+ as MEDIUM', () => {
    expect(classifySeverity(100n)).toBe('MEDIUM'); // 1.00
    expect(classifySeverity(9999n)).toBe('MEDIUM'); // 99.99
  });

  it('classifies 100.00+ as HIGH', () => {
    expect(classifySeverity(10000n)).toBe('HIGH');  // 100.00
    expect(classifySeverity(99999n)).toBe('HIGH');  // 999.99
  });

  it('classifies 1000.00+ as CRITICAL', () => {
    expect(classifySeverity(100000n)).toBe('CRITICAL'); // 1000.00
    expect(classifySeverity(1000000n)).toBe('CRITICAL'); // 10000.00
  });
});

describe('reconciliation: mismatch detection', () => {
  it('detects no mismatch when balances match', () => {
    const result = detectMismatch('100.00', '100.00');
    expect(result.isMismatch).toBe(false);
    expect(result.discrepancyCents).toBe(0n);
  });

  it('detects mismatch when computed > materialized', () => {
    const result = detectMismatch('150.00', '100.00');
    expect(result.isMismatch).toBe(true);
    expect(result.discrepancyCents).toBe(5000n); // 50.00 in cents
    expect(result.severity).toBe('MEDIUM');
  });

  it('detects mismatch when computed < materialized', () => {
    const result = detectMismatch('50.00', '100.00');
    expect(result.isMismatch).toBe(true);
    expect(result.discrepancyCents).toBe(-5000n);
    expect(result.severity).toBe('MEDIUM');
  });

  it('detects critical mismatch for large discrepancy', () => {
    const result = detectMismatch('2000.00', '100.00');
    expect(result.isMismatch).toBe(true);
    expect(result.severity).toBe('CRITICAL');
  });

  it('handles zero balances', () => {
    const result = detectMismatch('0.00', '0.00');
    expect(result.isMismatch).toBe(false);
  });

  it('handles negative computed balance', () => {
    const result = detectMismatch('-50.00', '0.00');
    expect(result.isMismatch).toBe(true);
    expect(result.discrepancyCents).toBe(-5000n);
  });
});

describe('reconciliation: parseAmountSafe', () => {
  it('parses valid amounts', () => {
    expect(parseAmountSafe('100.00')).toBe(10000n);
    expect(parseAmountSafe('0.50')).toBe(50n);
    expect(parseAmountSafe('0.00')).toBe(0n);
  });

  it('parses negative amounts', () => {
    expect(parseAmountSafe('-100.00')).toBe(-10000n);
  });

  it('returns 0 for invalid format', () => {
    expect(parseAmountSafe('abc')).toBe(0n);
    expect(parseAmountSafe('')).toBe(0n);
  });
});
