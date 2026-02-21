import { Hono } from 'hono';
import type { Env } from '../index.js';
import { generateCodesSchema, generateId, ActorType } from '@caricash/shared';
import { getActorById } from '@caricash/db';
import { reserveAvailableCodes } from '../lib/code-generator.js';

export const codeRoutes = new Hono<{ Bindings: Env }>();

codeRoutes.post('/generate', async (c) => {
    const body = await c.req.json();
    const parsed = generateCodesSchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
    }

    const correlationId = (body.correlation_id as string) || generateId();
    const { code_type, count, merchant_id, ttl_minutes } = parsed.data;

    try {
        if (code_type === 'STORE') {
            if (!merchant_id) {
                return c.json({ error: 'merchant_id is required for STORE code generation', correlation_id: correlationId }, 400);
            }

            const merchant = await getActorById(c.env.DB, merchant_id);
            if (!merchant || merchant.type !== ActorType.MERCHANT) {
                return c.json({ error: 'Merchant not found', correlation_id: correlationId }, 404);
            }
        }

        const reservedCodes = await reserveAvailableCodes(c.env.DB, {
            codeType: code_type,
            count,
            ttlMinutes: ttl_minutes,
            reservedByActorId: code_type === 'STORE' ? merchant_id : undefined,
        });

        const expiresAt = new Date(Date.now() + ttl_minutes * 60_000).toISOString();
        return c.json({
            code_type,
            codes: reservedCodes,
            count: reservedCodes.length,
            reserved_for_merchant_id: code_type === 'STORE' ? merchant_id : undefined,
            expires_at: expiresAt,
            correlation_id: correlationId,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return c.json({ error: message, correlation_id: correlationId }, 500);
    }
});
