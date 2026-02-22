/**
 * Concrete approval handlers for each ApprovalType.
 *
 * Each handler is registered into the approvalRegistry so the generic
 * /approvals/:id/approve and /approvals/:id/reject endpoints can
 * delegate to them without if/else chains.
 *
 * To add a new approval type, create a handler below and call
 * approvalRegistry.register(...) at the bottom of this file.
 */

import {
    ApprovalType,
    ApprovalState,
    ActorType,
    StaffRole,
    TxnType,
    EventName,
    generateId,
    nowISO,
} from '@caricash/shared';
import type { PostTransactionCommand, ApprovalTypeConfig } from '@caricash/shared';
import {
    getOrCreateLedgerAccount,
    initAccountBalance,
    getAccountBalance,
    upsertAccountBalance,
    updateOverdraftFacility,
} from '@caricash/db';
import { buildReversalEntries } from '@caricash/posting-do';
import type { Entry } from '@caricash/posting-do';
import { postTransaction, getBalance } from './posting-client.js';
import { approvalRegistry } from './approval-handlers.js';
import type { ApprovalHandler, ApprovalContext } from './approval-handlers.js';

// ═══════════════════════════════════════════════════════════════════════
// 1. REVERSAL
// ═══════════════════════════════════════════════════════════════════════

const reversalHandler: ApprovalHandler = {
    label: 'Journal Reversal',
    allowedCheckerRoles: [], // any staff can approve reversals

    async onApprove(ctx) {
        const { c, payload, staffId, correlationId } = ctx;
        const p = payload as {
            original_journal_id: string;
            reason: string;
            idempotency_key: string;
        };

        // Fetch original journal lines to build reversal entries
        const linesResult = await c.env.DB
            .prepare('SELECT account_id, entry_type, amount, description FROM ledger_lines WHERE journal_id = ?1')
            .bind(p.original_journal_id)
            .all();

        const originalEntries: Entry[] = (linesResult.results ?? []).map((l: Record<string, unknown>) => ({
            account_id: l.account_id as string,
            entry_type: l.entry_type as 'DR' | 'CR',
            amount: l.amount as string,
            description: l.description as string | undefined,
        }));

        const reversalEntries = buildReversalEntries(originalEntries);

        // Fetch original journal for currency
        const originalJournal = await c.env.DB
            .prepare('SELECT * FROM ledger_journals WHERE id = ?1')
            .bind(p.original_journal_id)
            .first() as { currency: string; txn_type: string } | null;

        if (!originalJournal) {
            throw new Error('Original journal not found');
        }

        const reversalCommand: PostTransactionCommand = {
            idempotency_key: `reversal:${p.idempotency_key}`,
            correlation_id: correlationId,
            txn_type: TxnType.REVERSAL,
            currency: originalJournal.currency as PostTransactionCommand['currency'],
            entries: reversalEntries,
            description: `Reversal of ${p.original_journal_id}: ${p.reason}`,
            actor_type: ActorType.STAFF,
            actor_id: staffId,
        };

        const domainKey = `REVERSAL:${p.original_journal_id}`;
        const result = await postTransaction(c.env, domainKey, reversalCommand);

        return {
            reversal_journal_id: result.journal_id,
            original_journal_id: p.original_journal_id,
            posting: result,
        };
    },

    eventNames: {
        onApprove: EventName.REVERSAL_POSTED,
        onReject: EventName.REVERSAL_REJECTED,
    },
    auditActions: {
        onApprove: 'REVERSAL_APPROVED',
        onReject: 'REVERSAL_REJECTED',
    },
};

// ═══════════════════════════════════════════════════════════════════════
// 2. MANUAL ADJUSTMENT (Suspense Funding)
// ═══════════════════════════════════════════════════════════════════════

const manualAdjustmentHandler: ApprovalHandler = {
    label: 'Manual Adjustment (Suspense Funding)',
    allowedCheckerRoles: [StaffRole.FINANCE],

    async validateApproval(ctx) {
        const { payload } = ctx;
        if (payload.operation !== 'SUSPENSE_FUNDING') {
            return 'Unsupported manual adjustment payload';
        }
        return null;
    },

    async onApprove(ctx) {
        const { c, payload, staffId, correlationId, now } = ctx;
        const p = payload as {
            operation: string;
            amount: string;
            currency: string;
            reason: string;
            reference?: string | null;
            idempotency_key: string;
        };

        const adjustmentCurrency = p.currency as 'BBD' | 'USD';

        const sourceAccount = await getOrCreateLedgerAccount(
            c.env.DB, ActorType.STAFF, 'TREASURY', 'SUSPENSE', adjustmentCurrency,
        );
        const destinationAccount = await getOrCreateLedgerAccount(
            c.env.DB, ActorType.STAFF, 'SYSTEM', 'SUSPENSE', adjustmentCurrency,
        );

        await initAccountBalance(c.env.DB, sourceAccount.id, adjustmentCurrency);
        await initAccountBalance(c.env.DB, destinationAccount.id, adjustmentCurrency);

        const sourceBefore = await getAccountBalance(c.env.DB, sourceAccount.id);
        const destBefore = await getAccountBalance(c.env.DB, destinationAccount.id);

        const command: PostTransactionCommand = {
            idempotency_key: `suspense-fund:${ctx.request.id}:${p.idempotency_key}`,
            correlation_id: correlationId,
            txn_type: TxnType.MANUAL_ADJUSTMENT,
            currency: adjustmentCurrency,
            entries: [
                {
                    account_id: sourceAccount.id,
                    entry_type: 'DR',
                    amount: p.amount,
                    description: `Treasury suspense funding source${p.reference ? ` (${p.reference})` : ''}`,
                },
                {
                    account_id: destinationAccount.id,
                    entry_type: 'CR',
                    amount: p.amount,
                    description: `System suspense funded: ${p.reason}`,
                },
            ],
            description: `SUSPENSE_FUNDING ${p.amount} ${p.currency} - ${p.reason}`,
            actor_type: ActorType.STAFF,
            actor_id: staffId,
        };

        const domainKey = `ops:suspense:${adjustmentCurrency}`;
        const postingResult = await postTransaction(c.env, domainKey, command);

        const sourceAfter = await getBalance(c.env, domainKey, sourceAccount.id);
        const destAfter = await getBalance(c.env, domainKey, destinationAccount.id);

        await upsertAccountBalance(c.env.DB, {
            account_id: sourceAccount.id,
            actual_balance: sourceAfter.balance,
            available_balance: sourceAfter.balance,
            hold_amount: sourceBefore?.hold_amount ?? '0.00',
            pending_credits: sourceBefore?.pending_credits ?? '0.00',
            last_journal_id: postingResult.journal_id,
            currency: adjustmentCurrency,
            updated_at: now,
        });
        await upsertAccountBalance(c.env.DB, {
            account_id: destinationAccount.id,
            actual_balance: destAfter.balance,
            available_balance: destAfter.balance,
            hold_amount: destBefore?.hold_amount ?? '0.00',
            pending_credits: destBefore?.pending_credits ?? '0.00',
            last_journal_id: postingResult.journal_id,
            currency: adjustmentCurrency,
            updated_at: now,
        });

        return {
            journal_id: postingResult.journal_id,
            operation: 'SUSPENSE_FUNDING',
            amount: p.amount,
            currency: adjustmentCurrency,
            source_account_id: sourceAccount.id,
            destination_account_id: destinationAccount.id,
            posting: postingResult,
        };
    },

    eventNames: {
        onApprove: EventName.MANUAL_ADJUSTMENT_POSTED,
        onReject: EventName.APPROVAL_REJECTED,
    },
    auditActions: {
        onApprove: 'MANUAL_ADJUSTMENT_APPROVED',
        onReject: 'MANUAL_ADJUSTMENT_REJECTED',
    },
};

// ═══════════════════════════════════════════════════════════════════════
// 3. OVERDRAFT FACILITY
// ═══════════════════════════════════════════════════════════════════════

const overdraftHandler: ApprovalHandler = {
    label: 'Overdraft Facility',
    allowedCheckerRoles: [], // any staff can approve (maker ≠ checker still enforced)

    async onApprove(ctx) {
        const { c, payload, staffId, now } = ctx;
        const p = payload as { facility_id: string; account_id: string; limit_amount: string; currency: string };

        await updateOverdraftFacility(c.env.DB, p.facility_id, 'ACTIVE', staffId, now);

        return { facility_id: p.facility_id, state: 'ACTIVE' };
    },

    async onReject(ctx) {
        const { c, payload, staffId } = ctx;
        const p = payload as { facility_id: string };

        await updateOverdraftFacility(c.env.DB, p.facility_id, 'REJECTED', staffId);

        return { facility_id: p.facility_id, state: 'REJECTED' };
    },

    eventNames: {
        onApprove: EventName.OVERDRAFT_FACILITY_APPROVED,
        onReject: EventName.OVERDRAFT_FACILITY_REJECTED,
    },
    auditActions: {
        onApprove: 'OVERDRAFT_APPROVED',
        onReject: 'OVERDRAFT_REJECTED',
    },
};

// ═══════════════════════════════════════════════════════════════════════
// 4. MERCHANT WITHDRAWAL
// ═══════════════════════════════════════════════════════════════════════

const merchantWithdrawalHandler: ApprovalHandler = {
    label: 'Merchant Withdrawal',
    allowedCheckerRoles: [StaffRole.OPERATIONS, StaffRole.SUPER_ADMIN],

    async onApprove(ctx) {
        const { c, payload, staffId, correlationId } = ctx;
        const p = payload as {
            merchant_id: string;
            wallet_account_id: string;
            amount: string;
            currency: string;
            idempotency_key: string;
        };

        // Post the withdrawal transaction via PostingDO
        const doId = c.env.POSTING_DO.idFromName('singleton');
        const stub = c.env.POSTING_DO.get(doId);
        const postingRes = await stub.fetch('https://do/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                idempotency_key: p.idempotency_key,
                correlation_id: correlationId,
                txn_type: 'WITHDRAWAL',
                currency: p.currency,
                entries: [
                    {
                        account_id: p.wallet_account_id,
                        entry_type: 'DR',
                        amount: p.amount,
                        description: `Merchant withdrawal - ${p.merchant_id}`,
                    },
                    {
                        owner_type: ActorType.STAFF,
                        owner_id: 'SETTLEMENT',
                        account_type: 'SUSPENSE',
                        entry_type: 'CR',
                        amount: p.amount,
                        description: `Merchant withdrawal payout - ${p.merchant_id}`,
                    },
                ],
                description: `Approved merchant withdrawal for ${p.merchant_id}`,
                actor_type: ActorType.STAFF,
                actor_id: staffId,
            }),
        });

        const postingResult = await postingRes.json() as Record<string, unknown>;

        return {
            merchant_id: p.merchant_id,
            amount: p.amount,
            currency: p.currency,
            posting: postingResult,
        };
    },

    eventNames: {
        onApprove: EventName.MERCHANT_WITHDRAWAL_APPROVED,
        onReject: EventName.MERCHANT_WITHDRAWAL_REJECTED,
    },
    auditActions: {
        onApprove: 'MERCHANT_WITHDRAWAL_APPROVED',
        onReject: 'MERCHANT_WITHDRAWAL_REJECTED',
    },
};

// ═══════════════════════════════════════════════════════════════════════
// 5. FEE MATRIX CHANGE (stub — no side-effects yet)
// ═══════════════════════════════════════════════════════════════════════

const feeMatrixHandler: ApprovalHandler = {
    label: 'Fee Matrix Change',
    allowedCheckerRoles: [StaffRole.FINANCE, StaffRole.SUPER_ADMIN],
    // TODO: implement onApprove to activate the new fee matrix version
    eventNames: {
        onApprove: EventName.FEE_MATRIX_APPROVED,
        onReject: EventName.APPROVAL_REJECTED,
    },
    auditActions: {
        onApprove: 'FEE_MATRIX_APPROVED',
        onReject: 'FEE_MATRIX_REJECTED',
    },
};

// ═══════════════════════════════════════════════════════════════════════
// 6. COMMISSION MATRIX CHANGE (stub — no side-effects yet)
// ═══════════════════════════════════════════════════════════════════════

const commissionMatrixHandler: ApprovalHandler = {
    label: 'Commission Matrix Change',
    allowedCheckerRoles: [StaffRole.FINANCE, StaffRole.SUPER_ADMIN],
    // TODO: implement onApprove to activate the new commission matrix version
    eventNames: {
        onApprove: EventName.COMMISSION_MATRIX_APPROVED,
        onReject: EventName.APPROVAL_REJECTED,
    },
    auditActions: {
        onApprove: 'COMMISSION_MATRIX_APPROVED',
        onReject: 'COMMISSION_MATRIX_REJECTED',
    },
};

// ═══════════════════════════════════════════════════════════════════════
// REGISTER ALL HANDLERS
// ═══════════════════════════════════════════════════════════════════════

approvalRegistry.register(ApprovalType.REVERSAL_REQUESTED, reversalHandler);
approvalRegistry.register(ApprovalType.MANUAL_ADJUSTMENT_REQUESTED, manualAdjustmentHandler);
approvalRegistry.register(ApprovalType.OVERDRAFT_FACILITY_REQUESTED, overdraftHandler);
approvalRegistry.register(ApprovalType.MERCHANT_WITHDRAWAL_REQUESTED, merchantWithdrawalHandler);
approvalRegistry.register(ApprovalType.FEE_MATRIX_CHANGE_REQUESTED, feeMatrixHandler);
approvalRegistry.register(ApprovalType.COMMISSION_MATRIX_CHANGE_REQUESTED, commissionMatrixHandler);

// ═══════════════════════════════════════════════════════════════════════
// GENERIC FALLBACK HANDLER
//
// Built dynamically from an ApprovalTypeConfig row for approval types
// that have no code-level handler. Acts as an approve/reject gate with
// no programmatic side-effects.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build a generic ApprovalHandler from a dynamic type config.
 * This handler:
 *  - Enforces checker roles from the config's default_checker_roles_json
 *  - Has no onApprove / onReject side-effects (pure gate)
 *  - Uses generic event names
 */
export function buildGenericHandler(config: ApprovalTypeConfig): ApprovalHandler {
    let checkerRoles: string[] = [];
    if (config.default_checker_roles_json) {
        try {
            checkerRoles = JSON.parse(config.default_checker_roles_json);
        } catch {
            checkerRoles = [];
        }
    }

    return {
        label: config.label,
        allowedCheckerRoles: checkerRoles,
        // No onApprove — pure approval gate
        // No onReject — pure rejection gate
        // Generic event names
    };
}
