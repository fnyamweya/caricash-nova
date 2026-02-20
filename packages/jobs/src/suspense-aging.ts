/**
 * Suspense aging job — detects non-zero suspense accounts
 * that have been open beyond a configurable threshold.
 */
import {
  generateId,
  nowISO,
  EventName,
  AccountType,
} from '@caricash/shared';
import { getAllAccounts, getBalance, insertEvent } from '@caricash/db';

type D1Database = any;

const DEFAULT_AGING_THRESHOLD_HOURS = 72;

export interface SuspenseAgingResult {
  accounts_checked: number;
  aged_accounts: { account_id: string; balance: string; age_hours: number }[];
}

export async function runSuspenseAging(
  db: D1Database,
  thresholdHours: number = DEFAULT_AGING_THRESHOLD_HOURS,
): Promise<SuspenseAgingResult> {
  const correlationId = generateId();
  const now = Date.now();

  // Get all suspense accounts
  const allAccounts = await getAllAccounts(db);
  const suspenseAccounts = allAccounts.filter(
    (a: any) => a.account_type === AccountType.SUSPENSE,
  );

  const aged: SuspenseAgingResult['aged_accounts'] = [];

  for (const account of suspenseAccounts) {
    const balance = await getBalance(db, account.id);
    const balanceNum = parseFloat(balance);

    if (balanceNum === 0) continue;

    // Compute account age in hours
    const createdAt = new Date(account.created_at).getTime();
    const ageHours = Math.floor((now - createdAt) / (1000 * 60 * 60));

    if (ageHours >= thresholdHours) {
      aged.push({
        account_id: account.id,
        balance,
        age_hours: ageHours,
      });

      // Emit suspense aging event
      await insertEvent(db, {
        id: generateId(),
        name: EventName.SUSPENSE_AGING_DETECTED,
        entity_type: 'ledger_account',
        entity_id: account.id,
        correlation_id: correlationId,
        actor_type: 'SYSTEM' as any,
        actor_id: 'SYSTEM',
        schema_version: 1,
        payload_json: JSON.stringify({
          account_id: account.id,
          balance,
          age_hours: ageHours,
          threshold_hours: thresholdHours,
        }),
        created_at: nowISO(),
      });

      // Emit alert
      await insertEvent(db, {
        id: generateId(),
        name: EventName.ALERT_RAISED,
        entity_type: 'ledger_account',
        entity_id: account.id,
        correlation_id: correlationId,
        actor_type: 'SYSTEM' as any,
        actor_id: 'SYSTEM',
        schema_version: 1,
        payload_json: JSON.stringify({
          alert_type: 'SUSPENSE_AGING',
          account_id: account.id,
          balance,
          age_hours: ageHours,
        }),
        created_at: nowISO(),
      });
    }
  }

  return {
    accounts_checked: suspenseAccounts.length,
    aged_accounts: aged,
  };
}
