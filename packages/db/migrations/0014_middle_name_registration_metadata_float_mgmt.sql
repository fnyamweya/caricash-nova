-- Migration 0014: Middle name, display name, registration metadata,
-- float management with actual/available balances, and expanded events
-- ============================================================================

-- ── 1. Actor profile enhancements ──────────────────────────────────────────

-- Add middle_name to actors for complete name representation
ALTER TABLE actors ADD COLUMN middle_name TEXT;

-- Add display_name for customer-chosen preferred name
ALTER TABLE actors ADD COLUMN display_name TEXT;

-- ── 2. Customer registration metadata ──────────────────────────────────────
-- Stores contextual information about how each customer was registered
-- (self-registration, agent-assisted, staff-assisted) with full audit trail.

CREATE TABLE IF NOT EXISTS registration_metadata (
  id              TEXT PRIMARY KEY,
  actor_id        TEXT NOT NULL REFERENCES actors(id),

  -- Registration channel / type
  registration_type TEXT NOT NULL CHECK (
    registration_type IN (
      'SELF_REGISTRATION',
      'AGENT_REGISTRATION',
      'STAFF_REGISTRATION',
      'BULK_IMPORT',
      'API_INTEGRATION',
      'MERCHANT_REFERRAL'
    )
  ),

  -- Who initiated the registration (the agent/staff actor if not self)
  registered_by_actor_id   TEXT REFERENCES actors(id),
  registered_by_actor_type TEXT,

  -- Channel / device metadata
  channel           TEXT CHECK (channel IN ('USSD', 'APP', 'WEB', 'API', 'PORTAL', 'IN_PERSON')),
  device_type       TEXT,          -- e.g. 'mobile', 'desktop', 'pos_terminal'
  device_info       TEXT,          -- User-Agent or device model
  ip_address        TEXT,          -- IP at time of registration
  geo_location      TEXT,          -- lat,lng or city/country if available

  -- Snapshot of actor state at registration time (immutable record)
  actor_snapshot_json TEXT NOT NULL DEFAULT '{}',

  -- Referral & campaign tracking (future-focused)
  referral_code     TEXT,
  campaign_id       TEXT,
  utm_source        TEXT,
  utm_medium        TEXT,
  utm_campaign      TEXT,

  -- Consent tracking
  terms_accepted_at   TEXT,
  privacy_accepted_at TEXT,
  marketing_opt_in    INTEGER NOT NULL DEFAULT 0,

  -- Verification steps completed during registration
  verification_json   TEXT DEFAULT '{}',

  -- Additional extensible metadata
  metadata_json     TEXT DEFAULT '{}',

  -- Timestamps
  started_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_reg_meta_actor         ON registration_metadata(actor_id);
CREATE INDEX IF NOT EXISTS idx_reg_meta_type          ON registration_metadata(registration_type);
CREATE INDEX IF NOT EXISTS idx_reg_meta_registered_by ON registration_metadata(registered_by_actor_id);
CREATE INDEX IF NOT EXISTS idx_reg_meta_channel       ON registration_metadata(channel);
CREATE INDEX IF NOT EXISTS idx_reg_meta_referral      ON registration_metadata(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reg_meta_campaign      ON registration_metadata(campaign_id) WHERE campaign_id IS NOT NULL;

-- ── 3. Account balances — actual & available ───────────────────────────────
-- Tracks both actual (posted) and available (usable) balances for every
-- ledger account. Available = actual - holds + pending_credits.
-- This is critical for agents (float) and merchants (settlement).

CREATE TABLE IF NOT EXISTS account_balances (
  account_id        TEXT PRIMARY KEY REFERENCES ledger_accounts(id),
  actual_balance    TEXT NOT NULL DEFAULT '0.00',
  available_balance TEXT NOT NULL DEFAULT '0.00',
  hold_amount       TEXT NOT NULL DEFAULT '0.00',   -- funds on hold (pending settlements, disputes)
  pending_credits   TEXT NOT NULL DEFAULT '0.00',   -- incoming credits not yet settled
  last_journal_id   TEXT,
  currency          TEXT NOT NULL DEFAULT 'BBD',
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_account_balances_currency ON account_balances(currency);

-- ── 4. Float management — top-up/deposit tracking ─────────────────────────
-- Records every float top-up operation by staff to agent wallets.
-- Provides complete audit trail for float management.

CREATE TABLE IF NOT EXISTS float_operations (
  id                TEXT PRIMARY KEY,
  agent_actor_id    TEXT NOT NULL REFERENCES actors(id),
  agent_account_id  TEXT NOT NULL REFERENCES ledger_accounts(id),
  staff_actor_id    TEXT NOT NULL REFERENCES actors(id),
  operation_type    TEXT NOT NULL CHECK (
    operation_type IN ('TOP_UP', 'WITHDRAWAL', 'ADJUSTMENT', 'CORRECTION')
  ),
  amount            TEXT NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'BBD',
  journal_id        TEXT REFERENCES ledger_journals(id),

  -- Before/after snapshots for audit
  balance_before    TEXT NOT NULL,
  balance_after     TEXT NOT NULL,
  available_before  TEXT NOT NULL,
  available_after   TEXT NOT NULL,

  -- Approval tracking (maker-checker for large amounts)
  requires_approval INTEGER NOT NULL DEFAULT 0,
  approval_id       TEXT REFERENCES approval_requests(id),

  reason            TEXT,
  reference         TEXT,         -- external reference number
  idempotency_key   TEXT NOT NULL,
  correlation_id    TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_float_ops_agent     ON float_operations(agent_actor_id);
CREATE INDEX IF NOT EXISTS idx_float_ops_staff     ON float_operations(staff_actor_id);
CREATE INDEX IF NOT EXISTS idx_float_ops_type      ON float_operations(operation_type);
CREATE INDEX IF NOT EXISTS idx_float_ops_journal   ON float_operations(journal_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_float_ops_idempotency ON float_operations(idempotency_key);

-- ── 5. Seed account_balances for existing ledger accounts ──────────────────
INSERT OR IGNORE INTO account_balances (account_id, actual_balance, available_balance, currency, updated_at)
SELECT id, '0.00', '0.00', currency, strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM ledger_accounts;
