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
} from '@caricash/shared';
import type { Actor } from '@caricash/shared';
import {
  insertActor,
  insertPin,
  insertLedgerAccount,
  getActorByStoreCode,
  insertEvent,
} from '@caricash/db';
import { hashPin, generateSalt } from '../lib/pin.js';

export const merchantRoutes = new Hono<{ Bindings: Env }>();

// POST /merchants - create merchant
merchantRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createMerchantSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }

  const { store_code, name, msisdn, pin } = parsed.data;
  const correlationId = (body.correlation_id as string) || generateId();

  try {
    // Check for existing merchant
    const existing = await getActorByStoreCode(c.env.DB, store_code);
    if (existing) {
      return c.json({ error: 'Merchant with this store code already exists', correlation_id: correlationId }, 409);
    }

    const now = nowISO();
    const actorId = generateId();

    const actor: Actor = {
      id: actorId,
      type: ActorType.MERCHANT,
      state: ActorState.PENDING,
      name,
      msisdn,
      store_code,
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
      payload_json: JSON.stringify({ store_code, name, msisdn, wallet_id: walletId }),
      created_at: now,
    };
    await insertEvent(c.env.DB, event);
    await c.env.EVENTS_QUEUE.send(event);

    return c.json({
      actor,
      wallet_id: walletId,
      correlation_id: correlationId,
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});
