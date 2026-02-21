import { z } from 'zod';
import { ActorType, TxnType, AgentType, MerchantUserRole, RegistrationType, RegistrationChannel, FloatOperationType } from './enums.js';
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
  first_name: z.string().min(1).optional(),
  middle_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  display_name: z.string().min(1).optional(),
  preferred_name: z.enum(['FIRST_NAME', 'MIDDLE_NAME', 'LAST_NAME', 'FULL_NAME', 'CUSTOM']).optional(),
  email: z.string().email().optional(),
  pin: z.string().min(1),
  // Registration metadata (optional — enriched server-side)
  registration_type: z.nativeEnum(RegistrationType).optional(),
  channel: z.nativeEnum(RegistrationChannel).optional(),
  registered_by_actor_id: z.string().min(1).optional(),
  referral_code: z.string().min(1).optional(),
  campaign_id: z.string().min(1).optional(),
  terms_accepted: z.boolean().optional(),
  privacy_accepted: z.boolean().optional(),
  marketing_opt_in: z.boolean().optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const createAgentSchema = z.object({
  agent_code: z.string().length(6).regex(/^\d{6}$/).optional(),
  name: z.string().min(1),
  owner_name: z.string().min(1).optional(),
  msisdn: z.string().min(1),
  pin: z.string().min(1),
  agent_type: z.nativeEnum(AgentType),
  parent_aggregator_id: z.string().min(1).optional(),
});
export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export const createMerchantSchema = z.object({
  name: z.string().min(1),
  msisdn: z.string().min(1),
  owner_name: z.string().min(1),
  owner_first_name: z.string().min(1).optional(),
  owner_last_name: z.string().min(1).optional(),
  business_registration_no: z.string().min(1).optional(),
  tax_id: z.string().min(1).optional(),
  email: z.string().email().optional(),
  pin: z.string().min(4),
  pin_confirm: z.string().min(4).optional(),
}).refine((data) => !data.pin_confirm || data.pin === data.pin_confirm, {
  message: 'PINs do not match',
  path: ['pin_confirm'],
});
export type CreateMerchantInput = z.infer<typeof createMerchantSchema>;

export const createStoreSchema = z.object({
  store_code: z.string().length(6).regex(/^\d{6}$/).optional(),
  name: z.string().min(1),
  msisdn: z.string().min(1),
  owner_name: z.string().min(1),
  email: z.string().email().optional(),
  pin: z.string().min(4),
  pin_confirm: z.string().min(4).optional(),
}).refine((data) => !data.pin_confirm || data.pin === data.pin_confirm, {
  message: 'PINs do not match',
  path: ['pin_confirm'],
});
export type CreateStoreInput = z.infer<typeof createStoreSchema>;

export const createMerchantUserSchema = z.object({
  msisdn: z.string().min(1),
  name: z.string().min(1),
  role: z.nativeEnum(MerchantUserRole),
  pin: z.string().min(4),
});
export type CreateMerchantUserInput = z.infer<typeof createMerchantUserSchema>;

export const updateMerchantUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.nativeEnum(MerchantUserRole).optional(),
  state: z.enum(['ACTIVE', 'SUSPENDED', 'REMOVED']).optional(),
});
export type UpdateMerchantUserInput = z.infer<typeof updateMerchantUserSchema>;

export const merchantLoginSchema = z.object({
  msisdn: z.string().min(1),
  pin: z.string().min(1),
  store_code: z.string().min(1).optional(),
});
export type MerchantLoginInput = z.infer<typeof merchantLoginSchema>;

export const generateCodesSchema = z.object({
  code_type: z.enum(['AGENT', 'STORE']),
  count: z.number().int().min(1).max(20).default(5),
  merchant_id: z.string().min(1).optional(),
  ttl_minutes: z.number().int().min(5).max(240).default(30),
});
export type GenerateCodesInput = z.infer<typeof generateCodesSchema>;

export const actorLookupSchema = z.object({
  msisdn: z.string().min(1).optional(),
  store_code: z.string().min(1).optional(),
  agent_code: z.string().min(1).optional(),
}).refine((data) => data.msisdn || data.store_code || data.agent_code, {
  message: 'At least one lookup parameter is required (msisdn, store_code, or agent_code)',
});
export type ActorLookupInput = z.infer<typeof actorLookupSchema>;

export const balanceQuerySchema = z.object({
  owner_type: z.nativeEnum(ActorType),
  owner_id: z.string().min(1),
  currency: z.enum(SUPPORTED_CURRENCIES),
});
export type BalanceQueryInput = z.infer<typeof balanceQuerySchema>;

// ---------------------------------------------------------------------------
// Float management schemas
// ---------------------------------------------------------------------------

export const floatTopUpSchema = z.object({
  agent_code: z.string().min(1),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a decimal with up to 2 places'),
  currency: z.enum(SUPPORTED_CURRENCIES).default('BBD'),
  staff_id: z.string().min(1),
  reason: z.string().min(1).optional(),
  reference: z.string().optional(),
  idempotency_key: z.string().min(1),
});
export type FloatTopUpInput = z.infer<typeof floatTopUpSchema>;

export const floatWithdrawalSchema = z.object({
  agent_code: z.string().min(1),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a decimal with up to 2 places'),
  currency: z.enum(SUPPORTED_CURRENCIES).default('BBD'),
  staff_id: z.string().min(1),
  reason: z.string().min(1).optional(),
  reference: z.string().optional(),
  idempotency_key: z.string().min(1),
});
export type FloatWithdrawalInput = z.infer<typeof floatWithdrawalSchema>;

export const suspenseFundRequestSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a decimal with up to 2 places'),
  currency: z.enum(SUPPORTED_CURRENCIES).default('BBD'),
  reason: z.string().min(1),
  reference: z.string().min(1).optional(),
  idempotency_key: z.string().min(1),
});
export type SuspenseFundRequestInput = z.infer<typeof suspenseFundRequestSchema>;
