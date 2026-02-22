-- Migration 0015: Dynamic Approval Type Configs & Endpoint Bindings
--
-- Allows approval types and their endpoint associations to be configured
-- at runtime via API rather than requiring code changes.
--
-- Tables:
--   approval_type_configs      – defines each approval type with metadata
--   approval_endpoint_bindings – maps (route, method) → approval_type

-- ═══════════════════════════════════════════════════════════════════════
-- 1. approval_type_configs
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS approval_type_configs (
  type_key              TEXT    PRIMARY KEY,
  label                 TEXT    NOT NULL,
  description           TEXT,
  default_checker_roles_json TEXT,          -- JSON array of StaffRole strings, e.g. '["FINANCE","SUPER_ADMIN"]'
  require_reason        INTEGER NOT NULL DEFAULT 0,  -- 1 = maker must provide a reason
  has_code_handler      INTEGER NOT NULL DEFAULT 0,  -- 1 = a code-level ApprovalHandler is registered
  auto_policy_id        TEXT,                        -- default policy to attach (optional)
  enabled               INTEGER NOT NULL DEFAULT 1,
  created_by            TEXT,
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_atc_enabled ON approval_type_configs(enabled);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. approval_endpoint_bindings
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS approval_endpoint_bindings (
  id                    TEXT    PRIMARY KEY,
  route_pattern         TEXT    NOT NULL,              -- e.g. '/merchants/:id/withdraw'
  http_method           TEXT    NOT NULL DEFAULT 'POST', -- GET, POST, PUT, PATCH, DELETE
  approval_type         TEXT    NOT NULL REFERENCES approval_type_configs(type_key),
  description           TEXT,
  extract_payload_json  TEXT,                          -- JSON template for payload extraction from request body
  enabled               INTEGER NOT NULL DEFAULT 1,
  created_by            TEXT,
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aeb_route_method
  ON approval_endpoint_bindings(route_pattern, http_method);

CREATE INDEX IF NOT EXISTS idx_aeb_type
  ON approval_endpoint_bindings(approval_type);

CREATE INDEX IF NOT EXISTS idx_aeb_enabled
  ON approval_endpoint_bindings(enabled);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Seed existing 6 built-in approval types
-- ═══════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO approval_type_configs (type_key, label, description, default_checker_roles_json, has_code_handler, require_reason)
VALUES
  ('REVERSAL_REQUESTED',
   'Transaction Reversal',
   'Reverse a previously posted journal entry',
   '["OPERATIONS","SUPER_ADMIN"]',
   1, 0),

  ('MANUAL_ADJUSTMENT_REQUESTED',
   'Manual Adjustment',
   'Manual credit/debit adjustment between accounts',
   '["FINANCE","SUPER_ADMIN"]',
   1, 1),

  ('FEE_MATRIX_CHANGE_REQUESTED',
   'Fee Matrix Change',
   'Activate a new fee matrix version',
   '["FINANCE","SUPER_ADMIN"]',
   1, 0),

  ('COMMISSION_MATRIX_CHANGE_REQUESTED',
   'Commission Matrix Change',
   'Activate a new commission matrix version',
   '["FINANCE","SUPER_ADMIN"]',
   1, 0),

  ('OVERDRAFT_FACILITY_REQUESTED',
   'Overdraft Facility',
   'Grant overdraft facility to an account',
   '["FINANCE","SUPER_ADMIN"]',
   1, 1),

  ('MERCHANT_WITHDRAWAL_REQUESTED',
   'Merchant Withdrawal',
   'Withdraw funds from a merchant wallet',
   '["OPERATIONS","FINANCE","SUPER_ADMIN"]',
   1, 0);
