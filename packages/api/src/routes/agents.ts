import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
  generateId,
  nowISO,
  createAgentSchema,
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
  getActorByAgentCode,
  getActiveCodeReservation,
  markCodeReservationUsed,
  insertEvent,
  initAccountBalance,
  ensureKycProfile,
  getKycProfileByActorId,
  listKycRequirementsByActorType,
  upsertKycProfile,
} from '@caricash/db';
import { hashPin, generateSalt } from '../lib/pin.js';
import { generateUniqueAgentCode } from '../lib/code-generator.js';

export const agentRoutes = new Hono<{ Bindings: Env }>();

// POST /agents - create agent
agentRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createAgentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }

  const { agent_code, name, msisdn, pin, agent_type } = parsed.data;
  const correlationId = (body.correlation_id as string) || generateId();

  try {
    const resolvedAgentCode = agent_code ?? await generateUniqueAgentCode(c.env.DB);
    const now = nowISO();
    let selectedReservation: Awaited<ReturnType<typeof getActiveCodeReservation>> | null = null;

    if (agent_code) {
      const existing = await getActorByAgentCode(c.env.DB, resolvedAgentCode);
      if (existing) {
        return c.json({ error: 'Agent with this code already exists', correlation_id: correlationId }, 409);
      }

      selectedReservation = await getActiveCodeReservation(c.env.DB, 'AGENT', resolvedAgentCode, now);
      if (!selectedReservation) {
        return c.json({ error: 'Selected agent code is no longer available. Generate a new code set.', correlation_id: correlationId }, 409);
      }
    }

    const actorId = generateId();

    const actor: Actor = {
      id: actorId,
      type: ActorType.AGENT,
      state: ActorState.PENDING,
      name,
      msisdn,
      agent_code: resolvedAgentCode,
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
      owner_type: ActorType.AGENT,
      owner_id: actorId,
      account_type: AccountType.WALLET,
      currency: 'BBD',
      created_at: now,
    });
    await initAccountBalance(c.env.DB, walletId, 'BBD');

    // Create CASH_FLOAT account (BBD)
    const cashFloatId = generateId();
    await insertLedgerAccount(c.env.DB, {
      id: cashFloatId,
      owner_type: ActorType.AGENT,
      owner_id: actorId,
      account_type: AccountType.CASH_FLOAT,
      currency: 'BBD',
      created_at: now,
    });
    await initAccountBalance(c.env.DB, cashFloatId, 'BBD');

    // Ensure linked KYC profile exists
    await ensureKycProfile(c.env.DB, {
      id: `kyc_${actorId}`,
      actor_id: actorId,
      actor_type: ActorType.AGENT,
      status: KycState.NOT_STARTED,
      created_at: now,
      updated_at: now,
    });

    // Emit AGENT_CREATED event
    const event = {
      id: generateId(),
      name: EventName.AGENT_CREATED,
      entity_type: 'actor',
      entity_id: actorId,
      correlation_id: correlationId,
      actor_type: ActorType.AGENT,
      actor_id: actorId,
      schema_version: 1,
      payload_json: JSON.stringify({
        agent_code,
        generated_agent_code: resolvedAgentCode,
        agent_type,
        name,
        msisdn,
        wallet_id: walletId,
        cash_float_id: cashFloatId,
      }),
      created_at: now,
    };
    await insertEvent(c.env.DB, event);
    await c.env.EVENTS_QUEUE.send(event);

    if (selectedReservation) {
      await markCodeReservationUsed(c.env.DB, 'AGENT', resolvedAgentCode, actorId, now);
    }

    return c.json({
      actor,
      agent_code: resolvedAgentCode,
      wallet_id: walletId,
      cash_float_id: cashFloatId,
      correlation_id: correlationId,
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});

// GET /agents/:id/kyc - agent KYC profile + requirements
agentRoutes.get('/:id/kyc', async (c) => {
  const actorId = c.req.param('id');
  const correlationId = generateId();

  try {
    const profile = await getKycProfileByActorId(c.env.DB, actorId);
    const requirements = await listKycRequirementsByActorType(c.env.DB, ActorType.AGENT);
    return c.json({ profile, requirements, correlation_id: correlationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});

// POST /agents/:id/kyc/initiate - mark KYC pending with submitted docs
agentRoutes.post('/:id/kyc/initiate', async (c) => {
  const actorId = c.req.param('id');
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
      .bind(now, actorId)
      .run();

    await upsertKycProfile(c.env.DB, {
      id: `kyc_${actorId}`,
      actor_id: actorId,
      actor_type: ActorType.AGENT,
      status: KycState.PENDING,
      submitted_at: now,
      documents_json: JSON.stringify({ document_type, document_number }),
      metadata_json: JSON.stringify({ source: 'agents/:id/kyc/initiate' }),
      created_at: now,
      updated_at: now,
    });

    return c.json({ actor_id: actorId, kyc_state: KycState.PENDING, correlation_id: correlationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});

// backward-compatible alias
agentRoutes.post('/:id/kyc', async (c) => {
  const actorId = c.req.param('id');
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
      .bind(now, actorId)
      .run();

    await upsertKycProfile(c.env.DB, {
      id: `kyc_${actorId}`,
      actor_id: actorId,
      actor_type: ActorType.AGENT,
      status: KycState.PENDING,
      submitted_at: now,
      documents_json: JSON.stringify({ document_type, document_number }),
      metadata_json: JSON.stringify({ source: 'agents/:id/kyc' }),
      created_at: now,
      updated_at: now,
    });

    return c.json({ actor_id: actorId, kyc_state: KycState.PENDING, correlation_id: correlationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});
