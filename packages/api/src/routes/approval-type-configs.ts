/**
 * Approval Type Config & Endpoint Binding CRUD routes
 *
 * These routes allow administrators to:
 *  - Define new approval types at runtime (no code changes needed)
 *  - Bind approval types to specific route/method combinations
 *  - Manage existing type configs and bindings
 *
 * All routes require SUPER_ADMIN or ADMIN staff authentication.
 */

import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
    generateId,
    nowISO,
    StaffRole,
    ActorType,
    EventName,
} from '@caricash/shared';
import type { EventName as EventNameType } from '@caricash/shared';
import {
    getActorById,
    getApprovalTypeConfig,
    listApprovalTypeConfigs,
    insertApprovalTypeConfig,
    updateApprovalTypeConfig,
    deleteApprovalTypeConfig,
    getEndpointBinding,
    listEndpointBindings,
    findEndpointBinding,
    insertEndpointBinding,
    updateEndpointBinding,
    deleteEndpointBinding,
    insertAuditLog,
    insertEvent,
} from '@caricash/db';
import { approvalRegistry } from '../lib/approval-handlers.js';

// ═══════════════════════════════════════════════════════════════════════
// TYPE CONFIG ROUTES  (mounted at /approvals/types/config)
// ═══════════════════════════════════════════════════════════════════════

export const typeConfigRoutes = new Hono<{ Bindings: Env }>();

// Helper: validate admin staff
async function requireAdmin(
    db: any,
    staffId: string,
): Promise<{ error?: string; status?: number }> {
    if (!staffId) return { error: 'staff_id is required', status: 400 };
    const actor = await getActorById(db, staffId);
    if (!actor || actor.type !== ActorType.STAFF) {
        return { error: 'Staff actor not found', status: 404 };
    }
    const role = actor.staff_role as string;
    if (role !== StaffRole.SUPER_ADMIN && role !== StaffRole.ADMIN) {
        return { error: 'Only SUPER_ADMIN or ADMIN can manage approval type configs', status: 403 };
    }
    return {};
}

// ── GET /approvals/types/config ──────────────────────────────────────
typeConfigRoutes.get('/', async (c) => {
    const enabledOnly = c.req.query('enabled_only') === 'true';
    try {
        const configs = await listApprovalTypeConfigs(c.env.DB, { enabled_only: enabledOnly });
        return c.json({
            items: configs.map((cfg) => ({
                ...cfg,
                default_checker_roles: safeParseJson(cfg.default_checker_roles_json),
                has_code_handler_bool: !!cfg.has_code_handler,
            })),
        });
    } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
    }
});

// ── GET /approvals/types/config/:typeKey ─────────────────────────────
typeConfigRoutes.get('/:typeKey', async (c) => {
    const typeKey = c.req.param('typeKey');
    try {
        const config = await getApprovalTypeConfig(c.env.DB, typeKey);
        if (!config) {
            return c.json({ error: 'Approval type config not found' }, 404);
        }
        return c.json({
            ...config,
            default_checker_roles: safeParseJson(config.default_checker_roles_json),
            has_code_handler_registered: approvalRegistry.has(typeKey),
        });
    } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
    }
});

// ── POST /approvals/types/config ─────────────────────────────────────
typeConfigRoutes.post('/', async (c) => {
    const body = await c.req.json();
    const {
        staff_id, type_key, label, description,
        default_checker_roles, require_reason, auto_policy_id,
    } = body;

    const auth = await requireAdmin(c.env.DB, staff_id);
    if (auth.error) return c.json({ error: auth.error }, auth.status as any);

    if (!type_key || !label) {
        return c.json({ error: 'type_key and label are required' }, 400);
    }

    // Validate type_key format: UPPER_SNAKE_CASE
    if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(type_key)) {
        return c.json({ error: 'type_key must be UPPER_SNAKE_CASE, 3–64 chars' }, 400);
    }

    // Check for duplicate
    const existing = await getApprovalTypeConfig(c.env.DB, type_key);
    if (existing) {
        return c.json({ error: `Type config '${type_key}' already exists` }, 409);
    }

    const now = nowISO();
    const rolesJson = Array.isArray(default_checker_roles)
        ? JSON.stringify(default_checker_roles)
        : null;

    try {
        await insertApprovalTypeConfig(c.env.DB, {
            type_key,
            label,
            description: description ?? undefined,
            default_checker_roles_json: rolesJson ?? undefined,
            require_reason: require_reason ? 1 : 0,
            has_code_handler: approvalRegistry.has(type_key) ? 1 : 0,
            auto_policy_id: auto_policy_id ?? undefined,
            enabled: 1,
            created_by: staff_id,
            created_at: now,
            updated_at: now,
        });

        await insertAuditLog(c.env.DB, {
            id: generateId(),
            action: 'APPROVAL_TYPE_CONFIG_CREATED',
            actor_type: ActorType.STAFF,
            actor_id: staff_id,
            target_type: 'approval_type_config',
            target_id: type_key,
            before_json: undefined,
            after_json: JSON.stringify({ type_key, label }),
            correlation_id: generateId(),
            created_at: now,
        });

        return c.json({
            type_key,
            label,
            description: description ?? null,
            default_checker_roles: default_checker_roles ?? [],
            require_reason: !!require_reason,
            has_code_handler: approvalRegistry.has(type_key),
            enabled: true,
            created_at: now,
        }, 201);
    } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
    }
});

// ── PATCH /approvals/types/config/:typeKey ───────────────────────────
typeConfigRoutes.patch('/:typeKey', async (c) => {
    const typeKey = c.req.param('typeKey');
    const body = await c.req.json();
    const { staff_id } = body;

    const auth = await requireAdmin(c.env.DB, staff_id);
    if (auth.error) return c.json({ error: auth.error }, auth.status as any);

    const existing = await getApprovalTypeConfig(c.env.DB, typeKey);
    if (!existing) {
        return c.json({ error: 'Approval type config not found' }, 404);
    }

    const updates: Record<string, unknown> = {};
    if (body.label !== undefined) updates.label = body.label;
    if (body.description !== undefined) updates.description = body.description;
    if (body.default_checker_roles !== undefined) {
        updates.default_checker_roles_json = Array.isArray(body.default_checker_roles)
            ? JSON.stringify(body.default_checker_roles)
            : null;
    }
    if (body.require_reason !== undefined) updates.require_reason = body.require_reason ? 1 : 0;
    if (body.auto_policy_id !== undefined) updates.auto_policy_id = body.auto_policy_id;
    if (body.enabled !== undefined) updates.enabled = body.enabled ? 1 : 0;

    if (Object.keys(updates).length === 0) {
        return c.json({ error: 'No fields to update' }, 400);
    }

    const now = nowISO();
    try {
        await updateApprovalTypeConfig(c.env.DB, typeKey, updates as any, now);

        await insertAuditLog(c.env.DB, {
            id: generateId(),
            action: 'APPROVAL_TYPE_CONFIG_UPDATED',
            actor_type: ActorType.STAFF,
            actor_id: staff_id,
            target_type: 'approval_type_config',
            target_id: typeKey,
            before_json: JSON.stringify(existing),
            after_json: JSON.stringify(updates),
            correlation_id: generateId(),
            created_at: now,
        });

        const updated = await getApprovalTypeConfig(c.env.DB, typeKey);
        return c.json({
            ...updated,
            default_checker_roles: safeParseJson(updated?.default_checker_roles_json),
        });
    } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
    }
});

// ── DELETE /approvals/types/config/:typeKey ───────────────────────────
typeConfigRoutes.delete('/:typeKey', async (c) => {
    const typeKey = c.req.param('typeKey');
    const staffId = c.req.query('staff_id') ?? '';

    const auth = await requireAdmin(c.env.DB, staffId);
    if (auth.error) return c.json({ error: auth.error }, auth.status as any);

    const existing = await getApprovalTypeConfig(c.env.DB, typeKey);
    if (!existing) {
        return c.json({ error: 'Approval type config not found' }, 404);
    }

    // Prevent deleting built-in types that have code handlers
    if (existing.has_code_handler && approvalRegistry.has(typeKey)) {
        return c.json({
            error: 'Cannot delete a built-in type with a code handler. Disable it instead.',
        }, 400);
    }

    const now = nowISO();
    try {
        await deleteApprovalTypeConfig(c.env.DB, typeKey);

        await insertAuditLog(c.env.DB, {
            id: generateId(),
            action: 'APPROVAL_TYPE_CONFIG_DELETED',
            actor_type: ActorType.STAFF,
            actor_id: staffId,
            target_type: 'approval_type_config',
            target_id: typeKey,
            before_json: JSON.stringify(existing),
            after_json: undefined,
            correlation_id: generateId(),
            created_at: now,
        });

        return c.json({ deleted: true, type_key: typeKey });
    } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
    }
});

// ═══════════════════════════════════════════════════════════════════════
// ENDPOINT BINDING ROUTES  (mounted at /approvals/endpoint-bindings)
// ═══════════════════════════════════════════════════════════════════════

export const endpointBindingRoutes = new Hono<{ Bindings: Env }>();

// ── GET /approvals/endpoint-bindings ─────────────────────────────────
endpointBindingRoutes.get('/', async (c) => {
    const approvalType = c.req.query('approval_type');
    const enabledOnly = c.req.query('enabled_only') === 'true';

    try {
        const bindings = await listEndpointBindings(c.env.DB, {
            approval_type: approvalType || undefined,
            enabled_only: enabledOnly,
        });
        return c.json({
            items: bindings.map((b) => ({
                ...b,
                extract_payload: safeParseJson(b.extract_payload_json),
            })),
        });
    } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
    }
});

// ── GET /approvals/endpoint-bindings/lookup ──────────────────────────
// Check if a specific route/method has an active binding
// NOTE: Must be defined BEFORE /:id to avoid being matched as a param
endpointBindingRoutes.get('/lookup', async (c) => {
    const route = c.req.query('route');
    const method = c.req.query('method') ?? 'POST';

    if (!route) {
        return c.json({ error: 'route query parameter is required' }, 400);
    }

    try {
        const binding = await findEndpointBinding(c.env.DB, route, method);
        if (!binding) {
            return c.json({ bound: false, route, method: method.toUpperCase() });
        }
        return c.json({
            bound: true,
            route,
            method: method.toUpperCase(),
            approval_type: binding.approval_type,
            binding_id: binding.id,
        });
    } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
    }
});

// ── GET /approvals/endpoint-bindings/:id ─────────────────────────────
endpointBindingRoutes.get('/:id', async (c) => {
    const id = c.req.param('id');
    try {
        const binding = await getEndpointBinding(c.env.DB, id);
        if (!binding) {
            return c.json({ error: 'Endpoint binding not found' }, 404);
        }
        return c.json({
            ...binding,
            extract_payload: safeParseJson(binding.extract_payload_json),
        });
    } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
    }
});

// ── POST /approvals/endpoint-bindings ────────────────────────────────
endpointBindingRoutes.post('/', async (c) => {
    const body = await c.req.json();
    const {
        staff_id, route_pattern, http_method, approval_type,
        description, extract_payload,
    } = body;

    const auth = await requireAdmin(c.env.DB, staff_id);
    if (auth.error) return c.json({ error: auth.error }, auth.status as any);

    if (!route_pattern || !approval_type) {
        return c.json({ error: 'route_pattern and approval_type are required' }, 400);
    }

    const method = (http_method ?? 'POST').toUpperCase();
    const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    if (!validMethods.includes(method)) {
        return c.json({ error: `http_method must be one of: ${validMethods.join(', ')}` }, 400);
    }

    // Verify the approval type exists
    const typeConfig = await getApprovalTypeConfig(c.env.DB, approval_type);
    if (!typeConfig) {
        // Also check if it's a code-registered type
        if (!approvalRegistry.has(approval_type)) {
            return c.json({ error: `Approval type '${approval_type}' not found in configs or registry` }, 400);
        }
    }

    // Check for duplicate binding
    const existing = await findEndpointBinding(c.env.DB, route_pattern, method);
    if (existing) {
        return c.json({
            error: `Binding already exists for ${method} ${route_pattern}`,
            existing_binding_id: existing.id,
        }, 409);
    }

    const id = generateId();
    const now = nowISO();
    const payloadJson = extract_payload ? JSON.stringify(extract_payload) : undefined;

    try {
        await insertEndpointBinding(c.env.DB, {
            id,
            route_pattern,
            http_method: method,
            approval_type,
            description: description ?? undefined,
            extract_payload_json: payloadJson,
            enabled: 1,
            created_by: staff_id,
            created_at: now,
            updated_at: now,
        });

        await insertAuditLog(c.env.DB, {
            id: generateId(),
            action: 'ENDPOINT_BINDING_CREATED',
            actor_type: ActorType.STAFF,
            actor_id: staff_id,
            target_type: 'approval_endpoint_binding',
            target_id: id,
            before_json: undefined,
            after_json: JSON.stringify({ route_pattern, http_method: method, approval_type }),
            correlation_id: generateId(),
            created_at: now,
        });

        return c.json({
            id,
            route_pattern,
            http_method: method,
            approval_type,
            description: description ?? null,
            enabled: true,
            created_at: now,
        }, 201);
    } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
    }
});

// ── PATCH /approvals/endpoint-bindings/:id ───────────────────────────
endpointBindingRoutes.patch('/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { staff_id } = body;

    const auth = await requireAdmin(c.env.DB, staff_id);
    if (auth.error) return c.json({ error: auth.error }, auth.status as any);

    const existing = await getEndpointBinding(c.env.DB, id);
    if (!existing) {
        return c.json({ error: 'Endpoint binding not found' }, 404);
    }

    const updates: Record<string, unknown> = {};
    if (body.route_pattern !== undefined) updates.route_pattern = body.route_pattern;
    if (body.http_method !== undefined) updates.http_method = body.http_method;
    if (body.approval_type !== undefined) {
        // Verify the new type exists
        const typeConfig = await getApprovalTypeConfig(c.env.DB, body.approval_type);
        if (!typeConfig && !approvalRegistry.has(body.approval_type)) {
            return c.json({ error: `Approval type '${body.approval_type}' not found` }, 400);
        }
        updates.approval_type = body.approval_type;
    }
    if (body.description !== undefined) updates.description = body.description;
    if (body.extract_payload !== undefined) {
        updates.extract_payload_json = body.extract_payload ? JSON.stringify(body.extract_payload) : null;
    }
    if (body.enabled !== undefined) updates.enabled = body.enabled ? 1 : 0;

    if (Object.keys(updates).length === 0) {
        return c.json({ error: 'No fields to update' }, 400);
    }

    const now = nowISO();
    try {
        await updateEndpointBinding(c.env.DB, id, updates as any, now);

        await insertAuditLog(c.env.DB, {
            id: generateId(),
            action: 'ENDPOINT_BINDING_UPDATED',
            actor_type: ActorType.STAFF,
            actor_id: staff_id,
            target_type: 'approval_endpoint_binding',
            target_id: id,
            before_json: JSON.stringify(existing),
            after_json: JSON.stringify(updates),
            correlation_id: generateId(),
            created_at: now,
        });

        const updated = await getEndpointBinding(c.env.DB, id);
        return c.json({
            ...updated,
            extract_payload: safeParseJson(updated?.extract_payload_json),
        });
    } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
    }
});

// ── DELETE /approvals/endpoint-bindings/:id ───────────────────────────
endpointBindingRoutes.delete('/:id', async (c) => {
    const id = c.req.param('id');
    const staffId = c.req.query('staff_id') ?? '';

    const auth = await requireAdmin(c.env.DB, staffId);
    if (auth.error) return c.json({ error: auth.error }, auth.status as any);

    const existing = await getEndpointBinding(c.env.DB, id);
    if (!existing) {
        return c.json({ error: 'Endpoint binding not found' }, 404);
    }

    const now = nowISO();
    try {
        await deleteEndpointBinding(c.env.DB, id);

        await insertAuditLog(c.env.DB, {
            id: generateId(),
            action: 'ENDPOINT_BINDING_DELETED',
            actor_type: ActorType.STAFF,
            actor_id: staffId,
            target_type: 'approval_endpoint_binding',
            target_id: id,
            before_json: JSON.stringify(existing),
            after_json: undefined,
            correlation_id: generateId(),
            created_at: now,
        });

        return c.json({ deleted: true, id });
    } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
    }
});

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function safeParseJson(json: string | null | undefined): unknown {
    if (!json) return null;
    try {
        return JSON.parse(json);
    } catch {
        return null;
    }
}
