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
  STORE_OWNER: 'store_owner', STORE_ADMIN: 'store_admin', STORE_SUPERVISOR: 'store_supervisor',
  MANAGER: 'manager', CASHIER: 'cashier', VIEWER: 'viewer',
} as const;
export type MerchantUserRole = typeof MerchantUserRole[keyof typeof MerchantUserRole];

export const MerchantStoreStatus = {
  ACTIVE: 'active', SUSPENDED: 'suspended', CLOSED: 'closed',
} as const;
export type MerchantStoreStatus = typeof MerchantStoreStatus[keyof typeof MerchantStoreStatus];

export const StorePaymentNodeStatus = {
  ACTIVE: 'active', SUSPENDED: 'suspended', CLOSED: 'closed',
} as const;
export type StorePaymentNodeStatus = typeof StorePaymentNodeStatus[keyof typeof StorePaymentNodeStatus];

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
