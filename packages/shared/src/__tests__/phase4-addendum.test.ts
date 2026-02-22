/**
 * Phase 4 Addendum hardening tests.
 * Tests for: state machines, rounding, journal templates, reconciliation engine,
 * fraud rule coverage, beneficiary flow, currency anomaly.
 */
import { describe, it, expect } from 'vitest';
import {
  // State machines
  InvalidTransitionError,
  validateStatementEntryTransition,
  validateExternalTransferTransition,
  validateSettlementBatchTransition,
  validatePayoutTransition,
  validateBeneficiaryTransition,
  validateReconciliationCaseTransition,
  // Rounding
  roundHalfUp,
  isValidBBDAmount,
  computeRoundingAdjustment,
  getNextBusinessDayAST,
  isPastSettlementCutoff,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_RETRY_CONFIG,
  IDEMPOTENCY_TTL,
  // Journal templates
  buildDepositWithFeeTemplate,
  buildSettlementFeeTemplate,
  buildCommissionSplitTemplate,
  buildTaxWithholdingTemplate,
  buildHoldbackReserveTemplate,
  buildRoundingAdjustmentTemplate,
  validateJournalBalance,
  validateJournalCurrency,
  // Reconciliation engine
  matchLineItem,
  matchBatch,
  getBatchMatchStatus,
  shouldEscalateUnmatched,
  classifyCaseType,
  // Enums
  StatementEntryStatus,
  ExternalTransferStatus,
  BeneficiaryStatus,
  SettlementBatchStatus,
  PayoutStatus,
  ReconciliationCaseStatus,
  FraudContextType,
  FraudDecision,
  FraudSignalType,
  SettlementNettingMode,
  SettlementFeeMode,
  BeneficiaryVerificationStatus,
  DataRetentionCategory,
  FraudCaseOutcome,
  ReconciliationCaseType,
  ReconciliationMatchMethod,
  // Fraud engine
  evaluateFraudRules,
  DEFAULT_FRAUD_RULES,
  // Types
  STUB_FRAUD_SCORING_PROVIDER,
} from '@caricash/shared';
import type { BankStatementEntry, ExternalTransfer, FraudRule } from '@caricash/shared';

// ── State machine tests (Section T) ────────────────────────────────────────

describe('State Machine: StatementEntry (Section A2)', () => {
  it('allows NEW → CANDIDATE_MATCHED', () => {
    expect(() => validateStatementEntryTransition('NEW', 'CANDIDATE_MATCHED')).not.toThrow();
  });

  it('allows NEW → UNMATCHED', () => {
    expect(() => validateStatementEntryTransition('NEW', 'UNMATCHED')).not.toThrow();
  });

  it('allows CANDIDATE_MATCHED → MATCHED', () => {
    expect(() => validateStatementEntryTransition('CANDIDATE_MATCHED', 'MATCHED')).not.toThrow();
  });

  it('allows CANDIDATE_MATCHED → PARTIAL_MATCHED', () => {
    expect(() => validateStatementEntryTransition('CANDIDATE_MATCHED', 'PARTIAL_MATCHED')).not.toThrow();
  });

  it('allows UNMATCHED → DISPUTED', () => {
    expect(() => validateStatementEntryTransition('UNMATCHED', 'DISPUTED')).not.toThrow();
  });

  it('allows DISPUTED → RESOLVED', () => {
    expect(() => validateStatementEntryTransition('DISPUTED', 'RESOLVED')).not.toThrow();
  });

  it('allows ANY → ESCALATED from NEW', () => {
    expect(() => validateStatementEntryTransition('NEW', 'ESCALATED')).not.toThrow();
  });

  it('rejects SETTLED → anything', () => {
    expect(() => validateStatementEntryTransition('SETTLED', 'NEW'))
      .toThrow(InvalidTransitionError);
  });

  it('rejects invalid transition RESOLVED → NEW', () => {
    expect(() => validateStatementEntryTransition('RESOLVED', 'NEW'))
      .toThrow(InvalidTransitionError);
  });
});

describe('State Machine: ExternalTransfer', () => {
  it('allows CREATED → PENDING', () => {
    expect(() => validateExternalTransferTransition('CREATED', 'PENDING')).not.toThrow();
  });

  it('allows PENDING → SETTLED', () => {
    expect(() => validateExternalTransferTransition('PENDING', 'SETTLED')).not.toThrow();
  });

  it('allows PENDING → ANOMALY_CURRENCY (Section D)', () => {
    expect(() => validateExternalTransferTransition('PENDING', 'ANOMALY_CURRENCY')).not.toThrow();
  });

  it('rejects SETTLED → PENDING', () => {
    expect(() => validateExternalTransferTransition('SETTLED', 'PENDING'))
      .toThrow(InvalidTransitionError);
  });

  it('allows FAILED → CREATED (retry)', () => {
    expect(() => validateExternalTransferTransition('FAILED', 'CREATED')).not.toThrow();
  });
});

describe('State Machine: SettlementBatch', () => {
  it('allows CREATED → READY → REQUESTED → PROCESSING → COMPLETED', () => {
    expect(() => validateSettlementBatchTransition('CREATED', 'READY')).not.toThrow();
    expect(() => validateSettlementBatchTransition('READY', 'REQUESTED')).not.toThrow();
    expect(() => validateSettlementBatchTransition('REQUESTED', 'PROCESSING')).not.toThrow();
    expect(() => validateSettlementBatchTransition('PROCESSING', 'COMPLETED')).not.toThrow();
  });

  it('rejects COMPLETED → anything', () => {
    expect(() => validateSettlementBatchTransition('COMPLETED', 'CREATED'))
      .toThrow(InvalidTransitionError);
  });
});

describe('State Machine: Payout', () => {
  it('allows REQUESTED → APPROVED → PENDING → SETTLED', () => {
    expect(() => validatePayoutTransition('REQUESTED', 'APPROVED')).not.toThrow();
    expect(() => validatePayoutTransition('APPROVED', 'PENDING')).not.toThrow();
    expect(() => validatePayoutTransition('PENDING', 'SETTLED')).not.toThrow();
  });

  it('rejects SETTLED → REQUESTED', () => {
    expect(() => validatePayoutTransition('SETTLED', 'REQUESTED'))
      .toThrow(InvalidTransitionError);
  });
});

describe('State Machine: Beneficiary (Section E)', () => {
  it('full flow: DRAFT → PENDING_VERIFICATION → PENDING_APPROVAL → ACTIVE', () => {
    expect(() => validateBeneficiaryTransition('DRAFT', 'PENDING_VERIFICATION')).not.toThrow();
    expect(() => validateBeneficiaryTransition('PENDING_VERIFICATION', 'PENDING_APPROVAL')).not.toThrow();
    expect(() => validateBeneficiaryTransition('PENDING_APPROVAL', 'ACTIVE')).not.toThrow();
  });

  it('update flow: ACTIVE → UPDATE_PENDING_VERIFICATION → UPDATE_PENDING_APPROVAL → ACTIVE', () => {
    expect(() => validateBeneficiaryTransition('ACTIVE', 'UPDATE_PENDING_VERIFICATION')).not.toThrow();
    expect(() => validateBeneficiaryTransition('UPDATE_PENDING_VERIFICATION', 'UPDATE_PENDING_APPROVAL')).not.toThrow();
    expect(() => validateBeneficiaryTransition('UPDATE_PENDING_APPROVAL', 'ACTIVE')).not.toThrow();
  });

  it('rejects REJECTED → ACTIVE', () => {
    expect(() => validateBeneficiaryTransition('REJECTED', 'ACTIVE'))
      .toThrow(InvalidTransitionError);
  });
});

describe('State Machine: ReconciliationCase', () => {
  it('allows OPEN → INVESTIGATING → RESOLVED', () => {
    expect(() => validateReconciliationCaseTransition('OPEN', 'INVESTIGATING')).not.toThrow();
    expect(() => validateReconciliationCaseTransition('INVESTIGATING', 'RESOLVED')).not.toThrow();
  });

  it('rejects RESOLVED → anything', () => {
    expect(() => validateReconciliationCaseTransition('RESOLVED', 'OPEN'))
      .toThrow(InvalidTransitionError);
  });
});

// ── Rounding tests (Section W) ─────────────────────────────────────────────

describe('Rounding (Section W)', () => {
  it('rounds to 2 decimal places with HALF_UP', () => {
    expect(roundHalfUp('100.125')).toBe('100.13');
    expect(roundHalfUp('100.124')).toBe('100.12');
    expect(roundHalfUp('99.995')).toBe('100.00');
  });

  it('handles whole numbers', () => {
    expect(roundHalfUp('100')).toBe('100.00');
    expect(roundHalfUp(50)).toBe('50.00');
  });

  it('throws on invalid input', () => {
    expect(() => roundHalfUp('abc')).toThrow(RangeError);
    expect(() => roundHalfUp(Infinity)).toThrow(RangeError);
  });

  it('validates BBD amounts', () => {
    expect(isValidBBDAmount('100.00')).toBe(true);
    expect(isValidBBDAmount('100.5')).toBe(true);
    expect(isValidBBDAmount('100')).toBe(true);
    expect(isValidBBDAmount('100.001')).toBe(false); // fractional cent
    expect(isValidBBDAmount('abc')).toBe(false);
  });

  it('computes rounding adjustment', () => {
    const adj = computeRoundingAdjustment('100.00', '100.01');
    expect(parseFloat(adj)).toBe(0.01);
  });
});

describe('Settlement timezone (Section V)', () => {
  it('getNextBusinessDayAST skips weekends', () => {
    // Friday 2026-02-20 → Monday 2026-02-23
    const friday = new Date('2026-02-20T21:00:00Z'); // 17:00 AST
    const next = getNextBusinessDayAST(friday);
    expect(next).toBe('2026-02-23');
  });

  it('isPastSettlementCutoff detects AST cutoff', () => {
    // 21:00 UTC = 17:00 AST = exactly cutoff
    const atCutoff = new Date('2026-02-22T21:00:00Z');
    expect(isPastSettlementCutoff(atCutoff)).toBe(true);

    const beforeCutoff = new Date('2026-02-22T20:59:00Z');
    expect(isPastSettlementCutoff(beforeCutoff)).toBe(false);
  });
});

// ── Default configs (Section M) ────────────────────────────────────────────

describe('Circuit breaker defaults (Section M)', () => {
  it('has correct default values', () => {
    expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.failure_threshold).toBe(5);
    expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.window_ms).toBe(60_000);
    expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.reset_timeout_ms).toBe(120_000);
    expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.half_open_max_attempts).toBe(2);
  });
});

describe('Retry defaults (Section M)', () => {
  it('has correct default values', () => {
    expect(DEFAULT_RETRY_CONFIG.max_attempts).toBe(5);
    expect(DEFAULT_RETRY_CONFIG.max_delay_ms).toBe(4_000);
    expect(DEFAULT_RETRY_CONFIG.backoff_multiplier).toBe(2);
  });
});

describe('Idempotency TTL (Section B)', () => {
  it('defines all TTL categories', () => {
    expect(IDEMPOTENCY_TTL.MONEY_TX).toBe(30);
    expect(IDEMPOTENCY_TTL.BANK_TRANSFER).toBe(90);
    expect(IDEMPOTENCY_TTL.WEBHOOK_DEDUPE).toBe(180);
    expect(IDEMPOTENCY_TTL.OPS_CONFIG).toBe(365);
  });
});

// ── Journal template tests (Section C) ─────────────────────────────────────

describe('Journal Templates (Section C)', () => {
  it('C1: deposit with fee + tax is balanced', () => {
    const tmpl = buildDepositWithFeeTemplate({
      bankPoolAccountId: 'pool',
      clearingAccountId: 'clearing',
      customerWalletId: 'wallet',
      feeRevenueAccountId: 'fees',
      taxPayableAccountId: 'tax',
      grossAmount: '1000.00',
      feeAmount: '10.00',
      taxAmount: '1.50',
      currency: 'BBD',
      correlationId: 'corr-1',
    });
    expect(validateJournalBalance(tmpl)).toBe(true);
    expect(validateJournalCurrency(tmpl)).toBe(true);
    expect(tmpl.entries).toHaveLength(4);
  });

  it('C2: settlement fee deduction is balanced', () => {
    const tmpl = buildSettlementFeeTemplate({
      merchantWalletId: 'mwallet',
      clearingOutboundId: 'clearing',
      feeRevenueAccountId: 'fees',
      grossAmount: '5000.00',
      feeAmount: '50.00',
      currency: 'BBD',
      correlationId: 'corr-2',
    });
    expect(validateJournalBalance(tmpl)).toBe(true);
    expect(tmpl.entries).toHaveLength(3);
  });

  it('C3: commission split is balanced', () => {
    const tmpl = buildCommissionSplitTemplate({
      commissionsPayableId: 'comm',
      agentWalletId: 'agent',
      platformPoolId: 'platform',
      totalCommission: '100.00',
      agentShare: '70.00',
      platformShare: '30.00',
      currency: 'BBD',
      correlationId: 'corr-3',
    });
    expect(validateJournalBalance(tmpl)).toBe(true);
  });

  it('C4: tax withholding is balanced', () => {
    const tmpl = buildTaxWithholdingTemplate({
      merchantWalletId: 'mwallet',
      taxPayableAccountId: 'tax',
      taxAmount: '25.00',
      currency: 'BBD',
      correlationId: 'corr-4',
    });
    expect(validateJournalBalance(tmpl)).toBe(true);
  });

  it('C5: holdback reserve is balanced (reserve)', () => {
    const tmpl = buildHoldbackReserveTemplate({
      merchantWalletId: 'mwallet',
      holdbackReserveId: 'holdback',
      amount: '500.00',
      currency: 'BBD',
      correlationId: 'corr-5',
      isRelease: false,
    });
    expect(validateJournalBalance(tmpl)).toBe(true);
    expect(tmpl.txn_type).toBe('HOLDBACK_RESERVE');
  });

  it('C5: holdback release is balanced', () => {
    const tmpl = buildHoldbackReserveTemplate({
      merchantWalletId: 'mwallet',
      holdbackReserveId: 'holdback',
      amount: '500.00',
      currency: 'BBD',
      correlationId: 'corr-5r',
      isRelease: true,
    });
    expect(validateJournalBalance(tmpl)).toBe(true);
    expect(tmpl.txn_type).toBe('HOLDBACK_RELEASE');
  });

  it('C6: rounding adjustment is balanced', () => {
    const tmpl = buildRoundingAdjustmentTemplate({
      targetAccountId: 'target',
      roundingAccountId: 'rounding',
      adjustmentAmount: '0.01',
      currency: 'BBD',
      correlationId: 'corr-6',
    });
    expect(validateJournalBalance(tmpl)).toBe(true);
    expect(tmpl.entries).toHaveLength(2);
  });

  it('C6: zero rounding adjustment produces empty entries', () => {
    const tmpl = buildRoundingAdjustmentTemplate({
      targetAccountId: 'target',
      roundingAccountId: 'rounding',
      adjustmentAmount: '0',
      currency: 'BBD',
      correlationId: 'corr-6z',
    });
    expect(tmpl.entries).toHaveLength(0);
  });
});

// ── Reconciliation engine tests (Section A) ────────────────────────────────

function makeEntry(overrides: Partial<BankStatementEntry> = {}): BankStatementEntry {
  return {
    id: 'entry-1',
    statement_id: 'stmt-1',
    provider: 'CITIBANK',
    bank_account_id: 'ba-1',
    direction: 'OUTBOUND' as const,
    amount: '1000.00',
    currency: 'BBD' as any,
    value_date: '2026-02-22T12:00:00Z',
    status: 'NEW' as any,
    created_at: '2026-02-22T12:00:00Z',
    updated_at: '2026-02-22T12:00:00Z',
    ...overrides,
  };
}

function makeTransfer(overrides: Partial<ExternalTransfer> = {}): ExternalTransfer {
  return {
    id: 'xfer-1',
    provider: 'CITIBANK',
    client_reference: 'DEP-001',
    direction: 'OUTBOUND' as any,
    transfer_type: 'MERCHANT_PAYOUT' as any,
    currency: 'BBD' as any,
    amount: '1000.00',
    status: 'SETTLED' as any,
    correlation_id: 'corr-1',
    initiated_at: '2026-02-22T12:00:00Z',
    ...overrides,
  };
}

describe('Reconciliation Engine: Line-item matching', () => {
  it('matches by provider_transfer_id (priority 1)', () => {
    const entry = makeEntry({ entry_reference: 'BANK-TXN-001' });
    const transfer = makeTransfer({ provider_transfer_id: 'BANK-TXN-001' });
    const result = matchLineItem(entry, [transfer]);
    expect(result).not.toBeNull();
    expect(result!.method).toBe('PROVIDER_ID');
    expect(result!.confidence).toBe('HIGH');
  });

  it('matches by client_reference in description (priority 2)', () => {
    const entry = makeEntry({ description: 'Payment DEP-001 settled' });
    const transfer = makeTransfer({ client_reference: 'DEP-001' });
    const result = matchLineItem(entry, [transfer]);
    expect(result).not.toBeNull();
    expect(result!.method).toBe('CLIENT_REF');
  });

  it('matches by amount+time (priority 3)', () => {
    const entry = makeEntry({ amount: '500.00' });
    const transfer = makeTransfer({
      amount: '500.00',
      initiated_at: '2026-02-22T12:05:00Z',
    });
    const result = matchLineItem(entry, [transfer]);
    expect(result).not.toBeNull();
    expect(result!.method).toBe('AMOUNT_TIME');
  });

  it('returns null when no match', () => {
    const entry = makeEntry({ amount: '999.00' });
    const transfer = makeTransfer({ amount: '500.00' });
    const result = matchLineItem(entry, [transfer]);
    expect(result).toBeNull();
  });

  it('rejects cross-currency matches', () => {
    const entry = makeEntry({ entry_reference: 'BANK-001', currency: 'USD' as any });
    const transfer = makeTransfer({ provider_transfer_id: 'BANK-001', currency: 'BBD' as any });
    const result = matchLineItem(entry, [transfer]);
    expect(result).toBeNull();
  });
});

describe('Reconciliation Engine: Batch matching', () => {
  it('matches batch with exact sum', () => {
    const entry = makeEntry({ amount: '3000.00' });
    const transfers = [
      makeTransfer({ amount: '1000.00', id: 'x1' }),
      makeTransfer({ amount: '2000.00', id: 'x2' }),
    ];
    const result = matchBatch(entry, transfers);
    expect(result).not.toBeNull();
    expect(result!.method).toBe('BATCH');
    expect(result!.amountDifference).toBe('0.00');
    expect(result!.confidence).toBe('HIGH');
  });

  it('partial match when sum < entry', () => {
    const entry = makeEntry({ amount: '5000.00' });
    const transfers = [makeTransfer({ amount: '3000.00' })];
    const result = matchBatch(entry, transfers);
    expect(result).not.toBeNull();
    expect(getBatchMatchStatus(result!.amountDifference)).toBe('PARTIAL_MATCHED');
  });

  it('disputed when sum > entry', () => {
    const entry = makeEntry({ amount: '1000.00' });
    const transfers = [
      makeTransfer({ amount: '700.00', id: 'x1' }),
      makeTransfer({ amount: '500.00', id: 'x2' }),
    ];
    const result = matchBatch(entry, transfers);
    expect(result).not.toBeNull();
    expect(getBatchMatchStatus(result!.amountDifference)).toBe('DISPUTED');
  });
});

describe('Reconciliation: Unmatched escalation', () => {
  it('escalates entries older than 24h', () => {
    const old = makeEntry({ created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() });
    expect(shouldEscalateUnmatched(old)).toBe(true);
  });

  it('does not escalate recent entries', () => {
    const recent = makeEntry({ created_at: new Date().toISOString() });
    expect(shouldEscalateUnmatched(recent)).toBe(false);
  });
});

describe('Reconciliation: Case classification', () => {
  it('classifies unmatched as UNMATCHED_BANK', () => {
    expect(classifyCaseType(makeEntry(), null)).toBe('UNMATCHED_BANK');
  });

  it('classifies amount mismatch', () => {
    const match = { entry: makeEntry(), transfer: makeTransfer(), method: 'PROVIDER_ID', confidence: 'HIGH', amountDifference: '5.00' };
    expect(classifyCaseType(makeEntry(), match)).toBe('AMOUNT_MISMATCH');
  });
});

// ── Fraud engine coverage tests (Section F) ────────────────────────────────

describe('Fraud rule coverage requirements (Section F)', () => {
  const rules = DEFAULT_FRAUD_RULES.map((r, i) => ({
    ...r,
    id: `rule-${i}`,
    version_id: 'v1',
  })) as FraudRule[];

  const txnRules = rules.filter((r) => r.applies_to_context === 'TXN');
  const depositRules = rules.filter((r) => r.applies_to_context === 'BANK_DEPOSIT');
  const payoutRules = rules.filter((r) => r.applies_to_context === 'PAYOUT');

  it('has at least 6 TXN context rules', () => {
    expect(txnRules.length).toBeGreaterThanOrEqual(6);
  });

  it('has at least 6 BANK_DEPOSIT context rules', () => {
    expect(depositRules.length).toBeGreaterThanOrEqual(6);
  });

  it('has at least 8 PAYOUT context rules', () => {
    expect(payoutRules.length).toBeGreaterThanOrEqual(8);
  });

  it('all rules have reason_code', () => {
    for (const rule of rules) {
      expect(rule.reason_code).toBeTruthy();
    }
  });

  it('all rules have create_case boolean', () => {
    for (const rule of rules) {
      expect(typeof rule.create_case).toBe('boolean');
    }
  });

  it('BANK_DEPOSIT rules detect structuring', () => {
    const ctx = {
      context_type: 'BANK_DEPOSIT',
      context_id: 'dep-1',
      actor_type: 'CUSTOMER',
      actor_id: 'c-1',
      amount: '5000',
      currency: 'BBD',
      signals: [{ signal_type: 'STRUCTURING_DEPOSITS', severity: 'CRITICAL' }],
    };
    const result = evaluateFraudRules(ctx, rules);
    expect(result.decision).not.toBe('ALLOW');
    expect(result.matched_rules.some((r) => r.reason_code === 'STRUCTURING')).toBe(true);
  });

  it('PAYOUT rules block excessive refunds', () => {
    const ctx = {
      context_type: 'PAYOUT',
      context_id: 'pay-1',
      actor_type: 'MERCHANT',
      actor_id: 'm-1',
      amount: '10000',
      currency: 'BBD',
      signals: [{ signal_type: 'MERCHANT_EXCESSIVE_REFUNDS', severity: 'CRITICAL' }],
    };
    const result = evaluateFraudRules(ctx, rules);
    expect(result.decision).toBe('BLOCK');
  });
});

// ── ML/Scoring placeholder (Section H) ─────────────────────────────────────

describe('Fraud scoring provider (Section H)', () => {
  it('stub provider returns score=0.0', async () => {
    const result = await STUB_FRAUD_SCORING_PROVIDER.score({
      context_type: 'TXN',
      context_id: 'txn-1',
      actor_type: 'CUSTOMER',
      actor_id: 'c-1',
      amount: '100',
      currency: 'BBD',
      signals: [],
    });
    expect(result.score).toBe(0.0);
    expect(result.model_version).toBe('stub-v0');
    expect(result.explanation_json).toBe('{}');
  });
});

// ── New enum completeness ──────────────────────────────────────────────────

describe('Phase 4 Addendum Enums', () => {
  it('StatementEntryStatus has all 9 values', () => {
    expect(Object.values(StatementEntryStatus)).toHaveLength(9);
  });

  it('BeneficiaryStatus has full lifecycle states', () => {
    const values = Object.values(BeneficiaryStatus);
    expect(values).toContain('DRAFT');
    expect(values).toContain('PENDING_VERIFICATION');
    expect(values).toContain('PENDING_APPROVAL');
    expect(values).toContain('ACTIVE');
    expect(values).toContain('UPDATE_PENDING_VERIFICATION');
    expect(values).toContain('UPDATE_PENDING_APPROVAL');
    expect(values).toContain('REJECTED');
  });

  it('SettlementNettingMode has GROSS and NET', () => {
    expect(Object.values(SettlementNettingMode)).toEqual(['GROSS', 'NET']);
  });

  it('SettlementFeeMode has both modes', () => {
    expect(Object.values(SettlementFeeMode)).toEqual(['DEDUCT_FROM_PAYOUT', 'CHARGE_SEPARATELY']);
  });

  it('FraudCaseOutcome has all 3 values', () => {
    expect(Object.values(FraudCaseOutcome)).toEqual(['TRUE_POSITIVE', 'FALSE_POSITIVE', 'INCONCLUSIVE']);
  });

  it('DataRetentionCategory has all categories', () => {
    expect(Object.values(DataRetentionCategory)).toHaveLength(6);
  });

  it('ReconciliationCaseType has all 7 types', () => {
    expect(Object.values(ReconciliationCaseType)).toHaveLength(7);
  });

  it('BeneficiaryVerificationStatus has all 4 states', () => {
    expect(Object.values(BeneficiaryVerificationStatus)).toHaveLength(4);
  });

  it('FraudSignalType has deposit-specific signals', () => {
    expect(FraudSignalType.STRUCTURING_DEPOSITS).toBe('STRUCTURING_DEPOSITS');
    expect(FraudSignalType.DEPOSIT_RAPID_WITHDRAWAL).toBe('DEPOSIT_RAPID_WITHDRAWAL');
    expect(FraudSignalType.HIGH_FREQUENCY_DEPOSITS).toBe('HIGH_FREQUENCY_DEPOSITS');
  });
});
