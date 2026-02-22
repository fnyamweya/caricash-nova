import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './routes/auth.js';
import { customerRoutes } from './routes/customers.js';
import { agentRoutes } from './routes/agents.js';
import { merchantRoutes } from './routes/merchants.js';
import { actorRoutes } from './routes/actors.js';
import { merchantUserRoutes } from './routes/merchant-users.js';
import { txRoutes } from './routes/tx.js';
import { approvalRoutes } from './routes/approvals.js';
import { policyRoutes, delegationRoutes } from './routes/approval-policies.js';
import { typeConfigRoutes, endpointBindingRoutes } from './routes/approval-type-configs.js';
import { walletRoutes } from './routes/wallets.js';
import { floatRoutes } from './routes/float.js';
import { opsRoutes } from './routes/ops.js';
import { docsRoutes } from './routes/docs.js';
import { codeRoutes } from './routes/codes.js';
import { staffRoutes } from './routes/staff.js';
import bank from './routes/bank.js';
import settlements from './routes/settlements.js';
import fraud from './routes/fraud.js';
import opsPhase4 from './routes/ops-phase4.js';
import {
  customerStubRoutes,
  agentStubRoutes,
  merchantStubRoutes,
  storeStubRoutes,
  walletStubRoutes,
  txStubRoutes,
  approvalStubRoutes,
  opsStubRoutes,
} from './routes/stubs.js';

export interface Env {
  DB: D1Database;
  POSTING_DO: DurableObjectNamespace;
  EVENTS_QUEUE: Queue;
  PIN_PEPPER: string;
}

const app = new Hono<{ Bindings: Env }>();
app.use('*', cors());

// Core routes
app.route('/auth', authRoutes);
app.route('/customers', customerRoutes);
app.route('/agents', agentRoutes);
app.route('/merchants', merchantRoutes);
app.route('/actors', actorRoutes);
app.route('/merchants', merchantUserRoutes);
app.route('/tx', txRoutes);
app.route('/approvals/policies', policyRoutes);
app.route('/approvals/delegations', delegationRoutes);
app.route('/approvals/types/config', typeConfigRoutes);
app.route('/approvals/endpoint-bindings', endpointBindingRoutes);
app.route('/approvals', approvalRoutes);
app.route('/wallets', walletRoutes);
app.route('/float', floatRoutes);
app.route('/ops', opsRoutes);
app.route('/codes', codeRoutes);
app.route('/staff', staffRoutes);
app.route('/bank', bank);
app.route('/merchants', settlements);
app.route('/ops/fraud', fraud);
app.route('/ops', opsPhase4);

// Stub routes (spec-required endpoints not yet fully implemented)
app.route('/customers', customerStubRoutes);
app.route('/agents', agentStubRoutes);
app.route('/merchants', merchantStubRoutes);
app.route('/stores', storeStubRoutes);
app.route('/wallets', walletStubRoutes);
app.route('/tx', txStubRoutes);
app.route('/ops', opsStubRoutes);
app.route('/approvals', approvalStubRoutes);

// Documentation routes (Swagger UI + OpenAPI spec)
app.route('', docsRoutes);

app.get('/health', (c) =>
  c.json({ status: 'ok', service: 'CariCash Nova API', version: '0.2.0', timestamp: new Date().toISOString() }),
);

// Section N: Readiness endpoint
app.get('/readiness', async (c) => {
  const checks: Record<string, unknown> = {};
  // DB connectivity check
  try {
    await c.env.DB.prepare('SELECT 1').first();
    checks.db = 'ok';
  } catch {
    checks.db = 'error';
  }
  // Last reconciliation check
  try {
    const lastRecon = await c.env.DB.prepare(
      'SELECT id, created_at FROM reconciliation_runs ORDER BY created_at DESC LIMIT 1',
    ).first();
    checks.last_reconciliation = lastRecon ? lastRecon.created_at : 'never';
  } catch {
    checks.last_reconciliation = 'unknown';
  }
  // Pending webhooks (queue depth proxy)
  try {
    const pending = await c.env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM bank_webhook_deliveries WHERE status = 'RECEIVED'",
    ).first();
    checks.pending_webhooks = pending?.cnt ?? 0;
  } catch {
    checks.pending_webhooks = 'unknown';
  }
  const allOk = checks.db === 'ok';
  return c.json({
    status: allOk ? 'ready' : 'degraded',
    service: 'CariCash Nova API',
    version: '0.2.0',
    timestamp: new Date().toISOString(),
    checks,
  }, allOk ? 200 : 503);
});

app.get('/', (c) => c.json({ service: 'CariCash Nova API', version: '0.2.0' }));

export default app;
// Re-export PostingDO for wrangler
export { PostingDO } from '@caricash/posting-do';
