-- Migration 0017: Reservable 6-digit codes for agents and merchant stores

CREATE TABLE IF NOT EXISTS code_reservations (
  id TEXT PRIMARY KEY,
  code_type TEXT NOT NULL CHECK(code_type IN ('AGENT','STORE')),
  code_value TEXT NOT NULL CHECK(length(code_value) = 6),
  reserved_by_actor_id TEXT REFERENCES actors(id),
  status TEXT NOT NULL DEFAULT 'RESERVED' CHECK(status IN ('RESERVED','USED','EXPIRED')),
  expires_at TEXT NOT NULL,
  used_by_actor_id TEXT REFERENCES actors(id),
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(code_type, code_value)
);

CREATE INDEX IF NOT EXISTS idx_code_reservations_type_status_expiry
  ON code_reservations(code_type, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_code_reservations_reserved_by
  ON code_reservations(reserved_by_actor_id, code_type, status);
