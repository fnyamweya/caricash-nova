import { describe, it, expect } from 'vitest';
import {
  computeScopeHash,
  computePayloadHash,
  IdempotencyConflictError,
} from '@caricash/shared';

describe('computeScopeHash', () => {
  it('produces consistent hash for same inputs', async () => {
    const hash1 = await computeScopeHash('actor-1', 'DEPOSIT', 'key-001');
    const hash2 = await computeScopeHash('actor-1', 'DEPOSIT', 'key-001');
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
  });

  it('produces different hash for different actor', async () => {
    const hash1 = await computeScopeHash('actor-1', 'DEPOSIT', 'key-001');
    const hash2 = await computeScopeHash('actor-2', 'DEPOSIT', 'key-001');
    expect(hash1).not.toBe(hash2);
  });

  it('produces different hash for different txn_type', async () => {
    const hash1 = await computeScopeHash('actor-1', 'DEPOSIT', 'key-001');
    const hash2 = await computeScopeHash('actor-1', 'WITHDRAWAL', 'key-001');
    expect(hash1).not.toBe(hash2);
  });

  it('produces different hash for different idempotency_key', async () => {
    const hash1 = await computeScopeHash('actor-1', 'DEPOSIT', 'key-001');
    const hash2 = await computeScopeHash('actor-1', 'DEPOSIT', 'key-002');
    expect(hash1).not.toBe(hash2);
  });
});

describe('computePayloadHash', () => {
  it('produces consistent hash for same payload', async () => {
    const payload = { amount: '100.00', currency: 'BBD', description: 'test' };
    const hash1 = await computePayloadHash(payload);
    const hash2 = await computePayloadHash(payload);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces same hash regardless of key order', async () => {
    const hash1 = await computePayloadHash({ a: '1', b: '2' });
    const hash2 = await computePayloadHash({ b: '2', a: '1' });
    expect(hash1).toBe(hash2);
  });

  it('produces different hash for different payload', async () => {
    const hash1 = await computePayloadHash({ amount: '100.00' });
    const hash2 = await computePayloadHash({ amount: '200.00' });
    expect(hash1).not.toBe(hash2);
  });
});

describe('IdempotencyConflictError', () => {
  it('has correct name', () => {
    const err = new IdempotencyConflictError('conflict');
    expect(err.name).toBe('IdempotencyConflictError');
    expect(err.message).toBe('conflict');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('idempotency conflict detection logic', () => {
  // Simulates the conflict detection logic from PostingDO
  function checkIdempotency(
    existingRecord: { scope_hash: string; payload_hash: string; result_json: string } | null,
    incomingScopeHash: string,
    incomingPayloadHash: string,
  ): { action: 'process' | 'return_cached' | 'conflict'; result?: string } {
    if (!existingRecord) {
      return { action: 'process' };
    }
    if (existingRecord.payload_hash !== incomingPayloadHash) {
      return { action: 'conflict' };
    }
    return { action: 'return_cached', result: existingRecord.result_json };
  }

  it('returns "process" when no existing record', () => {
    const result = checkIdempotency(null, 'hash1', 'payload1');
    expect(result.action).toBe('process');
  });

  it('returns cached result for same scope_hash and payload_hash', () => {
    const existing = {
      scope_hash: 'hash1',
      payload_hash: 'payload1',
      result_json: '{"journal_id":"j-001"}',
    };
    const result = checkIdempotency(existing, 'hash1', 'payload1');
    expect(result.action).toBe('return_cached');
    expect(result.result).toBe('{"journal_id":"j-001"}');
  });

  it('returns "conflict" for same scope_hash but different payload_hash', () => {
    const existing = {
      scope_hash: 'hash1',
      payload_hash: 'payload1',
      result_json: '{"journal_id":"j-001"}',
    };
    const result = checkIdempotency(existing, 'hash1', 'different-payload');
    expect(result.action).toBe('conflict');
  });
});
