import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
  generateId,
  nowISO,
  createMerchantSchema,
  createStoreSchema,
  updateStoreSchema,
  createPaymentNodeSchema,
  updatePaymentNodeSchema,
  ActorType,
  ActorState,
  KycState,
  AccountType,
  EventName,
  MerchantUserRole,
  MerchantUserState,
} from '@caricash/shared';
import type { Actor, MerchantUser, MerchantStore, StorePaymentNode } from '@caricash/shared';
import {
  insertActor,
  insertPin,
  insertLedgerAccount,
  getActorById,
  getActorByMsisdnAndType,
  getActiveCodeReservation,
  insertEvent,
  insertAuditLog,
  insertMerchantUser,
  initMerchantStoreClosure,
  linkMerchantStoreBranch,
  markCodeReservationUsed,
  initAccountBalance,
  ensureKycProfile,
  getKycProfileByActorId,
  listKycRequirementsByActorType,
  upsertKycProfile,
  listActors,
  updateActorProfile,
  getMerchantDescendants,
  getLedgerAccount,
  getAccountBalance,
  insertMerchantStore,
  getMerchantStoreById,
  getMerchantStoreByCode,
  listMerchantStores,
  updateMerchantStore,
  insertStorePaymentNode,
  getStorePaymentNodeById,
  listStorePaymentNodes,
  updateStorePaymentNode,
  deleteStorePaymentNode,
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

// POST /merchants/:merchantId/stores - create a store under a merchant
merchantRoutes.post('/:merchantId/stores', async (c) => {
  const merchantId = c.req.param('merchantId');
  const body = await c.req.json();
  const parsed = createStoreSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }

  const { store_code, name, legal_name, is_primary, location, status, kyc_profile } = parsed.data;
  const correlationId = (body.correlation_id as string) || generateId();

  try {
    const parentMerchant = await getActorById(c.env.DB, merchantId);
    if (!parentMerchant || parentMerchant.type !== ActorType.MERCHANT) {
      return c.json({ error: 'Parent merchant not found', correlation_id: correlationId }, 404);
    }

    const now = nowISO();

    let storeCode = store_code;
    if (storeCode) {
      // Check if code is already in use
      const existingStore = await getMerchantStoreByCode(c.env.DB, storeCode);
      if (existingStore) {
        return c.json({ error: 'Store code already in use', correlation_id: correlationId }, 409);
      }
      // Check code reservation if available
      const selectedReservation = await getActiveCodeReservation(c.env.DB, 'STORE', storeCode, now);
      if (selectedReservation && selectedReservation.reserved_by_actor_id && selectedReservation.reserved_by_actor_id !== parentMerchant.id) {
        return c.json({ error: 'Selected store code is reserved for another merchant', correlation_id: correlationId }, 403);
      }
      if (selectedReservation) {
        await markCodeReservationUsed(c.env.DB, 'STORE', storeCode, parentMerchant.id, now);
      }
    } else {
      storeCode = await generateUniqueStoreCode(c.env.DB);
    }

    const storeId = generateId();

    const store: MerchantStore = {
      id: storeId,
      merchant_id: merchantId,
      name,
      legal_name: legal_name ?? undefined,
      store_code: storeCode,
      is_primary: is_primary ?? false,
      location: location ?? null,
      status: status ?? 'active',
      kyc_profile: kyc_profile ?? null,
      created_at: now,
      updated_at: now,
    };
    await insertMerchantStore(c.env.DB, store);

    // Emit event
    const storeEvent = {
      id: generateId(),
      name: EventName.MERCHANT_STORE_CREATED,
      entity_type: 'merchant_store',
      entity_id: storeId,
      correlation_id: correlationId,
      actor_type: ActorType.MERCHANT,
      actor_id: merchantId,
      schema_version: 1,
      payload_json: JSON.stringify({
        merchant_id: merchantId,
        store_id: storeId,
        store_code: storeCode,
        name,
      }),
      created_at: now,
    };
    await insertEvent(c.env.DB, storeEvent);

    return c.json({
      merchant_id: merchantId,
      store,
      store_code: storeCode,
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

// ---------------------------------------------------------------------------
// GET /merchants - list merchants with pagination/filters
// ---------------------------------------------------------------------------
merchantRoutes.get('/', async (c) => {
  try {
    const state = c.req.query('state');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50;
    const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!, 10) : 0;
    const parentId = c.req.query('parent_actor_id');

    const merchants = await listActors(c.env.DB, {
      type: ActorType.MERCHANT,
      state,
      parent_actor_id: parentId,
      limit: Math.min(limit, 200),
      offset,
    });

    // Strip sensitive fields for listing
    const sanitized = merchants.map((m) => ({
      id: m.id,
      type: m.type,
      state: m.state,
      name: m.name,
      display_name: m.display_name,
      store_code: m.store_code,
      parent_actor_id: m.parent_actor_id,
      kyc_state: m.kyc_state,
      created_at: m.created_at,
      updated_at: m.updated_at,
    }));

    return c.json({ merchants: sanitized, count: sanitized.length, limit, offset });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /merchants/:merchantId - merchant profile
// ---------------------------------------------------------------------------
merchantRoutes.get('/:merchantId', async (c) => {
  const merchantId = c.req.param('merchantId');
  const correlationId = generateId();

  try {
    const merchant = await getActorById(c.env.DB, merchantId);
    if (!merchant || merchant.type !== ActorType.MERCHANT) {
      return c.json({ error: 'Merchant not found', correlation_id: correlationId }, 404);
    }

    // Fetch wallet balance
    const walletAccount = await getLedgerAccount(
      c.env.DB, ActorType.MERCHANT, merchantId, AccountType.WALLET, 'BBD',
    );
    let balance: { actual_balance: string; available_balance: string } | null = null;
    if (walletAccount) {
      const bal = await getAccountBalance(c.env.DB, walletAccount.id);
      if (bal) {
        balance = { actual_balance: bal.actual_balance, available_balance: bal.available_balance };
      }
    }

    // KYC profile
    const kyc = await getKycProfileByActorId(c.env.DB, merchantId);

    return c.json({
      merchant: {
        id: merchant.id,
        type: merchant.type,
        state: merchant.state,
        name: merchant.name,
        display_name: merchant.display_name,
        email: merchant.email,
        msisdn: merchant.msisdn,
        store_code: merchant.store_code,
        parent_actor_id: merchant.parent_actor_id,
        kyc_state: merchant.kyc_state,
        created_at: merchant.created_at,
        updated_at: merchant.updated_at,
      },
      wallet: walletAccount ? { account_id: walletAccount.id, currency: walletAccount.currency, ...balance } : null,
      kyc: kyc ? { status: kyc.status, verification_level: kyc.verification_level, submitted_at: kyc.submitted_at } : null,
      correlation_id: correlationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});

// ---------------------------------------------------------------------------
// PUT /merchants/:merchantId - update merchant profile
// ---------------------------------------------------------------------------
merchantRoutes.put('/:merchantId', async (c) => {
  const merchantId = c.req.param('merchantId');
  const body = await c.req.json();
  const correlationId = (body.correlation_id as string) || generateId();

  try {
    const merchant = await getActorById(c.env.DB, merchantId);
    if (!merchant || merchant.type !== ActorType.MERCHANT) {
      return c.json({ error: 'Merchant not found', correlation_id: correlationId }, 404);
    }

    const updates: Record<string, string | undefined> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.display_name !== undefined) updates.display_name = body.display_name;
    if (body.email !== undefined) updates.email = body.email;
    if (body.first_name !== undefined) updates.first_name = body.first_name;
    if (body.last_name !== undefined) updates.last_name = body.last_name;

    if (Object.keys(updates).length === 0) {
      return c.json({ error: 'No fields to update', correlation_id: correlationId }, 400);
    }

    const now = nowISO();
    const beforeSnapshot = JSON.stringify({
      name: merchant.name, display_name: merchant.display_name,
      email: merchant.email, first_name: merchant.first_name, last_name: merchant.last_name,
    });

    await updateActorProfile(c.env.DB, merchantId, updates);

    const afterSnapshot = JSON.stringify({ ...JSON.parse(beforeSnapshot), ...updates });

    // Audit log
    await insertAuditLog(c.env.DB, {
      id: generateId(),
      action: 'MERCHANT_PROFILE_UPDATED',
      actor_type: ActorType.MERCHANT,
      actor_id: merchantId,
      target_type: 'actor',
      target_id: merchantId,
      before_json: beforeSnapshot,
      after_json: afterSnapshot,
      correlation_id: correlationId,
      created_at: now,
    });

    // Emit event
    await insertEvent(c.env.DB, {
      id: generateId(),
      name: EventName.MERCHANT_PROFILE_UPDATED,
      entity_type: 'actor',
      entity_id: merchantId,
      correlation_id: correlationId,
      actor_type: ActorType.MERCHANT,
      actor_id: merchantId,
      schema_version: 1,
      payload_json: afterSnapshot,
      created_at: now,
    });

    const updated = await getActorById(c.env.DB, merchantId);
    return c.json({
      merchant: {
        id: updated!.id,
        type: updated!.type,
        state: updated!.state,
        name: updated!.name,
        display_name: updated!.display_name,
        email: updated!.email,
        store_code: updated!.store_code,
        kyc_state: updated!.kyc_state,
        updated_at: updated!.updated_at,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /merchants/:merchantId/stores - list stores under a merchant
// ---------------------------------------------------------------------------
merchantRoutes.get('/:merchantId/stores', async (c) => {
  const merchantId = c.req.param('merchantId');
  const correlationId = generateId();

  try {
    const merchant = await getActorById(c.env.DB, merchantId);
    if (!merchant || merchant.type !== ActorType.MERCHANT) {
      return c.json({ error: 'Merchant not found', correlation_id: correlationId }, 404);
    }

    const statusFilter = c.req.query('status');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 100;
    const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!, 10) : 0;

    const stores = await listMerchantStores(c.env.DB, merchantId, {
      status: statusFilter,
      limit: Math.min(limit, 200),
      offset,
    });

    return c.json({ stores, count: stores.length, merchant_id: merchantId, correlation_id: correlationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /merchants/:merchantId/stores/:storeId - get a single store
// ---------------------------------------------------------------------------
merchantRoutes.get('/:merchantId/stores/:storeId', async (c) => {
  const merchantId = c.req.param('merchantId');
  const storeId = c.req.param('storeId');
  const correlationId = generateId();

  try {
    const store = await getMerchantStoreById(c.env.DB, storeId);
    if (!store || store.merchant_id !== merchantId) {
      return c.json({ error: 'Store not found', correlation_id: correlationId }, 404);
    }
    return c.json({ store, correlation_id: correlationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});

// ---------------------------------------------------------------------------
// PUT /merchants/:merchantId/stores/:storeId - update a store
// ---------------------------------------------------------------------------
merchantRoutes.put('/:merchantId/stores/:storeId', async (c) => {
  const merchantId = c.req.param('merchantId');
  const storeId = c.req.param('storeId');
  const body = await c.req.json();
  const parsed = updateStoreSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }
  const correlationId = (body.correlation_id as string) || generateId();

  try {
    const store = await getMerchantStoreById(c.env.DB, storeId);
    if (!store || store.merchant_id !== merchantId) {
      return c.json({ error: 'Store not found', correlation_id: correlationId }, 404);
    }

    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      return c.json({ error: 'No fields to update', correlation_id: correlationId }, 400);
    }

    const now = nowISO();
    await updateMerchantStore(c.env.DB, storeId, updates);

    await insertEvent(c.env.DB, {
      id: generateId(),
      name: EventName.MERCHANT_STORE_UPDATED,
      entity_type: 'merchant_store',
      entity_id: storeId,
      correlation_id: correlationId,
      actor_type: ActorType.MERCHANT,
      actor_id: merchantId,
      schema_version: 1,
      payload_json: JSON.stringify(updates),
      created_at: now,
    });

    const updated = await getMerchantStoreById(c.env.DB, storeId);
    return c.json({ store: updated, correlation_id: correlationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /merchants/:merchantId/stores/:storeId/payment-nodes - create payment node
// ---------------------------------------------------------------------------
merchantRoutes.post('/:merchantId/stores/:storeId/payment-nodes', async (c) => {
  const merchantId = c.req.param('merchantId');
  const storeId = c.req.param('storeId');
  const body = await c.req.json();
  const parsed = createPaymentNodeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }
  const correlationId = (body.correlation_id as string) || generateId();

  try {
    const store = await getMerchantStoreById(c.env.DB, storeId);
    if (!store || store.merchant_id !== merchantId) {
      return c.json({ error: 'Store not found', correlation_id: correlationId }, 404);
    }

    const now = nowISO();
    const nodeId = generateId();
    const node: StorePaymentNode = {
      id: nodeId,
      store_id: storeId,
      store_node_name: parsed.data.store_node_name,
      store_node_code: parsed.data.store_node_code,
      description: parsed.data.description,
      status: parsed.data.status ?? 'active',
      is_primary: parsed.data.is_primary ?? false,
      created_at: now,
      updated_at: now,
    };
    await insertStorePaymentNode(c.env.DB, node);

    await insertEvent(c.env.DB, {
      id: generateId(),
      name: EventName.STORE_PAYMENT_NODE_CREATED,
      entity_type: 'store_payment_node',
      entity_id: nodeId,
      correlation_id: correlationId,
      actor_type: ActorType.MERCHANT,
      actor_id: merchantId,
      schema_version: 1,
      payload_json: JSON.stringify({ store_id: storeId, ...parsed.data }),
      created_at: now,
    });

    return c.json({ node, correlation_id: correlationId }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /merchants/:merchantId/stores/:storeId/payment-nodes - list payment nodes
// ---------------------------------------------------------------------------
merchantRoutes.get('/:merchantId/stores/:storeId/payment-nodes', async (c) => {
  const merchantId = c.req.param('merchantId');
  const storeId = c.req.param('storeId');
  const correlationId = generateId();

  try {
    const store = await getMerchantStoreById(c.env.DB, storeId);
    if (!store || store.merchant_id !== merchantId) {
      return c.json({ error: 'Store not found', correlation_id: correlationId }, 404);
    }

    const statusFilter = c.req.query('status');
    const nodes = await listStorePaymentNodes(c.env.DB, storeId, { status: statusFilter });
    return c.json({ nodes, count: nodes.length, store_id: storeId, correlation_id: correlationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});

// ---------------------------------------------------------------------------
// PUT /merchants/:merchantId/stores/:storeId/payment-nodes/:nodeId - update node
// ---------------------------------------------------------------------------
merchantRoutes.put('/:merchantId/stores/:storeId/payment-nodes/:nodeId', async (c) => {
  const merchantId = c.req.param('merchantId');
  const storeId = c.req.param('storeId');
  const nodeId = c.req.param('nodeId');
  const body = await c.req.json();
  const parsed = updatePaymentNodeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }
  const correlationId = (body.correlation_id as string) || generateId();

  try {
    const store = await getMerchantStoreById(c.env.DB, storeId);
    if (!store || store.merchant_id !== merchantId) {
      return c.json({ error: 'Store not found', correlation_id: correlationId }, 404);
    }

    const existing = await getStorePaymentNodeById(c.env.DB, nodeId);
    if (!existing || existing.store_id !== storeId) {
      return c.json({ error: 'Payment node not found', correlation_id: correlationId }, 404);
    }

    await updateStorePaymentNode(c.env.DB, nodeId, parsed.data);

    await insertEvent(c.env.DB, {
      id: generateId(),
      name: EventName.STORE_PAYMENT_NODE_UPDATED,
      entity_type: 'store_payment_node',
      entity_id: nodeId,
      correlation_id: correlationId,
      actor_type: ActorType.MERCHANT,
      actor_id: merchantId,
      schema_version: 1,
      payload_json: JSON.stringify(parsed.data),
      created_at: nowISO(),
    });

    const updated = await getStorePaymentNodeById(c.env.DB, nodeId);
    return c.json({ node: updated, correlation_id: correlationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});

// ---------------------------------------------------------------------------
// DELETE /merchants/:merchantId/stores/:storeId/payment-nodes/:nodeId
// ---------------------------------------------------------------------------
merchantRoutes.delete('/:merchantId/stores/:storeId/payment-nodes/:nodeId', async (c) => {
  const merchantId = c.req.param('merchantId');
  const storeId = c.req.param('storeId');
  const nodeId = c.req.param('nodeId');
  const correlationId = generateId();

  try {
    const store = await getMerchantStoreById(c.env.DB, storeId);
    if (!store || store.merchant_id !== merchantId) {
      return c.json({ error: 'Store not found', correlation_id: correlationId }, 404);
    }

    const existing = await getStorePaymentNodeById(c.env.DB, nodeId);
    if (!existing || existing.store_id !== storeId) {
      return c.json({ error: 'Payment node not found', correlation_id: correlationId }, 404);
    }

    await deleteStorePaymentNode(c.env.DB, nodeId);
    return c.json({ success: true, correlation_id: correlationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});
