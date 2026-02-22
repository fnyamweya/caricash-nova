/**
 * Settlement jobs — scheduler, stuck-transfer detection, and reconciliation
 * for the merchant settlement pipeline.
 */
import { generateId, nowISO } from '@caricash/shared';

// D1Database typed as any for portability
type D1Database = any;

/**
 * Settlement scheduler - creates batches for auto-settlement merchants.
 * Called periodically (e.g., every hour or at schedule boundaries).
 */
export async function runSettlementScheduler(db: D1Database): Promise<{
  batches_created: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let batches_created = 0;

  try {
    const { results: profiles } = await db.prepare(
      'SELECT id, merchant_id, currency, schedule, mode FROM merchant_settlement_profiles WHERE status = ? AND mode = ?'
    ).bind('ACTIVE', 'AUTO').all();

    const now = nowISO();
    const today = now.split('T')[0];

    for (const profile of profiles) {
      try {
        // Check for existing batch today
        const existing = await db.prepare(
          'SELECT id FROM settlement_batches WHERE merchant_id = ? AND currency = ? AND period_start >= ?'
        ).bind(profile.merchant_id, profile.currency, today).first();

        if (existing) continue;

        const batch_id = generateId();
        await db.prepare(
          `INSERT INTO settlement_batches (id, merchant_id, currency, period_start, period_end, schedule, mode, status, total_amount, total_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'CREATED', '0', 0)`
        ).bind(batch_id, profile.merchant_id, profile.currency, today, now, profile.schedule, profile.mode).run();

        batches_created++;
      } catch (e: any) {
        errors.push(`Profile ${profile.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    errors.push(`Scheduler error: ${e.message}`);
  }

  return { batches_created, errors };
}

/**
 * Stuck transfer detector - finds transfers and payouts that are stuck.
 * Called hourly.
 */
export async function detectStuckTransfers(db: D1Database): Promise<{
  stuck_transfers: number;
  stuck_payouts: number;
  stuck_batches: number;
}> {
  // Transfers PENDING for more than 2 hours
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { results: stuckTransfers } = await db.prepare(
    'SELECT id FROM external_transfers WHERE status = ? AND initiated_at < ?'
  ).bind('PENDING', twoHoursAgo).all();

  // Payouts APPROVED but not initiated for more than 1 hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { results: stuckPayouts } = await db.prepare(
    'SELECT id FROM merchant_payouts WHERE status = ? AND updated_at < ?'
  ).bind('APPROVED', oneHourAgo).all();

  // Batches stuck in PROCESSING for more than 4 hours
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const { results: stuckBatches } = await db.prepare(
    'SELECT id FROM settlement_batches WHERE status = ? AND updated_at < ?'
  ).bind('PROCESSING', fourHoursAgo).all();

  return {
    stuck_transfers: stuckTransfers.length,
    stuck_payouts: stuckPayouts.length,
    stuck_batches: stuckBatches.length,
  };
}

/**
 * Settlement reconciliation - compares external transfers with bank statements.
 */
export async function runSettlementReconciliation(db: D1Database): Promise<{
  matched: number;
  unmatched: number;
  errors: string[];
}> {
  let matched = 0;
  let unmatched = 0;
  const errors: string[] = [];

  try {
    // Find all SETTLED external transfers without reconciliation
    const { results: transfers } = await db.prepare(
      'SELECT id, provider_transfer_id, amount, currency FROM external_transfers WHERE status = ? AND settled_at IS NOT NULL'
    ).bind('SETTLED').all();

    matched = transfers.length;

    // Find webhook deliveries that couldn't be matched
    const { results: unmatchedDeliveries } = await db.prepare(
      'SELECT id FROM bank_webhook_deliveries WHERE status = ?'
    ).bind('FAILED').all();

    unmatched = unmatchedDeliveries.length;
  } catch (e: any) {
    errors.push(`Reconciliation error: ${e.message}`);
  }

  return { matched, unmatched, errors };
}
