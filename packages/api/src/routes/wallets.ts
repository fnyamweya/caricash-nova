import { Hono } from 'hono';
import type { Env } from '../index.js';
import { ActorType, AccountType, generateId } from '@caricash/shared';
import type { CurrencyCode } from '@caricash/shared';
import { getLedgerAccount, getAccountBalance, getAccountBalancesByOwner, getAccountStatement } from '@caricash/db';
import { getBalance } from '../lib/posting-client.js';

export const walletRoutes = new Hono<{ Bindings: Env }>();

// GET /wallets/:owner_type/:owner_id/:currency/balance
walletRoutes.get('/:owner_type/:owner_id/:currency/balance', async (c) => {
  const ownerType = c.req.param('owner_type') as typeof ActorType[keyof typeof ActorType];
  const ownerId = c.req.param('owner_id');
  const currency = c.req.param('currency') as CurrencyCode;
  const correlationId = generateId();

  try {
    const account = await getLedgerAccount(c.env.DB, ownerType, ownerId, AccountType.WALLET, currency);
    if (!account) {
      return c.json({ error: 'Wallet account not found', correlation_id: correlationId }, 404);
    }

    const domainKey = `wallet:${ownerType}:${ownerId}:${currency}`;
    const result = await getBalance(c.env, domainKey, account.id);

    // Also return actual/available from account_balances if available
    const acctBal = await getAccountBalance(c.env.DB, account.id);

    return c.json({
      owner_type: ownerType,
      owner_id: ownerId,
      currency,
      account_id: account.id,
      balance: result.balance,
      actual_balance: acctBal?.actual_balance ?? result.balance,
      available_balance: acctBal?.available_balance ?? result.balance,
      hold_amount: acctBal?.hold_amount ?? '0.00',
      pending_credits: acctBal?.pending_credits ?? '0.00',
      correlation_id: correlationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});

// GET /wallets/:owner_type/:owner_id/:currency/all-balances
// Returns balances for all account types (wallet, cash_float, commissions, etc.)
walletRoutes.get('/:owner_type/:owner_id/:currency/all-balances', async (c) => {
  const ownerType = c.req.param('owner_type') as typeof ActorType[keyof typeof ActorType];
  const ownerId = c.req.param('owner_id');
  const currency = c.req.param('currency') as CurrencyCode;
  const correlationId = generateId();

  try {
    const balances = await getAccountBalancesByOwner(c.env.DB, ownerType, ownerId, currency);

    return c.json({
      owner_type: ownerType,
      owner_id: ownerId,
      currency,
      accounts: balances,
      correlation_id: correlationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});

// GET /wallets/:owner_type/:owner_id/:currency/statement
// Returns account statement (journal lines) for the owner's wallet account
walletRoutes.get('/:owner_type/:owner_id/:currency/statement', async (c) => {
  const ownerType = c.req.param('owner_type') as typeof ActorType[keyof typeof ActorType];
  const ownerId = c.req.param('owner_id');
  const currency = c.req.param('currency') as CurrencyCode;
  const correlationId = generateId();

  const from = c.req.query('from');
  const to = c.req.query('to');
  const limit = c.req.query('limit') ? Number(c.req.query('limit')) : 50;

  try {
    const account = await getLedgerAccount(c.env.DB, ownerType, ownerId, AccountType.WALLET, currency);
    if (!account) {
      return c.json({ error: 'Wallet account not found', correlation_id: correlationId }, 404);
    }

    const rows = await getAccountStatement(c.env.DB, account.id, from, to, limit);

    return c.json({
      owner_type: ownerType,
      owner_id: ownerId,
      currency,
      account_id: account.id,
      entries: rows,
      count: rows.length,
      correlation_id: correlationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});
