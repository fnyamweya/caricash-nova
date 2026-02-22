import { Hono } from 'hono';
import { ulid } from 'ulid';

type Env = { Bindings: { DB: D1Database; EVENTS_QUEUE: Queue } };

const settlements = new Hono<Env>();

// GET /merchants/:id/settlement/profile
settlements.get('/:id/settlement/profile', async (c) => {
  const merchant_id = c.req.param('id');
  const profile = await c.env.DB.prepare(
    'SELECT * FROM merchant_settlement_profiles WHERE merchant_id = ? AND status != ? ORDER BY created_at DESC LIMIT 1',
  )
    .bind(merchant_id, 'INACTIVE')
    .first();
  if (!profile) return c.json({ error: 'No active settlement profile' }, 404);
  return c.json(profile);
});

// POST /merchants/:id/settlement/profile/request - Maker creates profile request
settlements.post('/:id/settlement/profile/request', async (c) => {
  const merchant_id = c.req.param('id');
  const body = await c.req.json<{
    bank_account_id: string;
    schedule?: string;
    mode?: string;
    min_payout_amount?: string;
    max_payout_amount?: string;
    daily_cap?: string;
    require_two_approvals_above?: string;
    staff_id: string;
  }>();

  const id = ulid();
  await c.env.DB.prepare(
    `INSERT INTO merchant_settlement_profiles (id, merchant_id, bank_account_id, schedule, mode, min_payout_amount, max_payout_amount, daily_cap, require_two_approvals_above, status, created_by_staff_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_APPROVAL', ?)`,
  )
    .bind(
      id,
      merchant_id,
      body.bank_account_id,
      body.schedule || 'T1',
      body.mode || 'AUTO',
      body.min_payout_amount || '100.00',
      body.max_payout_amount || '500000.00',
      body.daily_cap || '1000000.00',
      body.require_two_approvals_above || '50000.00',
      body.staff_id,
    )
    .run();

  return c.json({ id, status: 'PENDING_APPROVAL' }, 201);
});

// POST /merchants/:id/settlement/profile/:profileId/approve
settlements.post('/:id/settlement/profile/:profileId/approve', async (c) => {
  const profile_id = c.req.param('profileId');
  const body = await c.req.json<{ staff_id: string }>();
  const now = new Date().toISOString();

  const profile = await c.env.DB.prepare('SELECT * FROM merchant_settlement_profiles WHERE id = ?')
    .bind(profile_id)
    .first();
  if (!profile) return c.json({ error: 'Profile not found' }, 404);
  if (profile.status !== 'PENDING_APPROVAL') return c.json({ error: 'Profile not pending approval' }, 409);
  if (profile.created_by_staff_id === body.staff_id)
    return c.json({ error: 'Maker cannot approve own request' }, 403);

  await c.env.DB.prepare(
    'UPDATE merchant_settlement_profiles SET status = ?, approved_by_staff_id = ?, approved_at = ? WHERE id = ?',
  )
    .bind('ACTIVE', body.staff_id, now, profile_id)
    .run();

  return c.json({ id: profile_id, status: 'ACTIVE' });
});

// POST /merchants/:id/settlement/profile/:profileId/reject
settlements.post('/:id/settlement/profile/:profileId/reject', async (c) => {
  const profile_id = c.req.param('profileId');

  await c.env.DB.prepare(
    'UPDATE merchant_settlement_profiles SET status = ? WHERE id = ? AND status = ?',
  )
    .bind('INACTIVE', profile_id, 'PENDING_APPROVAL')
    .run();

  return c.json({ id: profile_id, status: 'INACTIVE' });
});

// GET /merchants/:id/settlements - Settlement history
settlements.get('/:id/settlements', async (c) => {
  const merchant_id = c.req.param('id');
  const status = c.req.query('status');
  let query = 'SELECT * FROM settlement_batches WHERE merchant_id = ?';
  const params: string[] = [merchant_id];
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  query += ' ORDER BY created_at DESC LIMIT 50';
  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ batches: results });
});

// POST /merchants/:id/settlements/request-payout - Manual payout request
settlements.post('/:id/settlements/request-payout', async (c) => {
  const merchant_id = c.req.param('id');
  const body = await c.req.json<{
    amount: string;
    currency?: string;
    bank_account_id: string;
    staff_id: string;
  }>();

  const profile = await c.env.DB.prepare(
    'SELECT * FROM merchant_settlement_profiles WHERE merchant_id = ? AND status = ? LIMIT 1',
  )
    .bind(merchant_id, 'ACTIVE')
    .first();

  const amount = parseFloat(body.amount);
  const approvals_required =
    profile && amount > parseFloat(String(profile.require_two_approvals_above || '50000')) ? 2 : 1;

  const id = ulid();
  await c.env.DB.prepare(
    `INSERT INTO merchant_payouts (id, merchant_id, currency, amount, bank_account_id, status, approvals_required, created_by_staff_id)
     VALUES (?, ?, ?, ?, ?, 'REQUESTED', ?, ?)`,
  )
    .bind(id, merchant_id, body.currency || 'BBD', body.amount, body.bank_account_id, approvals_required, body.staff_id)
    .run();

  return c.json({ id, status: 'REQUESTED', approvals_required }, 201);
});

// GET /merchants/:id/payouts/:payoutId
settlements.get('/:id/payouts/:payoutId', async (c) => {
  const payout_id = c.req.param('payoutId');
  const payout = await c.env.DB.prepare('SELECT * FROM merchant_payouts WHERE id = ?').bind(payout_id).first();
  if (!payout) return c.json({ error: 'Payout not found' }, 404);
  return c.json(payout);
});

export default settlements;
