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
  AgentType,
  AgentUserRole,
  AgentUserState,
} from '@caricash/shared';
import type { Actor, AgentUser } from '@caricash/shared';
import {
  insertActor,
  insertPin,
  insertLedgerAccount,
  getActorByAgentCode,
  getActorById,
  getActiveCodeReservation,
  markCodeReservationUsed,
  insertAgentUser,
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

  const { agent_code, name, owner_name, msisdn, pin, agent_type, parent_aggregator_id } = parsed.data;
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

    let parentAggregator: Actor | null = null;
    if (parent_aggregator_id) {
      parentAggregator = await getActorById(c.env.DB, parent_aggregator_id);
      if (!parentAggregator || parentAggregator.type !== ActorType.AGENT) {
        return c.json({ error: 'Parent aggregator not found', correlation_id: correlationId }, 404);
      }
      if (parentAggregator.agent_type !== AgentType.AGGREGATOR) {
        return c.json({ error: 'Parent actor is not an aggregator agent', correlation_id: correlationId }, 400);
      }
      if (agent_type !== AgentType.STANDARD) {
        return c.json({ error: 'Child agents must be STANDARD type', correlation_id: correlationId }, 400);
      }
    }
    if (agent_type === AgentType.AGGREGATOR && parent_aggregator_id) {
      return c.json({ error: 'Aggregator agents cannot be registered as child agents', correlation_id: correlationId }, 400);
    }

    const actorId = generateId();

    const actor: Actor = {
      id: actorId,
      type: ActorType.AGENT,
      state: ActorState.PENDING,
      name,
      msisdn,
      agent_code: resolvedAgentCode,
      agent_type,
      parent_actor_id: parentAggregator?.id,
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

    const ownerUserId = generateId();
    const ownerUser: AgentUser & { pin_hash: string; salt: string } = {
      id: ownerUserId,
      actor_id: actorId,
      msisdn,
      name: owner_name ?? name,
      role: AgentUserRole.AGENT_OWNER,
      state: AgentUserState.ACTIVE,
      pin_hash: pinHash,
      salt,
      created_at: now,
      updated_at: now,
    };
    await insertAgentUser(c.env.DB, ownerUser);

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
        parent_aggregator_id: parentAggregator?.id ?? null,
        owner_user_id: ownerUserId,
        owner_user_role: AgentUserRole.AGENT_OWNER,
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
      owner_user_id: ownerUserId,
      owner_user_role: AgentUserRole.AGENT_OWNER,
      parent_aggregator_id: parentAggregator?.id,
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
