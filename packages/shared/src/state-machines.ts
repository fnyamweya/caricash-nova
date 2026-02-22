/**
 * State machine transition validators (Section T).
 *
 * Every status field must have defined states, valid transitions,
 * transition triggers, and invalid-transition protection.
 */

import {
  StatementEntryStatus,
  ExternalTransferStatus,
  SettlementBatchStatus,
  PayoutStatus,
  BeneficiaryStatus,
  ReconciliationCaseStatus,
} from './enums.js';

export class InvalidTransitionError extends Error {
  constructor(
    public readonly entity: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Invalid ${entity} transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

type TransitionMap = Record<string, readonly string[]>;

function createValidator(entity: string, transitions: TransitionMap) {
  return function validate(from: string, to: string): void {
    const allowed = transitions[from];
    if (!allowed || !allowed.includes(to)) {
      throw new InvalidTransitionError(entity, from, to);
    }
  };
}

// ── A2: Statement entry status state machine ────────────────────────────────

const STATEMENT_ENTRY_TRANSITIONS: TransitionMap = {
  [StatementEntryStatus.NEW]: [
    StatementEntryStatus.CANDIDATE_MATCHED,
    StatementEntryStatus.UNMATCHED,
    StatementEntryStatus.ESCALATED,
  ],
  [StatementEntryStatus.CANDIDATE_MATCHED]: [
    StatementEntryStatus.MATCHED,
    StatementEntryStatus.PARTIAL_MATCHED,
    StatementEntryStatus.UNMATCHED,
    StatementEntryStatus.ESCALATED,
  ],
  [StatementEntryStatus.PARTIAL_MATCHED]: [
    StatementEntryStatus.MATCHED,
    StatementEntryStatus.DISPUTED,
    StatementEntryStatus.ESCALATED,
  ],
  [StatementEntryStatus.MATCHED]: [
    StatementEntryStatus.SETTLED,
    StatementEntryStatus.ESCALATED,
  ],
  [StatementEntryStatus.SETTLED]: [],
  [StatementEntryStatus.UNMATCHED]: [
    StatementEntryStatus.CANDIDATE_MATCHED,
    StatementEntryStatus.DISPUTED,
    StatementEntryStatus.ESCALATED,
  ],
  [StatementEntryStatus.DISPUTED]: [
    StatementEntryStatus.RESOLVED,
    StatementEntryStatus.ESCALATED,
  ],
  [StatementEntryStatus.RESOLVED]: [],
  [StatementEntryStatus.ESCALATED]: [
    StatementEntryStatus.RESOLVED,
  ],
};

export const validateStatementEntryTransition = createValidator(
  'StatementEntry',
  STATEMENT_ENTRY_TRANSITIONS,
);

// ── External transfer status state machine ──────────────────────────────────

const EXTERNAL_TRANSFER_TRANSITIONS: TransitionMap = {
  [ExternalTransferStatus.CREATED]: [
    ExternalTransferStatus.PENDING,
    ExternalTransferStatus.FAILED,
    ExternalTransferStatus.CANCELLED,
    ExternalTransferStatus.ANOMALY_CURRENCY,
  ],
  [ExternalTransferStatus.PENDING]: [
    ExternalTransferStatus.SETTLED,
    ExternalTransferStatus.FAILED,
    ExternalTransferStatus.CANCELLED,
    ExternalTransferStatus.ANOMALY_CURRENCY,
  ],
  [ExternalTransferStatus.SETTLED]: [
    ExternalTransferStatus.REVERSED,
  ],
  [ExternalTransferStatus.FAILED]: [
    ExternalTransferStatus.CREATED, // retry
  ],
  [ExternalTransferStatus.CANCELLED]: [],
  [ExternalTransferStatus.REVERSED]: [],
  [ExternalTransferStatus.ANOMALY_CURRENCY]: [],
};

export const validateExternalTransferTransition = createValidator(
  'ExternalTransfer',
  EXTERNAL_TRANSFER_TRANSITIONS,
);

// ── Settlement batch status state machine ───────────────────────────────────

const SETTLEMENT_BATCH_TRANSITIONS: TransitionMap = {
  [SettlementBatchStatus.CREATED]: [
    SettlementBatchStatus.READY,
    SettlementBatchStatus.FAILED,
  ],
  [SettlementBatchStatus.READY]: [
    SettlementBatchStatus.REQUESTED,
    SettlementBatchStatus.FAILED,
  ],
  [SettlementBatchStatus.REQUESTED]: [
    SettlementBatchStatus.PROCESSING,
    SettlementBatchStatus.FAILED,
  ],
  [SettlementBatchStatus.PROCESSING]: [
    SettlementBatchStatus.COMPLETED,
    SettlementBatchStatus.FAILED,
  ],
  [SettlementBatchStatus.COMPLETED]: [],
  [SettlementBatchStatus.FAILED]: [
    SettlementBatchStatus.CREATED, // retry
  ],
};

export const validateSettlementBatchTransition = createValidator(
  'SettlementBatch',
  SETTLEMENT_BATCH_TRANSITIONS,
);

// ── Payout status state machine ─────────────────────────────────────────────

const PAYOUT_TRANSITIONS: TransitionMap = {
  [PayoutStatus.REQUESTED]: [
    PayoutStatus.APPROVED,
    PayoutStatus.CANCELLED,
  ],
  [PayoutStatus.APPROVED]: [
    PayoutStatus.PENDING,
    PayoutStatus.CANCELLED,
  ],
  [PayoutStatus.PENDING]: [
    PayoutStatus.SETTLED,
    PayoutStatus.FAILED,
  ],
  [PayoutStatus.SETTLED]: [],
  [PayoutStatus.FAILED]: [
    PayoutStatus.REQUESTED, // retry
  ],
  [PayoutStatus.CANCELLED]: [],
};

export const validatePayoutTransition = createValidator(
  'Payout',
  PAYOUT_TRANSITIONS,
);

// ── Beneficiary status state machine (Section E) ────────────────────────────

const BENEFICIARY_TRANSITIONS: TransitionMap = {
  [BeneficiaryStatus.DRAFT]: [
    BeneficiaryStatus.PENDING_VERIFICATION,
    BeneficiaryStatus.REJECTED,
  ],
  [BeneficiaryStatus.PENDING_VERIFICATION]: [
    BeneficiaryStatus.PENDING_APPROVAL,
    BeneficiaryStatus.REJECTED,
  ],
  [BeneficiaryStatus.PENDING_APPROVAL]: [
    BeneficiaryStatus.ACTIVE,
    BeneficiaryStatus.REJECTED,
  ],
  [BeneficiaryStatus.ACTIVE]: [
    BeneficiaryStatus.UPDATE_PENDING_VERIFICATION,
    BeneficiaryStatus.REJECTED,
  ],
  [BeneficiaryStatus.UPDATE_PENDING_VERIFICATION]: [
    BeneficiaryStatus.UPDATE_PENDING_APPROVAL,
    BeneficiaryStatus.ACTIVE, // revert
    BeneficiaryStatus.REJECTED,
  ],
  [BeneficiaryStatus.UPDATE_PENDING_APPROVAL]: [
    BeneficiaryStatus.ACTIVE,
    BeneficiaryStatus.REJECTED,
  ],
  [BeneficiaryStatus.REJECTED]: [],
};

export const validateBeneficiaryTransition = createValidator(
  'Beneficiary',
  BENEFICIARY_TRANSITIONS,
);

// ── Reconciliation case status ──────────────────────────────────────────────

const RECON_CASE_TRANSITIONS: TransitionMap = {
  [ReconciliationCaseStatus.OPEN]: [
    ReconciliationCaseStatus.INVESTIGATING,
    ReconciliationCaseStatus.RESOLVED,
    ReconciliationCaseStatus.ESCALATED,
  ],
  [ReconciliationCaseStatus.INVESTIGATING]: [
    ReconciliationCaseStatus.RESOLVED,
    ReconciliationCaseStatus.ESCALATED,
  ],
  [ReconciliationCaseStatus.ESCALATED]: [
    ReconciliationCaseStatus.INVESTIGATING,
    ReconciliationCaseStatus.RESOLVED,
  ],
  [ReconciliationCaseStatus.RESOLVED]: [],
};

export const validateReconciliationCaseTransition = createValidator(
  'ReconciliationCase',
  RECON_CASE_TRANSITIONS,
);
