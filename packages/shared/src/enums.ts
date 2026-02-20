export const ActorType = { CUSTOMER: 'CUSTOMER', AGENT: 'AGENT', MERCHANT: 'MERCHANT', STAFF: 'STAFF' } as const;
export type ActorType = typeof ActorType[keyof typeof ActorType];

export const AgentType = { STANDARD: 'STANDARD', AGGREGATOR: 'AGGREGATOR' } as const;
export type AgentType = typeof AgentType[keyof typeof AgentType];

export const TxnType = {
  DEPOSIT: 'DEPOSIT', WITHDRAWAL: 'WITHDRAWAL', P2P: 'P2P',
  PAYMENT: 'PAYMENT', B2B: 'B2B', REVERSAL: 'REVERSAL',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT', OVERDRAFT_DRAW: 'OVERDRAFT_DRAW',
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

export const ApprovalType = {
  REVERSAL_REQUESTED: 'REVERSAL_REQUESTED',
  MANUAL_ADJUSTMENT_REQUESTED: 'MANUAL_ADJUSTMENT_REQUESTED',
  FEE_MATRIX_CHANGE_REQUESTED: 'FEE_MATRIX_CHANGE_REQUESTED',
  COMMISSION_MATRIX_CHANGE_REQUESTED: 'COMMISSION_MATRIX_CHANGE_REQUESTED',
  OVERDRAFT_FACILITY_REQUESTED: 'OVERDRAFT_FACILITY_REQUESTED',
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
  ADMIN: 'ADMIN', OPERATIONS: 'OPERATIONS', COMPLIANCE: 'COMPLIANCE',
  FINANCE: 'FINANCE', SUPPORT: 'SUPPORT',
} as const;
export type StaffRole = typeof StaffRole[keyof typeof StaffRole];
