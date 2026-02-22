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

app.get('/', (c) => c.json({ service: 'CariCash Nova API', version: '0.2.0' }));

export default app;
// Re-export PostingDO for wrangler
export { PostingDO } from '@caricash/posting-do';
