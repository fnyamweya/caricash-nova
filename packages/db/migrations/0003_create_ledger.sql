-- Ledger accounts
CREATE TABLE IF NOT EXISTS ledger_accounts (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK(account_type IN ('WALLET','FEE_REVENUE','TAX_PAYABLE','COMMISSIONS_PAYABLE','OVERDRAFT_FACILITY','SUSPENSE','CASH_FLOAT')),
  currency TEXT NOT NULL DEFAULT 'BBD',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_accounts_owner_currency_type ON ledger_accounts(owner_type, owner_id, account_type, currency);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_owner ON ledger_accounts(owner_id, currency);

-- Ledger journals (append-only)
CREATE TABLE IF NOT EXISTS ledger_journals (
  id TEXT PRIMARY KEY,
  txn_type TEXT NOT NULL,
  currency TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'POSTED',
  fee_version_id TEXT,
  commission_version_id TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_journals_idempotency ON ledger_journals(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ledger_journals_correlation ON ledger_journals(correlation_id);

-- Ledger lines (append-only)
CREATE TABLE IF NOT EXISTS ledger_lines (
  id TEXT PRIMARY KEY,
  journal_id TEXT NOT NULL REFERENCES ledger_journals(id),
  account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
  entry_type TEXT NOT NULL CHECK(entry_type IN ('DR','CR')),
  amount TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_ledger_lines_journal ON ledger_lines(journal_id);
CREATE INDEX IF NOT EXISTS idx_ledger_lines_account ON ledger_lines(account_id);
