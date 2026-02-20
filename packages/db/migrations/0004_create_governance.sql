-- Maker-checker approval requests
CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  maker_staff_id TEXT NOT NULL REFERENCES actors(id),
  checker_staff_id TEXT REFERENCES actors(id),
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','APPROVED','REJECTED','EXPIRED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  decided_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_state ON approval_requests(state);
CREATE INDEX IF NOT EXISTS idx_approval_requests_type ON approval_requests(type);
CREATE INDEX IF NOT EXISTS idx_approval_requests_maker ON approval_requests(maker_staff_id);
