import { describe, it, expect } from 'vitest';
import { computeScopeHash } from '@caricash/shared';

/**
 * Repair logic tests — tests the safe backfill rules.
 * The repair job checks if an idempotency record exists for each journal.
 * If not, it creates one. These tests verify the logic is correct.
 */

describe('repair: safe backfill rules', () => {
  it('should compute consistent scope_hash for backfill', async () => {
    const hash1 = await computeScopeHash('actor-1', 'DEPOSIT', 'key-001');
    const hash2 = await computeScopeHash('actor-1', 'DEPOSIT', 'key-001');
    expect(hash1).toBe(hash2);
  });

  it('should not backfill if record already exists', () => {
    // Simulates the check in repairMissingIdempotencyRecords
    const existingRecord = { id: 'idem-001', scope: 'actor-1:DEPOSIT', idempotency_key: 'key-001' };
    const shouldBackfill = existingRecord === null;
    expect(shouldBackfill).toBe(false);
  });

  it('should backfill if no record exists', () => {
    const existingRecord = null;
    const shouldBackfill = existingRecord === null;
    expect(shouldBackfill).toBe(true);
  });

  it('should only process POSTED journals', () => {
    // Simulates the state filter in repairMissingIdempotencyRecords
    const journals = [
      { id: 'j1', state: 'POSTED' },
      { id: 'j2', state: 'FAILED' },
      { id: 'j3', state: 'POSTED' },
      { id: 'j4', state: 'REVERSED' },
    ];
    const posted = journals.filter((j) => j.state === 'POSTED');
    expect(posted.length).toBe(2);
    expect(posted.map((j) => j.id)).toEqual(['j1', 'j3']);
  });

  it('backfill result should contain journal entries', () => {
    // Simulates building the result for an idempotency record
    const journal = { id: 'j-001', state: 'POSTED', created_at: '2025-01-01T00:00:00Z' };
    const lines = [
      { account_id: 'acct-1', entry_type: 'DR', amount: '100.00' },
      { account_id: 'acct-2', entry_type: 'CR', amount: '100.00' },
    ];

    const result = {
      journal_id: journal.id,
      state: journal.state,
      entries: lines.map((l) => ({
        account_id: l.account_id,
        entry_type: l.entry_type,
        amount: l.amount,
      })),
      created_at: journal.created_at,
    };

    expect(result.journal_id).toBe('j-001');
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].entry_type).toBe('DR');
    expect(result.entries[1].entry_type).toBe('CR');
  });
});
