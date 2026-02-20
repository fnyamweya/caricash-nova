export const SUPPORTED_CURRENCIES = ['BBD', 'USD'] as const;
export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number];
export const BASE_CURRENCY: CurrencyCode = 'BBD';

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return SUPPORTED_CURRENCIES.includes(code as CurrencyCode);
}

// Cross-currency transfers are BLOCKED in Phase 1
export function assertSameCurrency(currencies: string[]): void {
  const unique = new Set(currencies);
  if (unique.size > 1) {
    throw new Error(`Cross-currency postings are not permitted. Found: ${[...unique].join(', ')}`);
  }
}
