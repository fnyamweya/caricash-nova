/**
 * Repair job — backfills missing idempotency records for existing journals.
 * Also repairs incomplete (IN_PROGRESS) state machine entries.
 * This is a safe repair: it only creates/updates idempotency records, never modifies journals.
 */
import {
  generateId,
  nowISO,
  computeScopeHash,
  EventName,
  TxnState,
} from '@caricash/shared';
import {
  getIdempotencyRecord,
  insertIdempotencyRecord,
  getStaleInProgressRecords,
  updateIdempotencyResult,
  insertEvent,
  getJournalById,
} from '@caricash/db';

type D1Database = any;

export interface RepairResult {
  journals_checked: number;
  records_backfilled: number;
  errors: string[];
}

export interface StateRepairResult {
  records_checked: number;
  records_repaired: number;
  errors: string[];
}

export async function repairMissingIdempotencyRecords(db: D1Database): Promise<RepairResult> {
  const correlationId = generateId();
  let journalsChecked = 0;
  let recordsBackfilled = 0;
  const errors: string[] = [];

  // Get all journals
  const res = await db
    .prepare('SELECT id, txn_type, idempotency_key, state, initiator_actor_id, currency, correlation_id, created_at FROM ledger_journals ORDER BY created_at ASC')
    .all();
  const journals = (res.results ?? []) as any[];

  for (const journal of journals) {
    journalsChecked++;

    // Only process POSTED journals
    if (journal.state !== TxnState.POSTED) continue;

    // Check if idempotency record exists
    const scope = `${journal.initiator_actor_id ?? 'unknown'}:${journal.txn_type}`;
    const existing = await getIdempotencyRecord(db, scope, journal.idempotency_key);

    if (!existing) {
      try {
        // Compute scope_hash for the missing record.
        // Note: actor_type is not stored in ledger_journals pre-Phase 2,
        // so we use 'UNKNOWN'. This means the backfilled scope_hash won't match
        // future requests with the real actor_type. This is acceptable because
        // the backfill only prevents duplicates within the repair job itself;
        // the idempotency_key column on journals still prevents double-posting.
        const scopeHash = await computeScopeHash(
          'UNKNOWN',
          journal.initiator_actor_id ?? 'unknown',
          journal.txn_type,
          journal.idempotency_key,
        );

        // Get journal lines for the result
        const linesRes = await db
          .prepare('SELECT account_id, entry_type, amount, description FROM ledger_lines WHERE journal_id = ?1')
          .bind(journal.id)
          .all();
        const lines = (linesRes.results ?? []) as any[];

        const result = {
          journal_id: journal.id,
          state: journal.state,
          entries: lines.map((l: any) => ({
            account_id: l.account_id,
            entry_type: l.entry_type,
            amount: l.amount,
            description: l.description,
          })),
          created_at: journal.created_at,
        };

        await insertIdempotencyRecord(db, {
          id: generateId(),
          scope,
          idempotency_key: journal.idempotency_key,
          result_json: JSON.stringify(result),
          created_at: nowISO(),
          expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          scope_hash: scopeHash,
        });

        recordsBackfilled++;

        // Emit repair event — mark as REPAIRED in audit log
        await insertEvent(db, {
          id: generateId(),
          name: EventName.REPAIR_EXECUTED,
          entity_type: 'idempotency_record',
          entity_id: journal.id,
          correlation_id: correlationId,
          actor_type: 'SYSTEM' as any,
          actor_id: 'SYSTEM',
          schema_version: 1,
          payload_json: JSON.stringify({
            journal_id: journal.id,
            repair_type: 'MISSING_IDEMPOTENCY_RECORD',
          }),
          created_at: nowISO(),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`Journal ${journal.id}: ${message}`);
      }
    }
  }

  return {
    journals_checked: journalsChecked,
    records_backfilled: recordsBackfilled,
    errors,
  };
}

/**
 * Repairs IN_PROGRESS idempotency records that are older than a timeout threshold.
 * If the corresponding journal exists with state POSTED, marks the idempotency record as COMPLETED.
 * NEVER modifies ledger entries or amounts.
 */
const DEFAULT_STALE_TIMEOUT_MINUTES = 5;

export async function repairStaleInProgressRecords(
  db: D1Database,
  timeoutMinutes: number = DEFAULT_STALE_TIMEOUT_MINUTES,
): Promise<StateRepairResult> {
  const correlationId = generateId();
  let recordsChecked = 0;
  let recordsRepaired = 0;
  const errors: string[] = [];

  const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();

  let staleRecords: any[];
  try {
    staleRecords = await getStaleInProgressRecords(db, cutoff);
  } catch (err) {
    // Table may not have the right columns yet
    const msg = err instanceof Error ? err.message : String(err);
    return { records_checked: 0, records_repaired: 0, errors: [`Could not query stale records: ${msg}`] };
  }

  for (const record of staleRecords) {
    recordsChecked++;

    try {
      // Parse the stored result to find the journal_id
      let storedResult: any;
      try {
        storedResult = JSON.parse(record.result_json);
      } catch {
        errors.push(`Record ${record.id}: invalid result_json`);
        continue;
      }

      const journalId = storedResult?.journal_id;
      if (!journalId) {
        // No journal_id in stored result — check by idempotency_key
        const journalRes = await db
          .prepare('SELECT id, state FROM ledger_journals WHERE idempotency_key = ?1')
          .bind(record.idempotency_key)
          .first();

        if (journalRes && journalRes.state === TxnState.POSTED) {
          // Journal exists and is POSTED — safe to mark COMPLETED
          storedResult.journal_id = journalRes.id;
          storedResult.state = TxnState.POSTED;
          await updateIdempotencyResult(db, record.id, JSON.stringify(storedResult));
          recordsRepaired++;

          await insertEvent(db, {
            id: generateId(),
            name: EventName.STATE_REPAIRED,
            entity_type: 'idempotency_record',
            entity_id: record.id,
            correlation_id: correlationId,
            actor_type: 'SYSTEM' as any,
            actor_id: 'SYSTEM',
            schema_version: 1,
            payload_json: JSON.stringify({
              record_id: record.id,
              repair_type: 'STALE_IN_PROGRESS',
              journal_id: journalRes.id,
              previous_state: 'IN_PROGRESS',
              new_state: 'COMPLETED',
            }),
            created_at: nowISO(),
          });
        }
        continue;
      }

      // Verify the journal exists and is POSTED
      const journal = await getJournalById(db, journalId);
      if (journal && journal.state === TxnState.POSTED) {
        // Safe to mark as COMPLETED
        storedResult.state = TxnState.POSTED;
        await updateIdempotencyResult(db, record.id, JSON.stringify(storedResult));
        recordsRepaired++;

        await insertEvent(db, {
          id: generateId(),
          name: EventName.STATE_REPAIRED,
          entity_type: 'idempotency_record',
          entity_id: record.id,
          correlation_id: correlationId,
          actor_type: 'SYSTEM' as any,
          actor_id: 'SYSTEM',
          schema_version: 1,
          payload_json: JSON.stringify({
            record_id: record.id,
            repair_type: 'STALE_IN_PROGRESS',
            journal_id: journalId,
            previous_state: 'IN_PROGRESS',
            new_state: 'COMPLETED',
          }),
          created_at: nowISO(),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Record ${record.id}: ${message}`);
    }
  }

  return {
    records_checked: recordsChecked,
    records_repaired: recordsRepaired,
    errors,
  };
}
