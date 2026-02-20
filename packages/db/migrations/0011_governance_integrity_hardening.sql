-- Phase 2 PR3+PR4 hardening: governance constraints + integrity

-- Maker-checker DB constraint: prevent maker = checker on approval_requests
-- Note: SQLite does not support ALTER TABLE ADD CHECK after table creation.
-- We enforce this via application-level guard + a trigger.
CREATE TRIGGER IF NOT EXISTS trg_approval_maker_ne_checker
BEFORE UPDATE ON approval_requests
FOR EACH ROW
WHEN NEW.checker_staff_id IS NOT NULL AND NEW.maker_staff_id = NEW.checker_staff_id
BEGIN
  SELECT RAISE(ABORT, 'MAKER_CHECKER_VIOLATION: maker_staff_id must differ from checker_staff_id');
END;

-- Add resolved boolean to reconciliation_findings for spec compliance
ALTER TABLE reconciliation_findings ADD COLUMN resolved INTEGER DEFAULT 0;

-- Index for hash chain integrity verification ordering
CREATE INDEX IF NOT EXISTS idx_ledger_journals_created_asc ON ledger_journals(created_at ASC);
