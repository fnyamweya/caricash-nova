-- Phase 4: External Rails, Fraud Engine, Settlement

-- 1. Bank account registry
CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'CITIBANK',
  provider_account_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('CUSTOMER_DEPOSITS_HOLDING','MERCHANT_PAYOUTS_CLEARING','AGENT_FLOAT_FUNDING_CLEARING','FEES_REVENUE','TAX_PAYABLE_HOLDING','COMMISSION_POOL','OVERDRAFT_POOL','SUSPENSE','OPERATIONS')),
  currency TEXT NOT NULL DEFAULT 'BBD',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
  owner_type TEXT CHECK(owner_type IN ('MERCHANT','AGENT','PLATFORM')),
  owner_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider, provider_account_id)
);

-- 2. External transfer tracking with idempotency
CREATE TABLE IF NOT EXISTS external_transfers (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'CITIBANK',
  provider_transfer_id TEXT,
  client_reference TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL CHECK(direction IN ('INBOUND','OUTBOUND')),
  transfer_type TEXT NOT NULL CHECK(transfer_type IN ('CUSTOMER_BANK_DEPOSIT','MERCHANT_PAYOUT','AGENT_FLOAT_FUND','SWEEP','MANUAL_DISBURSEMENT')),
  currency TEXT NOT NULL,
  amount TEXT NOT NULL,
  from_bank_account_id TEXT,
  to_bank_account_id TEXT,
  related_owner_type TEXT,
  related_owner_id TEXT,
  status TEXT NOT NULL DEFAULT 'CREATED' CHECK(status IN ('CREATED','PENDING','SETTLED','FAILED','CANCELLED','REVERSED')),
  idempotency_scope_hash TEXT UNIQUE,
  payload_hash TEXT,
  correlation_id TEXT NOT NULL,
  initiated_by_actor_type TEXT,
  initiated_by_actor_id TEXT,
  initiated_at TEXT NOT NULL DEFAULT (datetime('now')),
  settled_at TEXT,
  failure_reason TEXT,
  journal_id TEXT,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_ext_transfers_status ON external_transfers(status);
CREATE INDEX IF NOT EXISTS idx_ext_transfers_initiated_at ON external_transfers(initiated_at);
CREATE INDEX IF NOT EXISTS idx_ext_transfers_provider_tid ON external_transfers(provider_transfer_id);
CREATE INDEX IF NOT EXISTS idx_ext_transfers_correlation ON external_transfers(correlation_id);

-- 3. Settlement configuration per merchant
CREATE TABLE IF NOT EXISTS merchant_settlement_profiles (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BBD',
  bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id),
  schedule TEXT NOT NULL DEFAULT 'T1' CHECK(schedule IN ('T0','T1','T2')),
  mode TEXT NOT NULL DEFAULT 'AUTO' CHECK(mode IN ('AUTO','MANUAL')),
  min_payout_amount TEXT NOT NULL DEFAULT '100.00',
  max_payout_amount TEXT NOT NULL DEFAULT '500000.00',
  daily_cap TEXT NOT NULL DEFAULT '1000000.00',
  require_maker_checker INTEGER NOT NULL DEFAULT 1,
  require_two_approvals_above TEXT NOT NULL DEFAULT '50000.00',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE','PENDING_APPROVAL')),
  effective_from TEXT NOT NULL DEFAULT (datetime('now')),
  effective_to TEXT,
  created_by_staff_id TEXT,
  approved_by_staff_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_settlement_profiles_merchant ON merchant_settlement_profiles(merchant_id, currency);

-- 4. Settlement batch records
CREATE TABLE IF NOT EXISTS settlement_batches (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BBD',
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  schedule TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATED' CHECK(status IN ('CREATED','READY','REQUESTED','PROCESSING','COMPLETED','FAILED')),
  total_amount TEXT NOT NULL DEFAULT '0',
  total_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_settlement_batches_merchant ON settlement_batches(merchant_id);
CREATE INDEX IF NOT EXISTS idx_settlement_batches_status ON settlement_batches(status);

-- 5. Individual items in a settlement batch
CREATE TABLE IF NOT EXISTS settlement_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES settlement_batches(id),
  journal_id TEXT NOT NULL,
  amount TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_settlement_items_batch ON settlement_items(batch_id);

-- 6. Merchant payout records
CREATE TABLE IF NOT EXISTS merchant_payouts (
  id TEXT PRIMARY KEY,
  batch_id TEXT REFERENCES settlement_batches(id),
  merchant_id TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BBD',
  amount TEXT NOT NULL,
  bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id),
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','APPROVED','PENDING','SETTLED','FAILED','CANCELLED')),
  external_transfer_id TEXT REFERENCES external_transfers(id),
  approvals_required INTEGER NOT NULL DEFAULT 1,
  created_by_staff_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_merchant_payouts_merchant ON merchant_payouts(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_payouts_status ON merchant_payouts(status);
CREATE INDEX IF NOT EXISTS idx_merchant_payouts_batch ON merchant_payouts(batch_id);

-- 7. Merchant bank accounts (beneficiaries)
CREATE TABLE IF NOT EXISTS merchant_beneficiaries (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id),
  nickname TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK(status IN ('ACTIVE','PENDING_APPROVAL','REJECTED')),
  created_by_staff_id TEXT,
  approved_by_staff_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_merchant_beneficiaries_merchant ON merchant_beneficiaries(merchant_id);

-- 8. Fraud signal storage
CREATE TABLE IF NOT EXISTS fraud_signals (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO' CHECK(severity IN ('INFO','WARN','CRITICAL')),
  evidence_ref TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_actor ON fraud_signals(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_type ON fraud_signals(signal_type);

-- 9. Fraud decision records
CREATE TABLE IF NOT EXISTS fraud_decisions (
  id TEXT PRIMARY KEY,
  context_type TEXT NOT NULL CHECK(context_type IN ('TXN','PAYOUT','BANK_DEPOSIT')),
  context_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('ALLOW','BLOCK','STEP_UP','HOLD','FREEZE')),
  reasons_json TEXT,
  rules_version_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fraud_decisions_context ON fraud_decisions(context_type, context_id);

-- 10. Versioned fraud rule sets (maker-checker)
CREATE TABLE IF NOT EXISTS fraud_rules_versions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING_APPROVAL','ACTIVE','INACTIVE')),
  effective_from TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_staff_id TEXT,
  approved_by_staff_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT
);

-- 11. Individual fraud rules within a version
CREATE TABLE IF NOT EXISTS fraud_rules (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES fraud_rules_versions(id),
  name TEXT NOT NULL,
  applies_to_context TEXT NOT NULL CHECK(applies_to_context IN ('TXN','PAYOUT','BANK_DEPOSIT','ALL')),
  severity TEXT NOT NULL DEFAULT 'WARN' CHECK(severity IN ('INFO','WARN','CRITICAL')),
  action TEXT NOT NULL CHECK(action IN ('ALLOW','BLOCK','STEP_UP','HOLD','FREEZE')),
  conditions_json TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_fraud_rules_version ON fraud_rules(version_id);

-- 12. Webhook delivery tracking for idempotency
CREATE TABLE IF NOT EXISTS bank_webhook_deliveries (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'CITIBANK',
  event_id TEXT NOT NULL,
  transfer_id TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED','PROCESSED','FAILED','DLQ')),
  payload_hash TEXT,
  error_message TEXT,
  UNIQUE(provider, event_id)
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_transfer ON bank_webhook_deliveries(transfer_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON bank_webhook_deliveries(status);
