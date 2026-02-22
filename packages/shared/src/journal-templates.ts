/**
 * Accounting journal templates for external rails (Section C).
 *
 * All templates are:
 * - balanced (total DR == total CR)
 * - currency-validated (single currency per journal)
 * - correlation-id tracked
 * - config-version referenced where applicable
 *
 * Account naming follows the chart-of-accounts established in Phase 4.
 */

import { roundHalfUp } from './rounding.js';

export interface JournalEntry {
  account_id: string;
  entry_type: 'DR' | 'CR';
  amount: string;
  description?: string;
}

export interface JournalTemplate {
  txn_type: string;
  currency: string;
  correlation_id: string;
  description: string;
  entries: JournalEntry[];
  fee_version_id?: string;
  commission_version_id?: string;
}

/**
 * C1: Customer bank deposit with fee + tax.
 * Phase A: Bank deposit confirmed (funds received at bank).
 *   Dr PLATFORM_BANK_POOL
 *   Cr BANK_CLEARING_INBOUND
 * Phase B: Credit customer wallet (net of fees).
 *   Dr BANK_CLEARING_INBOUND (gross)
 *   Cr CUSTOMER_WALLET (net)
 *   Cr FEE_REVENUE (fee)
 *   Cr TAX_PAYABLE (tax on fee)
 */
export function buildDepositWithFeeTemplate(params: {
  bankPoolAccountId: string;
  clearingAccountId: string;
  customerWalletId: string;
  feeRevenueAccountId: string;
  taxPayableAccountId: string;
  grossAmount: string;
  feeAmount: string;
  taxAmount: string;
  currency: string;
  correlationId: string;
  feeVersionId?: string;
}): JournalTemplate {
  const net = roundHalfUp(
    parseFloat(params.grossAmount) - parseFloat(params.feeAmount) - parseFloat(params.taxAmount),
  );
  return {
    txn_type: 'BANK_DEPOSIT_CREDIT',
    currency: params.currency,
    correlation_id: params.correlationId,
    description: `Customer deposit credit: gross=${params.grossAmount}, fee=${params.feeAmount}, tax=${params.taxAmount}`,
    fee_version_id: params.feeVersionId,
    entries: [
      { account_id: params.clearingAccountId, entry_type: 'DR', amount: params.grossAmount, description: 'Clear inbound deposit' },
      { account_id: params.customerWalletId, entry_type: 'CR', amount: net, description: 'Credit customer wallet (net)' },
      { account_id: params.feeRevenueAccountId, entry_type: 'CR', amount: params.feeAmount, description: 'Deposit fee revenue' },
      { account_id: params.taxPayableAccountId, entry_type: 'CR', amount: params.taxAmount, description: 'Tax on deposit fee' },
    ],
  };
}

/**
 * C2: Settlement fee deduction from payout.
 *   Dr MERCHANT_WALLET (gross)
 *   Cr BANK_CLEARING_OUTBOUND (net after fee)
 *   Cr FEE_REVENUE (settlement fee)
 */
export function buildSettlementFeeTemplate(params: {
  merchantWalletId: string;
  clearingOutboundId: string;
  feeRevenueAccountId: string;
  grossAmount: string;
  feeAmount: string;
  currency: string;
  correlationId: string;
  feeVersionId?: string;
}): JournalTemplate {
  const net = roundHalfUp(parseFloat(params.grossAmount) - parseFloat(params.feeAmount));
  return {
    txn_type: 'SETTLEMENT_FEE_DEDUCTION',
    currency: params.currency,
    correlation_id: params.correlationId,
    description: `Settlement payout with fee: gross=${params.grossAmount}, fee=${params.feeAmount}`,
    fee_version_id: params.feeVersionId,
    entries: [
      { account_id: params.merchantWalletId, entry_type: 'DR', amount: params.grossAmount, description: 'Debit merchant wallet (gross)' },
      { account_id: params.clearingOutboundId, entry_type: 'CR', amount: net, description: 'Outbound clearing (net)' },
      { account_id: params.feeRevenueAccountId, entry_type: 'CR', amount: params.feeAmount, description: 'Settlement fee' },
    ],
  };
}

/**
 * C3: Commission split (agent commission from transaction).
 *   Dr COMMISSIONS_PAYABLE (total commission)
 *   Cr AGENT_WALLET (agent share)
 *   Cr PLATFORM_COMMISSION_POOL (platform share)
 */
export function buildCommissionSplitTemplate(params: {
  commissionsPayableId: string;
  agentWalletId: string;
  platformPoolId: string;
  totalCommission: string;
  agentShare: string;
  platformShare: string;
  currency: string;
  correlationId: string;
  commissionVersionId?: string;
}): JournalTemplate {
  return {
    txn_type: 'COMMISSION_SPLIT',
    currency: params.currency,
    correlation_id: params.correlationId,
    description: `Commission split: agent=${params.agentShare}, platform=${params.platformShare}`,
    commission_version_id: params.commissionVersionId,
    entries: [
      { account_id: params.commissionsPayableId, entry_type: 'DR', amount: params.totalCommission, description: 'Commission expense' },
      { account_id: params.agentWalletId, entry_type: 'CR', amount: params.agentShare, description: 'Agent commission' },
      { account_id: params.platformPoolId, entry_type: 'CR', amount: params.platformShare, description: 'Platform commission share' },
    ],
  };
}

/**
 * C4: Tax withholding on merchant payout.
 *   Dr MERCHANT_WALLET (tax amount)
 *   Cr TAX_PAYABLE (tax amount)
 */
export function buildTaxWithholdingTemplate(params: {
  merchantWalletId: string;
  taxPayableAccountId: string;
  taxAmount: string;
  currency: string;
  correlationId: string;
}): JournalTemplate {
  return {
    txn_type: 'TAX_WITHHOLDING',
    currency: params.currency,
    correlation_id: params.correlationId,
    description: `Tax withholding: amount=${params.taxAmount}`,
    entries: [
      { account_id: params.merchantWalletId, entry_type: 'DR', amount: params.taxAmount, description: 'Withhold tax from merchant' },
      { account_id: params.taxPayableAccountId, entry_type: 'CR', amount: params.taxAmount, description: 'Tax payable' },
    ],
  };
}

/**
 * C5: Holdback reserve (Section J).
 * On payment receipt, reserve holdback:
 *   Dr MERCHANT_WALLET (holdback amount)
 *   Cr MERCHANT_HOLDBACK_RESERVE (holdback amount)
 * On release:
 *   Dr MERCHANT_HOLDBACK_RESERVE (release amount)
 *   Cr MERCHANT_WALLET (release amount)
 */
export function buildHoldbackReserveTemplate(params: {
  merchantWalletId: string;
  holdbackReserveId: string;
  amount: string;
  currency: string;
  correlationId: string;
  isRelease: boolean;
}): JournalTemplate {
  if (params.isRelease) {
    return {
      txn_type: 'HOLDBACK_RELEASE',
      currency: params.currency,
      correlation_id: params.correlationId,
      description: `Holdback release: amount=${params.amount}`,
      entries: [
        { account_id: params.holdbackReserveId, entry_type: 'DR', amount: params.amount, description: 'Release holdback reserve' },
        { account_id: params.merchantWalletId, entry_type: 'CR', amount: params.amount, description: 'Credit merchant wallet' },
      ],
    };
  }
  return {
    txn_type: 'HOLDBACK_RESERVE',
    currency: params.currency,
    correlation_id: params.correlationId,
    description: `Holdback reserve: amount=${params.amount}`,
    entries: [
      { account_id: params.merchantWalletId, entry_type: 'DR', amount: params.amount, description: 'Debit merchant for holdback' },
      { account_id: params.holdbackReserveId, entry_type: 'CR', amount: params.amount, description: 'Credit holdback reserve' },
    ],
  };
}

/**
 * C6: Rounding adjustment (Section W).
 * Posts rounding difference to ROUNDING_ADJUSTMENT account.
 *   Dr/Cr target account
 *   Cr/Dr ROUNDING_ADJUSTMENT
 */
export function buildRoundingAdjustmentTemplate(params: {
  targetAccountId: string;
  roundingAccountId: string;
  adjustmentAmount: string;
  currency: string;
  correlationId: string;
}): JournalTemplate {
  const amt = parseFloat(params.adjustmentAmount);
  if (amt === 0) {
    return {
      txn_type: 'ROUNDING_ADJUSTMENT',
      currency: params.currency,
      correlation_id: params.correlationId,
      description: 'No rounding adjustment needed',
      entries: [],
    };
  }
  const absAmount = roundHalfUp(Math.abs(amt));
  // If positive: target received more than expected → Dr target, Cr rounding
  // If negative: target received less → Dr rounding, Cr target
  return {
    txn_type: 'ROUNDING_ADJUSTMENT',
    currency: params.currency,
    correlation_id: params.correlationId,
    description: `Rounding adjustment: ${params.adjustmentAmount}`,
    entries: amt > 0
      ? [
          { account_id: params.targetAccountId, entry_type: 'DR', amount: absAmount, description: 'Rounding adjustment debit' },
          { account_id: params.roundingAccountId, entry_type: 'CR', amount: absAmount, description: 'Rounding adjustment credit' },
        ]
      : [
          { account_id: params.roundingAccountId, entry_type: 'DR', amount: absAmount, description: 'Rounding adjustment debit' },
          { account_id: params.targetAccountId, entry_type: 'CR', amount: absAmount, description: 'Rounding adjustment credit' },
        ],
  };
}

/**
 * Validates that a journal template is balanced (total DR == total CR).
 */
export function validateJournalBalance(template: JournalTemplate): boolean {
  if (template.entries.length === 0) return true;
  let totalDR = 0;
  let totalCR = 0;
  for (const entry of template.entries) {
    const amt = parseFloat(entry.amount);
    if (entry.entry_type === 'DR') totalDR += amt;
    else totalCR += amt;
  }
  // Allow tiny floating-point tolerance
  return Math.abs(totalDR - totalCR) < 0.005;
}

/**
 * Validates that all entries in a template use the same currency as the template.
 */
export function validateJournalCurrency(template: JournalTemplate): boolean {
  // All entries inherit the template currency – this validates the template has a currency set
  return !!template.currency && template.currency.length >= 3;
}
