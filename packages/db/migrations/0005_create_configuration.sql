-- Fee matrix versions (versioned + effective-dated)
CREATE TABLE IF NOT EXISTS fee_matrix_versions (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','APPROVED','REJECTED','EXPIRED')),
  effective_from TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES actors(id),
  approved_by TEXT REFERENCES actors(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Fee rules
CREATE TABLE IF NOT EXISTS fee_rules (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES fee_matrix_versions(id),
  txn_type TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BBD',
  flat_amount TEXT NOT NULL DEFAULT '0.00',
  percent_amount TEXT NOT NULL DEFAULT '0.00',
  min_amount TEXT NOT NULL DEFAULT '0.00',
  max_amount TEXT NOT NULL DEFAULT '999999.99',
  tax_rate TEXT NOT NULL DEFAULT '0.00'
);

CREATE INDEX IF NOT EXISTS idx_fee_rules_version ON fee_rules(version_id);
CREATE INDEX IF NOT EXISTS idx_fee_rules_lookup ON fee_rules(version_id, txn_type, currency);

-- Commission matrix versions
CREATE TABLE IF NOT EXISTS commission_matrix_versions (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','APPROVED','REJECTED','EXPIRED')),
  effective_from TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES actors(id),
  approved_by TEXT REFERENCES actors(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Commission rules
CREATE TABLE IF NOT EXISTS commission_rules (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES commission_matrix_versions(id),
  txn_type TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BBD',
  agent_type TEXT NOT NULL DEFAULT 'STANDARD',
  flat_amount TEXT NOT NULL DEFAULT '0.00',
  percent_amount TEXT NOT NULL DEFAULT '0.00'
);

CREATE INDEX IF NOT EXISTS idx_commission_rules_version ON commission_rules(version_id);
CREATE INDEX IF NOT EXISTS idx_commission_rules_lookup ON commission_rules(version_id, txn_type, currency);
