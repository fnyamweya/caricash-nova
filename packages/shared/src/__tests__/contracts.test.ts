import { describe, it, expect } from 'vitest';
import {
  requestEnvelopeSchema,
  errorResponseSchema,
  postingReceiptSchema,
  ActorType,
} from '../index.js';

describe('requestEnvelopeSchema', () => {
  const validEnvelope = {
    correlation_id: 'corr-001',
    idempotency_key: 'idem-001',
    actor_context: {
      actor_type: ActorType.CUSTOMER,
      actor_id: 'actor-001',
    },
    timestamp: '2025-01-01T00:00:00Z',
    payload: { amount: '100.00' },
  };

  it('accepts a valid request envelope', () => {
    const result = requestEnvelopeSchema.safeParse(validEnvelope);
    expect(result.success).toBe(true);
  });

  it('rejects missing idempotency_key', () => {
    const { idempotency_key, ...without } = validEnvelope;
    const result = requestEnvelopeSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it('rejects missing correlation_id', () => {
    const { correlation_id, ...without } = validEnvelope;
    const result = requestEnvelopeSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it('rejects missing actor_context', () => {
    const { actor_context, ...without } = validEnvelope;
    const result = requestEnvelopeSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it('rejects missing timestamp', () => {
    const { timestamp, ...without } = validEnvelope;
    const result = requestEnvelopeSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it('rejects empty idempotency_key', () => {
    const result = requestEnvelopeSchema.safeParse({ ...validEnvelope, idempotency_key: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid actor_type', () => {
    const result = requestEnvelopeSchema.safeParse({
      ...validEnvelope,
      actor_context: { actor_type: 'INVALID', actor_id: 'a' },
    });
    expect(result.success).toBe(false);
  });
});

describe('errorResponseSchema', () => {
  it('accepts a valid error response', () => {
    const result = errorResponseSchema.safeParse({
      error: {
        code: 'INSUFFICIENT_FUNDS',
        message: 'Account balance too low',
        correlation_id: 'corr-001',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing error code', () => {
    const result = errorResponseSchema.safeParse({
      error: { message: 'oops' },
    });
    expect(result.success).toBe(false);
  });
});

describe('postingReceiptSchema', () => {
  it('accepts a valid receipt', () => {
    const result = postingReceiptSchema.safeParse({
      journal_id: 'j-001',
      txn_type: 'DEPOSIT',
      currency: 'BBD',
      total_amount: '100.00',
      fees: '2.00',
      commissions: '1.00',
      posted_at: '2025-01-01T00:00:00Z',
      correlation_id: 'corr-001',
      idempotency_key: 'idem-001',
      state: 'POSTED',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unsupported currency', () => {
    const result = postingReceiptSchema.safeParse({
      journal_id: 'j-001',
      txn_type: 'DEPOSIT',
      currency: 'EUR',
      total_amount: '100.00',
      fees: '2.00',
      commissions: '1.00',
      posted_at: '2025-01-01T00:00:00Z',
      correlation_id: 'corr-001',
      idempotency_key: 'idem-001',
      state: 'POSTED',
    });
    expect(result.success).toBe(false);
  });
});
