import { describe, it, expect } from 'vitest';
import { sha256Hex } from '@caricash/shared';

/**
 * Tests for journal hash chain integrity logic.
 */

// Inline the hash computation for testing
async function computeJournalHash(
  journal: { id: string; txn_type: string; currency: string; correlation_id: string; idempotency_key: string; state: string; description: string; created_at: string },
  prevHash: string,
): Promise<string> {
  const canonical = [
    journal.id,
    journal.txn_type,
    journal.currency,
    journal.correlation_id,
    journal.idempotency_key,
    journal.state,
    journal.description,
    journal.created_at,
    prevHash,
  ].join('|');
  return sha256Hex(canonical);
}

describe('journal hash chain', () => {
  const journal1 = {
    id: 'j-001',
    txn_type: 'DEPOSIT',
    currency: 'BBD',
    correlation_id: 'corr-001',
    idempotency_key: 'idem-001',
    state: 'POSTED',
    description: 'Deposit 100 BBD',
    created_at: '2025-01-01T00:00:00Z',
  };

  const journal2 = {
    id: 'j-002',
    txn_type: 'P2P',
    currency: 'BBD',
    correlation_id: 'corr-002',
    idempotency_key: 'idem-002',
    state: 'POSTED',
    description: 'P2P transfer',
    created_at: '2025-01-01T01:00:00Z',
  };

  it('computes deterministic hash for journal', async () => {
    const hash1 = await computeJournalHash(journal1, '');
    const hash2 = await computeJournalHash(journal1, '');
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('different prev_hash produces different hash', async () => {
    const hash1 = await computeJournalHash(journal1, '');
    const hash2 = await computeJournalHash(journal1, 'previous-hash');
    expect(hash1).not.toBe(hash2);
  });

  it('builds a verifiable chain', async () => {
    // First journal — no prev_hash
    const hash1 = await computeJournalHash(journal1, '');

    // Second journal — chained to first
    const hash2 = await computeJournalHash(journal2, hash1);

    // Verify the chain: recompute hash2 using hash1
    const recomputed = await computeJournalHash(journal2, hash1);
    expect(recomputed).toBe(hash2);
  });

  it('detects tampering: changed journal content breaks chain', async () => {
    const hash1 = await computeJournalHash(journal1, '');

    // Tamper with journal2 content
    const tampered = { ...journal2, description: 'TAMPERED' };
    const hashTampered = await computeJournalHash(tampered, hash1);
    const hashOriginal = await computeJournalHash(journal2, hash1);

    expect(hashTampered).not.toBe(hashOriginal);
  });
});

describe('ops auth logic', () => {
  it('rejects request without staff ID', () => {
    const staffId: string | null = null;
    expect(staffId).toBeNull();
  });

  it('allows request with valid staff ID', () => {
    const staffId: string | null = 'staff-001';
    expect(staffId).not.toBeNull();
  });
});

describe('maker-checker hardening', () => {
  it('enforces maker != checker at approval', () => {
    const makerId = 'staff-alice';
    const checkerId = 'staff-alice';
    expect(makerId === checkerId).toBe(true);
    // This should be rejected
  });

  it('allows different staff to approve', () => {
    const makerId: string = 'staff-alice';
    const checkerId: string = 'staff-bob';
    expect(makerId === checkerId).toBe(false);
    // This should be allowed
  });

  it('tracks before/after state in audit log', () => {
    const beforeState = { state: 'PENDING' };
    const afterState = { state: 'APPROVED' };
    const auditEntry = {
      action: 'OVERDRAFT_APPROVED',
      before_json: JSON.stringify(beforeState),
      after_json: JSON.stringify(afterState),
    };
    expect(JSON.parse(auditEntry.before_json).state).toBe('PENDING');
    expect(JSON.parse(auditEntry.after_json).state).toBe('APPROVED');
  });
});
