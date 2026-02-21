import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
    generateId,
    nowISO,
    floatTopUpSchema,
    floatWithdrawalSchema,
    ActorType,
    AccountType,
    TxnType,
    EventName,
    ErrorCode,
    IdempotencyConflictError,
    InsufficientFundsError,
} from '@caricash/shared';
import type { PostTransactionCommand, CurrencyCode, AccountBalance, FloatOperation } from '@caricash/shared';
import {
    getActorByAgentCode,
    getActorById,
    getLedgerAccount,
    getOrCreateLedgerAccount,
    getAccountBalance,
    upsertAccountBalance,
    insertFloatOperation,
    getFloatOperationsByAgent,
    getFloatOperationByIdempotencyKey,
    getAccountBalancesByOwner,
    initAccountBalance,
    insertEvent,
    insertAuditLog,
} from '@caricash/db';
import { buildFloatTopUpEntries, buildFloatWithdrawalEntries } from '@caricash/posting-do';
import { postTransaction, getBalance } from '../lib/posting-client.js';

export const floatRoutes = new Hono<{ Bindings: Env }>();

function toCents(amount: string): number {
    return Math.round(Number(amount) * 100);
}

// ---------------------------------------------------------------------------
// POST /float/top-up — Staff deposits cash to agent's float
// ---------------------------------------------------------------------------
floatRoutes.post('/top-up', async (c) => {
    const body = await c.req.json();
    const parsed = floatTopUpSchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
    }

    const { agent_code, amount, currency, staff_id, reason, reference, idempotency_key } = parsed.data;
    const correlationId = (body.correlation_id as string) || generateId();
    const cur = (currency ?? 'BBD') as CurrencyCode;

    try {
        // Idempotency check
        const existingOp = await getFloatOperationByIdempotencyKey(c.env.DB, idempotency_key);
        if (existingOp) {
            return c.json({
                message: 'Float top-up already processed',
                operation: existingOp,
                correlation_id: correlationId,
            }, 200);
        }

        // Validate agent
        const agent = await getActorByAgentCode(c.env.DB, agent_code);
        if (!agent) {
            return c.json({ error: 'Agent not found', correlation_id: correlationId }, 404);
        }

        // Validate staff
        const staff = await getActorById(c.env.DB, staff_id);
        if (!staff || staff.type !== ActorType.STAFF) {
            return c.json({ error: 'Staff member not found or unauthorized', correlation_id: correlationId }, 403);
        }

        const now = nowISO();

        // Get or create agent cash float account
        const agentFloat = await getOrCreateLedgerAccount(c.env.DB, ActorType.AGENT, agent.id, AccountType.CASH_FLOAT, cur);

        // Get or create system suspense account (funding source for float)
        const systemSuspense = await getOrCreateLedgerAccount(c.env.DB, ActorType.STAFF, 'SYSTEM', AccountType.SUSPENSE, cur);

        // Ensure account_balances rows exist
        await initAccountBalance(c.env.DB, agentFloat.id, cur);
        await initAccountBalance(c.env.DB, systemSuspense.id, cur);

        // Get current balance snapshot (before)
        const balBefore = await getAccountBalance(c.env.DB, agentFloat.id);
        const actualBefore = balBefore?.actual_balance ?? '0.00';
        const availableBefore = balBefore?.available_balance ?? '0.00';

        const suspenseBalance = await getAccountBalance(c.env.DB, systemSuspense.id);
        const suspenseAvailable = suspenseBalance?.available_balance ?? suspenseBalance?.actual_balance ?? '0.00';
        if (toCents(suspenseAvailable) < toCents(amount)) {
            return c.json(
                {
                    error: `Insufficient system suspense balance: ${suspenseAvailable} available, ${amount} required`,
                    code: ErrorCode.INSUFFICIENT_FUNDS,
                    correlation_id: correlationId,
                },
                409,
            );
        }

        // Build double-entry journal
        const entries = buildFloatTopUpEntries(systemSuspense.id, agentFloat.id, amount);

        const command: PostTransactionCommand = {
            idempotency_key,
            correlation_id: correlationId,
            txn_type: TxnType.FLOAT_TOP_UP,
            currency: cur,
            entries,
            description: `Float top-up ${amount} ${cur} to agent ${agent_code}`,
            actor_type: ActorType.STAFF,
            actor_id: staff_id,
        };

        // Post through the durable object for serialized consistency
        const domainKey = `wallet:${ActorType.AGENT}:${agent.id}:${cur}`;
        const result = await postTransaction(c.env, domainKey, command);

        // Fetch new balance from DO
        const newBalResult = await getBalance(c.env, domainKey, agentFloat.id);
        const actualAfter = newBalResult.balance;
        const availableAfter = newBalResult.balance; // For top-up, available = actual

        // Update account_balances
        await upsertAccountBalance(c.env.DB, {
            account_id: agentFloat.id,
            actual_balance: actualAfter,
            available_balance: availableAfter,
            hold_amount: balBefore?.hold_amount ?? '0.00',
            pending_credits: '0.00',
            last_journal_id: result.journal_id,
            currency: cur,
            updated_at: now,
        });

        // Record float operation
        const opId = generateId();
        const floatOp: FloatOperation = {
            id: opId,
            agent_actor_id: agent.id,
            agent_account_id: agentFloat.id,
            staff_actor_id: staff_id,
            operation_type: 'TOP_UP',
            amount,
            currency: cur,
            journal_id: result.journal_id,
            balance_before: actualBefore,
            balance_after: actualAfter,
            available_before: availableBefore,
            available_after: availableAfter,
            requires_approval: false,
            reason: reason ?? undefined,
            reference: reference ?? undefined,
            idempotency_key,
            correlation_id: correlationId,
            created_at: now,
        };
        await insertFloatOperation(c.env.DB, floatOp);

        // Emit events
        const topUpEvent = {
            id: generateId(),
            name: EventName.FLOAT_TOP_UP_COMPLETED,
            entity_type: 'float_operation',
            entity_id: opId,
            correlation_id: correlationId,
            causation_id: result.journal_id,
            actor_type: ActorType.STAFF,
            actor_id: staff_id,
            schema_version: 1,
            payload_json: JSON.stringify({
                agent_id: agent.id,
                agent_code,
                amount,
                currency: cur,
                journal_id: result.journal_id,
                balance_before: actualBefore,
                balance_after: actualAfter,
                available_before: availableBefore,
                available_after: availableAfter,
                reason,
                reference,
            }),
            created_at: now,
        };
        await insertEvent(c.env.DB, topUpEvent);
        await c.env.EVENTS_QUEUE.send(topUpEvent);

        const balanceEvent = {
            id: generateId(),
            name: EventName.BALANCE_UPDATED,
            entity_type: 'account_balance',
            entity_id: agentFloat.id,
            correlation_id: correlationId,
            causation_id: result.journal_id,
            actor_type: ActorType.STAFF,
            actor_id: staff_id,
            schema_version: 1,
            payload_json: JSON.stringify({
                account_id: agentFloat.id,
                owner_type: ActorType.AGENT,
                owner_id: agent.id,
                actual_before: actualBefore,
                actual_after: actualAfter,
                available_before: availableBefore,
                available_after: availableAfter,
                trigger: 'FLOAT_TOP_UP',
            }),
            created_at: now,
        };
        await insertEvent(c.env.DB, balanceEvent);
        await c.env.EVENTS_QUEUE.send(balanceEvent);

        // Audit log
        await insertAuditLog(c.env.DB, {
            id: generateId(),
            action: 'FLOAT_TOP_UP',
            actor_type: ActorType.STAFF,
            actor_id: staff_id,
            target_type: 'actor',
            target_id: agent.id,
            before_json: JSON.stringify({ actual_balance: actualBefore, available_balance: availableBefore }),
            after_json: JSON.stringify({ actual_balance: actualAfter, available_balance: availableAfter }),
            correlation_id: correlationId,
            created_at: now,
        });

        return c.json({
            operation_id: opId,
            journal_id: result.journal_id,
            agent_id: agent.id,
            agent_code,
            amount,
            currency: cur,
            balance_before: actualBefore,
            balance_after: actualAfter,
            available_before: availableBefore,
            available_after: availableAfter,
            correlation_id: correlationId,
        }, 201);
    } catch (err) {
        if (err instanceof IdempotencyConflictError) {
            return c.json({ error: err.message, code: ErrorCode.DUPLICATE_IDEMPOTENCY_CONFLICT, correlation_id: correlationId }, 409);
        }
        if (err instanceof InsufficientFundsError) {
            return c.json({ error: err.message, code: ErrorCode.INSUFFICIENT_FUNDS, correlation_id: correlationId }, 409);
        }
        const message = err instanceof Error ? err.message : 'Internal server error';
        return c.json({ error: message, correlation_id: correlationId }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /float/withdrawal — Agent returns float to staff/bank
// ---------------------------------------------------------------------------
floatRoutes.post('/withdrawal', async (c) => {
    const body = await c.req.json();
    const parsed = floatWithdrawalSchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
    }

    const { agent_code, amount, currency, staff_id, reason, reference, idempotency_key } = parsed.data;
    const correlationId = (body.correlation_id as string) || generateId();
    const cur = (currency ?? 'BBD') as CurrencyCode;

    try {
        const existingOp = await getFloatOperationByIdempotencyKey(c.env.DB, idempotency_key);
        if (existingOp) {
            return c.json({
                message: 'Float withdrawal already processed',
                operation: existingOp,
                correlation_id: correlationId,
            }, 200);
        }

        const agent = await getActorByAgentCode(c.env.DB, agent_code);
        if (!agent) {
            return c.json({ error: 'Agent not found', correlation_id: correlationId }, 404);
        }

        const staff = await getActorById(c.env.DB, staff_id);
        if (!staff || staff.type !== ActorType.STAFF) {
            return c.json({ error: 'Staff member not found or unauthorized', correlation_id: correlationId }, 403);
        }

        const now = nowISO();

        const agentFloat = await getLedgerAccount(c.env.DB, ActorType.AGENT, agent.id, AccountType.CASH_FLOAT, cur);
        if (!agentFloat) {
            return c.json({ error: 'Agent cash float account not found', correlation_id: correlationId }, 404);
        }

        const systemSuspense = await getOrCreateLedgerAccount(c.env.DB, ActorType.STAFF, 'SYSTEM', AccountType.SUSPENSE, cur);

        await initAccountBalance(c.env.DB, agentFloat.id, cur);

        const balBefore = await getAccountBalance(c.env.DB, agentFloat.id);
        const actualBefore = balBefore?.actual_balance ?? '0.00';
        const availableBefore = balBefore?.available_balance ?? '0.00';

        const entries = buildFloatWithdrawalEntries(agentFloat.id, systemSuspense.id, amount);

        const command: PostTransactionCommand = {
            idempotency_key,
            correlation_id: correlationId,
            txn_type: TxnType.FLOAT_WITHDRAWAL,
            currency: cur,
            entries,
            description: `Float withdrawal ${amount} ${cur} from agent ${agent_code}`,
            actor_type: ActorType.STAFF,
            actor_id: staff_id,
        };

        const domainKey = `wallet:${ActorType.AGENT}:${agent.id}:${cur}`;
        const result = await postTransaction(c.env, domainKey, command);

        const newBalResult = await getBalance(c.env, domainKey, agentFloat.id);
        const actualAfter = newBalResult.balance;
        const availableAfter = newBalResult.balance;

        await upsertAccountBalance(c.env.DB, {
            account_id: agentFloat.id,
            actual_balance: actualAfter,
            available_balance: availableAfter,
            hold_amount: balBefore?.hold_amount ?? '0.00',
            pending_credits: '0.00',
            last_journal_id: result.journal_id,
            currency: cur,
            updated_at: now,
        });

        const opId = generateId();
        const floatOp: FloatOperation = {
            id: opId,
            agent_actor_id: agent.id,
            agent_account_id: agentFloat.id,
            staff_actor_id: staff_id,
            operation_type: 'WITHDRAWAL',
            amount,
            currency: cur,
            journal_id: result.journal_id,
            balance_before: actualBefore,
            balance_after: actualAfter,
            available_before: availableBefore,
            available_after: availableAfter,
            requires_approval: false,
            reason: reason ?? undefined,
            reference: reference ?? undefined,
            idempotency_key,
            correlation_id: correlationId,
            created_at: now,
        };
        await insertFloatOperation(c.env.DB, floatOp);

        const withdrawalEvent = {
            id: generateId(),
            name: EventName.FLOAT_WITHDRAWAL_COMPLETED,
            entity_type: 'float_operation',
            entity_id: opId,
            correlation_id: correlationId,
            causation_id: result.journal_id,
            actor_type: ActorType.STAFF,
            actor_id: staff_id,
            schema_version: 1,
            payload_json: JSON.stringify({
                agent_id: agent.id,
                agent_code,
                amount,
                currency: cur,
                journal_id: result.journal_id,
                balance_before: actualBefore,
                balance_after: actualAfter,
                reason,
                reference,
            }),
            created_at: now,
        };
        await insertEvent(c.env.DB, withdrawalEvent);
        await c.env.EVENTS_QUEUE.send(withdrawalEvent);

        await insertAuditLog(c.env.DB, {
            id: generateId(),
            action: 'FLOAT_WITHDRAWAL',
            actor_type: ActorType.STAFF,
            actor_id: staff_id,
            target_type: 'actor',
            target_id: agent.id,
            before_json: JSON.stringify({ actual_balance: actualBefore, available_balance: availableBefore }),
            after_json: JSON.stringify({ actual_balance: actualAfter, available_balance: availableAfter }),
            correlation_id: correlationId,
            created_at: now,
        });

        return c.json({
            operation_id: opId,
            journal_id: result.journal_id,
            agent_id: agent.id,
            agent_code,
            amount,
            currency: cur,
            balance_before: actualBefore,
            balance_after: actualAfter,
            available_before: availableBefore,
            available_after: availableAfter,
            correlation_id: correlationId,
        }, 201);
    } catch (err) {
        if (err instanceof IdempotencyConflictError) {
            return c.json({ error: err.message, code: ErrorCode.DUPLICATE_IDEMPOTENCY_CONFLICT, correlation_id: correlationId }, 409);
        }
        if (err instanceof InsufficientFundsError) {
            return c.json({ error: err.message, code: ErrorCode.INSUFFICIENT_FUNDS, correlation_id: correlationId }, 409);
        }
        const message = err instanceof Error ? err.message : 'Internal server error';
        return c.json({ error: message, correlation_id: correlationId }, 500);
    }
});

// ---------------------------------------------------------------------------
// GET /float/:agent_code/balance — Get agent float balance (actual & available)
// ---------------------------------------------------------------------------
floatRoutes.get('/:agent_code/balance', async (c) => {
    const agentCode = c.req.param('agent_code');
    const currency = (c.req.query('currency') ?? 'BBD') as CurrencyCode;
    const correlationId = generateId();

    try {
        const agent = await getActorByAgentCode(c.env.DB, agentCode);
        if (!agent) {
            return c.json({ error: 'Agent not found', correlation_id: correlationId }, 404);
        }

        const agentFloat = await getLedgerAccount(c.env.DB, ActorType.AGENT, agent.id, AccountType.CASH_FLOAT, currency);
        if (!agentFloat) {
            return c.json({ error: 'Agent cash float account not found', correlation_id: correlationId }, 404);
        }

        // Get actual balance from DO (source of truth)
        const domainKey = `wallet:${ActorType.AGENT}:${agent.id}:${currency}`;
        const doBalance = await getBalance(c.env, domainKey, agentFloat.id);

        // Get account_balances for available/hold info
        const acctBal = await getAccountBalance(c.env.DB, agentFloat.id);

        return c.json({
            agent_id: agent.id,
            agent_code: agentCode,
            currency,
            account_id: agentFloat.id,
            actual_balance: doBalance.balance,
            available_balance: acctBal?.available_balance ?? doBalance.balance,
            hold_amount: acctBal?.hold_amount ?? '0.00',
            pending_credits: acctBal?.pending_credits ?? '0.00',
            correlation_id: correlationId,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return c.json({ error: message, correlation_id: correlationId }, 500);
    }
});

// ---------------------------------------------------------------------------
// GET /float/:agent_code/history — Get float operation history
// ---------------------------------------------------------------------------
floatRoutes.get('/:agent_code/history', async (c) => {
    const agentCode = c.req.param('agent_code');
    const limit = parseInt(c.req.query('limit') ?? '50', 10);
    const correlationId = generateId();

    try {
        const agent = await getActorByAgentCode(c.env.DB, agentCode);
        if (!agent) {
            return c.json({ error: 'Agent not found', correlation_id: correlationId }, 404);
        }

        const operations = await getFloatOperationsByAgent(c.env.DB, agent.id, limit);

        return c.json({
            agent_id: agent.id,
            agent_code: agentCode,
            operations,
            count: operations.length,
            correlation_id: correlationId,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return c.json({ error: message, correlation_id: correlationId }, 500);
    }
});
