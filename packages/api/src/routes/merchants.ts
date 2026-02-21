import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
  generateId,
  nowISO,
  createMerchantSchema,
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
  getActorByStoreCode,
  insertEvent,
  insertMerchantUser,
  initMerchantStoreClosure,
  linkMerchantStoreBranch,
  initAccountBalance,
} from '@caricash/db';
import { hashPin, generateSalt } from '../lib/pin.js';

export const merchantRoutes = new Hono<{ Bindings: Env }>();

// POST /merchants - create merchant (optionally as a branch of a parent)
merchantRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createMerchantSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }

  const { store_code, name, msisdn, pin, owner_name, email, parent_store_code } = parsed.data;
  const correlationId = (body.correlation_id as string) || generateId();

  try {
    // Check for existing merchant
    const existing = await getActorByStoreCode(c.env.DB, store_code);
    if (existing) {
      return c.json({ error: 'Merchant with this store code already exists', correlation_id: correlationId }, 409);
    }

    // Resolve optional parent store
    let parentActor: Actor | null = null;
    if (parent_store_code) {
      parentActor = await getActorByStoreCode(c.env.DB, parent_store_code);
      if (!parentActor) {
        return c.json({ error: 'Parent store not found', correlation_id: correlationId }, 404);
      }
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
      store_code,
      parent_actor_id: parentActor?.id,
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

    // ── Closure table: self-reference + parent link ──────────────────────
    await initMerchantStoreClosure(c.env.DB, actorId);
    if (parentActor) {
      await linkMerchantStoreBranch(c.env.DB, parentActor.id, actorId);

      // Emit branch-linked event
      const branchEvent = {
        id: generateId(),
        name: EventName.MERCHANT_BRANCH_LINKED,
        entity_type: 'actor',
        entity_id: actorId,
        correlation_id: correlationId,
        actor_type: ActorType.MERCHANT,
        actor_id: parentActor.id,
        schema_version: 1,
        payload_json: JSON.stringify({
          parent_store_code: parent_store_code,
          child_store_code: store_code,
          parent_actor_id: parentActor.id,
          child_actor_id: actorId,
        }),
        created_at: now,
      };
      await insertEvent(c.env.DB, branchEvent);
    }

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
      payload_json: JSON.stringify({ store_code, name, msisdn, wallet_id: walletId, parent_store_code }),
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
