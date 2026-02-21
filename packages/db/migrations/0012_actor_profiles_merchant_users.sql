-- Migration 0012: Actor profiles & merchant users
-- Adds first_name, last_name, email to actors table for profile data.
-- Creates merchant_users table for multi-user merchant access.

-- ── Actor profile columns ────────────────────────────────────────────────────
ALTER TABLE actors ADD COLUMN first_name TEXT;
ALTER TABLE actors ADD COLUMN last_name TEXT;
ALTER TABLE actors ADD COLUMN email TEXT;

-- ── Merchant users ───────────────────────────────────────────────────────────
-- A merchant (actor) can have multiple users. The creator is the store_owner.
-- Other users can be added with roles: cashier, manager, viewer.
CREATE TABLE IF NOT EXISTS merchant_users (
  id            TEXT PRIMARY KEY,
  actor_id      TEXT NOT NULL REFERENCES actors(id),  -- the merchant actor
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT,
  display_name  TEXT NOT NULL,  -- convenience: "first last"
  role          TEXT NOT NULL CHECK (role IN ('store_owner', 'manager', 'cashier', 'viewer')),
  pin_hash      TEXT,
  salt          TEXT,
  state         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE', 'SUSPENDED', 'REMOVED')),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_merchant_users_actor ON merchant_users(actor_id);
CREATE INDEX idx_merchant_users_email ON merchant_users(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_merchant_users_actor_email ON merchant_users(actor_id, email) WHERE email IS NOT NULL;
