/**
 * Pluggable Approval Handler Registry
 *
 * Each ApprovalType registers an ApprovalHandler that defines:
 *  - Who can approve/reject (role-based access)
 *  - Validation logic before approval
 *  - Side-effects to run on approval (e.g. post a transaction)
 *  - Side-effects to run on rejection
 *
 * The generic /approvals/:id/approve and /approvals/:id/reject endpoints
 * delegate to the registered handler, removing the need for per-type
 * if/else chains or duplicate route triplets.
 *
 * To add a new approval type:
 *  1. Add the type to ApprovalType enum in @caricash/shared
 *  2. Create a handler implementing ApprovalHandler
 *  3. Register it: approvalRegistry.register(ApprovalType.MY_TYPE, myHandler)
 *
 * That's it — the generic approve/reject endpoints pick it up automatically.
 */

import type { Context } from 'hono';
import type { Env } from '../index.js';
import type { ApprovalRequest, Actor } from '@caricash/shared';
import type { EventName } from '@caricash/shared';

// ── Types ────────────────────────────────────────────────────────────

/** Context passed to every handler method */
export interface ApprovalContext {
    /** Hono request context (access c.env for DB, POSTING_DO, etc.) */
    c: Context<{ Bindings: Env }>;
    /** The approval request being acted upon */
    request: ApprovalRequest;
    /** Parsed payload from request.payload_json */
    payload: Record<string, unknown>;
    /** Staff ID of the person approving/rejecting */
    staffId: string;
    /** Staff actor record (type, role, name, etc.) */
    staffActor: Actor;
    /** Correlation ID for this operation */
    correlationId: string;
    /** Current ISO timestamp */
    now: string;
}

/** Result returned from onApprove — included in the API response */
export interface ApprovalResult {
    /** Arbitrary data to include in the response under the handler's key */
    [key: string]: unknown;
}

/** Result returned from onReject — included in the API response */
export interface RejectionResult {
    [key: string]: unknown;
}

/**
 * Handler for a specific approval type.
 *
 * All methods are optional — only implement what you need:
 *  - allowedCheckerRoles: restricts who can approve (empty = any staff)
 *  - validateApproval: run pre-approval checks (e.g. verify funds still available)
 *  - onApprove: execute side-effects (post transactions, update records)
 *  - onReject: execute rejection side-effects (revert pending records, etc.)
 *  - eventNames: custom event names for this type (overrides generic APPROVAL_APPROVED/REJECTED)
 */
export interface ApprovalHandler {
    /**
     * Human-readable label for this approval type (for UI/logging).
     */
    label: string;

    /**
     * Staff roles allowed to act as checker (approver).
     * Empty array = any authenticated staff can approve.
     * Maker-checker (maker ≠ checker) is always enforced regardless.
     */
    allowedCheckerRoles: readonly string[];

    /**
     * Optional validation before approval is granted.
     * Return an error string to reject the approval, or null/undefined to proceed.
     * Use this to check preconditions (e.g. funds still available, facility still valid).
     */
    validateApproval?: (ctx: ApprovalContext) => Promise<string | null | undefined>;

    /**
     * Execute side-effects when the request is approved.
     * Called AFTER the approval_request row is updated to APPROVED.
     * This is where you post transactions, activate facilities, etc.
     */
    onApprove?: (ctx: ApprovalContext) => Promise<ApprovalResult>;

    /**
     * Execute side-effects when the request is rejected.
     * Called AFTER the approval_request row is updated to REJECTED.
     * This is where you reject pending facilities, clean up holds, etc.
     */
    onReject?: (ctx: ApprovalContext & { reason: string }) => Promise<RejectionResult>;

    /**
     * Custom event names for this type.
     * If not provided, generic APPROVAL_APPROVED / APPROVAL_REJECTED are used.
     */
    eventNames?: {
        onApprove?: EventName;
        onReject?: EventName;
    };

    /**
     * Custom audit action strings.
     * If not provided, defaults to APPROVAL_APPROVED / APPROVAL_REJECTED.
     */
    auditActions?: {
        onApprove?: string;
        onReject?: string;
    };
}

// ── Registry ─────────────────────────────────────────────────────────

class ApprovalHandlerRegistry {
  private handlers = new Map<string, ApprovalHandler>();

  /**
   * Register a handler for an approval type.
   * If a handler is already registered for this type, it is silently skipped
   * (idempotent — safe for multiple imports of the impl module).
   */
  register(approvalType: string, handler: ApprovalHandler): void {
    if (this.handlers.has(approvalType)) {
      return; // already registered — idempotent
    }
    this.handlers.set(approvalType, handler);
  }

  /**
   * Get the handler for an approval type, or undefined if none registered.
   */
  get(approvalType: string): ApprovalHandler | undefined {
    return this.handlers.get(approvalType);
  }

  /**
   * Check if a handler is registered for the given type.
   */
  has(approvalType: string): boolean {
    return this.handlers.has(approvalType);
  }

  /**
   * List all registered approval types.
   */
  types(): string[] {
    return [...this.handlers.keys()];
  }
}

/** Singleton registry — import and register handlers at startup */
export const approvalRegistry = new ApprovalHandlerRegistry();
