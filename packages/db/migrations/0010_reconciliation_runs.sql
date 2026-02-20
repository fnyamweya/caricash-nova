-- Phase 2 PR3+PR4: Reconciliation runs tracking + state repair support

-- Reconciliation runs table — tracks each reconciliation execution
CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'RUNNING' CHECK(status IN ('RUNNING','COMPLETED','FAILED')),
  accounts_checked INTEGER DEFAULT 0,
  mismatches_found INTEGER DEFAULT 0,
  summary_json TEXT,
  triggered_by TEXT,
  correlation_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_status ON reconciliation_runs(status);
CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_started ON reconciliation_runs(started_at);

-- Add currency column to reconciliation_findings for per-currency tracking
ALTER TABLE reconciliation_findings ADD COLUMN currency TEXT DEFAULT 'BBD';

-- Add request_id and action_type to audit_log for governance tracking
ALTER TABLE audit_log ADD COLUMN request_id TEXT;
ALTER TABLE audit_log ADD COLUMN action_type TEXT DEFAULT 'CREATE' CHECK(action_type IN ('CREATE','APPROVE','REJECT','REPAIR','VERIFY'));

CREATE INDEX IF NOT EXISTS idx_audit_log_request ON audit_log(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_type ON audit_log(action_type);
