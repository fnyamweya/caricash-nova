-- Migration 0018: Agent users and explicit agent hierarchy support

CREATE TABLE IF NOT EXISTS agent_users (
  id               TEXT PRIMARY KEY,
  actor_id         TEXT NOT NULL REFERENCES actors(id),
  msisdn           TEXT NOT NULL,
  name             TEXT NOT NULL,
  role             TEXT NOT NULL CHECK (role IN ('agent_owner', 'manager', 'cashier', 'viewer')),
  pin_hash         TEXT,
  salt             TEXT,
  state            TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE', 'SUSPENDED', 'REMOVED')),
  failed_attempts  INTEGER NOT NULL DEFAULT 0,
  locked_until     TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(actor_id, msisdn)
);

CREATE INDEX IF NOT EXISTS idx_agent_users_actor ON agent_users(actor_id);
CREATE INDEX IF NOT EXISTS idx_agent_users_msisdn ON agent_users(msisdn);

-- Backfill one owner user per existing agent actor where possible
INSERT OR IGNORE INTO agent_users (
  id,
  actor_id,
  msisdn,
  name,
  role,
  pin_hash,
  salt,
  state,
  failed_attempts,
  locked_until,
  created_at,
  updated_at
)
SELECT
  'agent_user_' || a.id,
  a.id,
  a.msisdn,
  a.name,
  'agent_owner',
  p.pin_hash,
  p.salt,
  'ACTIVE',
  COALESCE(p.failed_attempts, 0),
  p.locked_until,
  a.created_at,
  a.updated_at
FROM actors a
LEFT JOIN pins p ON p.actor_id = a.id
WHERE a.type = 'AGENT' AND a.msisdn IS NOT NULL;
