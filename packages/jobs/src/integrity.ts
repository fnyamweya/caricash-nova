/**
 * Journal hash chain integrity verification.
 * Optional feature — can be enabled via feature flag.
 *
 * Each journal has a `hash` computed from its canonical content + prev_hash.
 * This provides tamper detection for the journal chain.
 */
import { sha256Hex, nowISO, generateId, EventName } from '@caricash/shared';
import { getJournalsInRange, insertEvent, insertReconciliationFinding } from '@caricash/db';
import type { LedgerJournal } from '@caricash/shared';

type D1Database = any;

export interface IntegrityCheckResult {
  journals_verified: number;
  first_journal_id?: string;
  last_journal_id?: string;
  is_valid: boolean;
  broken_at_journal_id?: string;
  error?: string;
}

/**
 * Compute the canonical hash for a journal entry.
 */
export async function computeJournalHash(journal: LedgerJournal, prevHash: string): Promise<string> {
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

/**
 * Verify the integrity of the journal hash chain for a date range.
 */
export async function verifyJournalIntegrity(
  db: D1Database,
  from?: string,
  to?: string,
): Promise<IntegrityCheckResult> {
  const correlationId = generateId();
  const journals = await getJournalsInRange(db, from, to);

  if (journals.length === 0) {
    return { journals_verified: 0, is_valid: true };
  }

  let prevHash = '';
  let brokenAt: string | undefined;

  for (const journal of journals) {
    // If journal has no hash stored, skip (pre-Phase 2 data)
    if (!journal.hash) continue;

    const expectedHash = await computeJournalHash(journal, journal.prev_hash ?? '');
    if (expectedHash !== journal.hash) {
      brokenAt = journal.id;

      // Write reconciliation finding for tampered journal (G6: emit events for integrity failures)
      try {
        await insertReconciliationFinding(db, {
          id: generateId(),
          account_id: journal.id,
          expected_balance: expectedHash,
          actual_balance: journal.hash,
          discrepancy: 'HASH_MISMATCH',
          severity: 'CRITICAL',
          status: 'OPEN',
          run_id: correlationId,
          created_at: nowISO(),
          currency: journal.currency,
        });
      } catch {
        // Best-effort — don't fail verification if finding insert fails
      }

      break;
    }

    prevHash = journal.hash;
  }

  const isValid = brokenAt === undefined;
  const eventName = isValid ? EventName.INTEGRITY_CHECK_PASSED : EventName.INTEGRITY_CHECK_FAILED;

  await insertEvent(db, {
    id: generateId(),
    name: eventName,
    entity_type: 'integrity_check',
    entity_id: correlationId,
    correlation_id: correlationId,
    actor_type: 'SYSTEM' as any,
    actor_id: 'SYSTEM',
    schema_version: 1,
    payload_json: JSON.stringify({
      journals_verified: journals.length,
      is_valid: isValid,
      broken_at: brokenAt,
      from,
      to,
    }),
    created_at: nowISO(),
  });

  return {
    journals_verified: journals.length,
    first_journal_id: journals[0]?.id,
    last_journal_id: journals[journals.length - 1]?.id,
    is_valid: isValid,
    broken_at_journal_id: brokenAt,
  };
}
