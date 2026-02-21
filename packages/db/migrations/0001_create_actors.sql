-- Actors: customers, agents, merchants, stores, staff
CREATE TABLE IF NOT EXISTS actors (
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
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_actors_msisdn ON actors(msisdn) WHERE msisdn IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_actors_agent_code ON actors(agent_code) WHERE agent_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_actors_store_code ON actors(store_code) WHERE store_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_actors_staff_code ON actors(staff_code) WHERE staff_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_actors_type ON actors(type);
CREATE INDEX IF NOT EXISTS idx_actors_state ON actors(state);
