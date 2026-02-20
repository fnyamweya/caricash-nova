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

export interface Env {
  DB: D1Database;
  POSTING_DO: DurableObjectNamespace;
  EVENTS_QUEUE: Queue;
  PIN_PEPPER: string;
}

const app = new Hono<{ Bindings: Env }>();
app.use('*', cors());

app.route('/auth', authRoutes);
app.route('/customers', customerRoutes);
app.route('/agents', agentRoutes);
app.route('/merchants', merchantRoutes);
app.route('/tx', txRoutes);
app.route('/approvals', approvalRoutes);
app.route('/wallets', walletRoutes);
app.route('/ops', opsRoutes);

app.get('/', (c) => c.json({ service: 'CariCash Nova API', version: '0.2.0' }));

export default app;
// Re-export PostingDO for wrangler
export { PostingDO } from '@caricash/posting-do';
