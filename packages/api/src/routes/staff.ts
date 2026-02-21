import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
    generateId,
    nowISO,
    createStaffSchema,
    updateStaffSchema,
    staffActionSchema,
    ActorType,
    ActorState,
    KycState,
    EventName,
    StaffRole,
} from '@caricash/shared';
import type { Actor } from '@caricash/shared';
import {
    getActorById,
    getActorByStaffCode,
    insertActor,
    insertPin,
    getPinByActorId,
    updatePinFailedAttempts,
    listStaffActors,
    getStaffActorById,
    updateStaffActor,
    ensureKycProfile,
    upsertKycProfile,
    getKycProfileByActorId,
    listKycRequirementsByActorType,
    insertAuditLog,
    insertEvent,
} from '@caricash/db';
import { hashPin, generateSalt } from '../lib/pin.js';

export const staffRoutes = new Hono<{ Bindings: Env }>();

function canManageStaff(role?: string): boolean {
    return role === StaffRole.SUPER_ADMIN || role === StaffRole.ADMIN;
}

async function requireStaffActor(c: { env: Env; req: { header: (name: string) => string | undefined }; json: (data: unknown, status?: number) => Response }) {
    const requestStaffId = c.req.header('X-Staff-Id');
    if (!requestStaffId) {
        return c.json({ error: 'Staff authentication required', code: 'UNAUTHORIZED' }, 401);
    }
    const actor = await getActorById(c.env.DB, requestStaffId);
    if (!actor || actor.type !== ActorType.STAFF) {
        return c.json({ error: 'Staff actor not found', code: 'UNAUTHORIZED' }, 401);
    }
    return actor;
}

// GET /staff
staffRoutes.get('/', async (c) => {
    const authActor = await requireStaffActor(c);
    if (authActor instanceof Response) return authActor;

    const state = c.req.query('state');
    const staffRole = c.req.query('staff_role');

    try {
        const items = await listStaffActors(c.env.DB, {
            state: state || undefined,
            staff_role: staffRole || undefined,
        });
        return c.json({ items, count: items.length });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return c.json({ error: message }, 500);
    }
});

// POST /staff
staffRoutes.post('/', async (c) => {
    const authActor = await requireStaffActor(c);
    if (authActor instanceof Response) return authActor;
    if (!canManageStaff(authActor.staff_role)) {
        return c.json({ error: 'Insufficient privileges to create staff', code: 'FORBIDDEN' }, 403);
    }

    const body = await c.req.json();
    const parsed = createStaffSchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
    }

    const { staff_code, name, email, msisdn, staff_role, pin } = parsed.data;
    if (authActor.staff_role !== StaffRole.SUPER_ADMIN && staff_role === StaffRole.SUPER_ADMIN) {
        return c.json({ error: 'Only SUPER_ADMIN can create SUPER_ADMIN staff', code: 'FORBIDDEN' }, 403);
    }

    const correlationId = (body.correlation_id as string) || generateId();

    try {
        const existing = await getActorByStaffCode(c.env.DB, staff_code);
        if (existing) {
            return c.json({ error: 'Staff with this code already exists', correlation_id: correlationId }, 409);
        }

        const now = nowISO();
        const actorId = generateId();

        const actor: Actor = {
            id: actorId,
            type: ActorType.STAFF,
            state: ActorState.ACTIVE,
            name,
            email,
            msisdn,
            staff_code,
            staff_role,
            kyc_state: KycState.NOT_STARTED,
            created_at: now,
            updated_at: now,
        };

        await insertActor(c.env.DB, actor);

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

        await ensureKycProfile(c.env.DB, {
            id: `kyc_${actorId}`,
            actor_id: actorId,
            actor_type: ActorType.STAFF,
            status: KycState.NOT_STARTED,
            created_at: now,
            updated_at: now,
        });

        await insertAuditLog(c.env.DB, {
            id: generateId(),
            action: 'STAFF_CREATED',
            actor_type: ActorType.STAFF,
            actor_id: authActor.id,
            target_type: 'actor',
            target_id: actorId,
            correlation_id: correlationId,
            created_at: now,
        });

        const event = {
            id: generateId(),
            name: EventName.STAFF_CREATED,
            entity_type: 'actor',
            entity_id: actorId,
            correlation_id: correlationId,
            actor_type: ActorType.STAFF,
            actor_id: authActor.id,
            schema_version: 1,
            payload_json: JSON.stringify({
                staff_code,
                name,
                email,
                msisdn,
                staff_role,
            }),
            created_at: now,
        };
        await insertEvent(c.env.DB, event);
        await c.env.EVENTS_QUEUE.send(event);

        return c.json({ actor, correlation_id: correlationId }, 201);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return c.json({ error: message, correlation_id: correlationId }, 500);
    }
});

// GET /staff/:id
staffRoutes.get('/:id', async (c) => {
    const authActor = await requireStaffActor(c);
    if (authActor instanceof Response) return authActor;

    const staffId = c.req.param('id');
    try {
        const actor = await getStaffActorById(c.env.DB, staffId);
        if (!actor) return c.json({ error: 'Staff not found' }, 404);
        return c.json({ actor });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return c.json({ error: message }, 500);
    }
});

// PATCH /staff/:id
staffRoutes.patch('/:id', async (c) => {
    const authActor = await requireStaffActor(c);
    if (authActor instanceof Response) return authActor;
    if (!canManageStaff(authActor.staff_role)) {
        return c.json({ error: 'Insufficient privileges to update staff', code: 'FORBIDDEN' }, 403);
    }

    const staffId = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateStaffSchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
    }

    if (Object.keys(parsed.data).length === 0) {
        return c.json({ error: 'At least one field is required' }, 400);
    }

    const correlationId = (body.correlation_id as string) || generateId();

    try {
        const existing = await getStaffActorById(c.env.DB, staffId);
        if (!existing) return c.json({ error: 'Staff not found', correlation_id: correlationId }, 404);

        if (authActor.staff_role !== StaffRole.SUPER_ADMIN && parsed.data.staff_role === StaffRole.SUPER_ADMIN) {
            return c.json({ error: 'Only SUPER_ADMIN can assign SUPER_ADMIN role', code: 'FORBIDDEN', correlation_id: correlationId }, 403);
        }

        await updateStaffActor(c.env.DB, staffId, parsed.data);

        const now = nowISO();
        await insertAuditLog(c.env.DB, {
            id: generateId(),
            action: 'STAFF_UPDATED',
            actor_type: ActorType.STAFF,
            actor_id: authActor.id,
            target_type: 'actor',
            target_id: staffId,
            before_json: JSON.stringify({
                name: existing.name,
                email: existing.email,
                staff_role: existing.staff_role,
                state: existing.state,
            }),
            after_json: JSON.stringify(parsed.data),
            correlation_id: correlationId,
            created_at: now,
        });

        const updated = await getStaffActorById(c.env.DB, staffId);
        return c.json({ actor: updated, correlation_id: correlationId });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return c.json({ error: message, correlation_id: correlationId }, 500);
    }
});

// DELETE /staff/:id (soft delete -> CLOSED)
staffRoutes.delete('/:id', async (c) => {
    const authActor = await requireStaffActor(c);
    if (authActor instanceof Response) return authActor;
    if (!canManageStaff(authActor.staff_role)) {
        return c.json({ error: 'Insufficient privileges to close staff', code: 'FORBIDDEN' }, 403);
    }

    const staffId = c.req.param('id');
    const correlationId = generateId();

    try {
        const existing = await getStaffActorById(c.env.DB, staffId);
        if (!existing) return c.json({ error: 'Staff not found', correlation_id: correlationId }, 404);

        if (existing.staff_role === StaffRole.SUPER_ADMIN && authActor.staff_role !== StaffRole.SUPER_ADMIN) {
            return c.json({ error: 'Only SUPER_ADMIN can close SUPER_ADMIN staff', code: 'FORBIDDEN', correlation_id: correlationId }, 403);
        }

        await updateStaffActor(c.env.DB, staffId, { state: ActorState.CLOSED });
        return c.json({ success: true, actor_id: staffId, state: ActorState.CLOSED, correlation_id: correlationId });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return c.json({ error: message, correlation_id: correlationId }, 500);
    }
});

// POST /staff/:id/actions
staffRoutes.post('/:id/actions', async (c) => {
    const authActor = await requireStaffActor(c);
    if (authActor instanceof Response) return authActor;
    if (!canManageStaff(authActor.staff_role)) {
        return c.json({ error: 'Insufficient privileges for staff actions', code: 'FORBIDDEN' }, 403);
    }

    const staffId = c.req.param('id');
    const body = await c.req.json();
    const parsed = staffActionSchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
    }

    const correlationId = (body.correlation_id as string) || generateId();

    try {
        const target = await getStaffActorById(c.env.DB, staffId);
        if (!target) {
            return c.json({ error: 'Staff not found', correlation_id: correlationId }, 404);
        }

        if (target.staff_role === StaffRole.SUPER_ADMIN && authActor.staff_role !== StaffRole.SUPER_ADMIN) {
            return c.json({ error: 'Only SUPER_ADMIN can action SUPER_ADMIN staff', code: 'FORBIDDEN', correlation_id: correlationId }, 403);
        }

        let result: Record<string, unknown> = {};
        if (parsed.data.action === 'ACTIVATE') {
            await updateStaffActor(c.env.DB, staffId, { state: ActorState.ACTIVE });
            result = { state: ActorState.ACTIVE };
        } else if (parsed.data.action === 'SUSPEND') {
            await updateStaffActor(c.env.DB, staffId, { state: ActorState.SUSPENDED });
            result = { state: ActorState.SUSPENDED };
        } else if (parsed.data.action === 'CLOSE') {
            await updateStaffActor(c.env.DB, staffId, { state: ActorState.CLOSED });
            result = { state: ActorState.CLOSED };
        } else if (parsed.data.action === 'UNLOCK') {
            const pinRecord = await getPinByActorId(c.env.DB, staffId);
            if (!pinRecord) {
                return c.json({ error: 'PIN record not found for staff', correlation_id: correlationId }, 404);
            }
            await updatePinFailedAttempts(c.env.DB, pinRecord.id, 0);
            result = { unlocked: true };
        }

        const now = nowISO();
        await insertAuditLog(c.env.DB, {
            id: generateId(),
            action: `STAFF_ACTION_${parsed.data.action}`,
            actor_type: ActorType.STAFF,
            actor_id: authActor.id,
            target_type: 'actor',
            target_id: staffId,
            after_json: JSON.stringify({ action: parsed.data.action, reason: parsed.data.reason ?? null, ...result }),
            correlation_id: correlationId,
            created_at: now,
        });

        const updated = await getStaffActorById(c.env.DB, staffId);
        return c.json({
            success: true,
            action: parsed.data.action,
            actor: updated,
            ...result,
            correlation_id: correlationId,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return c.json({ error: message, correlation_id: correlationId }, 500);
    }
});

// POST /staff/:id/kyc/initiate
staffRoutes.post('/:id/kyc/initiate', async (c) => {
    const authActor = await requireStaffActor(c);
    if (authActor instanceof Response) return authActor;

    const staffId = c.req.param('id');
    const body = await c.req.json();
    const correlationId = (body.correlation_id as string) || generateId();

    const { document_type, document_number } = body as { document_type?: string; document_number?: string };
    if (!document_type || !document_number) {
        return c.json({ error: 'document_type and document_number are required', correlation_id: correlationId }, 400);
    }

    try {
        const target = await getStaffActorById(c.env.DB, staffId);
        if (!target) {
            return c.json({ error: 'Staff not found', correlation_id: correlationId }, 404);
        }

        const now = nowISO();
        await c.env.DB
            .prepare("UPDATE actors SET kyc_state = 'PENDING', updated_at = ?1 WHERE id = ?2 AND type = 'STAFF'")
            .bind(now, staffId)
            .run();

        await upsertKycProfile(c.env.DB, {
            id: `kyc_${staffId}`,
            actor_id: staffId,
            actor_type: ActorType.STAFF,
            status: KycState.PENDING,
            submitted_at: now,
            documents_json: JSON.stringify({ document_type, document_number }),
            metadata_json: JSON.stringify({ source: 'staff/:id/kyc/initiate' }),
            created_at: now,
            updated_at: now,
        });

        return c.json({ actor_id: staffId, actor_type: ActorType.STAFF, kyc_state: KycState.PENDING, correlation_id: correlationId });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return c.json({ error: message, correlation_id: correlationId }, 500);
    }
});

// GET /staff/:id/kyc
staffRoutes.get('/:id/kyc', async (c) => {
    const authActor = await requireStaffActor(c);
    if (authActor instanceof Response) return authActor;

    const staffId = c.req.param('id');
    const correlationId = generateId();

    try {
        const target = await getStaffActorById(c.env.DB, staffId);
        if (!target) {
            return c.json({ error: 'Staff not found', correlation_id: correlationId }, 404);
        }

        const profile = await getKycProfileByActorId(c.env.DB, staffId);
        const requirements = await listKycRequirementsByActorType(c.env.DB, ActorType.STAFF);
        return c.json({ actor_id: staffId, actor_type: ActorType.STAFF, profile, requirements, correlation_id: correlationId });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return c.json({ error: message, correlation_id: correlationId }, 500);
    }
});
