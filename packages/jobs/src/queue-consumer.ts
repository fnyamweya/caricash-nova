/**
 * Queue consumer wrapper — provides idempotent, at-least-once safe message processing.
 *
 * All queue consumers:
 * - Are idempotent (use message_id or journal_id as dedupe key)
 * - Catch and log errors
 * - Emit CONSUMER_ERROR event on failure
 * - Support dead-letter handling (log poisoned messages as events)
 */
import {
  generateId,
  nowISO,
  EventName,
} from '@caricash/shared';
import { insertEvent } from '@caricash/db';

type D1Database = any;

export interface QueueMessage {
  id: string;
  body: Record<string, unknown>;
  topic: string;
  timestamp?: string;
}

export interface QueueConsumerResult {
  message_id: string;
  processed: boolean;
  error?: string;
  deduplicated?: boolean;
}

/** Set of processed message IDs — used for in-memory dedupe within a consumer run. */
const processedMessages = new Set<string>();

/**
 * Wrap a queue handler to make it idempotent and safe.
 * The handler receives the message body and db, and returns void on success.
 * On failure, the error is caught, logged, and an event emitted.
 */
export async function processQueueMessage(
  db: D1Database,
  message: QueueMessage,
  handler: (body: Record<string, unknown>, db: D1Database) => Promise<void>,
): Promise<QueueConsumerResult> {
  const dedupeKey = message.id;

  // In-memory dedupe for same batch
  if (processedMessages.has(dedupeKey)) {
    return { message_id: dedupeKey, processed: false, deduplicated: true };
  }

  // Check if already processed (persistent dedupe via events table)
  try {
    const existing = await db
      .prepare(
        `SELECT id FROM events WHERE name = 'QUEUE_MESSAGE_PROCESSED' AND entity_id = ?1 LIMIT 1`,
      )
      .bind(dedupeKey)
      .first();

    if (existing) {
      processedMessages.add(dedupeKey);
      return { message_id: dedupeKey, processed: false, deduplicated: true };
    }
  } catch {
    // events table query failed — proceed without persistent dedupe
  }

  try {
    await handler(message.body, db);

    // Mark as processed
    processedMessages.add(dedupeKey);

    // Persist processed marker
    try {
      await insertEvent(db, {
        id: generateId(),
        name: 'QUEUE_MESSAGE_PROCESSED' as any,
        entity_type: 'queue_message',
        entity_id: dedupeKey,
        correlation_id: (message.body.correlation_id as string) ?? dedupeKey,
        actor_type: 'SYSTEM' as any,
        actor_id: 'SYSTEM',
        schema_version: 1,
        payload_json: JSON.stringify({ topic: message.topic, message_id: dedupeKey }),
        created_at: nowISO(),
      });
    } catch {
      // Best-effort persistence
    }

    return { message_id: dedupeKey, processed: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Emit CONSUMER_ERROR event
    try {
      await insertEvent(db, {
        id: generateId(),
        name: EventName.CONSUMER_ERROR,
        entity_type: 'queue_message',
        entity_id: dedupeKey,
        correlation_id: (message.body.correlation_id as string) ?? dedupeKey,
        actor_type: 'SYSTEM' as any,
        actor_id: 'SYSTEM',
        schema_version: 1,
        payload_json: JSON.stringify({
          topic: message.topic,
          message_id: dedupeKey,
          error: errorMessage,
          body_summary: JSON.stringify(message.body).slice(0, 500),
        }),
        created_at: nowISO(),
      });
    } catch {
      // Can't emit event — truly poisoned
    }

    return { message_id: dedupeKey, processed: false, error: errorMessage };
  }
}

/** Reset in-memory dedupe (for testing). */
export function resetProcessedMessages(): void {
  processedMessages.clear();
}
