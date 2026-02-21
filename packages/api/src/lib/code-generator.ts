import {
    expireCodeReservations,
    getActiveCodeReservation,
    getActorByAgentCode,
    getActorByStoreCode,
    reserveCode,
} from '@caricash/db';
import { generateId } from '@caricash/shared';

type D1Database = any;
type CodeType = 'AGENT' | 'STORE';

function generateSixDigitCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function addMinutes(iso: string, minutes: number): string {
    const dt = new Date(iso);
    dt.setMinutes(dt.getMinutes() + minutes);
    return dt.toISOString();
}

async function isCodeAlreadyUsed(db: D1Database, codeType: CodeType, code: string): Promise<boolean> {
    if (codeType === 'AGENT') {
        return Boolean(await getActorByAgentCode(db, code));
    }
    return Boolean(await getActorByStoreCode(db, code));
}

async function isCodeActivelyReserved(db: D1Database, codeType: CodeType, code: string, nowIso: string): Promise<boolean> {
    return Boolean(await getActiveCodeReservation(db, codeType, code, nowIso));
}

export async function generateUniqueAgentCode(db: D1Database, maxAttempts = 25): Promise<string> {
    const nowIso = new Date().toISOString();
    await expireCodeReservations(db, nowIso);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const code = generateSixDigitCode();
        const used = await isCodeAlreadyUsed(db, 'AGENT', code);
        if (used) continue;
        const reserved = await isCodeActivelyReserved(db, 'AGENT', code, nowIso);
        if (!reserved) return code;
    }
    throw new Error('Unable to generate unique 6-digit agent code');
}

export async function generateUniqueStoreCode(db: D1Database, maxAttempts = 25): Promise<string> {
    const nowIso = new Date().toISOString();
    await expireCodeReservations(db, nowIso);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const code = generateSixDigitCode();
        const used = await isCodeAlreadyUsed(db, 'STORE', code);
        if (used) continue;
        const reserved = await isCodeActivelyReserved(db, 'STORE', code, nowIso);
        if (!reserved) return code;
    }
    throw new Error('Unable to generate unique 6-digit store code');
}

export async function reserveAvailableCodes(
    db: D1Database,
    {
        codeType,
        count,
        ttlMinutes = 30,
        reservedByActorId,
        maxAttempts,
    }: {
        codeType: CodeType;
        count: number;
        ttlMinutes?: number;
        reservedByActorId?: string;
        maxAttempts?: number;
    },
): Promise<string[]> {
    const nowIso = new Date().toISOString();
    await expireCodeReservations(db, nowIso);

    const codes: string[] = [];
    const attempts = maxAttempts ?? Math.max(50, count * 25);
    const expiresAt = addMinutes(nowIso, ttlMinutes);

    for (let attempt = 0; attempt < attempts && codes.length < count; attempt++) {
        const code = generateSixDigitCode();
        if (codes.includes(code)) continue;

        const used = await isCodeAlreadyUsed(db, codeType, code);
        if (used) continue;

        const reserved = await isCodeActivelyReserved(db, codeType, code, nowIso);
        if (reserved) continue;

        try {
            await reserveCode(db, {
                id: generateId(),
                code_type: codeType,
                code_value: code,
                reserved_by_actor_id: reservedByActorId,
                status: 'RESERVED',
                expires_at: expiresAt,
                created_at: nowIso,
                updated_at: nowIso,
            });
            codes.push(code);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!message.includes('UNIQUE constraint failed')) {
                throw error;
            }
        }
    }

    if (codes.length < count) {
        throw new Error(`Unable to reserve ${count} unique ${codeType.toLowerCase()} codes`);
    }

    return codes;
}
