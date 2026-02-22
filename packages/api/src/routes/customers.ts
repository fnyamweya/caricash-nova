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
  RegistrationType,
} from '@caricash/shared';
import type { Actor, RegistrationMetadata } from '@caricash/shared';
import {
  insertActor,
  insertPin,
  insertLedgerAccount,
  getActorByMsisdn,
  getActorById,
  insertEvent,
  insertAuditLog,
  insertRegistrationMetadata,
  initAccountBalance,
  ensureKycProfile,
  upsertKycProfile,
  getKycProfileByActorId,
  listKycRequirementsByActorType,
  listActors,
  updateActorProfile,
  getLedgerAccount,
  getAccountBalance,
} from '@caricash/db';
import { hashPin, generateSalt } from '../lib/pin.js';

export const customerRoutes = new Hono<{ Bindings: Env }>();

/**
 * Resolve display_name from preferred_name preference.
 * If the user selects a preferred name source, compute display_name from their name parts.
 */
function resolveDisplayName(
  preferred: string | undefined,
  customDisplayName: string | undefined,
  firstName?: string,
  middleName?: string,
  lastName?: string,
  fullName?: string,
): string | undefined {
  if (!preferred) return customDisplayName;
  switch (preferred) {
    case 'FIRST_NAME': return firstName;
    case 'MIDDLE_NAME': return middleName;
    case 'LAST_NAME': return lastName;
    case 'FULL_NAME': return fullName;
    case 'CUSTOM': return customDisplayName;
    default: return customDisplayName;
  }
}

// POST /customers - create customer
customerRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }

  const {
    msisdn, name, pin, first_name, middle_name, last_name, email,
    display_name: customDisplayName, preferred_name,
    registration_type, channel, registered_by_actor_id,
    referral_code, campaign_id,
    terms_accepted, privacy_accepted, marketing_opt_in,
  } = parsed.data;
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

    // Resolve display name from preferred name selection
    const displayName = resolveDisplayName(preferred_name, customDisplayName, first_name, middle_name, last_name, name);

    const actor: Actor = {
      id: actorId,
      type: ActorType.CUSTOMER,
      state: ActorState.PENDING,
      name,
      first_name,
      middle_name,
      last_name,
      display_name: displayName,
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

    // Initialize account_balances row
    await initAccountBalance(c.env.DB, walletId, 'BBD');

    // Ensure linked KYC profile exists
    await ensureKycProfile(c.env.DB, {
      id: `kyc_${actorId}`,
      actor_id: actorId,
      actor_type: ActorType.CUSTOMER,
      status: KycState.NOT_STARTED,
      created_at: now,
      updated_at: now,
    });

    // Determine registration type
    let regType = registration_type ?? RegistrationType.SELF_REGISTRATION;
    let registeredByActorType: string | undefined;
    if (registered_by_actor_id) {
      const registrar = await getActorById(c.env.DB, registered_by_actor_id);
      if (registrar) {
        registeredByActorType = registrar.type;
        if (!registration_type) {
          if (registrar.type === ActorType.AGENT) regType = RegistrationType.AGENT_REGISTRATION;
          else if (registrar.type === ActorType.STAFF) regType = RegistrationType.STAFF_REGISTRATION;
          else if (registrar.type === ActorType.MERCHANT) regType = RegistrationType.MERCHANT_REFERRAL;
        }
      }
    }

    // Store registration metadata
    const regMetaId = generateId();
    const actorSnapshot = JSON.stringify({
      id: actorId,
      type: ActorType.CUSTOMER,
      state: ActorState.PENDING,
      name,
      first_name: first_name ?? null,
      middle_name: middle_name ?? null,
      last_name: last_name ?? null,
      display_name: displayName ?? null,
      preferred_name: preferred_name ?? null,
      email: email ?? null,
      msisdn,
      kyc_state: KycState.NOT_STARTED,
      wallet_id: walletId,
    });

    const regMeta: RegistrationMetadata = {
      id: regMetaId,
      actor_id: actorId,
      registration_type: regType,
      registered_by_actor_id: registered_by_actor_id,
      registered_by_actor_type: registeredByActorType,
      channel: channel ?? (body.channel as string | undefined) as any,
      device_type: body.device_type as string | undefined,
      device_info: c.req.header('User-Agent') ?? undefined,
      ip_address: c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? undefined,
      geo_location: c.req.header('CF-IPCountry') ?? undefined,
      actor_snapshot_json: actorSnapshot,
      referral_code,
      campaign_id,
      utm_source: body.utm_source as string | undefined,
      utm_medium: body.utm_medium as string | undefined,
      utm_campaign: body.utm_campaign as string | undefined,
      terms_accepted_at: terms_accepted ? now : undefined,
      privacy_accepted_at: privacy_accepted ? now : undefined,
      marketing_opt_in: marketing_opt_in ?? false,
      verification_json: '{}',
      metadata_json: JSON.stringify({
        preferred_name: preferred_name ?? null,
        pin_set: true,
        wallet_created: true,
      }),
      started_at: now,
      completed_at: now,
      created_at: now,
      updated_at: now,
    };
    await insertRegistrationMetadata(c.env.DB, regMeta);

    // Emit CUSTOMER_CREATED event
    const createdEvent = {
      id: generateId(),
      name: EventName.CUSTOMER_CREATED,
      entity_type: 'actor',
      entity_id: actorId,
      correlation_id: correlationId,
      actor_type: ActorType.CUSTOMER,
      actor_id: actorId,
      schema_version: 2,
      payload_json: JSON.stringify({
        msisdn, name, first_name, middle_name, last_name,
        display_name: displayName, preferred_name,
        email, wallet_id: walletId,
      }),
      created_at: now,
    };
    await insertEvent(c.env.DB, createdEvent);
    await c.env.EVENTS_QUEUE.send(createdEvent);

    // Emit REGISTRATION_COMPLETED event
    const regEvent = {
      id: generateId(),
      name: EventName.REGISTRATION_COMPLETED,
      entity_type: 'registration_metadata',
      entity_id: regMetaId,
      correlation_id: correlationId,
      causation_id: actorId,
      actor_type: regType === RegistrationType.SELF_REGISTRATION ? ActorType.CUSTOMER : (registeredByActorType ?? ActorType.CUSTOMER) as any,
      actor_id: registered_by_actor_id ?? actorId,
      schema_version: 1,
      payload_json: JSON.stringify({
        actor_id: actorId,
        registration_type: regType,
        channel: channel ?? null,
        registered_by_actor_id: registered_by_actor_id ?? null,
        referral_code: referral_code ?? null,
        campaign_id: campaign_id ?? null,
      }),
      created_at: now,
    };
    await insertEvent(c.env.DB, regEvent);
    await c.env.EVENTS_QUEUE.send(regEvent);

    // Emit display name event if set
    if (displayName) {
      const displayNameEvent = {
        id: generateId(),
        name: EventName.CUSTOMER_DISPLAY_NAME_SET,
        entity_type: 'actor',
        entity_id: actorId,
        correlation_id: correlationId,
        actor_type: ActorType.CUSTOMER,
        actor_id: actorId,
        schema_version: 1,
        payload_json: JSON.stringify({
          display_name: displayName,
          preferred_name: preferred_name ?? 'CUSTOM',
          source_first: first_name ?? null,
          source_middle: middle_name ?? null,
          source_last: last_name ?? null,
        }),
        created_at: now,
      };
      await insertEvent(c.env.DB, displayNameEvent);
      await c.env.EVENTS_QUEUE.send(displayNameEvent);
    }

    // Audit log
    await insertAuditLog(c.env.DB, {
      id: generateId(),
      action: 'CUSTOMER_REGISTERED',
      actor_type: registered_by_actor_id ? (registeredByActorType ?? ActorType.CUSTOMER) as any : ActorType.CUSTOMER,
      actor_id: registered_by_actor_id ?? actorId,
      target_type: 'actor',
      target_id: actorId,
      after_json: actorSnapshot,
      ip: c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? undefined,
      device: c.req.header('User-Agent') ?? undefined,
      correlation_id: correlationId,
      created_at: now,
    });

    return c.json({
      actor,
      wallet_id: walletId,
      registration_id: regMetaId,
      registration_type: regType,
      correlation_id: correlationId,
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});

// POST /customers/:id/kyc/initiate - initiate KYC (canonical path)
// Also mounted at POST /customers/:id/kyc for backwards compatibility
customerRoutes.post('/:id/kyc/initiate', async (c) => {
  // Forward to the handler below
  return handleKycInitiate(c);
});
customerRoutes.post('/:id/kyc', async (c) => {
  return handleKycInitiate(c);
});

customerRoutes.get('/:id/kyc', async (c) => {
  const actorId = c.req.param('id');
  const correlationId = generateId();

  try {
    const profile = await getKycProfileByActorId(c.env.DB, actorId);
    const requirements = await listKycRequirementsByActorType(c.env.DB, ActorType.CUSTOMER);
    return c.json({ profile, requirements, correlation_id: correlationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});

async function handleKycInitiate(c: any) {
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

    // Upsert KYC profile details
    await upsertKycProfile(c.env.DB, {
      id: `kyc_${actorId}`,
      actor_id: actorId,
      actor_type: ActorType.CUSTOMER,
      status: KycState.PENDING,
      submitted_at: now,
      documents_json: JSON.stringify({ document_type, document_number }),
      metadata_json: JSON.stringify({ source: 'customers/:id/kyc/initiate' }),
      created_at: now,
      updated_at: now,
    });

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
}

// ---------------------------------------------------------------------------
// GET /customers - list customers with pagination/filters
// ---------------------------------------------------------------------------
customerRoutes.get('/', async (c) => {
  try {
    const state = c.req.query('state');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50;
    const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!, 10) : 0;

    const customers = await listActors(c.env.DB, {
      type: ActorType.CUSTOMER,
      state,
      limit: Math.min(limit, 200),
      offset,
    });

    // Strip sensitive fields for listing — PII safe
    const sanitized = customers.map((cust) => ({
      id: cust.id,
      type: cust.type,
      state: cust.state,
      name: cust.name,
      display_name: cust.display_name,
      msisdn: cust.msisdn ? maskMsisdn(cust.msisdn) : undefined,
      kyc_state: cust.kyc_state,
      created_at: cust.created_at,
      updated_at: cust.updated_at,
    }));

    return c.json({ customers: sanitized, count: sanitized.length, limit, offset });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /customers/:id - customer profile
// ---------------------------------------------------------------------------
customerRoutes.get('/:id', async (c) => {
  const customerId = c.req.param('id');
  // Avoid colliding with GET /:id/kyc — Hono should resolve this correctly
  // because /:id/kyc is registered with a more specific path
  const correlationId = generateId();

  try {
    const customer = await getActorById(c.env.DB, customerId);
    if (!customer || customer.type !== ActorType.CUSTOMER) {
      return c.json({ error: 'Customer not found', correlation_id: correlationId }, 404);
    }

    // Fetch wallet balance
    const walletAccount = await getLedgerAccount(
      c.env.DB, ActorType.CUSTOMER, customerId, AccountType.WALLET, 'BBD',
    );
    let balance: { actual_balance: string; available_balance: string } | null = null;
    if (walletAccount) {
      const bal = await getAccountBalance(c.env.DB, walletAccount.id);
      if (bal) {
        balance = { actual_balance: bal.actual_balance, available_balance: bal.available_balance };
      }
    }

    // KYC profile
    const kyc = await getKycProfileByActorId(c.env.DB, customerId);

    return c.json({
      customer: {
        id: customer.id,
        type: customer.type,
        state: customer.state,
        name: customer.name,
        first_name: customer.first_name,
        last_name: customer.last_name,
        display_name: customer.display_name,
        email: customer.email,
        msisdn: customer.msisdn,
        kyc_state: customer.kyc_state,
        created_at: customer.created_at,
        updated_at: customer.updated_at,
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
// PUT /customers/:id - update customer profile
// ---------------------------------------------------------------------------
customerRoutes.put('/:id', async (c) => {
  const customerId = c.req.param('id');
  const body = await c.req.json();
  const correlationId = (body.correlation_id as string) || generateId();

  try {
    const customer = await getActorById(c.env.DB, customerId);
    if (!customer || customer.type !== ActorType.CUSTOMER) {
      return c.json({ error: 'Customer not found', correlation_id: correlationId }, 404);
    }

    const updates: Record<string, string | undefined> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.first_name !== undefined) updates.first_name = body.first_name;
    if (body.middle_name !== undefined) updates.middle_name = body.middle_name;
    if (body.last_name !== undefined) updates.last_name = body.last_name;
    if (body.display_name !== undefined) updates.display_name = body.display_name;
    if (body.email !== undefined) updates.email = body.email;

    if (Object.keys(updates).length === 0) {
      return c.json({ error: 'No fields to update', correlation_id: correlationId }, 400);
    }

    const now = nowISO();
    const beforeSnapshot = JSON.stringify({
      name: customer.name, first_name: customer.first_name, middle_name: customer.middle_name,
      last_name: customer.last_name, display_name: customer.display_name, email: customer.email,
    });

    await updateActorProfile(c.env.DB, customerId, updates);

    const afterSnapshot = JSON.stringify({ ...JSON.parse(beforeSnapshot), ...updates });

    // Audit log
    await insertAuditLog(c.env.DB, {
      id: generateId(),
      action: 'CUSTOMER_PROFILE_UPDATED',
      actor_type: ActorType.CUSTOMER,
      actor_id: customerId,
      target_type: 'actor',
      target_id: customerId,
      before_json: beforeSnapshot,
      after_json: afterSnapshot,
      correlation_id: correlationId,
      created_at: now,
    });

    // Emit event
    await insertEvent(c.env.DB, {
      id: generateId(),
      name: EventName.CUSTOMER_PROFILE_UPDATED,
      entity_type: 'actor',
      entity_id: customerId,
      correlation_id: correlationId,
      actor_type: ActorType.CUSTOMER,
      actor_id: customerId,
      schema_version: 1,
      payload_json: afterSnapshot,
      created_at: now,
    });

    const updated = await getActorById(c.env.DB, customerId);
    return c.json({
      customer: {
        id: updated!.id,
        type: updated!.type,
        state: updated!.state,
        name: updated!.name,
        first_name: updated!.first_name,
        last_name: updated!.last_name,
        display_name: updated!.display_name,
        email: updated!.email,
        msisdn: updated!.msisdn,
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
// PII Masking Helpers
// ---------------------------------------------------------------------------

/** Mask MSISDN: show first 3 + last 4 digits, asterisks in between */
function maskMsisdn(msisdn: string): string {
  if (msisdn.length <= 7) return msisdn;
  return msisdn.slice(0, 3) + '****' + msisdn.slice(-4);
}
