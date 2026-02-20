import { describe, it, expect } from 'vitest';

/**
 * Replay / at-least-once delivery tests.
 * Verifies that processing the same message twice produces idempotent results.
 */

describe('queue consumer idempotency: replay tests', () => {
  // Simulates a consumer that processes events idempotently
  class IdempotentConsumer {
    private processedIds = new Set<string>();
    private results: Record<string, unknown>[] = [];

    processMessage(message: { id: string; payload: unknown }): { processed: boolean; duplicate: boolean } {
      if (this.processedIds.has(message.id)) {
        return { processed: false, duplicate: true };
      }
      this.processedIds.add(message.id);
      this.results.push({ id: message.id, payload: message.payload });
      return { processed: true, duplicate: false };
    }

    getResults() {
      return this.results;
    }
  }

  it('processes first delivery normally', () => {
    const consumer = new IdempotentConsumer();
    const msg = { id: 'msg-001', payload: { txn_type: 'DEPOSIT', amount: '100.00' } };

    const result = consumer.processMessage(msg);
    expect(result.processed).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(consumer.getResults()).toHaveLength(1);
  });

  it('rejects duplicate delivery (same message twice)', () => {
    const consumer = new IdempotentConsumer();
    const msg = { id: 'msg-001', payload: { txn_type: 'DEPOSIT', amount: '100.00' } };

    consumer.processMessage(msg);
    const result = consumer.processMessage(msg);

    expect(result.processed).toBe(false);
    expect(result.duplicate).toBe(true);
    // Still only 1 result despite 2 deliveries
    expect(consumer.getResults()).toHaveLength(1);
  });

  it('handles interleaved messages correctly', () => {
    const consumer = new IdempotentConsumer();
    const msg1 = { id: 'msg-001', payload: { type: 'A' } };
    const msg2 = { id: 'msg-002', payload: { type: 'B' } };

    consumer.processMessage(msg1);
    consumer.processMessage(msg2);
    consumer.processMessage(msg1); // replay
    consumer.processMessage(msg2); // replay

    expect(consumer.getResults()).toHaveLength(2);
  });

  it('processes all unique messages in a batch', () => {
    const consumer = new IdempotentConsumer();
    const batch = [
      { id: 'msg-001', payload: {} },
      { id: 'msg-002', payload: {} },
      { id: 'msg-003', payload: {} },
      { id: 'msg-001', payload: {} }, // replay
      { id: 'msg-002', payload: {} }, // replay
    ];

    let processedCount = 0;
    let duplicateCount = 0;

    for (const msg of batch) {
      const result = consumer.processMessage(msg);
      if (result.processed) processedCount++;
      if (result.duplicate) duplicateCount++;
    }

    expect(processedCount).toBe(3);
    expect(duplicateCount).toBe(2);
    expect(consumer.getResults()).toHaveLength(3);
  });
});
