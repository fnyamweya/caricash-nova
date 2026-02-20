import { Hono } from 'hono';
import type { Env } from '../index.js';
import { ActorType, AccountType, generateId } from '@caricash/shared';
import type { CurrencyCode } from '@caricash/shared';
import { getLedgerAccount } from '@caricash/db';
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

    const domainKey = `${ownerType}:${ownerId}:${currency}`;
    const result = await getBalance(c.env, domainKey, account.id);

    return c.json({
      owner_type: ownerType,
      owner_id: ownerId,
      currency,
      account_id: account.id,
      balance: result.balance,
      correlation_id: correlationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message, correlation_id: correlationId }, 500);
  }
});
