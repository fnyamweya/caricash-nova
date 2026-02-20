import type { CommissionRule } from '@caricash/shared';
import { parseAmount, formatAmount } from '@caricash/shared';

export interface CommissionResult {
  commissionAmount: string;
}

/**
 * Calculates the agent commission for a transaction.
 *
 * commission = flat + (amount * percent / 100)
 *
 * All arithmetic is performed in bigint cents to avoid floating-point drift.
 */
export function calculateCommission(amount: string, rules: CommissionRule[]): CommissionResult {
  if (rules.length === 0) {
    return { commissionAmount: '0.00' };
  }

  // Use the first matching rule (rules are returned ordered by effective_from DESC)
  const rule = rules[0];

  const amountCents = parseAmount(amount);
  const flatCents = parseAmount(rule.flat_amount);
  const percentBps = parseAmount(rule.percent_amount); // stored as decimal e.g. "2.00" → 200n

  // percent component: (amount * percent) / 100 — percent is in cents (×100), so divide by 10000
  const percentComponent = (amountCents * percentBps) / 10000n;
  const commissionCents = flatCents + percentComponent;

  return {
    commissionAmount: formatAmount(commissionCents),
  };
}
