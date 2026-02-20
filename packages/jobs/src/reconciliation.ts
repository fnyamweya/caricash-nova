/**
 * Reconciliation job — recomputes balances from ledger_lines
 * and compares against wallet_balances materialized table.
 * Writes discrepancies to reconciliation_findings.
 * Tracks each run in reconciliation_runs table.
 */
import {
  generateId,
  nowISO,
  EventName,
  parseAmount,
  formatAmount,
} from '@caricash/shared';
import type { Event } from '@caricash/shared';
import {
  getAllAccounts,
  getBalance,
  getWalletBalance,
  insertReconciliationFinding,
  insertReconciliationRun,
  updateReconciliationRun,
  insertEvent,
} from '@caricash/db';
import type { ReconciliationFinding, ReconciliationRun } from '@caricash/db';

// D1Database typed as any for portability
type D1Database = any;

export interface ReconciliationResult {
  run_id: string;
  accounts_checked: number;
  mismatches_found: number;
  findings: ReconciliationFinding[];
  started_at: string;
  completed_at: string;
  status: 'COMPLETED' | 'FAILED';
}

export async function runReconciliation(db: D1Database, triggeredBy?: string): Promise<ReconciliationResult> {
  const runId = generateId();
  const startedAt = nowISO();
  const findings: ReconciliationFinding[] = [];

  // Insert reconciliation run record
  const run: ReconciliationRun = {
    id: runId,
    started_at: startedAt,
    status: 'RUNNING',
    triggered_by: triggeredBy,
    correlation_id: runId,
  };

  try {
    await insertReconciliationRun(db, run);
  } catch {
    // Table may not exist in older schema — continue gracefully
  }

  // Emit start event
  await insertEvent(db, {
    id: generateId(),
    name: EventName.RECONCILIATION_STARTED,
    entity_type: 'reconciliation',
    entity_id: runId,
    correlation_id: runId,
    actor_type: 'SYSTEM' as any,
    actor_id: 'SYSTEM',
    schema_version: 1,
    payload_json: JSON.stringify({ run_id: runId }),
    created_at: startedAt,
  });

  let status: 'COMPLETED' | 'FAILED' = 'COMPLETED';

  try {
    // Get all accounts
    const accounts = await getAllAccounts(db);

    for (const account of accounts) {
      // Recompute balance from ledger_lines
      const computedBalance = await getBalance(db, account.id);

      // Get materialized balance (if exists)
      const materialized = await getWalletBalance(db, account.id);
      if (!materialized) {
        // No materialized balance — skip (not yet populated)
        continue;
      }

      // Compare
      const computedCents = parseAmountSafe(computedBalance);
      const materializedCents = parseAmountSafe(materialized.balance);

      if (computedCents !== materializedCents) {
        const discrepancyCents = computedCents - materializedCents;
        const discrepancy = formatAmount(discrepancyCents < 0n ? -discrepancyCents : discrepancyCents);
        const severity = classifySeverity(discrepancyCents);

        const finding: ReconciliationFinding = {
          id: generateId(),
          account_id: account.id,
          expected_balance: computedBalance,
          actual_balance: materialized.balance,
          discrepancy,
          severity,
          status: 'OPEN',
          run_id: runId,
          created_at: nowISO(),
          currency: account.currency ?? 'BBD',
        };

        findings.push(finding);
        await insertReconciliationFinding(db, finding);

        // Emit mismatch event
        await insertEvent(db, {
          id: generateId(),
          name: EventName.RECONCILIATION_MISMATCH_FOUND,
          entity_type: 'reconciliation_finding',
          entity_id: finding.id,
          correlation_id: runId,
          actor_type: 'SYSTEM' as any,
          actor_id: 'SYSTEM',
          schema_version: 1,
          payload_json: JSON.stringify({
            account_id: account.id,
            expected: computedBalance,
            actual: materialized.balance,
            discrepancy,
            severity,
          }),
          created_at: nowISO(),
        });

        // Emit alert for severe discrepancies — do NOT auto-correct
        if (severity === 'HIGH' || severity === 'CRITICAL') {
          await insertEvent(db, {
            id: generateId(),
            name: EventName.ALERT_RAISED,
            entity_type: 'reconciliation_finding',
            entity_id: finding.id,
            correlation_id: runId,
            actor_type: 'SYSTEM' as any,
            actor_id: 'SYSTEM',
            schema_version: 1,
            payload_json: JSON.stringify({
              alert_type: 'RECONCILIATION_MISMATCH',
              account_id: account.id,
              discrepancy,
              severity,
            }),
            created_at: nowISO(),
          });
        }
      }
    }

    const completedAt = nowISO();

    // Update run record
    try {
      await updateReconciliationRun(db, runId, 'COMPLETED', completedAt, accounts.length, findings.length, JSON.stringify({ findings_ids: findings.map(f => f.id) }));
    } catch {
      // Table may not exist — continue
    }

    // Emit completion event
    await insertEvent(db, {
      id: generateId(),
      name: EventName.RECONCILIATION_COMPLETED,
      entity_type: 'reconciliation',
      entity_id: runId,
      correlation_id: runId,
      actor_type: 'SYSTEM' as any,
      actor_id: 'SYSTEM',
      schema_version: 1,
      payload_json: JSON.stringify({
        run_id: runId,
        accounts_checked: accounts.length,
        mismatches_found: findings.length,
      }),
      created_at: completedAt,
    });

    return {
      run_id: runId,
      accounts_checked: accounts.length,
      mismatches_found: findings.length,
      findings,
      started_at: startedAt,
      completed_at: completedAt,
      status: 'COMPLETED',
    };
  } catch (err) {
    status = 'FAILED';
    const completedAt = nowISO();

    try {
      await updateReconciliationRun(db, runId, 'FAILED', completedAt, 0, 0, JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    } catch {
      // Table may not exist — continue
    }

    return {
      run_id: runId,
      accounts_checked: 0,
      mismatches_found: 0,
      findings: [],
      started_at: startedAt,
      completed_at: completedAt,
      status: 'FAILED',
    };
  }
}

function parseAmountSafe(s: string): bigint {
  try {
    const trimmed = s.trim().replace(/^-/, '');
    const isNegative = s.trim().startsWith('-');
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return 0n;
    const [whole, frac = ''] = trimmed.split('.');
    const cents = frac.padEnd(2, '0');
    const val = BigInt(whole + cents);
    return isNegative ? -val : val;
  } catch {
    return 0n;
  }
}

function classifySeverity(discrepancyCents: bigint): string {
  const abs = discrepancyCents < 0n ? -discrepancyCents : discrepancyCents;
  if (abs >= 100000n) return 'CRITICAL'; // >= 1000.00
  if (abs >= 10000n) return 'HIGH';      // >= 100.00
  if (abs >= 100n) return 'MEDIUM';      // >= 1.00
  return 'LOW';
}
