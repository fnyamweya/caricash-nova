import { ulid } from 'ulid';
import { UnbalancedJournalError } from './errors.js';

export function generateId(): string {
  return ulid();
}

export function assertBalanced(entries: { entry_type: 'DR' | 'CR'; amount: string }[]): void {
  let drTotal = 0n;
  let crTotal = 0n;
  for (const e of entries) {
    const cents = parseAmount(e.amount);
    if (e.entry_type === 'DR') drTotal += cents;
    else crTotal += cents;
  }
  if (drTotal !== crTotal) {
    throw new UnbalancedJournalError();
  }
}

/** Parses a decimal string (up to 2 decimal places) into bigint cents. */
export function parseAmount(s: string): bigint {
  const trimmed = s.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`Invalid amount format: "${s}"`);
  }
  const [whole, frac = ''] = trimmed.split('.');
  const cents = frac.padEnd(2, '0');
  return BigInt(whole + cents);
}

/** Formats bigint cents back to a decimal string with 2 decimal places. */
export function formatAmount(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const str = abs.toString().padStart(3, '0');
  const whole = str.slice(0, -2);
  const frac = str.slice(-2);
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}
