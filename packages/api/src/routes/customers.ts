import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
  generateId,
  nowISO,
  createCustomerSchema,
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
  getActorByMsisdn,
  insertEvent,
  insertAuditLog,
} from '@caricash/db';
import { hashPin, generateSalt } from '../lib/pin.js';

export const customerRoutes = new Hono<{ Bindings: Env }>();

// POST /customers - create customer
customerRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }

  const { msisdn, name, pin } = parsed.data;
  const idempotencyKey = body.idempotency_key as string | undefined;
  const correlationId = (body.correlation_id as string) || generateId();

  try {
    // Check for existing customer
    const existing = await getActorByMsisdn(c.env.DB, msisdn);
    if (existing) {
      return c.json({ error: 'Customer with this MSISDN already exists', correlation_id: correlationId }, 409);
    }

    const now = nowISO();
    const actorId = generateId();

    const actor: Actor = {
      id: actorId,
      type: ActorType.CUSTOMER,
      state: ActorState.PENDING,
      name,
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

    // Create wallet account (BBD)
    const walletId = generateId();
    await insertLedgerAccount(c.env.DB, {
      id: walletId,
      owner_type: ActorType.CUSTOMER,
      owner_id: actorId,
      account_type: AccountType.WALLET,
      currency: 'BBD',
      created_at: now,
    });

    // Emit CUSTOMER_CREATED event
    const event = {
      id: generateId(),
      name: EventName.CUSTOMER_CREATED,
      entity_type: 'actor',
      entity_id: actorId,
      correlation_id: correlationId,
      actor_type: ActorType.CUSTOMER,
      actor_id: actorId,
      schema_version: 1,
      payload_json: JSON.stringify({ msisdn, name, wallet_id: walletId }),
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

// POST /customers/:id/kyc - initiate KYC
customerRoutes.post('/:id/kyc', async (c) => {
  const actorId = c.req.param('id');
  const body = await c.req.json();
  const correlationId = (body.correlation_id as string) || generateId();

  const { document_type, document_number } = body;
  if (!document_type || !document_number) {
    return c.json({ error: 'document_type and document_number are required', correlation_id: correlationId }, 400);
  }

  try {
    const now = nowISO();

    // Update kyc_state to PENDING
    await c.env.DB
      .prepare("UPDATE actors SET kyc_state = 'PENDING', updated_at = ?1 WHERE id = ?2")
      .bind(now, actorId)
      .run();

    // Audit log
    await insertAuditLog(c.env.DB, {
      id: generateId(),
      action: 'KYC_INITIATED',
      actor_type: ActorType.CUSTOMER,
      actor_id: actorId,
      target_type: 'actor',
      target_id: actorId,
      after_json: JSON.stringify({ kyc_state: 'PENDING', document_type, document_number }),
      correlation_id: correlationId,
      created_at: now,
    });

    // Emit event
    const event = {
      id: generateId(),
      name: EventName.CUSTOMER_KYC_INITIATED,
      entity_type: 'actor',
      entity_id: actorId,
      correlation_id: correlationId,
      actor_type: ActorType.CUSTOMER,
      actor_id: actorId,
      schema_version: 1,
      payload_json: JSON.stringify({ document_type, document_number }),
      created_at: now,
    };
    await insertEvent(c.env.DB, event);
    await c.env.EVENTS_QUEUE.send(event);

    return c.json({
      actor_id: actorId,
      kyc_state: KycState.PENDING,
      correlation_id: correlationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});
