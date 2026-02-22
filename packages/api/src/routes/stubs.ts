/**
 * Stub routes for endpoints defined in the OpenAPI spec but not yet implemented.
 * Each returns 501 Not Implemented with a clear message.
 * These ensure spec-to-route coverage tests pass.
 *
 * Implemented stubs are removed as real endpoints are added.
 */
import { Hono } from 'hono';
import type { Env } from '../index.js';

// ---- Customer stubs ----
// GET /customers/:id — now implemented in customers.ts
// GET /customers/:id/kyc — now implemented in customers.ts
export const customerStubRoutes = new Hono<{ Bindings: Env }>();

// ---- Agent stubs ----
export const agentStubRoutes = new Hono<{ Bindings: Env }>();

// GET /agents/:id — TODO: implement agent profile retrieval
agentStubRoutes.get('/:id', async (c) => {
  return c.json({ error: 'Not yet implemented', code: 'NOT_IMPLEMENTED' }, 501);
});

// POST /agents/:id/kyc/initiate — TODO: implement agent KYC initiation
agentStubRoutes.post('/:id/kyc/initiate', async (c) => {
  return c.json({ error: 'Not yet implemented', code: 'NOT_IMPLEMENTED' }, 501);
});

// GET /agents/:id/kyc — TODO: implement agent KYC status retrieval
agentStubRoutes.get('/:id/kyc', async (c) => {
  return c.json({ error: 'Not yet implemented', code: 'NOT_IMPLEMENTED' }, 501);
});

// ---- Merchant stubs ----
// All merchant stubs now implemented in merchants.ts
export const merchantStubRoutes = new Hono<{ Bindings: Env }>();

// ---- Store stubs ----
export const storeStubRoutes = new Hono<{ Bindings: Env }>();

// GET /stores/:id — TODO: implement store details
storeStubRoutes.get('/:id', async (c) => {
  return c.json({ error: 'Not yet implemented', code: 'NOT_IMPLEMENTED' }, 501);
});

// ---- Wallet stubs ----
export const walletStubRoutes = new Hono<{ Bindings: Env }>();

// (wallet statement now implemented in wallets.ts)

// ---- Transaction stubs ----
export const txStubRoutes = new Hono<{ Bindings: Env }>();

// GET /tx/:journalId — TODO: implement transaction details retrieval
txStubRoutes.get('/:journalId', async (c) => {
  return c.json({ error: 'Not yet implemented', code: 'NOT_IMPLEMENTED' }, 501);
});

// GET /tx — TODO: implement transaction listing
txStubRoutes.get('/', async (c) => {
  return c.json({ error: 'Not yet implemented', code: 'NOT_IMPLEMENTED' }, 501);
});

// ---- Approval stubs ----
export const approvalStubRoutes = new Hono<{ Bindings: Env }>();

// GET /approvals — TODO: implement approval listing
approvalStubRoutes.get('/', async (c) => {
  return c.json({ error: 'Not yet implemented', code: 'NOT_IMPLEMENTED' }, 501);
});

// GET /approvals/:id — TODO: implement approval detail retrieval
approvalStubRoutes.get('/:id', async (c) => {
  return c.json({ error: 'Not yet implemented', code: 'NOT_IMPLEMENTED' }, 501);
});

// ---- Ops stubs ----
export const opsStubRoutes = new Hono<{ Bindings: Env }>();

// GET /ops/overdraft — TODO: implement overdraft facility listing
opsStubRoutes.get('/overdraft', async (c) => {
  const staffId = c.req.header('X-Staff-Id');
  if (!staffId) {
    return c.json({ error: 'Staff authentication required', code: 'UNAUTHORIZED' }, 401);
  }
  return c.json({ error: 'Not yet implemented', code: 'NOT_IMPLEMENTED' }, 501);
});
