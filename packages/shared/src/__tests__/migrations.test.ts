import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../db/migrations');

describe('D1 migration smoke tests', () => {
  it('migration files exist for all required tables', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).sort();
    expect(files.length).toBeGreaterThanOrEqual(10);

    // Phase 1 migrations
    expect(files).toContain('0001_create_actors.sql');
    expect(files).toContain('0002_create_auth.sql');
    expect(files).toContain('0003_create_ledger.sql');
    expect(files).toContain('0004_create_governance.sql');
    expect(files).toContain('0005_create_configuration.sql');
    expect(files).toContain('0006_create_hierarchy.sql');
    expect(files).toContain('0007_create_events.sql');
    expect(files).toContain('0008_create_idempotency.sql');

    // Phase 2 migrations
    expect(files).toContain('0009_phase2_schema_hardening.sql');
    expect(files).toContain('0010_reconciliation_runs.sql');
  });

  it('ledger_journals migration contains required columns', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '0003_create_ledger.sql'), 'utf-8');
    expect(sql).toContain('ledger_journals');
    expect(sql).toContain('idempotency_key');
    expect(sql).toContain('currency');
    expect(sql).toContain('correlation_id');
    expect(sql).toContain('state');
    expect(sql).toContain('idx_ledger_journals_idempotency');
    expect(sql).toContain('idx_ledger_journals_correlation');
  });

  it('ledger_lines migration contains required columns', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '0003_create_ledger.sql'), 'utf-8');
    expect(sql).toContain('ledger_lines');
    expect(sql).toContain('journal_id');
    expect(sql).toContain('account_id');
    expect(sql).toContain('entry_type');
    expect(sql).toContain("CHECK(entry_type IN ('DR','CR'))");
  });

  it('phase 2 migration creates overdraft_facilities table', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '0009_phase2_schema_hardening.sql'), 'utf-8');
    expect(sql).toContain('overdraft_facilities');
    expect(sql).toContain('limit_amount');
    expect(sql).toContain('maker_staff_id');
  });

  it('phase 2 migration creates wallet_balances table', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '0009_phase2_schema_hardening.sql'), 'utf-8');
    expect(sql).toContain('wallet_balances');
    expect(sql).toContain('last_journal_id');
  });

  it('phase 2 migration creates reconciliation_findings table', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '0009_phase2_schema_hardening.sql'), 'utf-8');
    expect(sql).toContain('reconciliation_findings');
    expect(sql).toContain('expected_balance');
    expect(sql).toContain('actual_balance');
    expect(sql).toContain('discrepancy');
    expect(sql).toContain('severity');
  });

  it('phase 2 migration adds scope_hash and payload_hash to idempotency', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '0009_phase2_schema_hardening.sql'), 'utf-8');
    expect(sql).toContain('payload_hash');
    expect(sql).toContain('scope_hash');
    expect(sql).toContain('idx_idempotency_scope_hash');
  });

  it('phase 2 migration adds initiator_actor_id and hash columns to journals', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '0009_phase2_schema_hardening.sql'), 'utf-8');
    expect(sql).toContain('initiator_actor_id');
    expect(sql).toContain('prev_hash');
    expect(sql).toContain('hash');
  });

  it('actors migration contains uniqueness constraints', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '0001_create_actors.sql'), 'utf-8');
    expect(sql).toContain('idx_actors_msisdn');
    expect(sql).toContain('idx_actors_agent_code');
    expect(sql).toContain('idx_actors_store_code');
    expect(sql).toContain('idx_actors_staff_code');
  });

  it('events migration contains required indexes', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '0007_create_events.sql'), 'utf-8');
    expect(sql).toContain('idx_events_entity');
    expect(sql).toContain('idx_events_correlation');
  });

  it('accounts have unique constraint on owner+type+currency', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '0003_create_ledger.sql'), 'utf-8');
    expect(sql).toContain('idx_ledger_accounts_owner_currency_type');
  });

  it('PR3+PR4 migration creates reconciliation_runs table', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '0010_reconciliation_runs.sql'), 'utf-8');
    expect(sql).toContain('reconciliation_runs');
    expect(sql).toContain('started_at');
    expect(sql).toContain('finished_at');
    expect(sql).toContain('status');
    expect(sql).toContain("CHECK(status IN ('RUNNING','COMPLETED','FAILED'))");
    expect(sql).toContain('summary_json');
    expect(sql).toContain('triggered_by');
  });

  it('PR3+PR4 migration adds currency to reconciliation_findings', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '0010_reconciliation_runs.sql'), 'utf-8');
    expect(sql).toContain('ALTER TABLE reconciliation_findings ADD COLUMN currency');
  });

  it('PR3+PR4 migration adds audit_log governance columns', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '0010_reconciliation_runs.sql'), 'utf-8');
    expect(sql).toContain('request_id');
    expect(sql).toContain('action_type');
    expect(sql).toContain("CHECK(action_type IN ('CREATE','APPROVE','REJECT','REPAIR','VERIFY'))");
  });
});
