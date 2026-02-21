-- Migration 0015: add SUPER_ADMIN staff role and seed super-admin actor

PRAGMA foreign_keys = OFF;

-- Rebuild actors table so staff_role CHECK includes SUPER_ADMIN
CREATE TABLE IF NOT EXISTS actors_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('CUSTOMER','AGENT','MERCHANT','STAFF')),
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','ACTIVE','SUSPENDED','CLOSED')),
  name TEXT NOT NULL,
  msisdn TEXT,
  agent_code TEXT,
  agent_type TEXT CHECK(agent_type IN ('STANDARD','AGGREGATOR')),
  store_code TEXT,
  staff_code TEXT,
  staff_role TEXT CHECK(staff_role IN ('SUPER_ADMIN','ADMIN','OPERATIONS','COMPLIANCE','FINANCE','SUPPORT')),
  kyc_state TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK(kyc_state IN ('NOT_STARTED','PENDING','APPROVED','REJECTED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  parent_actor_id TEXT REFERENCES actors(id),
  middle_name TEXT,
  display_name TEXT
);

INSERT INTO actors_new (
  id, type, state, name, msisdn, agent_code, agent_type, store_code,
  staff_code, staff_role, kyc_state, created_at, updated_at,
  first_name, last_name, email, parent_actor_id, middle_name, display_name
)
SELECT
  id, type, state, name, msisdn, agent_code, agent_type, store_code,
  staff_code, staff_role, kyc_state, created_at, updated_at,
  first_name, last_name, email, parent_actor_id, middle_name, display_name
FROM actors;

DROP TABLE actors;
ALTER TABLE actors_new RENAME TO actors;

CREATE UNIQUE INDEX IF NOT EXISTS idx_actors_msisdn ON actors(msisdn) WHERE msisdn IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_actors_agent_code ON actors(agent_code) WHERE agent_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_actors_store_code ON actors(store_code) WHERE store_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_actors_staff_code ON actors(staff_code) WHERE staff_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_actors_type ON actors(type);
CREATE INDEX IF NOT EXISTS idx_actors_state ON actors(state);

PRAGMA foreign_keys = ON;

-- Seed super-admin actor row (PIN seeded by API bootstrap using PIN_PEPPER)
INSERT OR IGNORE INTO actors (
  id, type, state, name, staff_code, staff_role, kyc_state, created_at, updated_at,
  first_name, last_name, display_name
) VALUES (
  'staff_super_admin_seed',
  'STAFF',
  'ACTIVE',
  'CariCash Super Admin',
  'SUPERADMIN001',
  'SUPER_ADMIN',
  'APPROVED',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'Super',
  'Admin',
  'Super Admin'
);
