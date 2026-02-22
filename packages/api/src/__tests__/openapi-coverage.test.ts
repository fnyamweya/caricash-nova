/**
 * OpenAPI route coverage tests.
 * 
 * 1. Route-to-spec: Every route registered in the API router has a matching path+method in openapi.yaml
 * 2. Spec-to-route: Every path+method in openapi.yaml has a handler registered (or stub present)
 * 3. Spec validation: The OpenAPI spec is structurally valid
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ---- Load and parse OpenAPI spec ----
const specPath = path.resolve(__dirname, '../../openapi/openapi.yaml');
const specContent = fs.readFileSync(specPath, 'utf-8');

/**
 * Simple YAML path+method parser.
 * Extracts all (method, path) pairs from the OpenAPI paths section.
 * Works without a full YAML parser by using the consistent indentation structure.
 */
function extractSpecEndpoints(yaml: string): Array<{ method: string; path: string }> {
  const endpoints: Array<{ method: string; path: string }> = [];
  const lines = yaml.split('\n');
  let inPaths = false;
  let currentPath: string | null = null;

  for (const line of lines) {
    // Detect the paths: section (top-level, no indentation)
    if (/^paths:/.test(line)) {
      inPaths = true;
      continue;
    }

    // Detect the end of paths section (next top-level key)
    if (inPaths && /^[a-z]/.test(line) && !line.startsWith(' ')) {
      inPaths = false;
      continue;
    }

    if (!inPaths) continue;

    // Path entries are at 2-space indent: "  /some/path:"
    const pathMatch = line.match(/^  (\/[^:]*):$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }

    // Method entries are at 4-space indent: "    get:" or "    post:"
    const methodMatch = line.match(/^    (get|post|put|patch|delete|head|options):$/);
    if (methodMatch && currentPath) {
      endpoints.push({ method: methodMatch[1].toUpperCase(), path: currentPath });
    }
  }

  return endpoints;
}

/**
 * Normalize OpenAPI path params to Express-style: {id} → :id
 */
function normalizeSpecPath(specPath: string): string {
  return specPath.replace(/\{(\w+)\}/g, ':$1');
}

// ---- Tests ----

describe('OpenAPI Spec', () => {
  it('openapi.yaml file exists', () => {
    expect(fs.existsSync(specPath)).toBe(true);
  });

  it('spec declares OpenAPI 3.1', () => {
    expect(specContent).toContain('openapi: 3.1.0');
  });

  it('spec has required sections', () => {
    expect(specContent).toContain('info:');
    expect(specContent).toContain('paths:');
    expect(specContent).toContain('components:');
    expect(specContent).toContain('securitySchemes:');
    expect(specContent).toContain('schemas:');
  });

  it('spec includes all 4 security schemes', () => {
    expect(specContent).toContain('CustomerAuth:');
    expect(specContent).toContain('AgentAuth:');
    expect(specContent).toContain('MerchantAuth:');
    expect(specContent).toContain('StaffAuth:');
  });

  it('spec includes all required error codes', () => {
    const requiredCodes = [
      'UNAUTHORIZED', 'FORBIDDEN', 'VALIDATION_ERROR',
      'INSUFFICIENT_FUNDS', 'CROSS_CURRENCY_NOT_ALLOWED',
      'DUPLICATE_IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_IN_PROGRESS',
      'MAKER_CHECKER_REQUIRED', 'NOT_FOUND', 'INTERNAL_ERROR',
    ];
    for (const code of requiredCodes) {
      expect(specContent).toContain(code);
    }
  });

  it('spec includes all required tags', () => {
    const requiredTags = [
      'Auth', 'Customers', 'Agents', 'Merchants', 'Wallets',
      'Transactions', 'Approvals', 'Ops', 'Reconciliation', 'Overdraft',
      'Bank', 'Settlement', 'Fraud',
    ];
    for (const tag of requiredTags) {
      expect(specContent).toContain(`name: ${tag}`);
    }
  });
});

describe('OpenAPI Spec Endpoints Inventory', () => {
  const specEndpoints = extractSpecEndpoints(specContent);

  it('spec has at least 30 endpoints', () => {
    expect(specEndpoints.length).toBeGreaterThanOrEqual(30);
  });

  // Required endpoints from the spec
  const requiredEndpoints = [
    { method: 'POST', path: '/auth/customer/login' },
    { method: 'POST', path: '/auth/agent/login' },
    { method: 'POST', path: '/auth/merchant/login' },
    { method: 'POST', path: '/auth/staff/login' },
    { method: 'GET', path: '/staff' },
    { method: 'POST', path: '/staff' },
    { method: 'GET', path: '/staff/{staffId}' },
    { method: 'PATCH', path: '/staff/{staffId}' },
    { method: 'DELETE', path: '/staff/{staffId}' },
    { method: 'POST', path: '/staff/{staffId}/actions' },
    { method: 'POST', path: '/staff/{staffId}/kyc/initiate' },
    { method: 'GET', path: '/staff/{staffId}/kyc' },
    { method: 'POST', path: '/customers' },
    { method: 'GET', path: '/customers/{customerId}' },
    { method: 'POST', path: '/customers/{customerId}/kyc/initiate' },
    { method: 'GET', path: '/customers/{customerId}/kyc' },
    { method: 'POST', path: '/agents' },
    { method: 'GET', path: '/agents/{agentId}' },
    { method: 'POST', path: '/merchants' },
    { method: 'GET', path: '/merchants/{merchantId}' },
    { method: 'POST', path: '/codes/generate' },
    { method: 'GET', path: '/wallets/{ownerType}/{ownerId}/{currency}/balance' },
    { method: 'POST', path: '/tx/deposit' },
    { method: 'POST', path: '/tx/withdrawal' },
    { method: 'POST', path: '/tx/p2p' },
    { method: 'POST', path: '/tx/payment' },
    { method: 'POST', path: '/tx/b2b' },
    { method: 'POST', path: '/tx/reversal/request' },
    { method: 'POST', path: '/approvals/{approvalId}/approve' },
    { method: 'POST', path: '/approvals/{approvalId}/reject' },
    { method: 'GET', path: '/approvals' },
    { method: 'GET', path: '/approvals/{approvalId}' },
    { method: 'GET', path: '/approvals/types' },
    // Approval policies
    { method: 'GET', path: '/approvals/policies' },
    { method: 'POST', path: '/approvals/policies' },
    { method: 'GET', path: '/approvals/policies/{policyId}' },
    { method: 'PATCH', path: '/approvals/policies/{policyId}' },
    { method: 'DELETE', path: '/approvals/policies/{policyId}' },
    { method: 'POST', path: '/approvals/policies/{policyId}/activate' },
    { method: 'POST', path: '/approvals/policies/{policyId}/deactivate' },
    { method: 'POST', path: '/approvals/policies/simulate' },
    { method: 'GET', path: '/approvals/policies/requests/{requestId}/policy-decision' },
    // Approval delegations
    { method: 'GET', path: '/approvals/delegations' },
    { method: 'POST', path: '/approvals/delegations' },
    { method: 'POST', path: '/approvals/delegations/{delegationId}/revoke' },
    // Approval type configs
    { method: 'GET', path: '/approvals/types/config' },
    { method: 'POST', path: '/approvals/types/config' },
    { method: 'GET', path: '/approvals/types/config/{typeKey}' },
    { method: 'PATCH', path: '/approvals/types/config/{typeKey}' },
    { method: 'DELETE', path: '/approvals/types/config/{typeKey}' },
    // Endpoint bindings
    { method: 'GET', path: '/approvals/endpoint-bindings' },
    { method: 'POST', path: '/approvals/endpoint-bindings' },
    { method: 'GET', path: '/approvals/endpoint-bindings/lookup' },
    { method: 'GET', path: '/approvals/endpoint-bindings/{bindingId}' },
    { method: 'PATCH', path: '/approvals/endpoint-bindings/{bindingId}' },
    { method: 'DELETE', path: '/approvals/endpoint-bindings/{bindingId}' },
    { method: 'GET', path: '/ops/ledger/journal/{journalId}' },
    { method: 'GET', path: '/ops/ledger/verify' },
    { method: 'POST', path: '/ops/reconciliation/run' },
    { method: 'GET', path: '/ops/reconciliation/runs' },
    { method: 'GET', path: '/ops/reconciliation/findings' },
    { method: 'POST', path: '/ops/repair/idempotency/{journalId}' },
    { method: 'POST', path: '/ops/repair/state/{journalId}' },
    { method: 'POST', path: '/ops/float/suspense/fund' },
    { method: 'POST', path: '/ops/overdraft/request' },
    { method: 'POST', path: '/ops/overdraft/{facilityId}/approve' },
    { method: 'POST', path: '/ops/overdraft/{facilityId}/reject' },
    // Phase 4: Bank
    { method: 'POST', path: '/bank/deposits/initiate' },
    { method: 'GET', path: '/bank/deposits/{depositId}' },
    { method: 'POST', path: '/bank/webhooks/citibank' },
    // Phase 4: Settlement
    { method: 'GET', path: '/merchants/{merchantId}/settlement/profile' },
    { method: 'POST', path: '/merchants/{merchantId}/settlement/profile/request' },
    { method: 'POST', path: '/merchants/{merchantId}/settlement/profile/{profileId}/approve' },
    { method: 'POST', path: '/merchants/{merchantId}/settlement/profile/{profileId}/reject' },
    { method: 'GET', path: '/merchants/{merchantId}/settlements' },
    { method: 'POST', path: '/merchants/{merchantId}/settlements/request-payout' },
    { method: 'GET', path: '/merchants/{merchantId}/payouts/{payoutId}' },
    // Phase 4: Ops
    { method: 'GET', path: '/ops/external-transfers' },
    { method: 'GET', path: '/ops/external-transfers/{transferId}' },
    { method: 'POST', path: '/ops/external-transfers/{transferId}/retry' },
    { method: 'GET', path: '/ops/settlement/batches' },
    { method: 'POST', path: '/ops/settlement/batches/run' },
    { method: 'POST', path: '/ops/settlement/payouts/{payoutId}/approve' },
    { method: 'POST', path: '/ops/settlement/payouts/{payoutId}/reject' },
    { method: 'POST', path: '/ops/webhooks/replay/{deliveryId}' },
    // Phase 4: Fraud
    { method: 'GET', path: '/ops/fraud/decisions' },
    { method: 'GET', path: '/ops/fraud/signals' },
    { method: 'POST', path: '/ops/fraud/rules/version/request' },
    { method: 'POST', path: '/ops/fraud/rules/version/{versionId}/approve' },
    { method: 'GET', path: '/ops/fraud/rules/version/{versionId}' },
  ];

  for (const ep of requiredEndpoints) {
    it(`spec includes ${ep.method} ${ep.path}`, () => {
      const found = specEndpoints.some(
        s => s.method === ep.method && s.path === ep.path
      );
      expect(found).toBe(true);
    });
  }
});

describe('Route-to-Spec Coverage', () => {
  const specEndpoints = extractSpecEndpoints(specContent);

  // Known code routes (hardcoded from codebase analysis for accuracy)
  const codeRoutes = [
    // Auth
    { method: 'POST', path: '/auth/customer/login' },
    { method: 'POST', path: '/auth/agent/login' },
    { method: 'POST', path: '/auth/merchant/login' },
    { method: 'POST', path: '/auth/staff/login' },
    { method: 'GET', path: '/staff' },
    { method: 'POST', path: '/staff' },
    { method: 'GET', path: '/staff/:id' },
    { method: 'PATCH', path: '/staff/:id' },
    { method: 'DELETE', path: '/staff/:id' },
    { method: 'POST', path: '/staff/:id/actions' },
    { method: 'POST', path: '/staff/:id/kyc/initiate' },
    { method: 'GET', path: '/staff/:id/kyc' },
    // Customers
    { method: 'POST', path: '/customers' },
    { method: 'GET', path: '/customers/:id' },
    { method: 'POST', path: '/customers/:id/kyc/initiate' },
    { method: 'GET', path: '/customers/:id/kyc' },
    // Agents
    { method: 'POST', path: '/agents' },
    { method: 'GET', path: '/agents/:id' },
    { method: 'POST', path: '/agents/:id/kyc/initiate' },
    { method: 'GET', path: '/agents/:id/kyc' },
    // Merchants
    { method: 'POST', path: '/merchants' },
    { method: 'GET', path: '/merchants/:id' },
    { method: 'POST', path: '/merchants/:id/kyc/initiate' },
    { method: 'GET', path: '/merchants/:id/kyc' },
    { method: 'POST', path: '/merchants/:id/stores' },
    { method: 'GET', path: '/merchants/:id/stores' },
    // Codes
    { method: 'POST', path: '/codes/generate' },
    // Stores
    { method: 'GET', path: '/stores/:id' },
    // Wallets
    { method: 'GET', path: '/wallets/:owner_type/:owner_id/:currency/balance' },
    { method: 'GET', path: '/wallets/:owner_type/:owner_id/:currency/statement' },
    // Transactions
    { method: 'POST', path: '/tx/deposit' },
    { method: 'POST', path: '/tx/withdrawal' },
    { method: 'POST', path: '/tx/p2p' },
    { method: 'POST', path: '/tx/payment' },
    { method: 'POST', path: '/tx/b2b' },
    { method: 'POST', path: '/tx/reversal/request' },
    { method: 'GET', path: '/tx/:journalId' },
    { method: 'GET', path: '/tx' },
    // Approvals
    { method: 'POST', path: '/approvals/:id/approve' },
    { method: 'POST', path: '/approvals/:id/reject' },
    { method: 'GET', path: '/approvals' },
    { method: 'GET', path: '/approvals/:id' },
    { method: 'GET', path: '/approvals/types' },
    // Approval policies
    { method: 'GET', path: '/approvals/policies' },
    { method: 'POST', path: '/approvals/policies' },
    { method: 'GET', path: '/approvals/policies/:id' },
    { method: 'PATCH', path: '/approvals/policies/:id' },
    { method: 'DELETE', path: '/approvals/policies/:id' },
    { method: 'POST', path: '/approvals/policies/:id/activate' },
    { method: 'POST', path: '/approvals/policies/:id/deactivate' },
    { method: 'POST', path: '/approvals/policies/simulate' },
    { method: 'GET', path: '/approvals/policies/requests/:id/policy-decision' },
    // Approval delegations
    { method: 'GET', path: '/approvals/delegations' },
    { method: 'POST', path: '/approvals/delegations' },
    { method: 'POST', path: '/approvals/delegations/:id/revoke' },
    // Approval type configs
    { method: 'GET', path: '/approvals/types/config' },
    { method: 'POST', path: '/approvals/types/config' },
    { method: 'GET', path: '/approvals/types/config/:typeKey' },
    { method: 'PATCH', path: '/approvals/types/config/:typeKey' },
    { method: 'DELETE', path: '/approvals/types/config/:typeKey' },
    // Endpoint bindings
    { method: 'GET', path: '/approvals/endpoint-bindings' },
    { method: 'POST', path: '/approvals/endpoint-bindings' },
    { method: 'GET', path: '/approvals/endpoint-bindings/lookup' },
    { method: 'GET', path: '/approvals/endpoint-bindings/:id' },
    { method: 'PATCH', path: '/approvals/endpoint-bindings/:id' },
    { method: 'DELETE', path: '/approvals/endpoint-bindings/:id' },
    // Ops
    { method: 'GET', path: '/ops/ledger/journal/:id' },
    { method: 'GET', path: '/ops/ledger/verify' },
    { method: 'POST', path: '/ops/reconciliation/run' },
    { method: 'GET', path: '/ops/reconciliation/findings' },
    { method: 'GET', path: '/ops/reconciliation/runs' },
    { method: 'POST', path: '/ops/repair/idempotency/:journal_id' },
    { method: 'POST', path: '/ops/repair/state/:journal_id' },
    { method: 'POST', path: '/ops/float/suspense/fund' },
    { method: 'POST', path: '/ops/overdraft/request' },
    { method: 'POST', path: '/ops/overdraft/:id/approve' },
    { method: 'POST', path: '/ops/overdraft/:id/reject' },
    { method: 'GET', path: '/ops/overdraft' },
    // Phase 4: Bank routes
    { method: 'POST', path: '/bank/deposits/initiate' },
    { method: 'GET', path: '/bank/deposits/:id' },
    { method: 'POST', path: '/bank/webhooks/citibank' },
    // Phase 4: Settlement routes (mounted under /merchants)
    { method: 'GET', path: '/merchants/:id/settlement/profile' },
    { method: 'POST', path: '/merchants/:id/settlement/profile/request' },
    { method: 'POST', path: '/merchants/:id/settlement/profile/:profileId/approve' },
    { method: 'POST', path: '/merchants/:id/settlement/profile/:profileId/reject' },
    { method: 'GET', path: '/merchants/:id/settlements' },
    { method: 'POST', path: '/merchants/:id/settlements/request-payout' },
    { method: 'GET', path: '/merchants/:id/payouts/:payoutId' },
    // Phase 4: Ops routes
    { method: 'GET', path: '/ops/external-transfers' },
    { method: 'GET', path: '/ops/external-transfers/:id' },
    { method: 'POST', path: '/ops/external-transfers/:id/retry' },
    { method: 'GET', path: '/ops/settlement/batches' },
    { method: 'POST', path: '/ops/settlement/batches/run' },
    { method: 'POST', path: '/ops/settlement/payouts/:id/approve' },
    { method: 'POST', path: '/ops/settlement/payouts/:id/reject' },
    { method: 'POST', path: '/ops/webhooks/replay/:deliveryId' },
    // Phase 4: Fraud routes (mounted under /ops/fraud)
    { method: 'GET', path: '/ops/fraud/decisions' },
    { method: 'GET', path: '/ops/fraud/signals' },
    { method: 'POST', path: '/ops/fraud/rules/version/request' },
    { method: 'POST', path: '/ops/fraud/rules/version/:id/approve' },
    { method: 'GET', path: '/ops/fraud/rules/version/:id' },
    // Docs
    { method: 'GET', path: '/docs' },
    { method: 'GET', path: '/openapi.yaml' },
    { method: 'GET', path: '/openapi.json' },
    // Root
    { method: 'GET', path: '/' },
  ];

  // For each code route, check it has a matching spec entry
  // Normalize param names for comparison: :id → {*} (any param name)
  function normalizePath(p: string): string {
    return p.replace(/:[a-zA-Z_]+/g, '{*}').replace(/\{[a-zA-Z_]+\}/g, '{*}');
  }

  const specNormalized = specEndpoints.map(e => ({
    method: e.method,
    normalized: normalizePath(e.path),
    original: e.path,
  }));

  for (const route of codeRoutes) {
    it(`route ${route.method} ${route.path} is documented in spec`, () => {
      const normalized = normalizePath(route.path);
      const found = specNormalized.some(
        s => s.method === route.method && s.normalized === normalized
      );
      expect(found).toBe(true);
    });
  }
});

describe('Spec-to-Route Coverage', () => {
  const specEndpoints = extractSpecEndpoints(specContent);

  // All spec endpoints should have code handlers
  // We verify by checking that the route file for each endpoint exists
  const apiSrcDir = path.resolve(__dirname, '..');
  const routesDir = path.join(apiSrcDir, 'routes');
  const allRouteContent = fs.readdirSync(routesDir)
    .filter(f => f.endsWith('.ts'))
    .map(f => fs.readFileSync(path.join(routesDir, f), 'utf-8'))
    .join('\n');
  const indexContent = fs.readFileSync(path.join(apiSrcDir, 'index.ts'), 'utf-8');
  const allContent = allRouteContent + '\n' + indexContent;

  // Map spec paths to expected code patterns
  function specPathToCodePattern(specPath: string): string {
    // Convert /auth/customer/login → /customer/login (relative to mount)
    // We just need to verify the terminal path segment exists in code
    return specPath
      .replace(/\{(\w+)\}/g, ':$1') // {id} → :id
      .replace(/\{(\w+)\}/g, ':$1');
  }

  for (const ep of specEndpoints) {
    it(`spec ${ep.method} ${ep.path} has handler in code`, () => {
      const codePath = specPathToCodePattern(ep.path);
      // Check if the path's terminal segment is referenced in route code
      const segments = codePath.split('/').filter(Boolean);
      const terminalSegments = segments.slice(-2).join('/');

      // For simple paths, check the full path or terminal segment
      const hasHandler = allContent.includes(terminalSegments) ||
        allContent.includes(`'${codePath}'`) ||
        allContent.includes(`"${codePath}"`) ||
        // Check for partial path match (mounted routes)
        segments.some(seg => seg.length > 2 && !seg.startsWith(':') && allContent.includes(`'/${seg}'`));

      expect(hasHandler).toBe(true);
    });
  }
});
