import { Hono } from 'hono';
import { ulid } from 'ulid';

type Env = { Bindings: { DB: D1Database } };

const fraud = new Hono<Env>();

// GET /ops/fraud/decisions - Query fraud decisions
fraud.get('/decisions', async (c) => {
  const contextType = c.req.query('contextType');
  const contextId = c.req.query('contextId');
  let query = 'SELECT * FROM fraud_decisions WHERE 1=1';
  const params: string[] = [];
  if (contextType) {
    query += ' AND context_type = ?';
    params.push(contextType);
  }
  if (contextId) {
    query += ' AND context_id = ?';
    params.push(contextId);
  }
  query += ' ORDER BY created_at DESC LIMIT 50';
  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ decisions: results });
});

// GET /ops/fraud/signals - Query fraud signals
fraud.get('/signals', async (c) => {
  const actorType = c.req.query('actorType');
  const actorId = c.req.query('actorId');
  let query = 'SELECT * FROM fraud_signals WHERE 1=1';
  const params: string[] = [];
  if (actorType) {
    query += ' AND actor_type = ?';
    params.push(actorType);
  }
  if (actorId) {
    query += ' AND actor_id = ?';
    params.push(actorId);
  }
  query += ' ORDER BY created_at DESC LIMIT 50';
  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ signals: results });
});

// POST /ops/fraud/rules/version/request - Create new fraud rules version (maker)
fraud.post('/rules/version/request', async (c) => {
  const body = await c.req.json<{
    staff_id: string;
    rules: {
      name: string;
      applies_to_context: string;
      severity: string;
      action: string;
      conditions_json: string;
      priority: number;
    }[];
  }>();

  const version_id = ulid();
  await c.env.DB.prepare(
    `INSERT INTO fraud_rules_versions (id, status, created_by_staff_id)
     VALUES (?, 'DRAFT', ?)`,
  )
    .bind(version_id, body.staff_id)
    .run();

  for (const rule of body.rules) {
    const rule_id = ulid();
    await c.env.DB.prepare(
      `INSERT INTO fraud_rules (id, version_id, name, applies_to_context, severity, action, conditions_json, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        rule_id,
        version_id,
        rule.name,
        rule.applies_to_context,
        rule.severity,
        rule.action,
        rule.conditions_json,
        rule.priority,
      )
      .run();
  }

  return c.json({ version_id, status: 'DRAFT', rule_count: body.rules.length }, 201);
});

// POST /ops/fraud/rules/version/:id/approve - Approve fraud rules version (checker)
fraud.post('/rules/version/:id/approve', async (c) => {
  const version_id = c.req.param('id');
  const body = await c.req.json<{ staff_id: string }>();
  const now = new Date().toISOString();

  const version = await c.env.DB.prepare('SELECT * FROM fraud_rules_versions WHERE id = ?')
    .bind(version_id)
    .first();
  if (!version) return c.json({ error: 'Version not found' }, 404);
  if (version.status !== 'DRAFT' && version.status !== 'PENDING_APPROVAL') {
    return c.json({ error: 'Version not in approvable state' }, 409);
  }
  if (version.created_by_staff_id === body.staff_id) {
    return c.json({ error: 'Maker cannot approve own request' }, 403);
  }

  // Deactivate previous active version
  await c.env.DB.prepare('UPDATE fraud_rules_versions SET status = ? WHERE status = ?')
    .bind('INACTIVE', 'ACTIVE')
    .run();

  // Activate new version
  await c.env.DB.prepare(
    'UPDATE fraud_rules_versions SET status = ?, approved_by_staff_id = ?, approved_at = ? WHERE id = ?',
  )
    .bind('ACTIVE', body.staff_id, now, version_id)
    .run();

  return c.json({ version_id, status: 'ACTIVE' });
});

// GET /ops/fraud/rules/version/:id - Get fraud rules version with rules
fraud.get('/rules/version/:id', async (c) => {
  const version_id = c.req.param('id');
  const version = await c.env.DB.prepare('SELECT * FROM fraud_rules_versions WHERE id = ?')
    .bind(version_id)
    .first();
  if (!version) return c.json({ error: 'Version not found' }, 404);

  const { results: rules } = await c.env.DB.prepare(
    'SELECT * FROM fraud_rules WHERE version_id = ? ORDER BY priority',
  )
    .bind(version_id)
    .all();

  return c.json({ ...version, rules });
});

export default fraud;
