import { Hono } from 'hono';
import { ulid } from 'ulid';

type Env = { Bindings: { DB: D1Database; EVENTS_QUEUE: Queue } };

const opsPhase4 = new Hono<Env>();

// GET /ops/external-transfers - List external transfers
opsPhase4.get('/external-transfers', async (c) => {
  const status = c.req.query('status');
  let query = 'SELECT * FROM external_transfers';
  const params: string[] = [];
  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }
  query += ' ORDER BY initiated_at DESC LIMIT 100';
  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ transfers: results });
});

// GET /ops/external-transfers/:id
opsPhase4.get('/external-transfers/:id', async (c) => {
  const id = c.req.param('id');
  const transfer = await c.env.DB.prepare('SELECT * FROM external_transfers WHERE id = ?').bind(id).first();
  if (!transfer) return c.json({ error: 'Transfer not found' }, 404);
  return c.json(transfer);
});

// POST /ops/external-transfers/:id/retry - Retry failed transfer
opsPhase4.post('/external-transfers/:id/retry', async (c) => {
  const id = c.req.param('id');
  const transfer = await c.env.DB.prepare(
    'SELECT * FROM external_transfers WHERE id = ? AND status = ?',
  )
    .bind(id, 'FAILED')
    .first();
  if (!transfer) return c.json({ error: 'Transfer not found or not failed' }, 404);

  await c.env.DB.prepare('UPDATE external_transfers SET status = ?, failure_reason = NULL WHERE id = ?')
    .bind('CREATED', id)
    .run();

  return c.json({ id, status: 'CREATED', message: 'Transfer queued for retry' });
});

// GET /ops/settlement/batches - List settlement batches
opsPhase4.get('/settlement/batches', async (c) => {
  const status = c.req.query('status');
  let query = 'SELECT * FROM settlement_batches';
  const params: string[] = [];
  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }
  query += ' ORDER BY created_at DESC LIMIT 100';
  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ batches: results });
});

// POST /ops/settlement/batches/run - Trigger settlement batch creation
opsPhase4.post('/settlement/batches/run', async (c) => {
  const correlation_id = c.req.header('X-Correlation-ID') || ulid();
  const { results: profiles } = await c.env.DB.prepare(
    'SELECT * FROM merchant_settlement_profiles WHERE status = ? AND mode = ?',
  )
    .bind('ACTIVE', 'AUTO')
    .all();

  const now = new Date().toISOString();
  const batches_created: string[] = [];

  for (const profile of profiles) {
    const batch_id = ulid();
    await c.env.DB.prepare(
      `INSERT INTO settlement_batches (id, merchant_id, currency, period_start, period_end, schedule, mode, status, total_amount, total_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'CREATED', '0', 0)`,
    )
      .bind(batch_id, profile.merchant_id, profile.currency, now, now, profile.schedule, profile.mode)
      .run();
    batches_created.push(batch_id);
  }

  return c.json({ batches_created, count: batches_created.length, correlation_id });
});

// POST /ops/settlement/payouts/:id/approve - Approve a payout
opsPhase4.post('/settlement/payouts/:id/approve', async (c) => {
  const payout_id = c.req.param('id');
  const body = await c.req.json<{ staff_id: string }>();
  const now = new Date().toISOString();

  const payout = await c.env.DB.prepare('SELECT * FROM merchant_payouts WHERE id = ?').bind(payout_id).first();
  if (!payout) return c.json({ error: 'Payout not found' }, 404);
  if (payout.status !== 'REQUESTED') return c.json({ error: 'Payout not in requested state' }, 409);
  if (payout.created_by_staff_id === body.staff_id)
    return c.json({ error: 'Maker cannot approve own payout' }, 403);

  await c.env.DB.prepare('UPDATE merchant_payouts SET status = ?, updated_at = ? WHERE id = ?')
    .bind('APPROVED', now, payout_id)
    .run();

  return c.json({ id: payout_id, status: 'APPROVED' });
});

// POST /ops/settlement/payouts/:id/reject - Reject a payout
opsPhase4.post('/settlement/payouts/:id/reject', async (c) => {
  const payout_id = c.req.param('id');

  await c.env.DB.prepare('UPDATE merchant_payouts SET status = ? WHERE id = ? AND status = ?')
    .bind('CANCELLED', payout_id, 'REQUESTED')
    .run();

  return c.json({ id: payout_id, status: 'CANCELLED' });
});

// POST /ops/webhooks/replay/:deliveryId - Replay a webhook delivery
opsPhase4.post('/webhooks/replay/:deliveryId', async (c) => {
  const delivery_id = c.req.param('deliveryId');
  const delivery = await c.env.DB.prepare('SELECT * FROM bank_webhook_deliveries WHERE id = ?')
    .bind(delivery_id)
    .first();
  if (!delivery) return c.json({ error: 'Delivery not found' }, 404);

  await c.env.DB.prepare('UPDATE bank_webhook_deliveries SET status = ? WHERE id = ?')
    .bind('RECEIVED', delivery_id)
    .run();

  return c.json({ delivery_id, status: 'RECEIVED', message: 'Delivery queued for reprocessing' });
});

export default opsPhase4;
