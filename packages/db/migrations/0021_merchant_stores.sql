-- ===========================================================================
-- Migration 0021: merchant_stores + store_payment_nodes + merchant store roles
-- ===========================================================================
-- Introduces a proper merchant_stores table decoupled from the actors table,
-- a store_payment_nodes table for payment node management per store,
-- and expands merchant-user roles with store-level role granularity.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. merchant_stores table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchant_stores (
  id          TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES actors(id),
  name        TEXT NOT NULL,
  legal_name  TEXT,
  store_code  TEXT NOT NULL UNIQUE,
  is_primary  INTEGER NOT NULL DEFAULT 0,
  location    TEXT,  -- JSON: { address, city, country, lat, lng, ... }
  status      TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','suspended','closed')),
  kyc_profile TEXT,  -- optional reference / JSON to kyc data
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_merchant_stores_merchant ON merchant_stores(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_stores_status   ON merchant_stores(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_stores_code ON merchant_stores(store_code);

-- ---------------------------------------------------------------------------
-- 2. store_payment_nodes table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_payment_nodes (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES merchant_stores(id),
  store_node_name TEXT NOT NULL,
  store_node_code TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','suspended','closed')),
  is_primary      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_spn_store   ON store_payment_nodes(store_id);
CREATE INDEX IF NOT EXISTS idx_spn_code    ON store_payment_nodes(store_node_code);
CREATE INDEX IF NOT EXISTS idx_spn_status  ON store_payment_nodes(status);

-- ---------------------------------------------------------------------------
-- 3. Expand merchant_users role CHECK to include new merchant-store roles
-- ---------------------------------------------------------------------------
-- SQLite does not support ALTER TABLE ... ALTER COLUMN, so we recreate.
-- New roles: store_admin, store_supervisor in addition to existing
-- store_owner, manager, cashier, viewer.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchant_users_new (
  id              TEXT PRIMARY KEY,
  actor_id        TEXT NOT NULL REFERENCES actors(id),
  store_id        TEXT REFERENCES merchant_stores(id),
  msisdn          TEXT NOT NULL,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL
    CHECK(role IN ('store_owner','store_admin','store_supervisor','manager','cashier','viewer')),
  pin_hash        TEXT,
  salt            TEXT,
  state           TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK(state IN ('ACTIVE','SUSPENDED','REMOVED')),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Copy existing data (store_id will be NULL for existing rows; backfilled later)
INSERT INTO merchant_users_new
  (id, actor_id, store_id, msisdn, name, role, pin_hash, salt, state, failed_attempts, locked_until, created_at, updated_at)
SELECT
  id, actor_id, NULL, msisdn, name, role, pin_hash, salt, state, failed_attempts, locked_until, created_at, updated_at
FROM merchant_users;

DROP TABLE IF EXISTS merchant_users;
ALTER TABLE merchant_users_new RENAME TO merchant_users;

-- Re-create indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_users_actor_msisdn
  ON merchant_users(actor_id, msisdn);
CREATE INDEX IF NOT EXISTS idx_merchant_users_store
  ON merchant_users(store_id);

-- ---------------------------------------------------------------------------
-- 4. Backfill: migrate existing store actors into merchant_stores table
-- ---------------------------------------------------------------------------
-- Existing stores are actors with type='MERCHANT' and store_code IS NOT NULL.
-- Their parent_actor_id points to the parent merchant actor.
-- We migrate them into the new merchant_stores table.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO merchant_stores (id, merchant_id, name, store_code, is_primary, status, created_at, updated_at)
SELECT
  a.id,
  COALESCE(a.parent_actor_id, a.id) AS merchant_id,
  a.name,
  a.store_code,
  CASE WHEN a.parent_actor_id IS NULL THEN 1 ELSE 0 END AS is_primary,
  CASE a.state
    WHEN 'ACTIVE' THEN 'active'
    WHEN 'SUSPENDED' THEN 'suspended'
    WHEN 'CLOSED' THEN 'closed'
    ELSE 'active'
  END AS status,
  a.created_at,
  a.updated_at
FROM actors a
WHERE a.type = 'MERCHANT' AND a.store_code IS NOT NULL;

-- Backfill merchant_users.store_id from the migrated data
UPDATE merchant_users
SET store_id = (
  SELECT ms.id FROM merchant_stores ms WHERE ms.id = merchant_users.actor_id
)
WHERE store_id IS NULL
  AND EXISTS (SELECT 1 FROM merchant_stores ms WHERE ms.id = merchant_users.actor_id);
