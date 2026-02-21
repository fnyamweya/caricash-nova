-- ============================================================================
-- Migration 0015: V2 Accounting Ledger — IFRS-aligned chart of accounts,
-- account instances, accounting periods, posting batches, sub-ledger
-- hierarchy, and canonical reporting structures.
--
-- Design principles:
-- 1. Chart of Accounts (CoA) is the master reference — every account instance
--    maps to exactly one CoA entry.
-- 2. Amounts stored as INTEGER minor units (cents) to eliminate rounding.
-- 3. Journal lines carry line_number + debit_amount_minor / credit_amount_minor
--    (exactly one non-zero per line — strict single-sided posting).
-- 4. Accounting periods with close locks prevent back-dated posting.
-- 5. Sub-ledger accounts enable aggregator → child rollups.
-- 6. Daily balance snapshots support audit & regulatory reporting.
-- ============================================================================

-- ── 1. Chart of Accounts ─────────────────────────────────────────────────────
-- Master reference for all account codes. Hierarchical via parent_code.
-- account_class follows IFRS taxonomy: ASSET, LIABILITY, EQUITY, INCOME, EXPENSE.
-- normal_balance: DR for assets/expenses, CR for liabilities/equity/income.

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  code          TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  account_class TEXT NOT NULL CHECK(account_class IN ('ASSET','LIABILITY','EQUITY','INCOME','EXPENSE')),
  normal_balance TEXT NOT NULL CHECK(normal_balance IN ('DR','CR')),
  parent_code   TEXT REFERENCES chart_of_accounts(code),
  description   TEXT,
  ifrs_mapping  TEXT,
  is_header     INTEGER NOT NULL DEFAULT 0,
  active_from   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  active_to     TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_coa_parent ON chart_of_accounts(parent_code);
CREATE INDEX IF NOT EXISTS idx_coa_class  ON chart_of_accounts(account_class);

-- ── 2. Seed Chart of Accounts ────────────────────────────────────────────────
-- Top-level headers
INSERT OR IGNORE INTO chart_of_accounts (code, name, account_class, normal_balance, is_header, description, ifrs_mapping)
VALUES
  ('1000', 'Assets',              'ASSET',     'DR', 1, 'All asset accounts',          'IAS 1'),
  ('2000', 'Liabilities',         'LIABILITY', 'CR', 1, 'All liability accounts',      'IAS 1'),
  ('3000', 'Equity',              'EQUITY',    'CR', 1, 'All equity accounts',         'IAS 1'),
  ('4000', 'Income',              'INCOME',    'CR', 1, 'All income accounts',         'IAS 18/IFRS 15'),
  ('5000', 'Expenses',            'EXPENSE',   'DR', 1, 'All expense accounts',        'IAS 1');

-- Asset sub-accounts
INSERT OR IGNORE INTO chart_of_accounts (code, name, account_class, normal_balance, parent_code, description, ifrs_mapping)
VALUES
  ('1100', 'Customer Wallets',         'ASSET', 'DR', '1000', 'E-money customer wallets',              'IFRS 9'),
  ('1200', 'Agent Cash Float',         'ASSET', 'DR', '1000', 'Agent physical cash float',             'IFRS 9'),
  ('1300', 'Merchant Wallets',         'ASSET', 'DR', '1000', 'Merchant settlement wallets',           'IFRS 9'),
  ('1400', 'Staff Wallets',            'ASSET', 'DR', '1000', 'Internal staff operational wallets',    'IFRS 9'),
  ('1500', 'Suspense',                 'ASSET', 'DR', '1000', 'Unallocated / suspense holdings',       'IAS 37'),
  ('1600', 'Overdraft Facilities',     'ASSET', 'DR', '1000', 'Outstanding overdraft draws',           'IFRS 9');

-- Liability sub-accounts
INSERT OR IGNORE INTO chart_of_accounts (code, name, account_class, normal_balance, parent_code, description, ifrs_mapping)
VALUES
  ('2100', 'Tax Payable',              'LIABILITY', 'CR', '2000', 'Tax collected pending remittance',    'IAS 12'),
  ('2200', 'Commissions Payable',      'LIABILITY', 'CR', '2000', 'Agent commissions earned not paid',   'IAS 19');

-- Income sub-accounts
INSERT OR IGNORE INTO chart_of_accounts (code, name, account_class, normal_balance, parent_code, description, ifrs_mapping)
VALUES
  ('4100', 'Transaction Fee Revenue',  'INCOME', 'CR', '4000', 'Fees charged on transactions',         'IFRS 15'),
  ('4200', 'Commission Revenue',       'INCOME', 'CR', '4000', 'Revenue from commission structures',   'IFRS 15');

-- ── 3. Account Instances (replaces functional role of ledger_accounts) ───────
-- Each instance binds a CoA code to an owner (actor) + currency + lifecycle.
-- Backward-compatible: v1 ledger_accounts remain; new code writes to both
-- and reads from account_instances for v2 features.

CREATE TABLE IF NOT EXISTS account_instances (
  id                  TEXT PRIMARY KEY,
  coa_code            TEXT NOT NULL REFERENCES chart_of_accounts(code),
  owner_type          TEXT NOT NULL,
  owner_id            TEXT NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'BBD',
  status              TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','FROZEN','CLOSED')),
  opened_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  closed_at           TEXT,
  parent_instance_id  TEXT REFERENCES account_instances(id),
  legacy_account_id   TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_owner_coa_currency
  ON account_instances(owner_type, owner_id, coa_code, currency);
CREATE INDEX IF NOT EXISTS idx_ai_coa       ON account_instances(coa_code);
CREATE INDEX IF NOT EXISTS idx_ai_owner     ON account_instances(owner_id, currency);
CREATE INDEX IF NOT EXISTS idx_ai_parent    ON account_instances(parent_instance_id);
CREATE INDEX IF NOT EXISTS idx_ai_legacy    ON account_instances(legacy_account_id);
CREATE INDEX IF NOT EXISTS idx_ai_status    ON account_instances(status);

-- ── 4. Accounting Periods ────────────────────────────────────────────────────
-- Controls period close. Journals cannot post to a CLOSED period.

CREATE TABLE IF NOT EXISTS accounting_periods (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSING','CLOSED','LOCKED')),
  closed_by   TEXT,
  closed_at   TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ap_dates ON accounting_periods(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_ap_status        ON accounting_periods(status);

-- Seed open period for current month
INSERT OR IGNORE INTO accounting_periods (id, name, start_date, end_date, status)
VALUES (
  'AP-' || strftime('%Y-%m', 'now'),
  strftime('%Y-%m', 'now'),
  strftime('%Y-%m-01T00:00:00.000Z', 'now'),
  strftime('%Y-%m-01T00:00:00.000Z', 'now', '+1 month'),
  'OPEN'
);

-- ── 5. Posting Batches ──────────────────────────────────────────────────────
-- Groups journals that form one logical posting unit (e.g., bulk import).

CREATE TABLE IF NOT EXISTS posting_batches (
  id              TEXT PRIMARY KEY,
  source_system   TEXT NOT NULL DEFAULT 'CARICASH',
  source_doc_type TEXT,
  source_doc_id   TEXT,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','POSTED','REVERSED')),
  journal_count   INTEGER NOT NULL DEFAULT 0,
  created_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_pb_source ON posting_batches(source_system, source_doc_type, source_doc_id);
CREATE INDEX IF NOT EXISTS idx_pb_status ON posting_batches(status);

-- ── 6. Journal V2 columns ───────────────────────────────────────────────────
-- Add v2 columns to existing ledger_journals table (additive, not destructive).

ALTER TABLE ledger_journals ADD COLUMN account_instance_id TEXT;
ALTER TABLE ledger_journals ADD COLUMN posting_batch_id TEXT REFERENCES posting_batches(id);
ALTER TABLE ledger_journals ADD COLUMN source_system TEXT DEFAULT 'CARICASH';
ALTER TABLE ledger_journals ADD COLUMN source_doc_type TEXT;
ALTER TABLE ledger_journals ADD COLUMN source_doc_id TEXT;
ALTER TABLE ledger_journals ADD COLUMN reversal_of_journal_id TEXT;
ALTER TABLE ledger_journals ADD COLUMN correction_of_journal_id TEXT;
ALTER TABLE ledger_journals ADD COLUMN accounting_period_id TEXT;
ALTER TABLE ledger_journals ADD COLUMN effective_date TEXT;
ALTER TABLE ledger_journals ADD COLUMN total_amount_minor INTEGER;

CREATE INDEX IF NOT EXISTS idx_lj_period     ON ledger_journals(accounting_period_id);
CREATE INDEX IF NOT EXISTS idx_lj_batch      ON ledger_journals(posting_batch_id);
CREATE INDEX IF NOT EXISTS idx_lj_reversal   ON ledger_journals(reversal_of_journal_id);
CREATE INDEX IF NOT EXISTS idx_lj_correction ON ledger_journals(correction_of_journal_id);
CREATE INDEX IF NOT EXISTS idx_lj_effective  ON ledger_journals(effective_date);

-- ── 7. Ledger Lines V2 columns ──────────────────────────────────────────────
-- Add strict line discipline: line_number + minor-unit amounts.

ALTER TABLE ledger_lines ADD COLUMN line_number INTEGER;
ALTER TABLE ledger_lines ADD COLUMN debit_amount_minor INTEGER DEFAULT 0;
ALTER TABLE ledger_lines ADD COLUMN credit_amount_minor INTEGER DEFAULT 0;
ALTER TABLE ledger_lines ADD COLUMN account_instance_id TEXT;
ALTER TABLE ledger_lines ADD COLUMN coa_code TEXT;

CREATE INDEX IF NOT EXISTS idx_ll_instance     ON ledger_lines(account_instance_id);
CREATE INDEX IF NOT EXISTS idx_ll_coa          ON ledger_lines(coa_code);
CREATE INDEX IF NOT EXISTS idx_ll_line_number  ON ledger_lines(journal_id, line_number);

-- ── 8. Ledger Accounts V2 columns (bridge) ──────────────────────────────────
-- Link legacy accounts to the new CoA and instance system.

ALTER TABLE ledger_accounts ADD COLUMN coa_code TEXT;
ALTER TABLE ledger_accounts ADD COLUMN account_instance_id TEXT;
ALTER TABLE ledger_accounts ADD COLUMN status TEXT DEFAULT 'OPEN';

CREATE INDEX IF NOT EXISTS idx_la_coa      ON ledger_accounts(coa_code);
CREATE INDEX IF NOT EXISTS idx_la_instance ON ledger_accounts(account_instance_id);

-- ── 9. Backfill legacy ledger_accounts → account_instances + coa_code ───────
-- Map old account_type to CoA codes.

UPDATE ledger_accounts SET coa_code = CASE account_type
  WHEN 'WALLET'               THEN CASE owner_type
    WHEN 'CUSTOMER' THEN '1100'
    WHEN 'AGENT'    THEN '1200'
    WHEN 'MERCHANT' THEN '1300'
    WHEN 'STAFF'    THEN '1400'
    ELSE '1100'
  END
  WHEN 'CASH_FLOAT'           THEN '1200'
  WHEN 'SUSPENSE'             THEN '1500'
  WHEN 'OVERDRAFT_FACILITY'   THEN '1600'
  WHEN 'FEE_REVENUE'          THEN '4100'
  WHEN 'TAX_PAYABLE'          THEN '2100'
  WHEN 'COMMISSIONS_PAYABLE'  THEN '2200'
  ELSE '1100'
END
WHERE coa_code IS NULL;

-- Create account_instances from existing ledger_accounts
INSERT OR IGNORE INTO account_instances (id, coa_code, owner_type, owner_id, currency, status, opened_at, legacy_account_id, created_at, updated_at)
SELECT
  'ai-' || id,
  COALESCE(coa_code, '1100'),
  owner_type,
  owner_id,
  currency,
  'OPEN',
  created_at,
  id,
  created_at,
  created_at
FROM ledger_accounts;

-- Back-link ledger_accounts to their new instance
UPDATE ledger_accounts SET account_instance_id = 'ai-' || id
WHERE account_instance_id IS NULL;

-- ── 10. Backfill ledger_lines with minor-unit amounts ───────────────────────
-- Convert TEXT "123.45" → INTEGER 12345 for existing lines.

UPDATE ledger_lines SET
  debit_amount_minor  = CASE WHEN entry_type = 'DR' THEN CAST(REPLACE(amount, '.', '') AS INTEGER) ELSE 0 END,
  credit_amount_minor = CASE WHEN entry_type = 'CR' THEN CAST(REPLACE(amount, '.', '') AS INTEGER) ELSE 0 END
WHERE debit_amount_minor = 0 AND credit_amount_minor = 0 AND amount IS NOT NULL;

-- Backfill line numbers for existing lines (ordered by id within each journal)
UPDATE ledger_lines SET line_number = (
  SELECT COUNT(*) FROM ledger_lines ll2
  WHERE ll2.journal_id = ledger_lines.journal_id AND ll2.id <= ledger_lines.id
)
WHERE line_number IS NULL;

-- Backfill coa_code on ledger_lines from their account
UPDATE ledger_lines SET coa_code = (
  SELECT la.coa_code FROM ledger_accounts la WHERE la.id = ledger_lines.account_id
)
WHERE coa_code IS NULL;

-- Backfill account_instance_id on ledger_lines
UPDATE ledger_lines SET account_instance_id = (
  SELECT la.account_instance_id FROM ledger_accounts la WHERE la.id = ledger_lines.account_id
)
WHERE account_instance_id IS NULL;

-- ── 11. Sub-Ledger Accounts ─────────────────────────────────────────────────
-- Links parent actors (aggregators) to child actors for hierarchical rollups.

CREATE TABLE IF NOT EXISTS subledger_accounts (
  id                    TEXT PRIMARY KEY,
  parent_actor_id       TEXT NOT NULL REFERENCES actors(id),
  child_actor_id        TEXT NOT NULL REFERENCES actors(id),
  account_instance_id   TEXT NOT NULL REFERENCES account_instances(id),
  relationship_type     TEXT NOT NULL DEFAULT 'AGGREGATOR_CHILD'
    CHECK(relationship_type IN ('AGGREGATOR_CHILD','MERCHANT_STORE','FRANCHISE','BRANCH')),
  effective_from        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  effective_to          TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sla_parent_child
  ON subledger_accounts(parent_actor_id, child_actor_id, account_instance_id);
CREATE INDEX IF NOT EXISTS idx_sla_parent   ON subledger_accounts(parent_actor_id);
CREATE INDEX IF NOT EXISTS idx_sla_child    ON subledger_accounts(child_actor_id);
CREATE INDEX IF NOT EXISTS idx_sla_instance ON subledger_accounts(account_instance_id);

-- Auto-create sub-ledger entries for existing agent hierarchy
INSERT OR IGNORE INTO subledger_accounts (id, parent_actor_id, child_actor_id, account_instance_id, relationship_type, effective_from)
SELECT
  'sla-' || ap.id,
  ap.parent_agent_id,
  ap.agent_id,
  COALESCE(ai.id, ''),
  'AGGREGATOR_CHILD',
  ap.effective_from
FROM agent_parent ap
LEFT JOIN account_instances ai ON ai.owner_id = ap.agent_id AND ai.coa_code = '1200'
WHERE ap.effective_to IS NULL
  AND ai.id IS NOT NULL;

-- Auto-create sub-ledger entries for existing merchant store hierarchy
INSERT OR IGNORE INTO subledger_accounts (id, parent_actor_id, child_actor_id, account_instance_id, relationship_type)
SELECT
  'sla-msc-' || msc.descendant_id,
  msc.ancestor_id,
  msc.descendant_id,
  COALESCE(ai.id, ''),
  'MERCHANT_STORE'
FROM merchant_store_closure msc
LEFT JOIN account_instances ai ON ai.owner_id = msc.descendant_id AND ai.coa_code = '1300'
WHERE msc.depth = 1
  AND ai.id IS NOT NULL;

-- ── 12. Daily Balance Snapshots ─────────────────────────────────────────────
-- Stores end-of-day balances for each account instance.
-- Populated by a scheduled job; used for trial balance, GL, and statements.

CREATE TABLE IF NOT EXISTS daily_balance_snapshots (
  id                    TEXT PRIMARY KEY,
  account_instance_id   TEXT NOT NULL REFERENCES account_instances(id),
  snapshot_date         TEXT NOT NULL,
  opening_balance_minor INTEGER NOT NULL DEFAULT 0,
  debit_total_minor     INTEGER NOT NULL DEFAULT 0,
  credit_total_minor    INTEGER NOT NULL DEFAULT 0,
  closing_balance_minor INTEGER NOT NULL DEFAULT 0,
  journal_count         INTEGER NOT NULL DEFAULT 0,
  currency              TEXT NOT NULL DEFAULT 'BBD',
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dbs_instance_date
  ON daily_balance_snapshots(account_instance_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_dbs_date ON daily_balance_snapshots(snapshot_date);

-- ── 13. Reporting Views ─────────────────────────────────────────────────────

-- Trial Balance View: aggregates all account instances by CoA code
CREATE VIEW IF NOT EXISTS v_trial_balance AS
SELECT
  coa.code                          AS coa_code,
  coa.name                          AS account_name,
  coa.account_class,
  coa.normal_balance,
  ai.currency,
  COALESCE(SUM(ll.debit_amount_minor), 0)  AS total_debit_minor,
  COALESCE(SUM(ll.credit_amount_minor), 0) AS total_credit_minor,
  COALESCE(SUM(ll.debit_amount_minor), 0) - COALESCE(SUM(ll.credit_amount_minor), 0) AS net_balance_minor
FROM chart_of_accounts coa
JOIN account_instances ai ON ai.coa_code = coa.code AND ai.status = 'OPEN'
LEFT JOIN ledger_lines ll ON ll.account_instance_id = ai.id
GROUP BY coa.code, coa.name, coa.account_class, coa.normal_balance, ai.currency;

-- GL Detail View: full general ledger with line-level detail
CREATE VIEW IF NOT EXISTS v_gl_detail AS
SELECT
  lj.id                     AS journal_id,
  lj.txn_type,
  lj.currency,
  lj.state                  AS journal_state,
  lj.effective_date,
  lj.created_at             AS posted_at,
  lj.correlation_id,
  lj.description            AS journal_description,
  lj.posting_batch_id,
  lj.accounting_period_id,
  ll.id                     AS line_id,
  ll.line_number,
  ll.account_id,
  ll.account_instance_id,
  ll.coa_code,
  coa.name                  AS account_name,
  coa.account_class,
  ll.entry_type,
  ll.amount,
  ll.debit_amount_minor,
  ll.credit_amount_minor,
  ll.description            AS line_description
FROM ledger_journals lj
JOIN ledger_lines ll ON ll.journal_id = lj.id
LEFT JOIN chart_of_accounts coa ON coa.code = ll.coa_code;

-- Account Statement View: per-account ledger history
CREATE VIEW IF NOT EXISTS v_account_statement AS
SELECT
  ai.id                     AS account_instance_id,
  ai.owner_type,
  ai.owner_id,
  ai.coa_code,
  coa.name                  AS account_name,
  ai.currency,
  lj.id                     AS journal_id,
  lj.txn_type,
  lj.created_at             AS posted_at,
  lj.effective_date,
  lj.correlation_id,
  ll.id                     AS line_id,
  ll.line_number,
  ll.entry_type,
  ll.amount,
  ll.debit_amount_minor,
  ll.credit_amount_minor,
  ll.description            AS line_description
FROM account_instances ai
JOIN ledger_lines ll ON ll.account_instance_id = ai.id
JOIN ledger_journals lj ON lj.id = ll.journal_id
LEFT JOIN chart_of_accounts coa ON coa.code = ai.coa_code;

-- Sub-Ledger Rollup View: aggregated child balances for parent actors
CREATE VIEW IF NOT EXISTS v_subledger_rollup AS
SELECT
  sla.parent_actor_id,
  sla.relationship_type,
  ai.coa_code,
  coa.name                  AS account_name,
  ai.currency,
  COUNT(DISTINCT sla.child_actor_id)              AS child_count,
  COALESCE(SUM(ll.debit_amount_minor), 0)        AS total_debit_minor,
  COALESCE(SUM(ll.credit_amount_minor), 0)       AS total_credit_minor,
  COALESCE(SUM(ll.debit_amount_minor), 0)
    - COALESCE(SUM(ll.credit_amount_minor), 0)   AS net_balance_minor
FROM subledger_accounts sla
JOIN account_instances ai ON ai.id = sla.account_instance_id
LEFT JOIN ledger_lines ll ON ll.account_instance_id = ai.id
LEFT JOIN chart_of_accounts coa ON coa.code = ai.coa_code
WHERE sla.effective_to IS NULL
GROUP BY sla.parent_actor_id, sla.relationship_type, ai.coa_code, coa.name, ai.currency;
