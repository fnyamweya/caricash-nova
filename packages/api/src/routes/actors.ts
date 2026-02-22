/**
 * Actor lookup routes — lightweight recipient verification endpoints.
 * Returns only safe fields (id, type, state, name, first_name, last_name).
 * No sensitive data (msisdn, PIN, balances) is exposed.
 */
import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
    lookupActorByMsisdn,
    lookupActorByStoreCode,
    lookupActorByAgentCode,
    getActorById,
    updateActorProfile,
    getKycProfileByActorId,
    listKycRequirementsByActorType,
} from '@caricash/db';
import { generateId, nowISO, ActorState } from '@caricash/shared';

export const actorRoutes = new Hono<{ Bindings: Env }>();

// GET /actors/lookup?msisdn=X&type=CUSTOMER | ?store_code=X | ?agent_code=X
// Returns minimal actor data for recipient verification before payment.
// When looking up by msisdn, an optional `type` query param scopes to that actor type.
actorRoutes.get('/lookup', async (c) => {
    const msisdn = c.req.query('msisdn');
    const storeCode = c.req.query('store_code');
    const agentCode = c.req.query('agent_code');
    const actorType = c.req.query('type');

    if (!msisdn && !storeCode && !agentCode) {
        return c.json({ error: 'At least one query parameter is required: msisdn, store_code, or agent_code' }, 400);
    }

    try {
        let result = null;

        if (msisdn) {
            result = await lookupActorByMsisdn(c.env.DB, msisdn, actorType || undefined);
        } else if (storeCode) {
            result = await lookupActorByStoreCode(c.env.DB, storeCode);
        } else if (agentCode) {
            result = await lookupActorByAgentCode(c.env.DB, agentCode);
        }

        if (!result) {
            return c.json({ error: 'Actor not found' }, 404);
        }

        // Only return data for ACTIVE or PENDING actors
        if (result.state !== ActorState.ACTIVE && result.state !== ActorState.PENDING) {
            return c.json({ error: 'Actor not found' }, 404);
        }

        return c.json({ actor: result });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return c.json({ error: message }, 500);
    }
});

// GET /actors/:id — get actor by ID (returns minimal lookup data)
actorRoutes.get('/:id', async (c) => {
    const actorId = c.req.param('id');

    try {
        const actor = await getActorById(c.env.DB, actorId);
        if (!actor) {
            return c.json({ error: 'Actor not found' }, 404);
        }

        // Return safe subset
        return c.json({
            actor: {
                id: actor.id,
                type: actor.type,
                state: actor.state,
                name: actor.name,
                first_name: actor.first_name,
                middle_name: actor.middle_name,
                last_name: actor.last_name,
                display_name: actor.display_name,
            },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return c.json({ error: message }, 500);
    }
});

// PATCH /actors/:id/profile — update actor profile fields
actorRoutes.patch('/:id/profile', async (c) => {
    const actorId = c.req.param('id');
    const body = await c.req.json<{
        first_name?: string;
        middle_name?: string;
        last_name?: string;
        display_name?: string;
        email?: string;
        name?: string;
    }>();

    if (!body.first_name && !body.middle_name && !body.last_name && !body.display_name && !body.email && !body.name) {
        return c.json({ error: 'At least one field is required to update' }, 400);
    }

    try {
        const actor = await getActorById(c.env.DB, actorId);
        if (!actor) {
            return c.json({ error: 'Actor not found' }, 404);
        }

        await updateActorProfile(c.env.DB, actorId, body);

        return c.json({ success: true, actor_id: actorId });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return c.json({ error: message }, 500);
    }
});

// GET /actors/:id/kyc - actor-linked KYC profile + requirements (all actor types)
actorRoutes.get('/:id/kyc', async (c) => {
    const actorId = c.req.param('id');
    const correlationId = generateId();

    try {
        const actor = await getActorById(c.env.DB, actorId);
        if (!actor) {
            return c.json({ error: 'Actor not found', correlation_id: correlationId }, 404);
        }

        const profile = await getKycProfileByActorId(c.env.DB, actorId);
        const requirements = await listKycRequirementsByActorType(c.env.DB, actor.type);
        return c.json({ actor_id: actorId, actor_type: actor.type, profile, requirements, correlation_id: correlationId });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return c.json({ error: message, correlation_id: correlationId }, 500);
    }
});
