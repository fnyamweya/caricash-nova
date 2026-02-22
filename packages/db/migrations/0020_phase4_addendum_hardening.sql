-- Phase 4 Addendum: Reconciliation, Fraud Feedback, Hardening
-- Section A: Reconciliation Domain

CREATE TABLE IF NOT EXISTS bank_statements (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'CITIBANK',
  bank_account_id TEXT NOT NULL,
  statement_date TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BBD',
  opening_balance TEXT,
  closing_balance TEXT,
  entry_count INTEGER NOT NULL DEFAULT 0,
  raw_payload_json TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bank_statements_account ON bank_statements(bank_account_id, statement_date);

CREATE TABLE IF NOT EXISTS bank_statement_entries (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL REFERENCES bank_statements(id),
  provider TEXT NOT NULL DEFAULT 'CITIBANK',
  bank_account_id TEXT NOT NULL,
  entry_reference TEXT,
  direction TEXT NOT NULL CHECK(direction IN ('INBOUND','OUTBOUND')),
  amount TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BBD',
  value_date TEXT NOT NULL,
  booking_date TEXT,
  description TEXT,
  counterparty_account TEXT,
  counterparty_name TEXT,
  raw_payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','CANDIDATE_MATCHED','MATCHED','SETTLED','UNMATCHED','DISPUTED','RESOLVED','PARTIAL_MATCHED','ESCALATED')),
  matched_transfer_id TEXT,
  matched_batch_id TEXT,
  match_confidence TEXT,
  match_method TEXT CHECK(match_method IN ('PROVIDER_ID','CLIENT_REF','AMOUNT_TIME','BATCH')),
  suspense_journal_id TEXT,
  case_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bse_statement ON bank_statement_entries(statement_id);
CREATE INDEX IF NOT EXISTS idx_bse_status ON bank_statement_entries(status);
CREATE INDEX IF NOT EXISTS idx_bse_bank_account ON bank_statement_entries(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bse_value_date ON bank_statement_entries(value_date);

CREATE TABLE IF NOT EXISTS reconciliation_matches (
  id TEXT PRIMARY KEY,
  statement_entry_id TEXT NOT NULL REFERENCES bank_statement_entries(id),
  external_transfer_id TEXT,
  batch_id TEXT,
  match_method TEXT NOT NULL CHECK(match_method IN ('PROVIDER_ID','CLIENT_REF','AMOUNT_TIME','BATCH')),
  confidence TEXT NOT NULL DEFAULT 'HIGH' CHECK(confidence IN ('HIGH','MEDIUM','LOW')),
  amount_difference TEXT DEFAULT '0',
  currency TEXT NOT NULL DEFAULT 'BBD',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CONFIRMED','REJECTED','DISPUTED')),
  reviewed_by_staff_id TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recon_matches_entry ON reconciliation_matches(statement_entry_id);
CREATE INDEX IF NOT EXISTS idx_recon_matches_transfer ON reconciliation_matches(external_transfer_id);

CREATE TABLE IF NOT EXISTS reconciliation_cases (
  id TEXT PRIMARY KEY,
  statement_entry_id TEXT REFERENCES bank_statement_entries(id),
  external_transfer_id TEXT,
  case_type TEXT NOT NULL CHECK(case_type IN ('UNMATCHED_BANK','UNMATCHED_TRANSFER','AMOUNT_MISMATCH','CURRENCY_ANOMALY','DUPLICATE','STUCK_TRANSFER','PARTIAL_MATCH')),
  severity TEXT NOT NULL DEFAULT 'WARN' CHECK(severity IN ('INFO','WARN','CRITICAL')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','INVESTIGATING','RESOLVED','ESCALATED')),
  description TEXT,
  resolution_notes TEXT,
  assigned_to_staff_id TEXT,
  resolved_by_staff_id TEXT,
  resolved_at TEXT,
  correlation_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recon_cases_status ON reconciliation_cases(status);
CREATE INDEX IF NOT EXISTS idx_recon_cases_type ON reconciliation_cases(case_type);

-- Section I: Fraud Feedback Loop
CREATE TABLE IF NOT EXISTS fraud_case_outcomes (
  id TEXT PRIMARY KEY,
  fraud_decision_id TEXT NOT NULL REFERENCES fraud_decisions(id),
  case_id TEXT,
  outcome TEXT NOT NULL CHECK(outcome IN ('TRUE_POSITIVE','FALSE_POSITIVE','INCONCLUSIVE')),
  resolution_notes TEXT,
  resolved_by_staff_id TEXT,
  resolved_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fraud_outcomes_decision ON fraud_case_outcomes(fraud_decision_id);

CREATE TABLE IF NOT EXISTS fraud_signal_metrics (
  id TEXT PRIMARY KEY,
  signal_type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  total_count INTEGER NOT NULL DEFAULT 0,
  true_positive_count INTEGER NOT NULL DEFAULT 0,
  false_positive_count INTEGER NOT NULL DEFAULT 0,
  inconclusive_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fraud_metrics_signal ON fraud_signal_metrics(signal_type, period_start);

-- Section H: ML/Scoring fields on fraud_decisions
-- Add score, model_version, explanation_json columns
-- SQLite ALTER TABLE only supports adding columns
ALTER TABLE fraud_decisions ADD COLUMN score REAL DEFAULT 0.0;
ALTER TABLE fraud_decisions ADD COLUMN model_version TEXT DEFAULT 'rules-v1';
ALTER TABLE fraud_decisions ADD COLUMN explanation_json TEXT;

-- Section D: Currency anomaly status
-- Add ANOMALY_CURRENCY to external_transfers status
-- (SQLite CHECK constraints are not enforced on ALTER, document in code)

-- Section E: Beneficiary verification flow
-- Extend merchant_beneficiaries with verification fields
ALTER TABLE merchant_beneficiaries ADD COLUMN verification_status TEXT DEFAULT 'DRAFT' CHECK(verification_status IN ('DRAFT','PENDING_VERIFICATION','VERIFIED','FAILED'));
ALTER TABLE merchant_beneficiaries ADD COLUMN verification_method TEXT CHECK(verification_method IN ('NAME_MATCH','MICRO_DEPOSIT'));
ALTER TABLE merchant_beneficiaries ADD COLUMN verified_at TEXT;

-- Section K: Settlement netting mode
ALTER TABLE merchant_settlement_profiles ADD COLUMN netting_mode TEXT DEFAULT 'GROSS' CHECK(netting_mode IN ('GROSS','NET'));

-- Section L: Settlement fee mode
ALTER TABLE merchant_settlement_profiles ADD COLUMN fee_mode TEXT DEFAULT 'DEDUCT_FROM_PAYOUT' CHECK(fee_mode IN ('DEDUCT_FROM_PAYOUT','CHARGE_SEPARATELY'));

-- Section J: Holdback reserve
ALTER TABLE merchant_settlement_profiles ADD COLUMN holdback_percentage TEXT DEFAULT '0';

-- Section O: Data retention tracking
CREATE TABLE IF NOT EXISTS data_retention_policies (
  id TEXT PRIMARY KEY,
  data_category TEXT NOT NULL UNIQUE CHECK(data_category IN ('LEDGER','AUDIT','WEBHOOKS','FRAUD','RECONCILIATION','IDEMPOTENCY')),
  hot_retention_days INTEGER NOT NULL,
  archive_retention_days INTEGER NOT NULL,
  last_purge_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed retention policies per Section O
INSERT OR IGNORE INTO data_retention_policies (id, data_category, hot_retention_days, archive_retention_days) VALUES
  ('ret-ledger', 'LEDGER', 2555, 2555),
  ('ret-audit', 'AUDIT', 2555, 2555),
  ('ret-webhooks', 'WEBHOOKS', 90, 365),
  ('ret-fraud', 'FRAUD', 730, 2555),
  ('ret-recon', 'RECONCILIATION', 730, 2555),
  ('ret-idempotency', 'IDEMPOTENCY', 365, 730);
