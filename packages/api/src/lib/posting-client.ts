import type { PostTransactionCommand, PostTransactionResult } from '@caricash/shared';
import type { Env } from '../index.js';

export async function postTransaction(
  env: Env,
  domainKey: string,
  command: PostTransactionCommand,
): Promise<PostTransactionResult> {
  const id = env.POSTING_DO.idFromName(domainKey);
  const stub = env.POSTING_DO.get(id);

  const response = await stub.fetch('https://posting-do/post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    const body = (await response.json()) as { error: string; name: string };
    const err = new Error(body.error);
    err.name = body.name;
    throw err;
  }

  return (await response.json()) as PostTransactionResult;
}

export async function getBalance(
  env: Env,
  domainKey: string,
  accountId: string,
): Promise<{ account_id: string; balance: string }> {
  const id = env.POSTING_DO.idFromName(domainKey);
  const stub = env.POSTING_DO.get(id);

  const response = await stub.fetch(
    `https://posting-do/balance?account_id=${encodeURIComponent(accountId)}`,
  );

  if (!response.ok) {
    const body = (await response.json()) as { error: string };
    throw new Error(body.error);
  }

  return (await response.json()) as { account_id: string; balance: string };
}
