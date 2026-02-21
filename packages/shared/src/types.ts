import type { ActorType, ActorState, KycState, AccountType, TxnType, TxnState, ApprovalType, ApprovalState, MerchantUserRole, MerchantUserState, AgentUserRole, AgentUserState, RegistrationType, RegistrationChannel, FloatOperationType, StaffRole, AgentType } from './enums.js';
import type { CurrencyCode } from './currency.js';
import type { EventName } from './events.js';

export interface Actor {
  id: string;
  type: ActorType;
  state: ActorState;
  msisdn?: string;
  agent_code?: string;
  agent_type?: AgentType;
  store_code?: string;
  staff_code?: string;
  staff_role?: StaffRole;
  name: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  display_name?: string;
  email?: string;
  parent_actor_id?: string;
  kyc_state: KycState;
  created_at: string;
  updated_at: string;
}

/** Minimal actor data returned by lookup endpoints (no sensitive fields) */
export interface ActorLookup {
  id: string;
  type: ActorType;
  state: ActorState;
  name: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  display_name?: string;
}

export interface MerchantUser {
  id: string;
  actor_id: string;
  msisdn: string;
  name: string;
  role: MerchantUserRole;
  state: MerchantUserState;
  created_at: string;
  updated_at: string;
}

export interface AgentUser {
  id: string;
  actor_id: string;
  msisdn: string;
  name: string;
  role: AgentUserRole;
  state: AgentUserState;
  created_at: string;
  updated_at: string;
}

/** Closure-table row linking ancestor ↔ descendant merchant stores. */
export interface MerchantStoreClosure {
  ancestor_id: string;
  descendant_id: string;
  depth: number;
  created_at: string;
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
  correlation_id: string;
  txn_type: TxnType;
  currency: CurrencyCode;
}

export interface BalanceResult {
  owner_type: ActorType;
  owner_id: string;
  currency: CurrencyCode;
  balance: string;
  last_journal_id: string;
}

// ---------------------------------------------------------------------------
// Registration Metadata
// ---------------------------------------------------------------------------

export interface RegistrationMetadata {
  id: string;
  actor_id: string;
  registration_type: RegistrationType;
  registered_by_actor_id?: string;
  registered_by_actor_type?: string;
  channel?: RegistrationChannel;
  device_type?: string;
  device_info?: string;
  ip_address?: string;
  geo_location?: string;
  actor_snapshot_json: string;
  referral_code?: string;
  campaign_id?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  terms_accepted_at?: string;
  privacy_accepted_at?: string;
  marketing_opt_in: boolean;
  verification_json?: string;
  metadata_json?: string;
  started_at: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Account Balances (actual & available)
// ---------------------------------------------------------------------------

export interface AccountBalance {
  account_id: string;
  actual_balance: string;
  available_balance: string;
  hold_amount: string;
  pending_credits: string;
  last_journal_id?: string;
  currency: CurrencyCode;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Float Operations
// ---------------------------------------------------------------------------

export interface FloatOperation {
  id: string;
  agent_actor_id: string;
  agent_account_id: string;
  staff_actor_id: string;
  operation_type: FloatOperationType;
  amount: string;
  currency: CurrencyCode;
  journal_id?: string;
  balance_before: string;
  balance_after: string;
  available_before: string;
  available_after: string;
  requires_approval: boolean;
  approval_id?: string;
  reason?: string;
  reference?: string;
  idempotency_key: string;
  correlation_id: string;
  created_at: string;
}

export interface KycProfile {
  id: string;
  actor_id: string;
  actor_type: ActorType;
  status: KycState;
  verification_level?: string;
  submitted_at?: string;
  reviewed_at?: string;
  reviewer_actor_id?: string;
  documents_json?: string;
  metadata_json?: string;
  created_at: string;
  updated_at: string;
}

export interface KycRequirement {
  id: string;
  actor_type: ActorType;
  requirement_code: string;
  display_name: string;
  is_required: boolean;
  config_json?: string;
  created_at: string;
  updated_at: string;
}
