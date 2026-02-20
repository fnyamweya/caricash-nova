import type { FeeRule } from '@caricash/shared';
import { parseAmount, formatAmount } from '@caricash/shared';

export interface FeeResult {
  feeAmount: string;
  taxAmount: string;
}

/**
 * Calculates the transaction fee and associated tax.
 *
 * fee = max(min_amount, min(max_amount, flat + (amount * percent / 100)))
 * tax = fee * tax_rate / 100
 *
 * All arithmetic is performed in bigint cents to avoid floating-point drift.
 */
export function calculateFee(amount: string, rules: FeeRule[]): FeeResult {
  if (rules.length === 0) {
    return { feeAmount: '0.00', taxAmount: '0.00' };
  }

  // Use the first matching rule (rules are returned ordered by effective_from DESC)
  const rule = rules[0];

  const amountCents = parseAmount(amount);
  const flatCents = parseAmount(rule.flat_amount);
  const percentBps = parseAmount(rule.percent_amount); // stored as decimal e.g. "1.50" → 150n
  const minCents = parseAmount(rule.min_amount);
  const maxCents = parseAmount(rule.max_amount);
  const taxRateBps = parseAmount(rule.tax_rate); // e.g. "17.50" → 1750n

  // percent component: (amount * percent) / 100  — percent is in cents (×100), so divide by 10000
  const percentComponent = (amountCents * percentBps) / 10000n;
  const rawFee = flatCents + percentComponent;

  // Clamp to [min, max]
  let feeCents = rawFee;
  if (feeCents < minCents) feeCents = minCents;
  if (feeCents > maxCents) feeCents = maxCents;

  // tax = fee * taxRate / 100 — taxRate is in cents (×100), so divide by 10000
  const taxCents = (feeCents * taxRateBps) / 10000n;

  return {
    feeAmount: formatAmount(feeCents),
    taxAmount: formatAmount(taxCents),
  };
}
