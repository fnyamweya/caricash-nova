-- Phase 2: Schema hardening — new tables, indexes, columns

-- Overdraft facilities
CREATE TABLE IF NOT EXISTS overdraft_facilities (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
  limit_amount TEXT NOT NULL DEFAULT '0.00',
  currency TEXT NOT NULL DEFAULT 'BBD',
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','APPROVED','REJECTED','ACTIVE','SUSPENDED','CLOSED')),
  maker_staff_id TEXT NOT NULL REFERENCES actors(id),
  checker_staff_id TEXT REFERENCES actors(id),
  approved_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_overdraft_facilities_account ON overdraft_facilities(account_id);
CREATE INDEX IF NOT EXISTS idx_overdraft_facilities_state ON overdraft_facilities(state);

-- Wallet balances (materialized view for reconciliation)
CREATE TABLE IF NOT EXISTS wallet_balances (
  account_id TEXT PRIMARY KEY REFERENCES ledger_accounts(id),
  balance TEXT NOT NULL DEFAULT '0.00',
  last_journal_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Reconciliation findings
CREATE TABLE IF NOT EXISTS reconciliation_findings (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
  expected_balance TEXT NOT NULL,
  actual_balance TEXT NOT NULL,
  discrepancy TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'LOW' CHECK(severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  run_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_findings_account ON reconciliation_findings(account_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_findings_status ON reconciliation_findings(status);
CREATE INDEX IF NOT EXISTS idx_reconciliation_findings_run ON reconciliation_findings(run_id);

-- Additional indexes on ledger_journals
CREATE INDEX IF NOT EXISTS idx_ledger_journals_initiator ON ledger_journals(txn_type, created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_journals_state ON ledger_journals(state);

-- Additional indexes on ledger_lines
CREATE INDEX IF NOT EXISTS idx_ledger_lines_account_created ON ledger_lines(account_id, created_at);

-- Additional indexes on events
CREATE INDEX IF NOT EXISTS idx_events_entity_created ON events(entity_type, entity_id, created_at);

-- Add payload_hash and scope_hash to idempotency_records
ALTER TABLE idempotency_records ADD COLUMN payload_hash TEXT;
ALTER TABLE idempotency_records ADD COLUMN scope_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_scope_hash ON idempotency_records(scope_hash);

-- Add initiator_actor_id, prev_hash, hash to ledger_journals for audit trail
ALTER TABLE ledger_journals ADD COLUMN initiator_actor_id TEXT;
ALTER TABLE ledger_journals ADD COLUMN prev_hash TEXT;
ALTER TABLE ledger_journals ADD COLUMN hash TEXT;

CREATE INDEX IF NOT EXISTS idx_ledger_journals_initiator_actor ON ledger_journals(initiator_actor_id);
