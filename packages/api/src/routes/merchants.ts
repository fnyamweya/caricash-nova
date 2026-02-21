import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
  generateId,
  nowISO,
  createMerchantSchema,
  createStoreSchema,
  ActorType,
  ActorState,
  KycState,
  AccountType,
  EventName,
  MerchantUserRole,
  MerchantUserState,
} from '@caricash/shared';
import type { Actor, MerchantUser } from '@caricash/shared';
import {
  insertActor,
  insertPin,
  insertLedgerAccount,
  getActorById,
  getActorByMsisdnAndType,
  getActiveCodeReservation,
  insertEvent,
  insertMerchantUser,
  initMerchantStoreClosure,
  linkMerchantStoreBranch,
  markCodeReservationUsed,
  initAccountBalance,
  ensureKycProfile,
  getKycProfileByActorId,
  listKycRequirementsByActorType,
  upsertKycProfile,
} from '@caricash/db';
import { hashPin, generateSalt } from '../lib/pin.js';
import { generateUniqueStoreCode } from '../lib/code-generator.js';

export const merchantRoutes = new Hono<{ Bindings: Env }>();

// POST /merchants - create merchant business entity (no store code assigned here)
merchantRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createMerchantSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }

  const {
    name,
    msisdn,
    pin,
    owner_name,
    owner_first_name,
    owner_last_name,
    business_registration_no,
    tax_id,
    email,
  } = parsed.data;
  const correlationId = (body.correlation_id as string) || generateId();

  try {
    // Check for existing merchant by owner msisdn
    const existing = await getActorByMsisdnAndType(c.env.DB, msisdn, ActorType.MERCHANT);
    if (existing) {
      return c.json({ error: 'Merchant with this phone number already exists', correlation_id: correlationId }, 409);
    }

    const now = nowISO();
    const actorId = generateId();

    const actor: Actor = {
      id: actorId,
      type: ActorType.MERCHANT,
      state: ActorState.PENDING,
      name,
      email,
      msisdn,
      kyc_state: KycState.NOT_STARTED,
      created_at: now,
      updated_at: now,
    };

    await insertActor(c.env.DB, actor);

    // Hash and store PIN
    const salt = generateSalt();
    const pinHash = await hashPin(pin, salt, c.env.PIN_PEPPER);
    await insertPin(c.env.DB, {
      id: generateId(),
      actor_id: actorId,
      pin_hash: pinHash,
      salt,
      failed_attempts: 0,
      created_at: now,
      updated_at: now,
    });

    // Create WALLET account (BBD)
    const walletId = generateId();
    await insertLedgerAccount(c.env.DB, {
      id: walletId,
      owner_type: ActorType.MERCHANT,
      owner_id: actorId,
      account_type: AccountType.WALLET,
      currency: 'BBD',
      created_at: now,
    });
    await initAccountBalance(c.env.DB, walletId, 'BBD');

    // Ensure linked KYC profile exists
    await ensureKycProfile(c.env.DB, {
      id: `kyc_${actorId}`,
      actor_id: actorId,
      actor_type: ActorType.MERCHANT,
      status: KycState.NOT_STARTED,
      created_at: now,
      updated_at: now,
    });

    // Emit MERCHANT_CREATED event
    const event = {
      id: generateId(),
      name: EventName.MERCHANT_CREATED,
      entity_type: 'actor',
      entity_id: actorId,
      correlation_id: correlationId,
      actor_type: ActorType.MERCHANT,
      actor_id: actorId,
      schema_version: 1,
      payload_json: JSON.stringify({
        name,
        msisdn,
        owner_name,
        owner_first_name: owner_first_name ?? null,
        owner_last_name: owner_last_name ?? null,
        business_registration_no: business_registration_no ?? null,
        tax_id: tax_id ?? null,
        wallet_id: walletId,
      }),
      created_at: now,
    };
    await insertEvent(c.env.DB, event);
    await c.env.EVENTS_QUEUE.send(event);

    // Auto-create the store_owner merchant user (identified by msisdn)
    const ownerUserId = generateId();
    const ownerUser: MerchantUser & { pin_hash: string; salt: string } = {
      id: ownerUserId,
      actor_id: actorId,
      msisdn,
      name: owner_name,
      role: MerchantUserRole.STORE_OWNER,
      state: MerchantUserState.ACTIVE,
      pin_hash: pinHash,
      salt,
      created_at: now,
      updated_at: now,
    };
    await insertMerchantUser(c.env.DB, ownerUser);

    return c.json({
      actor,
      wallet_id: walletId,
      owner_user_id: ownerUserId,
      correlation_id: correlationId,
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});

// POST /merchants/:merchantId/stores - create a store branch under a merchant
merchantRoutes.post('/:merchantId/stores', async (c) => {
  const merchantId = c.req.param('merchantId');
  const body = await c.req.json();
  const parsed = createStoreSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }

  const { store_code, name, msisdn, owner_name, email, pin } = parsed.data;
  const correlationId = (body.correlation_id as string) || generateId();

  try {
    const parentMerchant = await getActorById(c.env.DB, merchantId);
    if (!parentMerchant || parentMerchant.type !== ActorType.MERCHANT) {
      return c.json({ error: 'Parent merchant not found', correlation_id: correlationId }, 404);
    }

    const now = nowISO();
    let selectedReservation: Awaited<ReturnType<typeof getActiveCodeReservation>> | null = null;

    let storeCode = store_code;
    if (storeCode) {
      selectedReservation = await getActiveCodeReservation(c.env.DB, 'STORE', storeCode, now);
      if (!selectedReservation) {
        return c.json({ error: 'Selected store code is no longer available. Generate a new code set.', correlation_id: correlationId }, 409);
      }
      if (selectedReservation.reserved_by_actor_id && selectedReservation.reserved_by_actor_id !== parentMerchant.id) {
        return c.json({ error: 'Selected store code is reserved for another merchant', correlation_id: correlationId }, 403);
      }
    } else {
      storeCode = await generateUniqueStoreCode(c.env.DB);
    }

    const storeActorId = generateId();

    const storeActor: Actor = {
      id: storeActorId,
      type: ActorType.MERCHANT,
      state: ActorState.PENDING,
      name,
      msisdn,
      email,
      store_code: storeCode,
      parent_actor_id: parentMerchant.id,
      kyc_state: KycState.NOT_STARTED,
      created_at: now,
      updated_at: now,
    };
    await insertActor(c.env.DB, storeActor);

    const salt = generateSalt();
    const pinHash = await hashPin(pin, salt, c.env.PIN_PEPPER);
    await insertPin(c.env.DB, {
      id: generateId(),
      actor_id: storeActorId,
      pin_hash: pinHash,
      salt,
      failed_attempts: 0,
      created_at: now,
      updated_at: now,
    });

    const walletId = generateId();
    await insertLedgerAccount(c.env.DB, {
      id: walletId,
      owner_type: ActorType.MERCHANT,
      owner_id: storeActorId,
      account_type: AccountType.WALLET,
      currency: 'BBD',
      created_at: now,
    });
    await initAccountBalance(c.env.DB, walletId, 'BBD');

    await initMerchantStoreClosure(c.env.DB, storeActorId);
    await linkMerchantStoreBranch(c.env.DB, parentMerchant.id, storeActorId);

    await ensureKycProfile(c.env.DB, {
      id: `kyc_${storeActorId}`,
      actor_id: storeActorId,
      actor_type: ActorType.MERCHANT,
      status: KycState.NOT_STARTED,
      created_at: now,
      updated_at: now,
    });

    const ownerUserId = generateId();
    const ownerUser: MerchantUser & { pin_hash: string; salt: string } = {
      id: ownerUserId,
      actor_id: storeActorId,
      msisdn,
      name: owner_name,
      role: MerchantUserRole.STORE_OWNER,
      state: MerchantUserState.ACTIVE,
      pin_hash: pinHash,
      salt,
      created_at: now,
      updated_at: now,
    };
    await insertMerchantUser(c.env.DB, ownerUser);

    const branchEvent = {
      id: generateId(),
      name: EventName.MERCHANT_BRANCH_LINKED,
      entity_type: 'actor',
      entity_id: storeActorId,
      correlation_id: correlationId,
      actor_type: ActorType.MERCHANT,
      actor_id: parentMerchant.id,
      schema_version: 1,
      payload_json: JSON.stringify({
        merchant_id: parentMerchant.id,
        store_actor_id: storeActorId,
        store_code: storeCode,
        wallet_id: walletId,
      }),
      created_at: now,
    };
    await insertEvent(c.env.DB, branchEvent);

    if (selectedReservation) {
      await markCodeReservationUsed(c.env.DB, 'STORE', storeCode, storeActorId, now);
    }

    return c.json({
      merchant_id: parentMerchant.id,
      store: storeActor,
      store_code: storeCode,
      wallet_id: walletId,
      owner_user_id: ownerUserId,
      correlation_id: correlationId,
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});

// GET /merchants/:merchantId/kyc - merchant KYC profile + requirements
merchantRoutes.get('/:merchantId/kyc', async (c) => {
  const merchantId = c.req.param('merchantId');
  const correlationId = generateId();

  try {
    const merchant = await getActorById(c.env.DB, merchantId);
    if (!merchant || merchant.type !== ActorType.MERCHANT) {
      return c.json({ error: 'Merchant not found', correlation_id: correlationId }, 404);
    }

    const profile = await getKycProfileByActorId(c.env.DB, merchantId);
    const requirements = await listKycRequirementsByActorType(c.env.DB, ActorType.MERCHANT);
    return c.json({ profile, requirements, correlation_id: correlationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});

merchantRoutes.post('/:merchantId/kyc/initiate', async (c) => {
  const merchantId = c.req.param('merchantId');
  const body = await c.req.json();
  const correlationId = (body.correlation_id as string) || generateId();
  const { document_type, document_number } = body;

  if (!document_type || !document_number) {
    return c.json({ error: 'document_type and document_number are required', correlation_id: correlationId }, 400);
  }

  try {
    const now = nowISO();
    await c.env.DB
      .prepare("UPDATE actors SET kyc_state = 'PENDING', updated_at = ?1 WHERE id = ?2")
      .bind(now, merchantId)
      .run();

    await upsertKycProfile(c.env.DB, {
      id: `kyc_${merchantId}`,
      actor_id: merchantId,
      actor_type: ActorType.MERCHANT,
      status: KycState.PENDING,
      submitted_at: now,
      documents_json: JSON.stringify({ document_type, document_number }),
      metadata_json: JSON.stringify({ source: 'merchants/:merchantId/kyc/initiate' }),
      created_at: now,
      updated_at: now,
    });

    return c.json({ actor_id: merchantId, kyc_state: KycState.PENDING, correlation_id: correlationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});
