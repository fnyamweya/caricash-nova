import { describe, it, expect } from 'vitest';
import { calculateCommission } from '../commission-calculator.js';
import type { CommissionRule } from '@caricash/shared';

function makeRule(overrides: Partial<CommissionRule> = {}): CommissionRule {
  return {
    id: 'comm-1',
    version_id: 'v1',
    txn_type: 'DEPOSIT',
    currency: 'BBD',
    agent_type: 'STANDARD',
    flat_amount: '0.00',
    percent_amount: '0.00',
    ...overrides,
  };
}

describe('calculateCommission', () => {
  it('returns zero when no matching rules', () => {
    const result = calculateCommission('100.00', []);
    expect(result.commissionAmount).toBe('0.00');
  });

  it('calculates flat commission', () => {
    const rule = makeRule({ flat_amount: '3.00' });
    const result = calculateCommission('100.00', [rule]);
    expect(result.commissionAmount).toBe('3.00');
  });

  it('calculates percent commission', () => {
    // 2% of 500.00 = 10.00
    const rule = makeRule({ percent_amount: '2.00' });
    const result = calculateCommission('500.00', [rule]);
    expect(result.commissionAmount).toBe('10.00');
  });

  it('calculates flat + percent commission', () => {
    // flat 1.00 + 1.50% of 200.00 = 1.00 + 3.00 = 4.00
    const rule = makeRule({ flat_amount: '1.00', percent_amount: '1.50' });
    const result = calculateCommission('200.00', [rule]);
    expect(result.commissionAmount).toBe('4.00');
  });

  it('uses the first rule when multiple rules are provided', () => {
    const rule1 = makeRule({ flat_amount: '5.00' });
    const rule2 = makeRule({ flat_amount: '10.00' });
    const result = calculateCommission('100.00', [rule1, rule2]);
    expect(result.commissionAmount).toBe('5.00');
  });
});
