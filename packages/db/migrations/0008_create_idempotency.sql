-- Idempotency records
CREATE TABLE IF NOT EXISTS idempotency_records (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_scope_key ON idempotency_records(scope, idempotency_key);
