import { Hono } from 'hono';
import { ulid } from 'ulid';

type Env = { Bindings: { DB: D1Database; EVENTS_QUEUE: Queue } };

const bank = new Hono<Env>();

// POST /bank/deposits/initiate - Create deposit intent
bank.post('/deposits/initiate', async (c) => {
  const body = await c.req.json<{
    customer_id: string;
    amount: string;
    currency: string;
    idempotency_key: string;
  }>();
  const { customer_id, amount, currency, idempotency_key } = body;
  if (!customer_id || !amount || !currency || !idempotency_key) {
    return c.json({ error: 'Missing required fields' }, 400);
  }
  const id = ulid();
  const client_reference = `DEP-${id}`;
  const correlation_id = c.req.header('X-Correlation-ID') || ulid();

  await c.env.DB.prepare(
    `INSERT INTO external_transfers (id, provider, client_reference, direction, transfer_type, currency, amount, status, correlation_id, initiated_by_actor_type, initiated_by_actor_id, idempotency_scope_hash)
     VALUES (?, 'CITIBANK', ?, 'INBOUND', 'CUSTOMER_BANK_DEPOSIT', ?, ?, 'CREATED', ?, 'CUSTOMER', ?, ?)`,
  )
    .bind(id, client_reference, currency, amount, correlation_id, customer_id, idempotency_key)
    .run();

  return c.json({ id, client_reference, status: 'CREATED', correlation_id }, 201);
});

// GET /bank/deposits/:id - Get deposit status
bank.get('/deposits/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM external_transfers WHERE id = ? AND transfer_type = ?')
    .bind(id, 'CUSTOMER_BANK_DEPOSIT')
    .first();
  if (!row) return c.json({ error: 'Deposit not found' }, 404);
  return c.json(row);
});

// POST /bank/webhooks/citibank - Webhook receiver (signature verification required)
bank.post('/webhooks/citibank', async (c) => {
  const rawBody = await c.req.text();

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const event_id = `${payload.bank_transfer_id}:${payload.status}`;
  const delivery_id = ulid();

  // Check duplicate delivery
  const existing = await c.env.DB.prepare(
    'SELECT id FROM bank_webhook_deliveries WHERE provider = ? AND event_id = ?',
  )
    .bind('CITIBANK', event_id)
    .first();

  if (existing) {
    return c.json({ status: 'duplicate', delivery_id: existing.id }, 200);
  }

  // Record delivery
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawBody));
  const payloadHash = [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
  await c.env.DB.prepare(
    `INSERT INTO bank_webhook_deliveries (id, provider, event_id, transfer_id, status, payload_hash)
     VALUES (?, 'CITIBANK', ?, ?, 'RECEIVED', ?)`,
  )
    .bind(delivery_id, event_id, payload.bank_transfer_id, payloadHash)
    .run();

  // Find matching external transfer
  const transfer = await c.env.DB.prepare(
    'SELECT * FROM external_transfers WHERE client_reference = ? OR provider_transfer_id = ?',
  )
    .bind(String(payload.client_reference || ''), String(payload.bank_transfer_id || ''))
    .first();

  if (!transfer) {
    await c.env.DB.prepare('UPDATE bank_webhook_deliveries SET status = ? WHERE id = ?')
      .bind('FAILED', delivery_id)
      .run();
    return c.json({ status: 'unmatched', delivery_id }, 200);
  }

  // Update transfer status based on webhook
  const now = new Date().toISOString();
  if (payload.status === 'SETTLED') {
    await c.env.DB.prepare(
      'UPDATE external_transfers SET status = ?, settled_at = ?, provider_transfer_id = ? WHERE id = ?',
    )
      .bind('SETTLED', now, payload.bank_transfer_id, transfer.id)
      .run();
  } else if (payload.status === 'FAILED') {
    await c.env.DB.prepare(
      'UPDATE external_transfers SET status = ?, failure_reason = ?, provider_transfer_id = ? WHERE id = ?',
    )
      .bind('FAILED', String(payload.failure_reason || 'Bank reported failure'), payload.bank_transfer_id, transfer.id)
      .run();
  } else if (payload.status === 'PENDING') {
    await c.env.DB.prepare(
      'UPDATE external_transfers SET status = ?, provider_transfer_id = ? WHERE id = ?',
    )
      .bind('PENDING', payload.bank_transfer_id, transfer.id)
      .run();
  }

  // Mark delivery processed
  await c.env.DB.prepare('UPDATE bank_webhook_deliveries SET status = ? WHERE id = ?')
    .bind('PROCESSED', delivery_id)
    .run();

  return c.json({ status: 'processed', delivery_id, transfer_id: transfer.id }, 200);
});

export default bank;
