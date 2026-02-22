/**
 * Endpoint Binding Helper
 *
 * Provides a helper function that checks whether a given route/method
 * has an active approval endpoint binding, and if so, creates an
 * approval request instead of executing the action directly.
 *
 * Usage in any route:
 *   const intercepted = await checkEndpointBinding(c, '/merchants/:id/withdraw', 'POST', {
 *     staff_id: maker.id,
 *     payload: { merchant_id, amount, ... },
 *     correlation_id: correlationId,
 *   });
 *   if (intercepted) return intercepted; // Returns the approval-required response
 *   // ... continue with normal execution
 */

import type { Context } from 'hono';
import type { Env } from '../index.js';
import {
    generateId,
    nowISO,
    ApprovalState,
    EventName,
    ActorType,
} from '@caricash/shared';
import type { EventName as EventNameType } from '@caricash/shared';
import {
    findEndpointBinding,
    getApprovalTypeConfig,
    insertApprovalRequest,
    insertEvent,
    insertAuditLog,
} from '@caricash/db';
import { evaluatePolicies } from './policy-engine.js';
import type { PolicyEvalContext } from './policy-engine.js';
import { getActorById, updateApprovalRequestWorkflow } from '@caricash/db';

export interface EndpointBindingCheckOptions {
    /** Staff ID of the maker (requester) */
    staff_id: string;
    /** Payload to store on the approval request */
    payload: Record<string, unknown>;
    /** Correlation ID for tracing */
    correlation_id?: string;
}

export interface EndpointBindingResult {
    /** Whether the request was intercepted and an approval request was created */
    intercepted: true;
    /** The Hono Response to return */
    response: Response;
}

/**
 * Check if the given route/method has an active endpoint binding.
 * If yes, create an approval request and return a response indicating
 * the operation requires approval.
 *
 * @returns EndpointBindingResult if intercepted, null if no binding exists.
 */
export async function checkEndpointBinding(
    c: Context<{ Bindings: Env }>,
    routePattern: string,
    httpMethod: string,
    opts: EndpointBindingCheckOptions,
): Promise<EndpointBindingResult | null> {
    const correlationId = opts.correlation_id ?? generateId();

    try {
        const binding = await findEndpointBinding(c.env.DB, routePattern, httpMethod);
        if (!binding) return null;

        // Check if the type is enabled
        const typeConfig = await getApprovalTypeConfig(c.env.DB, binding.approval_type);
        if (typeConfig && !typeConfig.enabled) return null;

        // Validate require_reason
        if (typeConfig?.require_reason && !opts.payload.reason) {
            const response = c.json({
                error: 'A reason is required for this approval type',
                approval_type: binding.approval_type,
                correlation_id: correlationId,
            }, 400);
            return { intercepted: true, response };
        }

        const now = nowISO();
        const requestId = generateId();

        // Evaluate policies to find matching policy
        let policyId: string | null = typeConfig?.auto_policy_id ?? null;
        let totalStages = 1;
        let workflowState: string | null = null;

        // Try policy evaluation
        const makerActor = await getActorById(c.env.DB, opts.staff_id);
        if (makerActor) {
            const evalCtx: PolicyEvalContext = {
                approval_type: binding.approval_type,
                maker_actor: makerActor,
                payload: opts.payload,
                now,
            };
            const evalResult = await evaluatePolicies(c.env.DB, evalCtx);
            if (evalResult.matched && evalResult.policy_id) {
                policyId = evalResult.policy_id;
                totalStages = evalResult.total_stages;
                workflowState = 'STAGE_PENDING';
            }
        }

        // Create the approval request
        await insertApprovalRequest(c.env.DB, {
            id: requestId,
            type: binding.approval_type,
            payload_json: JSON.stringify({
                ...opts.payload,
                _binding_id: binding.id,
                _route: routePattern,
                _method: httpMethod,
            }),
            maker_staff_id: opts.staff_id,
            state: ApprovalState.PENDING,
            created_at: now,
        });

        // Set up policy-driven workflow if a policy matched
        if (policyId) {
            await updateApprovalRequestWorkflow(c.env.DB, requestId, {
                policy_id: policyId,
                current_stage: 1,
                total_stages: totalStages,
                workflow_state: workflowState ?? undefined,
            });
        }

        // Emit event
        const event = {
            id: generateId(),
            name: EventName.APPROVAL_CREATED as EventNameType,
            entity_type: 'approval_request',
            entity_id: requestId,
            correlation_id: correlationId,
            actor_type: ActorType.STAFF,
            actor_id: opts.staff_id,
            schema_version: 1,
            payload_json: JSON.stringify({
                request_id: requestId,
                type: binding.approval_type,
                route: routePattern,
                method: httpMethod,
            }),
            created_at: now,
        };
        await insertEvent(c.env.DB, event);
        await c.env.EVENTS_QUEUE.send(event);

        // Audit
        await insertAuditLog(c.env.DB, {
            id: generateId(),
            action: 'APPROVAL_REQUEST_CREATED_VIA_BINDING',
            actor_type: ActorType.STAFF,
            actor_id: opts.staff_id,
            target_type: 'approval_request',
            target_id: requestId,
            before_json: undefined,
            after_json: JSON.stringify({
                type: binding.approval_type,
                binding_id: binding.id,
                route: routePattern,
                method: httpMethod,
                policy_id: policyId,
            }),
            correlation_id: correlationId,
            created_at: now,
        });

        const response = c.json({
            approval_required: true,
            request_id: requestId,
            approval_type: binding.approval_type,
            label: typeConfig?.label ?? binding.approval_type,
            policy_id: policyId,
            total_stages: policyId ? totalStages : null,
            correlation_id: correlationId,
            message: 'This operation requires approval. An approval request has been created.',
        }, 202);

        return { intercepted: true, response };
    } catch {
        // If the table doesn't exist or any error, don't block the operation
        return null;
    }
}
