/**
 * Merchant user management routes.
 * Allows merchants (store_owner) to add/manage users for their store.
 */
import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
    generateId,
    nowISO,
    createMerchantUserSchema,
    updateMerchantUserSchema,
    MerchantUserRole,
    MerchantUserState,
    EventName,
    ActorType,
} from '@caricash/shared';
import type { MerchantUser } from '@caricash/shared';
import {
    getActorByStoreCode,
    insertMerchantUser,
    getMerchantUsers,
    getMerchantUserById,
    updateMerchantUser,
    insertEvent,
} from '@caricash/db';
import { hashPin, generateSalt } from '../lib/pin.js';

export const merchantUserRoutes = new Hono<{ Bindings: Env }>();

// GET /merchants/:storeCode/users — list all users for a merchant
merchantUserRoutes.get('/:storeCode/users', async (c) => {
    const storeCode = c.req.param('storeCode');

    try {
        const merchant = await getActorByStoreCode(c.env.DB, storeCode);
        if (!merchant) {
            return c.json({ error: 'Merchant not found' }, 404);
        }

        const users = await getMerchantUsers(c.env.DB, merchant.id);
        return c.json({ users });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return c.json({ error: message }, 500);
    }
});

// POST /merchants/:storeCode/users — create a new merchant user
merchantUserRoutes.post('/:storeCode/users', async (c) => {
    const storeCode = c.req.param('storeCode');
    const body = await c.req.json();
    const parsed = createMerchantUserSchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
    }

    const { msisdn, name, role, pin } = parsed.data;
    const correlationId = (body.correlation_id as string) || generateId();

    try {
        const merchant = await getActorByStoreCode(c.env.DB, storeCode);
        if (!merchant) {
            return c.json({ error: 'Merchant not found', correlation_id: correlationId }, 404);
        }

        // Check that we don't already have a store_owner if trying to create one
        if (role === MerchantUserRole.STORE_OWNER) {
            const existingUsers = await getMerchantUsers(c.env.DB, merchant.id);
            const hasOwner = existingUsers.some((u) => u.role === MerchantUserRole.STORE_OWNER);
            if (hasOwner) {
                return c.json({ error: 'Merchant already has a store owner', correlation_id: correlationId }, 409);
            }
        }

        // Check for duplicate msisdn within this store
        const { getMerchantUserByActorAndMsisdn } = await import('@caricash/db');
        const existingByMsisdn = await getMerchantUserByActorAndMsisdn(c.env.DB, merchant.id, msisdn);
        if (existingByMsisdn) {
            return c.json({ error: 'A user with this phone number already exists for this store', correlation_id: correlationId }, 409);
        }

        const now = nowISO();
        const userId = generateId();

        // Hash PIN
        const salt = generateSalt();
        const pinHash = await hashPin(pin, salt, c.env.PIN_PEPPER);

        const user: MerchantUser & { pin_hash: string; salt: string } = {
            id: userId,
            actor_id: merchant.id,
            msisdn,
            name,
            role: role as MerchantUser['role'],
            state: MerchantUserState.ACTIVE,
            pin_hash: pinHash,
            salt,
            created_at: now,
            updated_at: now,
        };

        await insertMerchantUser(c.env.DB, user);

        // Emit event
        const event = {
            id: generateId(),
            name: EventName.MERCHANT_USER_CREATED,
            entity_type: 'merchant_user',
            entity_id: userId,
            correlation_id: correlationId,
            actor_type: ActorType.MERCHANT,
            actor_id: merchant.id,
            schema_version: 1,
            payload_json: JSON.stringify({ msisdn, name, role, store_code: storeCode }),
            created_at: now,
        };
        await insertEvent(c.env.DB, event);

        // Return user without sensitive fields
        const { pin_hash: _ph, salt: _s, ...safeUser } = user;
        return c.json({ user: safeUser, correlation_id: correlationId }, 201);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return c.json({ error: message, correlation_id: correlationId }, 500);
    }
});

// PATCH /merchants/:storeCode/users/:userId — update a merchant user
merchantUserRoutes.patch('/:storeCode/users/:userId', async (c) => {
    const storeCode = c.req.param('storeCode');
    const userId = c.req.param('userId');
    const body = await c.req.json();
    const parsed = updateMerchantUserSchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
    }

    const correlationId = (body.correlation_id as string) || generateId();

    try {
        const merchant = await getActorByStoreCode(c.env.DB, storeCode);
        if (!merchant) {
            return c.json({ error: 'Merchant not found', correlation_id: correlationId }, 404);
        }

        const existingUser = await getMerchantUserById(c.env.DB, userId);
        if (!existingUser || existingUser.actor_id !== merchant.id) {
            return c.json({ error: 'User not found', correlation_id: correlationId }, 404);
        }

        // Prevent removing the last store_owner
        if (parsed.data.role && parsed.data.role !== MerchantUserRole.STORE_OWNER && existingUser.role === MerchantUserRole.STORE_OWNER) {
            const allUsers = await getMerchantUsers(c.env.DB, merchant.id);
            const ownerCount = allUsers.filter((u) => u.role === MerchantUserRole.STORE_OWNER).length;
            if (ownerCount <= 1) {
                return c.json({ error: 'Cannot demote the last store owner', correlation_id: correlationId }, 409);
            }
        }

        await updateMerchantUser(c.env.DB, userId, parsed.data);

        const now = nowISO();
        const event = {
            id: generateId(),
            name: EventName.MERCHANT_USER_UPDATED,
            entity_type: 'merchant_user',
            entity_id: userId,
            correlation_id: correlationId,
            actor_type: ActorType.MERCHANT,
            actor_id: merchant.id,
            schema_version: 1,
            payload_json: JSON.stringify(parsed.data),
            created_at: now,
        };
        await insertEvent(c.env.DB, event);

        const updatedUser = await getMerchantUserById(c.env.DB, userId);
        return c.json({ user: updatedUser, correlation_id: correlationId });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return c.json({ error: message, correlation_id: correlationId }, 500);
    }
});

// DELETE /merchants/:storeCode/users/:userId — soft-delete (set state=REMOVED)
merchantUserRoutes.delete('/:storeCode/users/:userId', async (c) => {
    const storeCode = c.req.param('storeCode');
    const userId = c.req.param('userId');
    const correlationId = generateId();

    try {
        const merchant = await getActorByStoreCode(c.env.DB, storeCode);
        if (!merchant) {
            return c.json({ error: 'Merchant not found', correlation_id: correlationId }, 404);
        }

        const existingUser = await getMerchantUserById(c.env.DB, userId);
        if (!existingUser || existingUser.actor_id !== merchant.id) {
            return c.json({ error: 'User not found', correlation_id: correlationId }, 404);
        }

        // Prevent removing the last store_owner
        if (existingUser.role === MerchantUserRole.STORE_OWNER) {
            const allUsers = await getMerchantUsers(c.env.DB, merchant.id);
            const ownerCount = allUsers.filter((u) => u.role === MerchantUserRole.STORE_OWNER).length;
            if (ownerCount <= 1) {
                return c.json({ error: 'Cannot remove the last store owner', correlation_id: correlationId }, 409);
            }
        }

        await updateMerchantUser(c.env.DB, userId, { state: MerchantUserState.REMOVED });

        const now = nowISO();
        const event = {
            id: generateId(),
            name: EventName.MERCHANT_USER_REMOVED,
            entity_type: 'merchant_user',
            entity_id: userId,
            correlation_id: correlationId,
            actor_type: ActorType.MERCHANT,
            actor_id: merchant.id,
            schema_version: 1,
            payload_json: JSON.stringify({ removed_user_id: userId }),
            created_at: now,
        };
        await insertEvent(c.env.DB, event);

        return c.json({ success: true, correlation_id: correlationId });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return c.json({ error: message, correlation_id: correlationId }, 500);
    }
});
