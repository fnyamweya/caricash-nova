import type { ActorType, ActorState, KycState, AccountType, TxnType, TxnState, ApprovalType, ApprovalState } from './enums.js';
import type { CurrencyCode } from './currency.js';
import type { EventName } from './events.js';

export interface Actor {
  id: string;
  type: ActorType;
  state: ActorState;
  msisdn?: string;
  agent_code?: string;
  store_code?: string;
  staff_code?: string;
  name: string;
  kyc_state: KycState;
  created_at: string;
  updated_at: string;
}

export interface LedgerAccount {
  id: string;
  owner_type: ActorType;
  owner_id: string;
  account_type: AccountType;
  currency: CurrencyCode;
  created_at: string;
}

export interface LedgerJournal {
  id: string;
  txn_type: TxnType;
  currency: CurrencyCode;
  correlation_id: string;
  idempotency_key: string;
  state: TxnState;
  fee_version_id?: string;
  commission_version_id?: string;
  description: string;
  created_at: string;
  initiator_actor_id?: string;
  prev_hash?: string;
  hash?: string;
}

export interface LedgerLine {
  id: string;
  journal_id: string;
  account_id: string;
  entry_type: 'DR' | 'CR';
  amount: string;
  description?: string;
  created_at: string;
}

export interface ApprovalRequest {
  id: string;
  type: ApprovalType;
  payload_json: string;
  maker_staff_id: string;
  checker_staff_id?: string;
  state: ApprovalState;
  created_at: string;
  decided_at?: string;
}

export interface Event {
  id: string;
  name: EventName;
  entity_type: string;
  entity_id: string;
  correlation_id: string;
  causation_id?: string;
  actor_type: ActorType;
  actor_id: string;
  schema_version: number;
  payload_json: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  action: string;
  actor_type: ActorType;
  actor_id: string;
  target_type: string;
  target_id: string;
  before_json?: string;
  after_json?: string;
  ip?: string;
  device?: string;
  correlation_id: string;
  created_at: string;
}

export interface IdempotencyRecord {
  id: string;
  scope: string;
  idempotency_key: string;
  result_json: string;
  created_at: string;
  expires_at: string;
  payload_hash?: string;
  scope_hash?: string;
}

export interface FeeMatrixVersion {
  id: string;
  state: ApprovalState;
  effective_from: string;
  created_by: string;
  approved_by?: string;
  created_at: string;
}

export interface FeeRule {
  id: string;
  version_id: string;
  txn_type: TxnType;
  currency: CurrencyCode;
  flat_amount: string;
  percent_amount: string;
  min_amount: string;
  max_amount: string;
  tax_rate: string;
}

export interface CommissionMatrixVersion {
  id: string;
  state: ApprovalState;
  effective_from: string;
  created_by: string;
  approved_by?: string;
  created_at: string;
}

export interface CommissionRule {
  id: string;
  version_id: string;
  txn_type: TxnType;
  currency: CurrencyCode;
  agent_type: string;
  flat_amount: string;
  percent_amount: string;
}

export interface PostTransactionCommand {
  idempotency_key: string;
  correlation_id: string;
  txn_type: TxnType;
  currency: CurrencyCode;
  entries: {
    account_id: string;
    entry_type: 'DR' | 'CR';
    amount: string;
    description?: string;
  }[];
  description: string;
  actor_type: ActorType;
  actor_id: string;
  fee_version_id?: string;
  commission_version_id?: string;
}

export interface PostTransactionResult {
  journal_id: string;
  state: TxnState;
  entries: {
    account_id: string;
    entry_type: 'DR' | 'CR';
    amount: string;
    description?: string;
  }[];
  created_at: string;
}

export interface BalanceResult {
  owner_type: ActorType;
  owner_id: string;
  currency: CurrencyCode;
  balance: string;
  last_journal_id: string;
}
