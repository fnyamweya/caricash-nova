import type { Env } from '../index.js';
import {
    ActorType,
    ActorState,
    KycState,
    StaffRole,
    EventName,
    generateId,
    nowISO,
} from '@caricash/shared';
import {
    getActorByStaffCode,
    insertActor,
    getPinByActorId,
    insertPin,
    insertEvent,
    insertAuditLog,
} from '@caricash/db';
import { generateSalt, hashPin } from './pin.js';

const SUPER_ADMIN_STAFF_CODE = 'SUPERADMIN001';
const SUPER_ADMIN_DEFAULT_PIN = '2468';

export async function ensureSuperAdminSeeded(env: Env): Promise<void> {
    const now = nowISO();
    let actor = await getActorByStaffCode(env.DB, SUPER_ADMIN_STAFF_CODE);

    if (!actor) {
        const actorId = 'staff_super_admin_seed';
        await insertActor(env.DB, {
            id: actorId,
            type: ActorType.STAFF,
            state: ActorState.ACTIVE,
            name: 'CariCash Super Admin',
            first_name: 'Super',
            last_name: 'Admin',
            display_name: 'Super Admin',
            staff_code: SUPER_ADMIN_STAFF_CODE,
            staff_role: StaffRole.SUPER_ADMIN,
            kyc_state: KycState.APPROVED,
            created_at: now,
            updated_at: now,
        });

        actor = await getActorByStaffCode(env.DB, SUPER_ADMIN_STAFF_CODE);
        if (!actor) return;

        const event = {
            id: generateId(),
            name: EventName.STAFF_CREATED,
            entity_type: 'actor',
            entity_id: actor.id,
            correlation_id: generateId(),
            actor_type: ActorType.STAFF,
            actor_id: actor.id,
            schema_version: 1,
            payload_json: JSON.stringify({ staff_code: SUPER_ADMIN_STAFF_CODE, staff_role: StaffRole.SUPER_ADMIN }),
            created_at: now,
        };
        await insertEvent(env.DB, event);
    }

    const pinRecord = await getPinByActorId(env.DB, actor.id);
    if (pinRecord) {
        return;
    }

    const salt = generateSalt();
    const pinHash = await hashPin(SUPER_ADMIN_DEFAULT_PIN, salt, env.PIN_PEPPER);
    await insertPin(env.DB, {
        id: generateId(),
        actor_id: actor.id,
        pin_hash: pinHash,
        salt,
        failed_attempts: 0,
        created_at: now,
        updated_at: now,
    });

    await insertAuditLog(env.DB, {
        id: generateId(),
        action: 'SUPER_ADMIN_PIN_SEEDED',
        actor_type: ActorType.STAFF,
        actor_id: actor.id,
        target_type: 'actor',
        target_id: actor.id,
        correlation_id: generateId(),
        created_at: now,
    });
}
