import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
  generateId,
  nowISO,
  EventName,
  ActorType,
} from '@caricash/shared';
import {
  getActorByMsisdn,
  getActorByAgentCode,
  getActorByStoreCode,
  getActorByStaffCode,
  getPinByActorId,
  updatePinFailedAttempts,
  getMerchantUserByActorAndMsisdn,
  updateMerchantUserFailedAttempts,
  insertSession,
  insertAuditLog,
  insertEvent,
} from '@caricash/db';
import type { Pin } from '@caricash/db';
import type { Actor } from '@caricash/shared';
import { verifyPin } from '../lib/pin.js';
import { checkRateLimit } from '../lib/rate-limit.js';
import { ensureSuperAdminSeeded } from '../lib/bootstrap-super-admin.js';

const MAX_LOGIN_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const MAX_FAILED_BEFORE_LOCK = 5;

export const authRoutes = new Hono<{ Bindings: Env }>();

// ---- Customer login ----
authRoutes.post('/customer/login', async (c) => {
  const body = await c.req.json<{ msisdn: string; pin: string }>();
  const { msisdn, pin } = body;
  if (!msisdn || !pin) {
    return c.json({ error: 'msisdn and pin are required' }, 400);
  }
  const actor = await getActorByMsisdn(c.env.DB, msisdn);
  return handleLogin(c, msisdn, pin, actor, ActorType.CUSTOMER);
});

// ---- Agent login ----
authRoutes.post('/agent/login', async (c) => {
  const body = await c.req.json<{ agent_code: string; pin: string }>();
  const { agent_code, pin } = body;
  if (!agent_code || !pin) {
    return c.json({ error: 'agent_code and pin are required' }, 400);
  }
  const actor = await getActorByAgentCode(c.env.DB, agent_code);
  return handleLogin(c, agent_code, pin, actor, ActorType.AGENT);
});

// ---- Merchant login (store_code + msisdn + pin) ----
authRoutes.post('/merchant/login', async (c) => {
  const body = await c.req.json<{ store_code: string; msisdn: string; pin: string }>();
  const { store_code, msisdn, pin } = body;
  if (!store_code || !msisdn || !pin) {
    return c.json({ error: 'store_code, msisdn and pin are required' }, 400);
  }
  return handleMerchantLogin(c, store_code, msisdn, pin);
});

// ---- Staff login (stub) ----
authRoutes.post('/staff/login', async (c) => {
  const body = await c.req.json<{ staff_code: string; pin: string }>();
  const { staff_code, pin } = body;
  if (!staff_code || !pin) {
    return c.json({ error: 'staff_code and pin are required' }, 400);
  }

  await ensureSuperAdminSeeded(c.env);

  const actor = await getActorByStaffCode(c.env.DB, staff_code);
  return handleLogin(c, staff_code, pin, actor, ActorType.STAFF);
});

// ---------- Shared login handler ----------

async function handleLogin(
  c: { env: Env; json: (data: unknown, status?: number) => Response },
  identifier: string,
  pin: string,
  actor: Actor | null,
  actorType: typeof ActorType[keyof typeof ActorType],
): Promise<Response> {
  const correlationId = generateId();

  // Rate limit check
  const rl = checkRateLimit(identifier, MAX_LOGIN_ATTEMPTS, RATE_LIMIT_WINDOW_MS);
  if (!rl.allowed) {
    return c.json({ error: 'Rate limit exceeded', correlation_id: correlationId }, 429);
  }

  // Emit login attempted event
  await emitEvent(c.env, EventName.AUTH_LOGIN_ATTEMPTED, actorType, actor?.id ?? 'unknown', correlationId, {
    identifier,
  });

  if (!actor) {
    return c.json({ error: 'Invalid credentials', correlation_id: correlationId }, 401);
  }

  const pinRecord = await getPinByActorId(c.env.DB, actor.id);
  if (!pinRecord) {
    return c.json({ error: 'Invalid credentials', correlation_id: correlationId }, 401);
  }

  // Check lockout
  if (pinRecord.locked_until) {
    const lockedUntil = new Date(pinRecord.locked_until).getTime();
    if (lockedUntil > Date.now()) {
      return c.json({ error: 'Account is locked', correlation_id: correlationId }, 423);
    }
  }

  // Verify PIN
  const valid = await verifyPin(pin, pinRecord.salt, c.env.PIN_PEPPER, pinRecord.pin_hash);

  if (!valid) {
    const newAttempts = pinRecord.failed_attempts + 1;
    let lockedUntil: string | undefined;

    if (newAttempts >= MAX_FAILED_BEFORE_LOCK) {
      lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
      await emitEvent(c.env, EventName.AUTH_ACCOUNT_LOCKED, actorType, actor.id, correlationId, {
        identifier,
        locked_until: lockedUntil,
      });
    }

    await updatePinFailedAttempts(c.env.DB, pinRecord.id, newAttempts, lockedUntil);

    await insertAuditLog(c.env.DB, {
      id: generateId(),
      action: 'LOGIN_FAILED',
      actor_type: actorType,
      actor_id: actor.id,
      target_type: 'actor',
      target_id: actor.id,
      correlation_id: correlationId,
      created_at: nowISO(),
    });

    await emitEvent(c.env, EventName.AUTH_LOGIN_FAILED, actorType, actor.id, correlationId, {
      identifier,
      failed_attempts: newAttempts,
    });

    return c.json({ error: 'Invalid credentials', correlation_id: correlationId }, 401);
  }

  // Success — reset failed attempts
  await updatePinFailedAttempts(c.env.DB, pinRecord.id, 0);

  // Create session
  const sessionId = generateId();
  const token = generateId(); // placeholder token
  const now = nowISO();

  await insertSession(c.env.DB, {
    id: sessionId,
    actor_id: actor.id,
    token_hash: token,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    created_at: now,
  });

  await insertAuditLog(c.env.DB, {
    id: generateId(),
    action: 'LOGIN_SUCCESS',
    actor_type: actorType,
    actor_id: actor.id,
    target_type: 'actor',
    target_id: actor.id,
    correlation_id: correlationId,
    created_at: now,
  });

  await emitEvent(c.env, EventName.AUTH_LOGIN_SUCCEEDED, actorType, actor.id, correlationId, {
    identifier,
    session_id: sessionId,
  });

  return c.json({
    token,
    actor_id: actor.id,
    actor_type: actorType,
    session_id: sessionId,
    correlation_id: correlationId,
  });
}

// ---------- Merchant-user login (store_code + msisdn + pin) ----------

async function handleMerchantLogin(
  c: { env: Env; json: (data: unknown, status?: number) => Response },
  storeCode: string,
  msisdn: string,
  pin: string,
): Promise<Response> {
  const correlationId = generateId();
  const identifier = `${storeCode}:${msisdn}`;

  // Rate limit by composite identifier
  const rl = checkRateLimit(identifier, MAX_LOGIN_ATTEMPTS, RATE_LIMIT_WINDOW_MS);
  if (!rl.allowed) {
    return c.json({ error: 'Rate limit exceeded', correlation_id: correlationId }, 429);
  }

  await emitEvent(c.env, EventName.AUTH_LOGIN_ATTEMPTED, ActorType.MERCHANT, 'unknown', correlationId, {
    store_code: storeCode,
    msisdn,
  });

  // 1. Resolve the merchant actor by store_code
  const actor = await getActorByStoreCode(c.env.DB, storeCode);
  if (!actor) {
    return c.json({ error: 'Invalid credentials', correlation_id: correlationId }, 401);
  }

  // 2. Resolve the merchant user within that store by msisdn
  const merchantUser = await getMerchantUserByActorAndMsisdn(c.env.DB, actor.id, msisdn);
  if (!merchantUser || !merchantUser.pin_hash || !merchantUser.salt) {
    return c.json({ error: 'Invalid credentials', correlation_id: correlationId }, 401);
  }

  // 3. Check lockout on the merchant user
  if (merchantUser.locked_until) {
    const lockedUntil = new Date(merchantUser.locked_until).getTime();
    if (lockedUntil > Date.now()) {
      return c.json({ error: 'Account is locked', correlation_id: correlationId }, 423);
    }
  }

  // 4. Verify PIN against the merchant_user record
  const valid = await verifyPin(pin, merchantUser.salt, c.env.PIN_PEPPER, merchantUser.pin_hash);

  if (!valid) {
    const newAttempts = merchantUser.failed_attempts + 1;
    let lockedUntil: string | undefined;

    if (newAttempts >= MAX_FAILED_BEFORE_LOCK) {
      lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
      await emitEvent(c.env, EventName.MERCHANT_USER_ACCOUNT_LOCKED, ActorType.MERCHANT, actor.id, correlationId, {
        store_code: storeCode,
        msisdn,
        merchant_user_id: merchantUser.id,
        locked_until: lockedUntil,
      });
    }

    await updateMerchantUserFailedAttempts(c.env.DB, merchantUser.id, newAttempts, lockedUntil);

    await insertAuditLog(c.env.DB, {
      id: generateId(),
      action: 'LOGIN_FAILED',
      actor_type: ActorType.MERCHANT,
      actor_id: actor.id,
      target_type: 'merchant_user',
      target_id: merchantUser.id,
      correlation_id: correlationId,
      created_at: nowISO(),
    });

    await emitEvent(c.env, EventName.MERCHANT_USER_LOGIN_FAILED, ActorType.MERCHANT, actor.id, correlationId, {
      store_code: storeCode,
      msisdn,
      merchant_user_id: merchantUser.id,
      failed_attempts: newAttempts,
    });

    return c.json({ error: 'Invalid credentials', correlation_id: correlationId }, 401);
  }

  // 5. Success — reset failed attempts on the merchant user
  await updateMerchantUserFailedAttempts(c.env.DB, merchantUser.id, 0);

  // 6. Create session (scoped to the merchant actor)
  const sessionId = generateId();
  const token = generateId();
  const now = nowISO();

  await insertSession(c.env.DB, {
    id: sessionId,
    actor_id: actor.id,
    token_hash: token,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    created_at: now,
  });

  await insertAuditLog(c.env.DB, {
    id: generateId(),
    action: 'LOGIN_SUCCESS',
    actor_type: ActorType.MERCHANT,
    actor_id: actor.id,
    target_type: 'merchant_user',
    target_id: merchantUser.id,
    correlation_id: correlationId,
    created_at: now,
  });

  await emitEvent(c.env, EventName.MERCHANT_USER_LOGIN_SUCCEEDED, ActorType.MERCHANT, actor.id, correlationId, {
    store_code: storeCode,
    msisdn,
    merchant_user_id: merchantUser.id,
    role: merchantUser.role,
    session_id: sessionId,
  });

  return c.json({
    token,
    actor_id: actor.id,
    actor_type: ActorType.MERCHANT,
    merchant_user_id: merchantUser.id,
    merchant_user_role: merchantUser.role,
    merchant_user_name: merchantUser.name,
    session_id: sessionId,
    correlation_id: correlationId,
  });
}

async function emitEvent(
  env: Env,
  eventName: EventName,
  actorType: ActorType,
  actorId: string,
  correlationId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const event = {
    id: generateId(),
    name: eventName,
    entity_type: 'actor',
    entity_id: actorId,
    correlation_id: correlationId,
    actor_type: actorType,
    actor_id: actorId,
    schema_version: 1,
    payload_json: JSON.stringify(payload),
    created_at: nowISO(),
  };
  await insertEvent(env.DB, event);
  await env.EVENTS_QUEUE.send(event);
}
