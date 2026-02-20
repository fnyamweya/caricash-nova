import { describe, it, expect } from 'vitest';
import { calculateFee } from '../fee-calculator.js';
import type { FeeRule } from '@caricash/shared';

function makeRule(overrides: Partial<FeeRule> = {}): FeeRule {
  return {
    id: 'rule-1',
    version_id: 'v1',
    txn_type: 'DEPOSIT',
    currency: 'BBD',
    flat_amount: '0.00',
    percent_amount: '0.00',
    min_amount: '0.00',
    max_amount: '999999.99',
    tax_rate: '0.00',
    ...overrides,
  };
}

describe('calculateFee', () => {
  it('returns zero when no matching rules', () => {
    const result = calculateFee('100.00', []);
    expect(result.feeAmount).toBe('0.00');
    expect(result.taxAmount).toBe('0.00');
  });

  it('calculates flat fee only', () => {
    const rule = makeRule({ flat_amount: '5.00' });
    const result = calculateFee('100.00', [rule]);
    expect(result.feeAmount).toBe('5.00');
    expect(result.taxAmount).toBe('0.00');
  });

  it('calculates percent fee only', () => {
    // 2% of 100.00 = 2.00
    const rule = makeRule({ percent_amount: '2.00' });
    const result = calculateFee('100.00', [rule]);
    expect(result.feeAmount).toBe('2.00');
    expect(result.taxAmount).toBe('0.00');
  });

  it('calculates flat + percent fee', () => {
    // flat 1.00 + 1.50% of 200.00 = 1.00 + 3.00 = 4.00
    const rule = makeRule({ flat_amount: '1.00', percent_amount: '1.50' });
    const result = calculateFee('200.00', [rule]);
    expect(result.feeAmount).toBe('4.00');
    expect(result.taxAmount).toBe('0.00');
  });

  it('clamps fee to min_amount', () => {
    // flat 0.50 is below min 2.00
    const rule = makeRule({ flat_amount: '0.50', min_amount: '2.00' });
    const result = calculateFee('100.00', [rule]);
    expect(result.feeAmount).toBe('2.00');
  });

  it('clamps fee to max_amount', () => {
    // 10% of 1000.00 = 100.00, but max is 50.00
    const rule = makeRule({ percent_amount: '10.00', max_amount: '50.00' });
    const result = calculateFee('1000.00', [rule]);
    expect(result.feeAmount).toBe('50.00');
  });

  it('calculates tax on fee', () => {
    // fee = 10.00 (flat), tax = 17.50% of 10.00 = 1.75
    const rule = makeRule({ flat_amount: '10.00', tax_rate: '17.50' });
    const result = calculateFee('100.00', [rule]);
    expect(result.feeAmount).toBe('10.00');
    expect(result.taxAmount).toBe('1.75');
  });

  it('uses the first rule when multiple rules are provided', () => {
    const rule1 = makeRule({ flat_amount: '5.00' });
    const rule2 = makeRule({ flat_amount: '10.00' });
    const result = calculateFee('100.00', [rule1, rule2]);
    expect(result.feeAmount).toBe('5.00');
  });
});
