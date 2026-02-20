import { describe, it, expect } from 'vitest';
import { assertSameCurrency, isSupportedCurrency } from '../currency.js';

describe('assertSameCurrency', () => {
  it('passes with a single currency', () => {
    expect(() => assertSameCurrency(['BBD'])).not.toThrow();
  });

  it('passes when all currencies are the same', () => {
    expect(() => assertSameCurrency(['BBD', 'BBD', 'BBD'])).not.toThrow();
  });

  it('throws when currencies are mixed (BBD + USD)', () => {
    expect(() => assertSameCurrency(['BBD', 'USD'])).toThrow('Cross-currency postings are not permitted');
  });

  it('throws with multiple different currencies', () => {
    expect(() => assertSameCurrency(['BBD', 'USD', 'EUR'])).toThrow('Cross-currency postings are not permitted');
  });

  it('passes with empty array', () => {
    expect(() => assertSameCurrency([])).not.toThrow();
  });
});

describe('isSupportedCurrency', () => {
  it('returns true for BBD', () => {
    expect(isSupportedCurrency('BBD')).toBe(true);
  });

  it('returns true for USD', () => {
    expect(isSupportedCurrency('USD')).toBe(true);
  });

  it('returns false for EUR', () => {
    expect(isSupportedCurrency('EUR')).toBe(false);
  });

  it('returns false for GBP', () => {
    expect(isSupportedCurrency('GBP')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isSupportedCurrency('')).toBe(false);
  });
});
