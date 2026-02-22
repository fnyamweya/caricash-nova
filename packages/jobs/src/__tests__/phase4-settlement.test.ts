import { describe, it, expect, vi } from 'vitest';
import { runSettlementScheduler, detectStuckTransfers, runSettlementReconciliation } from '../settlement.js';

// ── D1 Mock Helper ───────────────────────────────────────────────────────────

function createMockDB(queryResults: Record<string, any[]> = {}) {
  return {
    prepare: (sql: string) => ({
      bind: (..._args: any[]) => ({
        first: async () => {
          for (const [key, results] of Object.entries(queryResults)) {
            if (sql.includes(key)) {
              return results[0] ?? null;
            }
          }
          return null;
        },
        all: async () => {
          for (const [key, results] of Object.entries(queryResults)) {
            if (sql.includes(key)) {
              return { results };
            }
          }
          return { results: [] };
        },
        run: async () => ({ success: true }),
      }),
    }),
  } as any;
}

// ── Settlement Scheduler Tests ───────────────────────────────────────────────

describe('runSettlementScheduler', () => {
  it('creates batches for AUTO profiles', async () => {
    const db = createMockDB({
      merchant_settlement_profiles: [
        { id: 'p1', merchant_id: 'm1', currency: 'BBD', schedule: 'T1', mode: 'AUTO' },
        { id: 'p2', merchant_id: 'm2', currency: 'BBD', schedule: 'T0', mode: 'AUTO' },
      ],
    });

    const result = await runSettlementScheduler(db);
    expect(result.batches_created).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it('skips if batch already exists today', async () => {
    // Return profiles from the first query, and an existing batch from the second
    const db = {
      prepare: (sql: string) => ({
        bind: (..._args: any[]) => ({
          first: async () => {
            if (sql.includes('settlement_batches')) {
              return { id: 'existing-batch' };
            }
            return null;
          },
          all: async () => {
            if (sql.includes('merchant_settlement_profiles')) {
              return {
                results: [
                  { id: 'p1', merchant_id: 'm1', currency: 'BBD', schedule: 'T1', mode: 'AUTO' },
                ],
              };
            }
            return { results: [] };
          },
          run: async () => ({ success: true }),
        }),
      }),
    } as any;

    const result = await runSettlementScheduler(db);
    expect(result.batches_created).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('handles empty profiles gracefully', async () => {
    const db = createMockDB({});
    const result = await runSettlementScheduler(db);
    expect(result.batches_created).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});

// ── Stuck Transfer Detector Tests ────────────────────────────────────────────

describe('detectStuckTransfers', () => {
  it('finds transfers pending too long', async () => {
    const db = createMockDB({
      external_transfers: [{ id: 'et-1' }, { id: 'et-2' }],
      merchant_payouts: [{ id: 'mp-1' }],
      settlement_batches: [],
    });

    const result = await detectStuckTransfers(db);
    expect(result.stuck_transfers).toBe(2);
    expect(result.stuck_payouts).toBe(1);
    expect(result.stuck_batches).toBe(0);
  });

  it('returns zeros when nothing stuck', async () => {
    const db = createMockDB({});
    const result = await detectStuckTransfers(db);
    expect(result.stuck_transfers).toBe(0);
    expect(result.stuck_payouts).toBe(0);
    expect(result.stuck_batches).toBe(0);
  });
});

// ── Settlement Reconciliation Tests ──────────────────────────────────────────

describe('runSettlementReconciliation', () => {
  it('counts matched settled transfers', async () => {
    const db = createMockDB({
      external_transfers: [
        { id: 'et-1', provider_transfer_id: 'prov-1', amount: '100', currency: 'BBD' },
        { id: 'et-2', provider_transfer_id: 'prov-2', amount: '200', currency: 'BBD' },
      ],
    });

    const result = await runSettlementReconciliation(db);
    expect(result.matched).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it('counts unmatched webhook deliveries', async () => {
    const db = createMockDB({
      external_transfers: [{ id: 'et-1', provider_transfer_id: 'prov-1', amount: '100', currency: 'BBD' }],
      bank_webhook_deliveries: [{ id: 'wd-1' }, { id: 'wd-2' }, { id: 'wd-3' }],
    });

    const result = await runSettlementReconciliation(db);
    expect(result.matched).toBe(1);
    expect(result.unmatched).toBe(3);
    expect(result.errors).toHaveLength(0);
  });
});
