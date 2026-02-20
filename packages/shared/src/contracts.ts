import { z } from 'zod';
import { ActorType } from './enums.js';
import { SUPPORTED_CURRENCIES } from './currency.js';

/**
 * Standardized request envelope for all CariCash API operations.
 * Every financial operation must include correlation_id and idempotency_key.
 */
export const requestEnvelopeSchema = z.object({
  correlation_id: z.string().min(1, 'correlation_id is required'),
  idempotency_key: z.string().min(1, 'idempotency_key is required'),
  actor_context: z.object({
    actor_type: z.nativeEnum(ActorType),
    actor_id: z.string().min(1),
  }),
  timestamp: z.string().min(1, 'timestamp is required'),
  payload: z.record(z.unknown()),
});
export type RequestEnvelope = z.infer<typeof requestEnvelopeSchema>;

/**
 * Standardized error response format.
 */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    correlation_id: z.string().optional(),
    details: z.record(z.unknown()).optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/**
 * Standardized posting receipt returned after successful posting.
 */
export const postingReceiptSchema = z.object({
  journal_id: z.string(),
  txn_type: z.string(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  total_amount: z.string(),
  fees: z.string(),
  commissions: z.string(),
  posted_at: z.string(),
  correlation_id: z.string(),
  idempotency_key: z.string(),
  state: z.string(),
});
export type PostingReceipt = z.infer<typeof postingReceiptSchema>;
