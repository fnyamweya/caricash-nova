import { z } from 'zod';
import { ActorType, TxnType, AgentType } from './enums.js';
import { SUPPORTED_CURRENCIES } from './currency.js';

export const loginSchema = z.object({
  identifier: z.string().min(1),
  pin: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const postTransactionSchema = z.object({
  idempotency_key: z.string().min(1),
  correlation_id: z.string().min(1),
  txn_type: z.nativeEnum(TxnType),
  currency: z.enum(SUPPORTED_CURRENCIES),
  entries: z
    .array(
      z.object({
        account_id: z.string().min(1),
        entry_type: z.enum(['DR', 'CR']),
        amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a decimal with up to 2 places'),
        description: z.string().optional(),
      }),
    )
    .min(1),
  description: z.string().min(1),
  actor_type: z.nativeEnum(ActorType),
  actor_id: z.string().min(1),
  fee_version_id: z.string().optional(),
  commission_version_id: z.string().optional(),
});
export type PostTransactionInput = z.infer<typeof postTransactionSchema>;

export const approvalActionSchema = z.object({
  request_id: z.string().min(1),
  staff_id: z.string().min(1),
});
export type ApprovalActionInput = z.infer<typeof approvalActionSchema>;

export const createCustomerSchema = z.object({
  msisdn: z.string().min(1),
  name: z.string().min(1),
  pin: z.string().min(1),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const createAgentSchema = z.object({
  agent_code: z.string().min(1),
  name: z.string().min(1),
  msisdn: z.string().min(1),
  pin: z.string().min(1),
  agent_type: z.nativeEnum(AgentType),
});
export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export const createMerchantSchema = z.object({
  store_code: z.string().min(1),
  name: z.string().min(1),
  msisdn: z.string().min(1),
  pin: z.string().min(1),
});
export type CreateMerchantInput = z.infer<typeof createMerchantSchema>;

export const balanceQuerySchema = z.object({
  owner_type: z.nativeEnum(ActorType),
  owner_id: z.string().min(1),
  currency: z.enum(SUPPORTED_CURRENCIES),
});
export type BalanceQueryInput = z.infer<typeof balanceQuerySchema>;
