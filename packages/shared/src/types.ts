import type { ActorType, ActorState, KycState, AccountType, TxnType, TxnState, ApprovalState, MerchantUserRole, MerchantUserState, AgentUserRole, AgentUserState, RegistrationType, RegistrationChannel, FloatOperationType, StaffRole, AgentType, AccountClass, NormalBalance, AccountInstanceStatus, AccountingPeriodStatus, PostingBatchStatus, SubledgerRelationshipType, PolicyState, WorkflowState, StageDecision, DelegationState, PolicyConditionOperator, PolicyBindingType } from './enums.js';
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
  /** V2 fields — optional until full migration */
  posting_batch_id?: string;
  source_system?: string;
  source_doc_type?: string;
  source_doc_id?: string;
  reversal_of_journal_id?: string;
  correction_of_journal_id?: string;
  accounting_period_id?: string;
  effective_date?: string;
  total_amount_minor?: number;
}

export interface LedgerLine {
  id: string;
  journal_id: string;
  account_id: string;
  entry_type: 'DR' | 'CR';
  amount: string;
  description?: string;
  created_at: string;
  /** V2 fields — optional until full migration */
  line_number?: number;
  debit_amount_minor?: number;
  credit_amount_minor?: number;
  account_instance_id?: string;
  coa_code?: string;
}

// ---------------------------------------------------------------------------
// V2 Accounting Types
// ---------------------------------------------------------------------------

export interface ChartOfAccount {
  code: string;
  name: string;
  account_class: AccountClass;
  normal_balance: NormalBalance;
  parent_code?: string;
  description?: string;
  ifrs_mapping?: string;
  is_header: boolean;
  active_from: string;
  active_to?: string;
  created_at: string;
  updated_at: string;
}

export interface AccountInstance {
  id: string;
  coa_code: string;
  owner_type: string;
  owner_id: string;
  currency: CurrencyCode;
  status: AccountInstanceStatus;
  opened_at: string;
  closed_at?: string;
  parent_instance_id?: string;
  legacy_account_id?: string;
  created_at: string;
  updated_at: string;
}

export interface AccountingPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: AccountingPeriodStatus;
  closed_by?: string;
  closed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface PostingBatch {
  id: string;
  source_system: string;
  source_doc_type?: string;
  source_doc_id?: string;
  description?: string;
  status: PostingBatchStatus;
  journal_count: number;
  created_by?: string;
  created_at: string;
}

export interface SubledgerAccount {
  id: string;
  parent_actor_id: string;
  child_actor_id: string;
  account_instance_id: string;
  relationship_type: SubledgerRelationshipType;
  effective_from: string;
  effective_to?: string;
  created_at: string;
}

export interface DailyBalanceSnapshot {
  id: string;
  account_instance_id: string;
  snapshot_date: string;
  opening_balance_minor: number;
  debit_total_minor: number;
  credit_total_minor: number;
  closing_balance_minor: number;
  journal_count: number;
  currency: CurrencyCode;
  created_at: string;
}

export interface TrialBalanceRow {
  coa_code: string;
  account_name: string;
  account_class: AccountClass;
  normal_balance: NormalBalance;
  currency: CurrencyCode;
  total_debit_minor: number;
  total_credit_minor: number;
  net_balance_minor: number;
}

export interface GLDetailRow {
  journal_id: string;
  txn_type: string;
  currency: string;
  journal_state: string;
  effective_date?: string;
  posted_at: string;
  correlation_id: string;
  journal_description: string;
  posting_batch_id?: string;
  accounting_period_id?: string;
  line_id: string;
  line_number?: number;
  account_id: string;
  account_instance_id?: string;
  coa_code?: string;
  account_name?: string;
  account_class?: string;
  entry_type: 'DR' | 'CR';
  amount: string;
  debit_amount_minor?: number;
  credit_amount_minor?: number;
  line_description?: string;
}

export interface AccountStatementRow {
  account_instance_id: string;
  owner_type: string;
  owner_id: string;
  coa_code: string;
  account_name: string;
  currency: string;
  journal_id: string;
  txn_type: string;
  posted_at: string;
  effective_date?: string;
  correlation_id: string;
  line_id: string;
  line_number?: number;
  entry_type: 'DR' | 'CR';
  amount: string;
  debit_amount_minor?: number;
  credit_amount_minor?: number;
  line_description?: string;
}

export interface SubledgerRollupRow {
  parent_actor_id: string;
  relationship_type: string;
  coa_code: string;
  account_name: string;
  currency: string;
  child_count: number;
  total_debit_minor: number;
  total_credit_minor: number;
  net_balance_minor: number;
}

export interface ApprovalRequest {
  id: string;
  type: string;
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

// ---------------------------------------------------------------------------
// Approval Policies — dynamic maker-checker configuration
// ---------------------------------------------------------------------------

export interface ApprovalPolicy {
  id: string;
  name: string;
  description?: string;
  approval_type?: string;
  priority: number;
  version: number;
  state: PolicyState;
  valid_from?: string;
  valid_to?: string;
  time_constraints_json?: string;
  expiry_minutes?: number;
  escalation_minutes?: number;
  escalation_group_json?: string;
  created_by: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ApprovalPolicyCondition {
  id: string;
  policy_id: string;
  field: string;
  operator: PolicyConditionOperator;
  value_json: string;
  created_at: string;
}

export interface ApprovalPolicyStage {
  id: string;
  policy_id: string;
  stage_no: number;
  min_approvals: number;
  roles_json?: string;
  actor_ids_json?: string;
  exclude_maker: number;
  exclude_previous_approvers: number;
  timeout_minutes?: number;
  escalation_roles_json?: string;
  escalation_actor_ids_json?: string;
  created_at: string;
}

export interface ApprovalPolicyBinding {
  id: string;
  policy_id: string;
  binding_type: PolicyBindingType;
  binding_value_json: string;
  created_at: string;
}

export interface ApprovalStageDecision {
  id: string;
  request_id: string;
  policy_id: string;
  stage_no: number;
  decision: StageDecision;
  decider_id: string;
  decider_role?: string;
  reason?: string;
  decided_at: string;
  created_at: string;
}

export interface ApprovalDelegation {
  id: string;
  delegator_id: string;
  delegate_id: string;
  approval_type?: string;
  valid_from: string;
  valid_to: string;
  reason?: string;
  state: DelegationState;
  created_by: string;
  created_at: string;
  revoked_at?: string;
  revoked_by?: string;
}

export interface ApprovalPolicyDecision {
  id: string;
  request_id: string;
  evaluation_json: string;
  matched_policy_id?: string;
  total_stages: number;
  created_at: string;
}

/** Full policy with nested conditions, stages, and bindings */
export interface ApprovalPolicyFull extends ApprovalPolicy {
  conditions: ApprovalPolicyCondition[];
  stages: ApprovalPolicyStage[];
  bindings: ApprovalPolicyBinding[];
}

/** Policy evaluation result for simulation / explain */
export interface PolicyEvaluationResult {
  matched: boolean;
  policy_id?: string;
  policy_name?: string;
  total_stages: number;
  stages: {
    stage_no: number;
    min_approvals: number;
    allowed_roles: string[];
    allowed_actors: string[];
    timeout_minutes?: number;
  }[];
  reasons: string[];
  all_evaluated: {
    policy_id: string;
    policy_name: string;
    matched: boolean;
    reasons: string[];
  }[];
}

// ─────────────────────────────────────────────────────────────────────
// Dynamic Approval Type Configs & Endpoint Bindings
// ─────────────────────────────────────────────────────────────────────

export interface ApprovalTypeConfig {
  type_key: string;
  label: string;
  description?: string;
  default_checker_roles_json?: string;
  require_reason: number;
  has_code_handler: number;
  auto_policy_id?: string;
  enabled: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ApprovalEndpointBinding {
  id: string;
  route_pattern: string;
  http_method: string;
  approval_type: string;
  description?: string;
  extract_payload_json?: string;
  enabled: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Phase 4: External Rails, Settlement, Fraud Types
// ---------------------------------------------------------------------------

export interface BankAccount {
  id: string;
  provider: string;
  provider_account_id: string;
  purpose: import('./enums.js').BankAccountPurpose;
  currency: CurrencyCode;
  status: string;
  owner_type?: string;
  owner_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ExternalTransfer {
  id: string;
  provider: string;
  provider_transfer_id?: string;
  client_reference: string;
  direction: import('./enums.js').ExternalTransferDirection;
  transfer_type: import('./enums.js').ExternalTransferType;
  currency: CurrencyCode;
  amount: string;
  from_bank_account_id?: string;
  to_bank_account_id?: string;
  related_owner_type?: string;
  related_owner_id?: string;
  status: import('./enums.js').ExternalTransferStatus;
  idempotency_scope_hash?: string;
  payload_hash?: string;
  correlation_id: string;
  initiated_by_actor_type?: string;
  initiated_by_actor_id?: string;
  initiated_at: string;
  settled_at?: string;
  failure_reason?: string;
  journal_id?: string;
  metadata_json?: string;
}

export interface MerchantSettlementProfile {
  id: string;
  merchant_id: string;
  currency: CurrencyCode;
  bank_account_id: string;
  schedule: import('./enums.js').SettlementSchedule;
  mode: import('./enums.js').SettlementMode;
  min_payout_amount: string;
  max_payout_amount: string;
  daily_cap: string;
  require_maker_checker: boolean;
  require_two_approvals_above: string;
  status: string;
  effective_from: string;
  effective_to?: string;
  created_by_staff_id?: string;
  approved_by_staff_id?: string;
  created_at: string;
  approved_at?: string;
}

export interface SettlementBatch {
  id: string;
  merchant_id: string;
  currency: CurrencyCode;
  period_start: string;
  period_end: string;
  schedule: import('./enums.js').SettlementSchedule;
  mode: import('./enums.js').SettlementMode;
  status: import('./enums.js').SettlementBatchStatus;
  total_amount: string;
  total_count: number;
  created_at: string;
  updated_at: string;
}

export interface SettlementItem {
  id: string;
  batch_id: string;
  journal_id: string;
  amount: string;
  created_at: string;
}

export interface MerchantPayout {
  id: string;
  batch_id?: string;
  merchant_id: string;
  currency: CurrencyCode;
  amount: string;
  bank_account_id: string;
  status: import('./enums.js').PayoutStatus;
  external_transfer_id?: string;
  approvals_required: number;
  created_by_staff_id?: string;
  created_at: string;
  updated_at: string;
}

export interface MerchantBeneficiary {
  id: string;
  merchant_id: string;
  bank_account_id: string;
  nickname?: string;
  status: import('./enums.js').BeneficiaryStatus;
  created_by_staff_id?: string;
  approved_by_staff_id?: string;
  created_at: string;
  approved_at?: string;
}

export interface FraudSignal {
  id: string;
  actor_type: string;
  actor_id: string;
  signal_type: import('./enums.js').FraudSignalType;
  severity: import('./enums.js').FraudSeverity;
  evidence_ref?: string;
  payload_json?: string;
  created_at: string;
}

export interface FraudDecisionRecord {
  id: string;
  context_type: import('./enums.js').FraudContextType;
  context_id: string;
  decision: import('./enums.js').FraudDecision;
  reasons_json?: string;
  rules_version_id?: string;
  created_at: string;
}

export interface FraudRulesVersion {
  id: string;
  status: import('./enums.js').FraudRuleVersionStatus;
  effective_from: string;
  created_by_staff_id?: string;
  approved_by_staff_id?: string;
  created_at: string;
  approved_at?: string;
}

export interface FraudRule {
  id: string;
  version_id: string;
  name: string;
  applies_to_context: string;
  severity: import('./enums.js').FraudSeverity;
  action: import('./enums.js').FraudDecision;
  conditions_json: string;
  priority: number;
  enabled: boolean;
}

export interface BankWebhookDelivery {
  id: string;
  provider: string;
  event_id: string;
  transfer_id?: string;
  received_at: string;
  status: import('./enums.js').WebhookDeliveryStatus;
  payload_hash?: string;
  error_message?: string;
}

export interface CitibankTransferRequest {
  client_reference: string;
  amount: string;
  currency: string;
  from_account_id: string;
  to_account_id: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface CitibankTransferResponse {
  bank_transfer_id: string;
  client_reference: string;
  status: string;
  amount: string;
  currency: string;
  from_account_id: string;
  to_account_id: string;
  created_at: string;
}

export interface CitibankWebhookPayload {
  bank_transfer_id: string;
  client_reference: string;
  status: string;
  amount: string;
  currency: string;
  from_account_id: string;
  to_account_id: string;
  occurred_at: string;
}

export interface CircuitBreakerConfig {
  failure_threshold: number;
  reset_timeout_ms: number;
  half_open_max_attempts: number;
}

export interface RetryConfig {
  max_attempts: number;
  base_delay_ms: number;
  max_delay_ms: number;
  backoff_multiplier: number;
}
