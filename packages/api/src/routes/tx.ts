import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
  generateId,
  nowISO,
  TxnType,
  ActorType,
  AccountType,
  ApprovalState,
  ApprovalType,
  EventName,
  ErrorCode,
  IdempotencyConflictError,
} from '@caricash/shared';
import type { PostTransactionCommand, CurrencyCode } from '@caricash/shared';
import {
  getActorByMsisdn,
  getActorByAgentCode,
  getActorByStoreCode,
  getLedgerAccount,
  getActiveFeeRules,
  getActiveCommissionRules,
  getOrCreateLedgerAccount,
  insertApprovalRequest,
  insertEvent,
  getAccountBalance,
  upsertAccountBalance,
  initAccountBalance,
} from '@caricash/db';
import {
  buildDepositEntries,
  buildWithdrawalEntries,
  buildP2PEntries,
  buildPaymentEntries,
  buildB2BEntries,
  calculateFee,
  calculateCommission,
} from '@caricash/posting-do';
import type { CommissionEntry } from '@caricash/posting-do';
import { postTransaction } from '../lib/posting-client.js';
import { getBalance } from '../lib/posting-client.js';

export const txRoutes = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// POST /tx/deposit
// ---------------------------------------------------------------------------
txRoutes.post('/deposit', async (c) => {
  const body = await c.req.json();
  const { agent_id, customer_msisdn, amount, currency, idempotency_key, correlation_id: corrId } = body;
  const correlationId = (corrId as string) || generateId();

  if (!agent_id || !customer_msisdn || !amount || !currency || !idempotency_key) {
    return c.json({ error: 'Missing required fields', correlation_id: correlationId }, 400);
  }

  try {
    const cur = currency as CurrencyCode;
    const now = nowISO();

    // Look up agent cash float
    const agentCashFloat = await getLedgerAccount(c.env.DB, ActorType.AGENT, agent_id, AccountType.CASH_FLOAT, cur);
    if (!agentCashFloat) {
      return c.json({ error: 'Agent cash float account not found', correlation_id: correlationId }, 404);
    }

    // Look up customer
    const customer = await getActorByMsisdn(c.env.DB, customer_msisdn);
    if (!customer) {
      return c.json({ error: 'Customer not found', correlation_id: correlationId }, 404);
    }

    const customerWallet = await getLedgerAccount(c.env.DB, ActorType.CUSTOMER, customer.id, AccountType.WALLET, cur);
    if (!customerWallet) {
      return c.json({ error: 'Customer wallet not found', correlation_id: correlationId }, 404);
    }

    // Fee and commission
    const feeRules = await getActiveFeeRules(c.env.DB, TxnType.DEPOSIT, cur, now);
    const feeResult = calculateFee(amount, feeRules);
    const feeAccountId = feeResult.feeAmount !== '0.00'
      ? (await getOrCreateLedgerAccount(c.env.DB, ActorType.AGENT, 'SYSTEM', AccountType.FEE_REVENUE, cur)).id
      : undefined;

    const commissionRules = await getActiveCommissionRules(c.env.DB, TxnType.DEPOSIT, cur, now);
    const commResult = calculateCommission(amount, commissionRules);
    let commissionEntries: CommissionEntry[] | undefined;
    if (commResult.commissionAmount !== '0.00' && feeAccountId) {
      const agentCommAccount = await getOrCreateLedgerAccount(c.env.DB, ActorType.AGENT, agent_id, AccountType.COMMISSIONS_PAYABLE, cur);
      commissionEntries = [{
        feeRevenueAccountId: feeAccountId,
        agentCommissionAccountId: agentCommAccount.id,
        amount: commResult.commissionAmount,
      }];
    }

    const entries = buildDepositEntries(
      agentCashFloat.id,
      customerWallet.id,
      amount,
      feeAccountId,
      feeResult.feeAmount !== '0.00' ? feeResult.feeAmount : undefined,
      commissionEntries,
    );

    const command: PostTransactionCommand = {
      idempotency_key,
      correlation_id: correlationId,
      txn_type: TxnType.DEPOSIT,
      currency: cur,
      entries,
      description: `Deposit ${amount} ${cur} to ${customer_msisdn}`,
      actor_type: ActorType.AGENT,
      actor_id: agent_id,
      fee_version_id: feeRules[0]?.version_id,
      commission_version_id: commissionRules[0]?.version_id,
    };

    const domainKey = `wallet:${ActorType.AGENT}:${agent_id}:${cur}`;
    const result = await postTransaction(c.env, domainKey, command);

    // Update account_balances — agent available goes down, customer goes up
    await initAccountBalance(c.env.DB, agentCashFloat.id, cur);
    await initAccountBalance(c.env.DB, customerWallet.id, cur);

    const agentBalResult = await getBalance(c.env, domainKey, agentCashFloat.id);
    const agentBalBefore = await getAccountBalance(c.env.DB, agentCashFloat.id);
    await upsertAccountBalance(c.env.DB, {
      account_id: agentCashFloat.id,
      actual_balance: agentBalResult.balance,
      available_balance: agentBalResult.balance,
      hold_amount: agentBalBefore?.hold_amount ?? '0.00',
      pending_credits: '0.00',
      last_journal_id: result.journal_id,
      currency: cur,
      updated_at: now,
    });

    const customerDomainKey = `wallet:${ActorType.CUSTOMER}:${customer.id}:${cur}`;
    const custBalResult = await getBalance(c.env, customerDomainKey, customerWallet.id);
    const custBalBefore = await getAccountBalance(c.env.DB, customerWallet.id);
    await upsertAccountBalance(c.env.DB, {
      account_id: customerWallet.id,
      actual_balance: custBalResult.balance,
      available_balance: custBalResult.balance,
      hold_amount: custBalBefore?.hold_amount ?? '0.00',
      pending_credits: '0.00',
      last_journal_id: result.journal_id,
      currency: cur,
      updated_at: now,
    });

    await emitTxnEvent(c.env, EventName.TXN_POSTED, result.journal_id, correlationId, ActorType.AGENT, agent_id);

    // Emit deposit-specific events
    const depositEvent = {
      id: generateId(),
      name: EventName.DEPOSIT_COMPLETED,
      entity_type: 'journal',
      entity_id: result.journal_id,
      correlation_id: correlationId,
      causation_id: result.journal_id,
      actor_type: ActorType.AGENT,
      actor_id: agent_id,
      schema_version: 1,
      payload_json: JSON.stringify({
        journal_id: result.journal_id,
        customer_msisdn,
        customer_id: customer.id,
        agent_id,
        amount,
        currency: cur,
        customer_balance_after: custBalResult.balance,
        agent_float_balance_after: agentBalResult.balance,
      }),
      created_at: now,
    };
    await insertEvent(c.env.DB, depositEvent);
    await c.env.EVENTS_QUEUE.send(depositEvent);

    return c.json({ ...result, correlation_id: correlationId }, 201);
  } catch (err) {
    return handleTxError(c, err, correlationId);
  }
});

// ---------------------------------------------------------------------------
// POST /tx/withdrawal
// ---------------------------------------------------------------------------
txRoutes.post('/withdrawal', async (c) => {
  const body = await c.req.json();
  const { agent_id, customer_msisdn, amount, currency, idempotency_key, correlation_id: corrId } = body;
  const correlationId = (corrId as string) || generateId();

  if (!agent_id || !customer_msisdn || !amount || !currency || !idempotency_key) {
    return c.json({ error: 'Missing required fields', correlation_id: correlationId }, 400);
  }

  try {
    const cur = currency as CurrencyCode;
    const now = nowISO();

    const customer = await getActorByMsisdn(c.env.DB, customer_msisdn);
    if (!customer) {
      return c.json({ error: 'Customer not found', correlation_id: correlationId }, 404);
    }

    const customerWallet = await getLedgerAccount(c.env.DB, ActorType.CUSTOMER, customer.id, AccountType.WALLET, cur);
    if (!customerWallet) {
      return c.json({ error: 'Customer wallet not found', correlation_id: correlationId }, 404);
    }

    const agentCashFloat = await getLedgerAccount(c.env.DB, ActorType.AGENT, agent_id, AccountType.CASH_FLOAT, cur);
    if (!agentCashFloat) {
      return c.json({ error: 'Agent cash float account not found', correlation_id: correlationId }, 404);
    }

    // Fee and commission
    const feeRules = await getActiveFeeRules(c.env.DB, TxnType.WITHDRAWAL, cur, now);
    const feeResult = calculateFee(amount, feeRules);
    const feeAccountId = feeResult.feeAmount !== '0.00'
      ? (await getOrCreateLedgerAccount(c.env.DB, ActorType.AGENT, 'SYSTEM', AccountType.FEE_REVENUE, cur)).id
      : undefined;

    const commissionRules = await getActiveCommissionRules(c.env.DB, TxnType.WITHDRAWAL, cur, now);
    const commResult = calculateCommission(amount, commissionRules);
    let commissionEntries: CommissionEntry[] | undefined;
    if (commResult.commissionAmount !== '0.00' && feeAccountId) {
      const agentCommAccount = await getOrCreateLedgerAccount(c.env.DB, ActorType.AGENT, agent_id, AccountType.COMMISSIONS_PAYABLE, cur);
      commissionEntries = [{
        feeRevenueAccountId: feeAccountId,
        agentCommissionAccountId: agentCommAccount.id,
        amount: commResult.commissionAmount,
      }];
    }

    const entries = buildWithdrawalEntries(
      customerWallet.id,
      agentCashFloat.id,
      amount,
      feeAccountId,
      feeResult.feeAmount !== '0.00' ? feeResult.feeAmount : undefined,
      commissionEntries,
    );

    const command: PostTransactionCommand = {
      idempotency_key,
      correlation_id: correlationId,
      txn_type: TxnType.WITHDRAWAL,
      currency: cur,
      entries,
      description: `Withdrawal ${amount} ${cur} by ${customer_msisdn}`,
      actor_type: ActorType.AGENT,
      actor_id: agent_id,
      fee_version_id: feeRules[0]?.version_id,
      commission_version_id: commissionRules[0]?.version_id,
    };

    const domainKey = `wallet:${ActorType.CUSTOMER}:${customer.id}:${cur}`;
    const result = await postTransaction(c.env, domainKey, command);

    await emitTxnEvent(c.env, EventName.TXN_POSTED, result.journal_id, correlationId, ActorType.AGENT, agent_id);

    return c.json({ ...result, correlation_id: correlationId }, 201);
  } catch (err) {
    return handleTxError(c, err, correlationId);
  }
});

// ---------------------------------------------------------------------------
// POST /tx/p2p
// ---------------------------------------------------------------------------
txRoutes.post('/p2p', async (c) => {
  const body = await c.req.json();
  const { sender_msisdn, receiver_msisdn, amount, currency, idempotency_key, correlation_id: corrId } = body;
  const correlationId = (corrId as string) || generateId();

  if (!sender_msisdn || !receiver_msisdn || !amount || !currency || !idempotency_key) {
    return c.json({ error: 'Missing required fields', correlation_id: correlationId }, 400);
  }

  try {
    const cur = currency as CurrencyCode;
    const now = nowISO();

    const sender = await getActorByMsisdn(c.env.DB, sender_msisdn);
    if (!sender) return c.json({ error: 'Sender not found', correlation_id: correlationId }, 404);

    const receiver = await getActorByMsisdn(c.env.DB, receiver_msisdn);
    if (!receiver) return c.json({ error: 'Receiver not found', correlation_id: correlationId }, 404);

    const senderWallet = await getLedgerAccount(c.env.DB, ActorType.CUSTOMER, sender.id, AccountType.WALLET, cur);
    if (!senderWallet) return c.json({ error: 'Sender wallet not found', correlation_id: correlationId }, 404);

    const receiverWallet = await getLedgerAccount(c.env.DB, ActorType.CUSTOMER, receiver.id, AccountType.WALLET, cur);
    if (!receiverWallet) return c.json({ error: 'Receiver wallet not found', correlation_id: correlationId }, 404);

    const feeRules = await getActiveFeeRules(c.env.DB, TxnType.P2P, cur, now);
    const feeResult = calculateFee(amount, feeRules);
    const feeAccountId = feeResult.feeAmount !== '0.00'
      ? (await getOrCreateLedgerAccount(c.env.DB, ActorType.AGENT, 'SYSTEM', AccountType.FEE_REVENUE, cur)).id
      : undefined;

    const entries = buildP2PEntries(
      senderWallet.id,
      receiverWallet.id,
      amount,
      feeAccountId,
      feeResult.feeAmount !== '0.00' ? feeResult.feeAmount : undefined,
    );

    const command: PostTransactionCommand = {
      idempotency_key,
      correlation_id: correlationId,
      txn_type: TxnType.P2P,
      currency: cur,
      entries,
      description: `P2P ${amount} ${cur} from ${sender_msisdn} to ${receiver_msisdn}`,
      actor_type: ActorType.CUSTOMER,
      actor_id: sender.id,
      fee_version_id: feeRules[0]?.version_id,
    };

    const domainKey = `wallet:${ActorType.CUSTOMER}:${sender.id}:${cur}`;
    const result = await postTransaction(c.env, domainKey, command);

    await emitTxnEvent(c.env, EventName.TXN_POSTED, result.journal_id, correlationId, ActorType.CUSTOMER, sender.id);

    return c.json({ ...result, correlation_id: correlationId }, 201);
  } catch (err) {
    return handleTxError(c, err, correlationId);
  }
});

// ---------------------------------------------------------------------------
// POST /tx/payment
// ---------------------------------------------------------------------------
txRoutes.post('/payment', async (c) => {
  const body = await c.req.json();
  const { customer_msisdn, store_code, amount, currency, idempotency_key, correlation_id: corrId } = body;
  const correlationId = (corrId as string) || generateId();

  if (!customer_msisdn || !store_code || !amount || !currency || !idempotency_key) {
    return c.json({ error: 'Missing required fields', correlation_id: correlationId }, 400);
  }

  try {
    const cur = currency as CurrencyCode;
    const now = nowISO();

    const customer = await getActorByMsisdn(c.env.DB, customer_msisdn);
    if (!customer) return c.json({ error: 'Customer not found', correlation_id: correlationId }, 404);

    const merchant = await getActorByStoreCode(c.env.DB, store_code);
    if (!merchant) return c.json({ error: 'Merchant not found', correlation_id: correlationId }, 404);

    const customerWallet = await getLedgerAccount(c.env.DB, ActorType.CUSTOMER, customer.id, AccountType.WALLET, cur);
    if (!customerWallet) return c.json({ error: 'Customer wallet not found', correlation_id: correlationId }, 404);

    const merchantWallet = await getLedgerAccount(c.env.DB, ActorType.MERCHANT, merchant.id, AccountType.WALLET, cur);
    if (!merchantWallet) return c.json({ error: 'Merchant wallet not found', correlation_id: correlationId }, 404);

    const feeRules = await getActiveFeeRules(c.env.DB, TxnType.PAYMENT, cur, now);
    const feeResult = calculateFee(amount, feeRules);
    const feeAccountId = feeResult.feeAmount !== '0.00'
      ? (await getOrCreateLedgerAccount(c.env.DB, ActorType.AGENT, 'SYSTEM', AccountType.FEE_REVENUE, cur)).id
      : undefined;

    const entries = buildPaymentEntries(
      customerWallet.id,
      merchantWallet.id,
      amount,
      feeAccountId,
      feeResult.feeAmount !== '0.00' ? feeResult.feeAmount : undefined,
    );

    const command: PostTransactionCommand = {
      idempotency_key,
      correlation_id: correlationId,
      txn_type: TxnType.PAYMENT,
      currency: cur,
      entries,
      description: `Payment ${amount} ${cur} to ${store_code}`,
      actor_type: ActorType.CUSTOMER,
      actor_id: customer.id,
      fee_version_id: feeRules[0]?.version_id,
    };

    const domainKey = `wallet:${ActorType.CUSTOMER}:${customer.id}:${cur}`;
    const result = await postTransaction(c.env, domainKey, command);

    // Update account_balances — customer deducted, merchant credited
    await initAccountBalance(c.env.DB, customerWallet.id, cur);
    await initAccountBalance(c.env.DB, merchantWallet.id, cur);

    const custBalResult = await getBalance(c.env, domainKey, customerWallet.id);
    const custBalBefore = await getAccountBalance(c.env.DB, customerWallet.id);
    await upsertAccountBalance(c.env.DB, {
      account_id: customerWallet.id,
      actual_balance: custBalResult.balance,
      available_balance: custBalResult.balance,
      hold_amount: custBalBefore?.hold_amount ?? '0.00',
      pending_credits: '0.00',
      last_journal_id: result.journal_id,
      currency: cur,
      updated_at: now,
    });

    const merchantDomainKey = `wallet:${ActorType.MERCHANT}:${merchant.id}:${cur}`;
    const merchBalResult = await getBalance(c.env, merchantDomainKey, merchantWallet.id);
    const merchBalBefore = await getAccountBalance(c.env.DB, merchantWallet.id);
    await upsertAccountBalance(c.env.DB, {
      account_id: merchantWallet.id,
      actual_balance: merchBalResult.balance,
      available_balance: merchBalResult.balance,
      hold_amount: merchBalBefore?.hold_amount ?? '0.00',
      pending_credits: '0.00',
      last_journal_id: result.journal_id,
      currency: cur,
      updated_at: now,
    });

    await emitTxnEvent(c.env, EventName.TXN_POSTED, result.journal_id, correlationId, ActorType.CUSTOMER, customer.id);

    // Emit payment-specific events
    const paymentEvent = {
      id: generateId(),
      name: EventName.PAYMENT_COMPLETED,
      entity_type: 'journal',
      entity_id: result.journal_id,
      correlation_id: correlationId,
      causation_id: result.journal_id,
      actor_type: ActorType.CUSTOMER,
      actor_id: customer.id,
      schema_version: 1,
      payload_json: JSON.stringify({
        journal_id: result.journal_id,
        customer_msisdn,
        customer_id: customer.id,
        merchant_id: merchant.id,
        store_code,
        amount,
        currency: cur,
        customer_balance_after: custBalResult.balance,
        merchant_balance_after: merchBalResult.balance,
      }),
      created_at: now,
    };
    await insertEvent(c.env.DB, paymentEvent);
    await c.env.EVENTS_QUEUE.send(paymentEvent);

    return c.json({ ...result, correlation_id: correlationId }, 201);
  } catch (err) {
    return handleTxError(c, err, correlationId);
  }
});

// ---------------------------------------------------------------------------
// POST /tx/b2b
// ---------------------------------------------------------------------------
txRoutes.post('/b2b', async (c) => {
  const body = await c.req.json();
  const { sender_store_code, receiver_store_code, amount, currency, idempotency_key, correlation_id: corrId } = body;
  const correlationId = (corrId as string) || generateId();

  if (!sender_store_code || !receiver_store_code || !amount || !currency || !idempotency_key) {
    return c.json({ error: 'Missing required fields', correlation_id: correlationId }, 400);
  }

  try {
    const cur = currency as CurrencyCode;
    const now = nowISO();

    const sender = await getActorByStoreCode(c.env.DB, sender_store_code);
    if (!sender) return c.json({ error: 'Sender merchant not found', correlation_id: correlationId }, 404);

    const receiver = await getActorByStoreCode(c.env.DB, receiver_store_code);
    if (!receiver) return c.json({ error: 'Receiver merchant not found', correlation_id: correlationId }, 404);

    const senderWallet = await getLedgerAccount(c.env.DB, ActorType.MERCHANT, sender.id, AccountType.WALLET, cur);
    if (!senderWallet) return c.json({ error: 'Sender wallet not found', correlation_id: correlationId }, 404);

    const receiverWallet = await getLedgerAccount(c.env.DB, ActorType.MERCHANT, receiver.id, AccountType.WALLET, cur);
    if (!receiverWallet) return c.json({ error: 'Receiver wallet not found', correlation_id: correlationId }, 404);

    const feeRules = await getActiveFeeRules(c.env.DB, TxnType.B2B, cur, now);
    const feeResult = calculateFee(amount, feeRules);
    const feeAccountId = feeResult.feeAmount !== '0.00'
      ? (await getOrCreateLedgerAccount(c.env.DB, ActorType.AGENT, 'SYSTEM', AccountType.FEE_REVENUE, cur)).id
      : undefined;

    const entries = buildB2BEntries(
      senderWallet.id,
      receiverWallet.id,
      amount,
      feeAccountId,
      feeResult.feeAmount !== '0.00' ? feeResult.feeAmount : undefined,
    );

    const command: PostTransactionCommand = {
      idempotency_key,
      correlation_id: correlationId,
      txn_type: TxnType.B2B,
      currency: cur,
      entries,
      description: `B2B ${amount} ${cur} from ${sender_store_code} to ${receiver_store_code}`,
      actor_type: ActorType.MERCHANT,
      actor_id: sender.id,
      fee_version_id: feeRules[0]?.version_id,
    };

    const domainKey = `wallet:${ActorType.MERCHANT}:${sender.id}:${cur}`;
    const result = await postTransaction(c.env, domainKey, command);

    await emitTxnEvent(c.env, EventName.TXN_POSTED, result.journal_id, correlationId, ActorType.MERCHANT, sender.id);

    return c.json({ ...result, correlation_id: correlationId }, 201);
  } catch (err) {
    return handleTxError(c, err, correlationId);
  }
});

// ---------------------------------------------------------------------------
// POST /tx/reversal/request
// ---------------------------------------------------------------------------
txRoutes.post('/reversal/request', async (c) => {
  const body = await c.req.json();
  const { original_journal_id, reason, staff_id, idempotency_key, correlation_id: corrId } = body;
  const correlationId = (corrId as string) || generateId();

  if (!original_journal_id || !reason || !staff_id || !idempotency_key) {
    return c.json({ error: 'Missing required fields', correlation_id: correlationId }, 400);
  }

  try {
    const now = nowISO();
    const requestId = generateId();

    await insertApprovalRequest(c.env.DB, {
      id: requestId,
      type: ApprovalType.REVERSAL_REQUESTED,
      payload_json: JSON.stringify({ original_journal_id, reason, idempotency_key }),
      maker_staff_id: staff_id,
      state: ApprovalState.PENDING,
      created_at: now,
    });

    // Emit events
    const event = {
      id: generateId(),
      name: EventName.REVERSAL_REQUESTED,
      entity_type: 'approval_request',
      entity_id: requestId,
      correlation_id: correlationId,
      actor_type: ActorType.STAFF,
      actor_id: staff_id,
      schema_version: 1,
      payload_json: JSON.stringify({ original_journal_id, reason, request_id: requestId }),
      created_at: now,
    };
    await insertEvent(c.env.DB, event);
    await c.env.EVENTS_QUEUE.send(event);

    return c.json({
      request_id: requestId,
      state: ApprovalState.PENDING,
      correlation_id: correlationId,
    }, 201);
  } catch (err) {
    return handleTxError(c, err, correlationId);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function emitTxnEvent(
  env: Env,
  eventName: typeof EventName[keyof typeof EventName],
  journalId: string,
  correlationId: string,
  actorType: typeof ActorType[keyof typeof ActorType],
  actorId: string,
): Promise<void> {
  const event = {
    id: generateId(),
    name: eventName,
    entity_type: 'journal',
    entity_id: journalId,
    correlation_id: correlationId,
    causation_id: journalId,
    actor_type: actorType,
    actor_id: actorId,
    schema_version: 1,
    payload_json: JSON.stringify({ journal_id: journalId }),
    created_at: nowISO(),
  };
  await insertEvent(env.DB, event);
  await env.EVENTS_QUEUE.send(event);
}

function handleTxError(
  c: { json: (data: unknown, status?: number) => Response },
  err: unknown,
  correlationId: string,
): Response {
  if (err instanceof IdempotencyConflictError) {
    return c.json({ error: err.message, code: ErrorCode.DUPLICATE_IDEMPOTENCY_CONFLICT, name: err.name, correlation_id: correlationId }, 409);
  }
  if (err instanceof Error) {
    if (err.name === 'InsufficientFundsError') {
      return c.json({ error: err.message, code: ErrorCode.INSUFFICIENT_FUNDS, name: err.name, correlation_id: correlationId }, 409);
    }
    if (err.name === 'UnbalancedJournalError') {
      return c.json({ error: err.message, code: ErrorCode.UNBALANCED_JOURNAL, name: err.name, correlation_id: correlationId }, 422);
    }
    if (err.name === 'IdempotencyConflictError') {
      return c.json({ error: err.message, code: ErrorCode.DUPLICATE_IDEMPOTENCY_CONFLICT, name: 'IdempotencyConflictError', correlation_id: correlationId }, 409);
    }
    if (err.message.includes('Cross-currency')) {
      return c.json({ error: err.message, code: ErrorCode.CROSS_CURRENCY_NOT_ALLOWED, name: 'CrossCurrencyError', correlation_id: correlationId }, 422);
    }
    return c.json({ error: err.message, code: ErrorCode.INTERNAL_ERROR, correlation_id: correlationId }, 500);
  }
  return c.json({ error: 'Internal server error', code: ErrorCode.INTERNAL_ERROR, correlation_id: correlationId }, 500);
}
