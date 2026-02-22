export const ActorType = { CUSTOMER: 'CUSTOMER', AGENT: 'AGENT', MERCHANT: 'MERCHANT', STAFF: 'STAFF' } as const;
export type ActorType = typeof ActorType[keyof typeof ActorType];

export const AgentType = { STANDARD: 'STANDARD', AGGREGATOR: 'AGGREGATOR' } as const;
export type AgentType = typeof AgentType[keyof typeof AgentType];

export const TxnType = {
  DEPOSIT: 'DEPOSIT', WITHDRAWAL: 'WITHDRAWAL', P2P: 'P2P',
  PAYMENT: 'PAYMENT', B2B: 'B2B', REVERSAL: 'REVERSAL',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT', OVERDRAFT_DRAW: 'OVERDRAFT_DRAW',
  FLOAT_TOP_UP: 'FLOAT_TOP_UP', FLOAT_WITHDRAWAL: 'FLOAT_WITHDRAWAL',
} as const;
export type TxnType = typeof TxnType[keyof typeof TxnType];

export const AccountType = {
  WALLET: 'WALLET', FEE_REVENUE: 'FEE_REVENUE', TAX_PAYABLE: 'TAX_PAYABLE',
  COMMISSIONS_PAYABLE: 'COMMISSIONS_PAYABLE', OVERDRAFT_FACILITY: 'OVERDRAFT_FACILITY',
  SUSPENSE: 'SUSPENSE', CASH_FLOAT: 'CASH_FLOAT',
} as const;
export type AccountType = typeof AccountType[keyof typeof AccountType];

export const TxnState = {
  INITIATED: 'INITIATED', VALIDATED: 'VALIDATED', AUTHORIZED: 'AUTHORIZED',
  POSTED: 'POSTED', COMPLETED: 'COMPLETED', FAILED: 'FAILED',
  REVERSED: 'REVERSED', PENDING_APPROVAL: 'PENDING_APPROVAL',
} as const;
export type TxnState = typeof TxnState[keyof typeof TxnState];

export const ApprovalState = {
  PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED', EXPIRED: 'EXPIRED',
} as const;
export type ApprovalState = typeof ApprovalState[keyof typeof ApprovalState];

export const PolicyState = {
  DRAFT: 'DRAFT', ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE', ARCHIVED: 'ARCHIVED',
} as const;
export type PolicyState = typeof PolicyState[keyof typeof PolicyState];

export const WorkflowState = {
  STAGE_PENDING: 'STAGE_PENDING',
  STAGE_COMPLETE: 'STAGE_COMPLETE',
  ALL_STAGES_COMPLETE: 'ALL_STAGES_COMPLETE',
  ESCALATED: 'ESCALATED',
  EXPIRED: 'EXPIRED',
} as const;
export type WorkflowState = typeof WorkflowState[keyof typeof WorkflowState];

export const StageDecision = { APPROVE: 'APPROVE', REJECT: 'REJECT' } as const;
export type StageDecision = typeof StageDecision[keyof typeof StageDecision];

export const DelegationState = {
  ACTIVE: 'ACTIVE', REVOKED: 'REVOKED', EXPIRED: 'EXPIRED',
} as const;
export type DelegationState = typeof DelegationState[keyof typeof DelegationState];

export const PolicyConditionOperator = {
  EQ: 'eq', NEQ: 'neq', GT: 'gt', GTE: 'gte', LT: 'lt', LTE: 'lte',
  IN: 'in', NOT_IN: 'not_in', CONTAINS: 'contains', REGEX: 'regex',
  BETWEEN: 'between', EXISTS: 'exists',
} as const;
export type PolicyConditionOperator = typeof PolicyConditionOperator[keyof typeof PolicyConditionOperator];

export const PolicyBindingType = {
  ACTOR: 'actor', ACTOR_TYPE: 'actor_type', ROLE: 'role',
  HIERARCHY: 'hierarchy', BUSINESS_UNIT: 'business_unit',
  CURRENCY: 'currency', ALL: 'all',
} as const;
export type PolicyBindingType = typeof PolicyBindingType[keyof typeof PolicyBindingType];

export const ApprovalType = {
  REVERSAL_REQUESTED: 'REVERSAL_REQUESTED',
  MANUAL_ADJUSTMENT_REQUESTED: 'MANUAL_ADJUSTMENT_REQUESTED',
  FEE_MATRIX_CHANGE_REQUESTED: 'FEE_MATRIX_CHANGE_REQUESTED',
  COMMISSION_MATRIX_CHANGE_REQUESTED: 'COMMISSION_MATRIX_CHANGE_REQUESTED',
  OVERDRAFT_FACILITY_REQUESTED: 'OVERDRAFT_FACILITY_REQUESTED',
  MERCHANT_WITHDRAWAL_REQUESTED: 'MERCHANT_WITHDRAWAL_REQUESTED',
} as const;
export type ApprovalType = typeof ApprovalType[keyof typeof ApprovalType];

export const KycState = {
  NOT_STARTED: 'NOT_STARTED', PENDING: 'PENDING', APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type KycState = typeof KycState[keyof typeof KycState];

export const ActorState = {
  PENDING: 'PENDING', ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED',
  CLOSED: 'CLOSED',
} as const;
export type ActorState = typeof ActorState[keyof typeof ActorState];

export const StaffRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN', OPERATIONS: 'OPERATIONS', COMPLIANCE: 'COMPLIANCE',
  FINANCE: 'FINANCE', SUPPORT: 'SUPPORT',
} as const;
export type StaffRole = typeof StaffRole[keyof typeof StaffRole];

export const MerchantUserRole = {
  STORE_OWNER: 'store_owner', MANAGER: 'manager', CASHIER: 'cashier', VIEWER: 'viewer',
} as const;
export type MerchantUserRole = typeof MerchantUserRole[keyof typeof MerchantUserRole];

export const AgentUserRole = {
  AGENT_OWNER: 'agent_owner', MANAGER: 'manager', CASHIER: 'cashier', VIEWER: 'viewer',
} as const;
export type AgentUserRole = typeof AgentUserRole[keyof typeof AgentUserRole];

export const MerchantUserState = {
  ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED', REMOVED: 'REMOVED',
} as const;
export type MerchantUserState = typeof MerchantUserState[keyof typeof MerchantUserState];

export const AgentUserState = {
  ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED', REMOVED: 'REMOVED',
} as const;
export type AgentUserState = typeof AgentUserState[keyof typeof AgentUserState];

export const RegistrationType = {
  SELF_REGISTRATION: 'SELF_REGISTRATION',
  AGENT_REGISTRATION: 'AGENT_REGISTRATION',
  STAFF_REGISTRATION: 'STAFF_REGISTRATION',
  BULK_IMPORT: 'BULK_IMPORT',
  API_INTEGRATION: 'API_INTEGRATION',
  MERCHANT_REFERRAL: 'MERCHANT_REFERRAL',
} as const;
export type RegistrationType = typeof RegistrationType[keyof typeof RegistrationType];

export const RegistrationChannel = {
  USSD: 'USSD', APP: 'APP', WEB: 'WEB', API: 'API', PORTAL: 'PORTAL', IN_PERSON: 'IN_PERSON',
} as const;
export type RegistrationChannel = typeof RegistrationChannel[keyof typeof RegistrationChannel];

export const FloatOperationType = {
  TOP_UP: 'TOP_UP', WITHDRAWAL: 'WITHDRAWAL', ADJUSTMENT: 'ADJUSTMENT', CORRECTION: 'CORRECTION',
} as const;
export type FloatOperationType = typeof FloatOperationType[keyof typeof FloatOperationType];

// ---------------------------------------------------------------------------
// V2 Accounting Enums
// ---------------------------------------------------------------------------

export const AccountClass = {
  ASSET: 'ASSET', LIABILITY: 'LIABILITY', EQUITY: 'EQUITY', INCOME: 'INCOME', EXPENSE: 'EXPENSE',
} as const;
export type AccountClass = typeof AccountClass[keyof typeof AccountClass];

export const NormalBalance = { DR: 'DR', CR: 'CR' } as const;
export type NormalBalance = typeof NormalBalance[keyof typeof NormalBalance];

export const AccountInstanceStatus = {
  OPEN: 'OPEN', FROZEN: 'FROZEN', CLOSED: 'CLOSED',
} as const;
export type AccountInstanceStatus = typeof AccountInstanceStatus[keyof typeof AccountInstanceStatus];

export const AccountingPeriodStatus = {
  OPEN: 'OPEN', CLOSING: 'CLOSING', CLOSED: 'CLOSED', LOCKED: 'LOCKED',
} as const;
export type AccountingPeriodStatus = typeof AccountingPeriodStatus[keyof typeof AccountingPeriodStatus];

export const PostingBatchStatus = {
  OPEN: 'OPEN', POSTED: 'POSTED', REVERSED: 'REVERSED',
} as const;
export type PostingBatchStatus = typeof PostingBatchStatus[keyof typeof PostingBatchStatus];

export const SubledgerRelationshipType = {
  AGGREGATOR_CHILD: 'AGGREGATOR_CHILD', MERCHANT_STORE: 'MERCHANT_STORE',
  FRANCHISE: 'FRANCHISE', BRANCH: 'BRANCH',
} as const;
export type SubledgerRelationshipType = typeof SubledgerRelationshipType[keyof typeof SubledgerRelationshipType];

export const PreferredNameSource = {
  FIRST_NAME: 'FIRST_NAME',
  MIDDLE_NAME: 'MIDDLE_NAME',
  LAST_NAME: 'LAST_NAME',
  FULL_NAME: 'FULL_NAME',
  CUSTOM: 'CUSTOM',
} as const;
export type PreferredNameSource = typeof PreferredNameSource[keyof typeof PreferredNameSource];

// ---------------------------------------------------------------------------
// Phase 4: External Rails, Fraud, Settlement Enums
// ---------------------------------------------------------------------------

export const BankAccountPurpose = {
  CUSTOMER_DEPOSITS_HOLDING: 'CUSTOMER_DEPOSITS_HOLDING',
  MERCHANT_PAYOUTS_CLEARING: 'MERCHANT_PAYOUTS_CLEARING',
  AGENT_FLOAT_FUNDING_CLEARING: 'AGENT_FLOAT_FUNDING_CLEARING',
  FEES_REVENUE: 'FEES_REVENUE',
  TAX_PAYABLE_HOLDING: 'TAX_PAYABLE_HOLDING',
  COMMISSION_POOL: 'COMMISSION_POOL',
  OVERDRAFT_POOL: 'OVERDRAFT_POOL',
  SUSPENSE: 'SUSPENSE',
  OPERATIONS: 'OPERATIONS',
} as const;
export type BankAccountPurpose = typeof BankAccountPurpose[keyof typeof BankAccountPurpose];

export const ExternalTransferDirection = {
  INBOUND: 'INBOUND',
  OUTBOUND: 'OUTBOUND',
} as const;
export type ExternalTransferDirection = typeof ExternalTransferDirection[keyof typeof ExternalTransferDirection];

export const ExternalTransferType = {
  CUSTOMER_BANK_DEPOSIT: 'CUSTOMER_BANK_DEPOSIT',
  MERCHANT_PAYOUT: 'MERCHANT_PAYOUT',
  AGENT_FLOAT_FUND: 'AGENT_FLOAT_FUND',
  SWEEP: 'SWEEP',
  MANUAL_DISBURSEMENT: 'MANUAL_DISBURSEMENT',
} as const;
export type ExternalTransferType = typeof ExternalTransferType[keyof typeof ExternalTransferType];

export const ExternalTransferStatus = {
  CREATED: 'CREATED',
  PENDING: 'PENDING',
  SETTLED: 'SETTLED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REVERSED: 'REVERSED',
  ANOMALY_CURRENCY: 'ANOMALY_CURRENCY',
} as const;
export type ExternalTransferStatus = typeof ExternalTransferStatus[keyof typeof ExternalTransferStatus];

export const SettlementSchedule = {
  T0: 'T0',
  T1: 'T1',
  T2: 'T2',
} as const;
export type SettlementSchedule = typeof SettlementSchedule[keyof typeof SettlementSchedule];

export const SettlementMode = {
  AUTO: 'AUTO',
  MANUAL: 'MANUAL',
} as const;
export type SettlementMode = typeof SettlementMode[keyof typeof SettlementMode];

export const SettlementBatchStatus = {
  CREATED: 'CREATED',
  READY: 'READY',
  REQUESTED: 'REQUESTED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type SettlementBatchStatus = typeof SettlementBatchStatus[keyof typeof SettlementBatchStatus];

export const PayoutStatus = {
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  PENDING: 'PENDING',
  SETTLED: 'SETTLED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type PayoutStatus = typeof PayoutStatus[keyof typeof PayoutStatus];

export const FraudDecision = {
  ALLOW: 'ALLOW',
  BLOCK: 'BLOCK',
  STEP_UP: 'STEP_UP',
  HOLD: 'HOLD',
  FREEZE: 'FREEZE',
} as const;
export type FraudDecision = typeof FraudDecision[keyof typeof FraudDecision];

export const FraudSignalType = {
  NEW_DEVICE: 'NEW_DEVICE',
  DEVICE_MISMATCH: 'DEVICE_MISMATCH',
  MULTI_ACCOUNT_DEVICE: 'MULTI_ACCOUNT_DEVICE',
  RAPID_CASH_IN_OUT: 'RAPID_CASH_IN_OUT',
  HIGH_PAYOUT_FREQUENCY: 'HIGH_PAYOUT_FREQUENCY',
  BENEFICIARY_CHANGE_PRE_PAYOUT: 'BENEFICIARY_CHANGE_PRE_PAYOUT',
  REPEATED_PAYOUT_FAILURE: 'REPEATED_PAYOUT_FAILURE',
  UNUSUAL_HOUR: 'UNUSUAL_HOUR',
  VELOCITY_SPIKE: 'VELOCITY_SPIKE',
  LARGE_SINGLE_TXN: 'LARGE_SINGLE_TXN',
  DORMANT_REACTIVATION: 'DORMANT_REACTIVATION',
  GEO_ANOMALY: 'GEO_ANOMALY',
  RAPID_BENEFICIARY_ADD: 'RAPID_BENEFICIARY_ADD',
  ROUND_AMOUNT_PATTERN: 'ROUND_AMOUNT_PATTERN',
  SPLIT_TXN_PATTERN: 'SPLIT_TXN_PATTERN',
  // Section G: Deposit fraud signals
  STRUCTURING_DEPOSITS: 'STRUCTURING_DEPOSITS',
  DEPOSIT_RAPID_WITHDRAWAL: 'DEPOSIT_RAPID_WITHDRAWAL',
  NEW_BENEFICIARY_RISK: 'NEW_BENEFICIARY_RISK',
  REPEATED_FAILED_DEPOSITS: 'REPEATED_FAILED_DEPOSITS',
  SAME_BANK_SOURCE_MULTI_USER: 'SAME_BANK_SOURCE_MULTI_USER',
  HIGH_FREQUENCY_DEPOSITS: 'HIGH_FREQUENCY_DEPOSITS',
  // Payout-specific signals
  PAYOUT_AMOUNT_SPIKE: 'PAYOUT_AMOUNT_SPIKE',
  PAYOUT_NEW_BENEFICIARY: 'PAYOUT_NEW_BENEFICIARY',
  MERCHANT_EXCESSIVE_REFUNDS: 'MERCHANT_EXCESSIVE_REFUNDS',
  AGENT_SUBTREE_ANOMALY: 'AGENT_SUBTREE_ANOMALY',
} as const;
export type FraudSignalType = typeof FraudSignalType[keyof typeof FraudSignalType];

export const FraudContextType = {
  TXN: 'TXN',
  PAYOUT: 'PAYOUT',
  BANK_DEPOSIT: 'BANK_DEPOSIT',
} as const;
export type FraudContextType = typeof FraudContextType[keyof typeof FraudContextType];

export const FraudSeverity = {
  INFO: 'INFO',
  WARN: 'WARN',
  CRITICAL: 'CRITICAL',
} as const;
export type FraudSeverity = typeof FraudSeverity[keyof typeof FraudSeverity];

export const FraudRuleVersionStatus = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;
export type FraudRuleVersionStatus = typeof FraudRuleVersionStatus[keyof typeof FraudRuleVersionStatus];

export const WebhookDeliveryStatus = {
  RECEIVED: 'RECEIVED',
  PROCESSED: 'PROCESSED',
  FAILED: 'FAILED',
  DLQ: 'DLQ',
} as const;
export type WebhookDeliveryStatus = typeof WebhookDeliveryStatus[keyof typeof WebhookDeliveryStatus];

export const BeneficiaryStatus = {
  DRAFT: 'DRAFT',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  ACTIVE: 'ACTIVE',
  REJECTED: 'REJECTED',
  UPDATE_PENDING_VERIFICATION: 'UPDATE_PENDING_VERIFICATION',
  UPDATE_PENDING_APPROVAL: 'UPDATE_PENDING_APPROVAL',
} as const;
export type BeneficiaryStatus = typeof BeneficiaryStatus[keyof typeof BeneficiaryStatus];

export const CircuitBreakerState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
} as const;
export type CircuitBreakerState = typeof CircuitBreakerState[keyof typeof CircuitBreakerState];

// ---------------------------------------------------------------------------
// Phase 4 Addendum: Reconciliation, State Machines, Hardening
// ---------------------------------------------------------------------------

export const StatementEntryStatus = {
  NEW: 'NEW',
  CANDIDATE_MATCHED: 'CANDIDATE_MATCHED',
  MATCHED: 'MATCHED',
  SETTLED: 'SETTLED',
  UNMATCHED: 'UNMATCHED',
  DISPUTED: 'DISPUTED',
  RESOLVED: 'RESOLVED',
  PARTIAL_MATCHED: 'PARTIAL_MATCHED',
  ESCALATED: 'ESCALATED',
} as const;
export type StatementEntryStatus = typeof StatementEntryStatus[keyof typeof StatementEntryStatus];

export const ReconciliationMatchMethod = {
  PROVIDER_ID: 'PROVIDER_ID',
  CLIENT_REF: 'CLIENT_REF',
  AMOUNT_TIME: 'AMOUNT_TIME',
  BATCH: 'BATCH',
} as const;
export type ReconciliationMatchMethod = typeof ReconciliationMatchMethod[keyof typeof ReconciliationMatchMethod];

export const ReconciliationMatchConfidence = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
} as const;
export type ReconciliationMatchConfidence = typeof ReconciliationMatchConfidence[keyof typeof ReconciliationMatchConfidence];

export const ReconciliationCaseType = {
  UNMATCHED_BANK: 'UNMATCHED_BANK',
  UNMATCHED_TRANSFER: 'UNMATCHED_TRANSFER',
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  CURRENCY_ANOMALY: 'CURRENCY_ANOMALY',
  DUPLICATE: 'DUPLICATE',
  STUCK_TRANSFER: 'STUCK_TRANSFER',
  PARTIAL_MATCH: 'PARTIAL_MATCH',
} as const;
export type ReconciliationCaseType = typeof ReconciliationCaseType[keyof typeof ReconciliationCaseType];

export const ReconciliationCaseStatus = {
  OPEN: 'OPEN',
  INVESTIGATING: 'INVESTIGATING',
  RESOLVED: 'RESOLVED',
  ESCALATED: 'ESCALATED',
} as const;
export type ReconciliationCaseStatus = typeof ReconciliationCaseStatus[keyof typeof ReconciliationCaseStatus];

export const FraudCaseOutcome = {
  TRUE_POSITIVE: 'TRUE_POSITIVE',
  FALSE_POSITIVE: 'FALSE_POSITIVE',
  INCONCLUSIVE: 'INCONCLUSIVE',
} as const;
export type FraudCaseOutcome = typeof FraudCaseOutcome[keyof typeof FraudCaseOutcome];

export const SettlementNettingMode = {
  GROSS: 'GROSS',
  NET: 'NET',
} as const;
export type SettlementNettingMode = typeof SettlementNettingMode[keyof typeof SettlementNettingMode];

export const SettlementFeeMode = {
  DEDUCT_FROM_PAYOUT: 'DEDUCT_FROM_PAYOUT',
  CHARGE_SEPARATELY: 'CHARGE_SEPARATELY',
} as const;
export type SettlementFeeMode = typeof SettlementFeeMode[keyof typeof SettlementFeeMode];

export const BeneficiaryVerificationStatus = {
  DRAFT: 'DRAFT',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  VERIFIED: 'VERIFIED',
  FAILED: 'FAILED',
} as const;
export type BeneficiaryVerificationStatus = typeof BeneficiaryVerificationStatus[keyof typeof BeneficiaryVerificationStatus];

export const DataRetentionCategory = {
  LEDGER: 'LEDGER',
  AUDIT: 'AUDIT',
  WEBHOOKS: 'WEBHOOKS',
  FRAUD: 'FRAUD',
  RECONCILIATION: 'RECONCILIATION',
  IDEMPOTENCY: 'IDEMPOTENCY',
} as const;
export type DataRetentionCategory = typeof DataRetentionCategory[keyof typeof DataRetentionCategory];
