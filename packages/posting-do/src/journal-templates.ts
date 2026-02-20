/**
 * Deterministic journal line builders for each transaction type.
 * Every function returns a balanced set of entries (sum DR === sum CR).
 */

export interface Entry {
  account_id: string;
  entry_type: 'DR' | 'CR';
  amount: string;
  description?: string;
}

export interface CommissionEntry {
  feeRevenueAccountId: string;
  agentCommissionAccountId: string;
  amount: string;
}

// ---------------------------------------------------------------------------
// Deposit: Agent cash-float → Customer wallet
// ---------------------------------------------------------------------------

export function buildDepositEntries(
  agentCashFloatAccountId: string,
  customerWalletAccountId: string,
  amount: string,
  feeAccountId?: string,
  feeAmount?: string,
  commissionEntries?: CommissionEntry[],
): Entry[] {
  const entries: Entry[] = [
    { account_id: agentCashFloatAccountId, entry_type: 'DR', amount, description: 'Deposit from agent' },
    { account_id: customerWalletAccountId, entry_type: 'CR', amount, description: 'Deposit to wallet' },
  ];

  if (feeAccountId && feeAmount && feeAmount !== '0.00') {
    entries.push(
      { account_id: customerWalletAccountId, entry_type: 'DR', amount: feeAmount, description: 'Deposit fee' },
      { account_id: feeAccountId, entry_type: 'CR', amount: feeAmount, description: 'Fee revenue' },
    );
  }

  if (commissionEntries) {
    for (const c of commissionEntries) {
      entries.push(
        { account_id: c.feeRevenueAccountId, entry_type: 'DR', amount: c.amount, description: 'Commission from fee revenue' },
        { account_id: c.agentCommissionAccountId, entry_type: 'CR', amount: c.amount, description: 'Agent commission payable' },
      );
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Withdrawal: Customer wallet → Agent cash-float
// ---------------------------------------------------------------------------

export function buildWithdrawalEntries(
  customerWalletAccountId: string,
  agentCashFloatAccountId: string,
  amount: string,
  feeAccountId?: string,
  feeAmount?: string,
  commissionEntries?: CommissionEntry[],
): Entry[] {
  const entries: Entry[] = [
    { account_id: customerWalletAccountId, entry_type: 'DR', amount, description: 'Withdrawal from wallet' },
    { account_id: agentCashFloatAccountId, entry_type: 'CR', amount, description: 'Withdrawal to agent' },
  ];

  if (feeAccountId && feeAmount && feeAmount !== '0.00') {
    entries.push(
      { account_id: customerWalletAccountId, entry_type: 'DR', amount: feeAmount, description: 'Withdrawal fee' },
      { account_id: feeAccountId, entry_type: 'CR', amount: feeAmount, description: 'Fee revenue' },
    );
  }

  if (commissionEntries) {
    for (const c of commissionEntries) {
      entries.push(
        { account_id: c.feeRevenueAccountId, entry_type: 'DR', amount: c.amount, description: 'Commission from fee revenue' },
        { account_id: c.agentCommissionAccountId, entry_type: 'CR', amount: c.amount, description: 'Agent commission payable' },
      );
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// P2P: Sender wallet → Receiver wallet
// ---------------------------------------------------------------------------

export function buildP2PEntries(
  senderWalletAccountId: string,
  receiverWalletAccountId: string,
  amount: string,
  feeAccountId?: string,
  feeAmount?: string,
): Entry[] {
  const entries: Entry[] = [
    { account_id: senderWalletAccountId, entry_type: 'DR', amount, description: 'P2P transfer sent' },
    { account_id: receiverWalletAccountId, entry_type: 'CR', amount, description: 'P2P transfer received' },
  ];

  if (feeAccountId && feeAmount && feeAmount !== '0.00') {
    entries.push(
      { account_id: senderWalletAccountId, entry_type: 'DR', amount: feeAmount, description: 'Transfer fee' },
      { account_id: feeAccountId, entry_type: 'CR', amount: feeAmount, description: 'Fee revenue' },
    );
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Payment: Customer wallet → Merchant wallet
// ---------------------------------------------------------------------------

export function buildPaymentEntries(
  customerWalletAccountId: string,
  merchantWalletAccountId: string,
  amount: string,
  feeAccountId?: string,
  feeAmount?: string,
): Entry[] {
  const entries: Entry[] = [
    { account_id: customerWalletAccountId, entry_type: 'DR', amount, description: 'Payment sent' },
    { account_id: merchantWalletAccountId, entry_type: 'CR', amount, description: 'Payment received' },
  ];

  if (feeAccountId && feeAmount && feeAmount !== '0.00') {
    entries.push(
      { account_id: customerWalletAccountId, entry_type: 'DR', amount: feeAmount, description: 'Payment fee' },
      { account_id: feeAccountId, entry_type: 'CR', amount: feeAmount, description: 'Fee revenue' },
    );
  }

  return entries;
}

// ---------------------------------------------------------------------------
// B2B: Sender merchant → Receiver merchant
// ---------------------------------------------------------------------------

export function buildB2BEntries(
  senderMerchantAccountId: string,
  receiverMerchantAccountId: string,
  amount: string,
  feeAccountId?: string,
  feeAmount?: string,
): Entry[] {
  const entries: Entry[] = [
    { account_id: senderMerchantAccountId, entry_type: 'DR', amount, description: 'B2B transfer sent' },
    { account_id: receiverMerchantAccountId, entry_type: 'CR', amount, description: 'B2B transfer received' },
  ];

  if (feeAccountId && feeAmount && feeAmount !== '0.00') {
    entries.push(
      { account_id: senderMerchantAccountId, entry_type: 'DR', amount: feeAmount, description: 'B2B fee' },
      { account_id: feeAccountId, entry_type: 'CR', amount: feeAmount, description: 'Fee revenue' },
    );
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Reversal: Swap DR ↔ CR on all original entries
// ---------------------------------------------------------------------------

export function buildReversalEntries(originalEntries: Entry[]): Entry[] {
  return originalEntries.map((e) => ({
    account_id: e.account_id,
    entry_type: e.entry_type === 'DR' ? 'CR' as const : 'DR' as const,
    amount: e.amount,
    description: `Reversal: ${e.description ?? ''}`.trim(),
  }));
}
