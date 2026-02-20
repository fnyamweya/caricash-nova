import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './routes/auth.js';
import { customerRoutes } from './routes/customers.js';
import { agentRoutes } from './routes/agents.js';
import { merchantRoutes } from './routes/merchants.js';
import { txRoutes } from './routes/tx.js';
import { approvalRoutes } from './routes/approvals.js';
import { walletRoutes } from './routes/wallets.js';
import { opsRoutes } from './routes/ops.js';
import { docsRoutes } from './routes/docs.js';
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
app.route('/tx', txRoutes);
app.route('/approvals', approvalRoutes);
app.route('/wallets', walletRoutes);
app.route('/ops', opsRoutes);

// Stub routes (spec-required endpoints not yet fully implemented)
app.route('/customers', customerStubRoutes);
app.route('/agents', agentStubRoutes);
app.route('/merchants', merchantStubRoutes);
app.route('/stores', storeStubRoutes);
app.route('/wallets', walletStubRoutes);
app.route('/tx', txStubRoutes);
app.route('/approvals', approvalStubRoutes);
app.route('/ops', opsStubRoutes);

// Documentation routes (Swagger UI + OpenAPI spec)
app.route('', docsRoutes);

app.get('/', (c) => c.json({ service: 'CariCash Nova API', version: '0.2.0' }));

export default app;
// Re-export PostingDO for wrangler
export { PostingDO } from '@caricash/posting-do';
