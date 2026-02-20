/**
 * Reconciliation job — recomputes balances from ledger_lines
 * and compares against wallet_balances materialized table.
 * Writes discrepancies to reconciliation_findings.
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
  insertEvent,
} from '@caricash/db';
import type { ReconciliationFinding } from '@caricash/db';

// D1Database typed as any for portability
type D1Database = any;

export interface ReconciliationResult {
  run_id: string;
  accounts_checked: number;
  mismatches_found: number;
  findings: ReconciliationFinding[];
  started_at: string;
  completed_at: string;
}

export async function runReconciliation(db: D1Database): Promise<ReconciliationResult> {
  const runId = generateId();
  const startedAt = nowISO();
  const findings: ReconciliationFinding[] = [];

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

      // Emit alert for severe discrepancies
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
  };
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
