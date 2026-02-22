-- ============================================================================
-- 0019: Actor Type Separation
-- ============================================================================
-- Phase 1: Create type-specific profile tables and backfill from actors.
-- Phase 2: Replace global MSISDN unique index with (type, msisdn) composite
--          to allow the same phone number across different actor types
--          (e.g. a customer can also register as a merchant).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Customer profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_profiles (
  actor_id TEXT PRIMARY KEY REFERENCES actors(id),
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  display_name TEXT,
  preferred_name TEXT CHECK(preferred_name IN ('FIRST_NAME','MIDDLE_NAME','LAST_NAME','FULL_NAME','CUSTOM')),
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ---------------------------------------------------------------------------
-- 2. Merchant profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchant_profiles (
  actor_id TEXT PRIMARY KEY REFERENCES actors(id),
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  display_name TEXT,
  email TEXT,
  parent_actor_id TEXT REFERENCES actors(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ---------------------------------------------------------------------------
-- 3. Agent profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_profiles (
  actor_id TEXT PRIMARY KEY REFERENCES actors(id),
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  display_name TEXT,
  agent_code TEXT NOT NULL,
  agent_type TEXT NOT NULL CHECK(agent_type IN ('STANDARD','AGGREGATOR')),
  owner_name TEXT,
  msisdn TEXT,
  parent_actor_id TEXT REFERENCES actors(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_profiles_agent_code
  ON agent_profiles(agent_code);

-- ---------------------------------------------------------------------------
-- 4. Staff profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_profiles (
  actor_id TEXT PRIMARY KEY REFERENCES actors(id),
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  display_name TEXT,
  staff_code TEXT NOT NULL,
  staff_role TEXT NOT NULL CHECK(staff_role IN ('SUPER_ADMIN','ADMIN','OPERATIONS','COMPLIANCE','FINANCE','SUPPORT')),
  email TEXT,
  msisdn TEXT,
  department TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_profiles_staff_code
  ON staff_profiles(staff_code);

-- ---------------------------------------------------------------------------
-- 5. Backfill profile tables from existing actors data
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO customer_profiles (actor_id, first_name, middle_name, last_name, display_name, email, created_at, updated_at)
  SELECT id, first_name, middle_name, last_name, display_name, email, created_at, updated_at
  FROM actors WHERE type = 'CUSTOMER';

INSERT OR IGNORE INTO merchant_profiles (actor_id, first_name, middle_name, last_name, display_name, email, parent_actor_id, created_at, updated_at)
  SELECT id, first_name, middle_name, last_name, display_name, email, parent_actor_id, created_at, updated_at
  FROM actors WHERE type = 'MERCHANT';

INSERT OR IGNORE INTO agent_profiles (actor_id, first_name, middle_name, last_name, display_name, agent_code, agent_type, msisdn, parent_actor_id, created_at, updated_at)
  SELECT id, first_name, middle_name, last_name, display_name, agent_code, agent_type, msisdn, parent_actor_id, created_at, updated_at
  FROM actors WHERE type = 'AGENT' AND agent_code IS NOT NULL;

INSERT OR IGNORE INTO staff_profiles (actor_id, first_name, middle_name, last_name, display_name, staff_code, staff_role, email, msisdn, created_at, updated_at)
  SELECT id, first_name, middle_name, last_name, display_name, staff_code, staff_role, email, msisdn, created_at, updated_at
  FROM actors WHERE type = 'STAFF' AND staff_code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. Phase 2 — Replace global MSISDN uniqueness with (type, msisdn) composite
--    This allows the same phone number to exist for different actor types.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_actors_msisdn;
CREATE UNIQUE INDEX IF NOT EXISTS idx_actors_type_msisdn
  ON actors(type, msisdn) WHERE msisdn IS NOT NULL;

-- The type-specific code indexes stay on their profile tables;
-- keep the legacy actors indexes for backward-compat during transition.
-- They'll be dropped in a future cleanup migration once all reads go
-- through the profile tables.
