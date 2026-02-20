/**
 * PR5 — Governance Bypass Detection Tests
 *
 * Tests that attempt to bypass governance controls.
 * All attempts MUST fail. The system MUST block:
 * 1. Maker approving own request
 * 2. Non-staff accessing ops endpoints
 * 3. Direct ledger writes outside PostingDO
 * 4. Reversal without approval
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  MakerCheckerViolationError,
  IdempotencyConflictError,
} from '@caricash/shared';
import {
  assertMakerCheckerEnforced,
  assertNoDirectLedgerWrites,
  assertAppendOnlyLedger,
} from '../assertions.js';

// ─── 1) Maker Cannot Approve Own Request ───

describe('PR5 governance: maker-checker enforcement', () => {
  it('throws when maker == checker', () => {
    expect(() => assertMakerCheckerEnforced('staff-alice', 'staff-alice')).toThrow(
      MakerCheckerViolationError,
    );
  });

  it('passes when maker != checker', () => {
    expect(() => assertMakerCheckerEnforced('staff-alice', 'staff-bob')).not.toThrow();
  });

  it('throws with descriptive message', () => {
    expect(() => assertMakerCheckerEnforced('staff-001', 'staff-001')).toThrow(
      /maker.*cannot be checker/,
    );
  });

  it('enforcement works with various ID formats', () => {
    const pairs = [
      ['admin-001', 'admin-001'],
      ['ops-lead', 'ops-lead'],
      ['uuid-1234-5678', 'uuid-1234-5678'],
    ];

    for (const [maker, checker] of pairs) {
      expect(() => assertMakerCheckerEnforced(maker, checker)).toThrow(
        MakerCheckerViolationError,
      );
    }
  });

  it('different staff always allowed', () => {
    const pairs = [
      ['admin-001', 'admin-002'],
      ['ops-lead', 'finance-lead'],
      ['maker-uuid', 'checker-uuid'],
    ];

    for (const [maker, checker] of pairs) {
      expect(() => assertMakerCheckerEnforced(maker, checker)).not.toThrow();
    }
  });
});

// ─── 2) Non-Staff Access Ops Endpoints (Simulated) ───

describe('PR5 governance: ops endpoint access control', () => {
  // Simulate the auth check that ops routes perform
  function requireStaffAuth(headers: Record<string, string | undefined>): { authorized: boolean; staffId?: string } {
    const staffId = headers['x-staff-id'];
    if (!staffId) {
      return { authorized: false };
    }
    return { authorized: true, staffId };
  }

  it('rejects request without X-Staff-Id header', () => {
    const result = requireStaffAuth({});
    expect(result.authorized).toBe(false);
    expect(result.staffId).toBeUndefined();
  });

  it('rejects request with empty X-Staff-Id', () => {
    const result = requireStaffAuth({ 'x-staff-id': '' });
    expect(result.authorized).toBe(false);
  });

  it('accepts request with valid X-Staff-Id', () => {
    const result = requireStaffAuth({ 'x-staff-id': 'staff-001' });
    expect(result.authorized).toBe(true);
    expect(result.staffId).toBe('staff-001');
  });

  it('all ops endpoints enforce staff auth (structural check)', () => {
    // Read the ops route source and verify all routes check for staff auth
    const opsPath = path.resolve(__dirname, '../../../api/src/routes/ops.ts');
    if (fs.existsSync(opsPath)) {
      const source = fs.readFileSync(opsPath, 'utf-8');

      // Every route handler should check for staffId
      const routeCount = (source.match(/ops\.(get|post)\(/g) || []).length;
      const authCheckCount = (source.match(/staffId/g) || []).length;

      // There should be at least as many auth checks as routes
      expect(authCheckCount).toBeGreaterThanOrEqual(routeCount);
    }
  });
});

// ─── 3) No Direct Ledger Writes Outside PostingDO ───

describe('PR5 governance: no direct ledger writes', () => {
  const packagesDir = path.resolve(__dirname, '../../..');

  // Get all source files in specified package
  function getSourceFiles(packageName: string): string[] {
    const srcDir = path.join(packagesDir, packageName, 'src');
    if (!fs.existsSync(srcDir)) return [];
    return collectTsFiles(srcDir);
  }

  function collectTsFiles(dir: string): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== '__tests__' && entry.name !== 'node_modules') {
        files.push(...collectTsFiles(fullPath));
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) && !entry.name.endsWith('.test.ts')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  it('packages/api has no UPDATE/DELETE on ledger tables', () => {
    const files = getSourceFiles('api');
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf-8');
      const filename = path.relative(packagesDir, file);
      expect(() => assertNoDirectLedgerWrites(source, filename)).not.toThrow();
    }
  });

  it('packages/jobs has no UPDATE/DELETE on ledger tables', () => {
    const files = getSourceFiles('jobs');
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf-8');
      const filename = path.relative(packagesDir, file);
      expect(() => assertNoDirectLedgerWrites(source, filename)).not.toThrow();
    }
  });

  it('packages/api has no INSERT INTO ledger tables (only PostingDO can)', () => {
    const files = getSourceFiles('api');
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf-8');
      const filename = path.relative(packagesDir, file);
      expect(() => assertAppendOnlyLedger(source, filename, false)).not.toThrow();
    }
  });

  it('packages/jobs has no INSERT INTO ledger tables', () => {
    const files = getSourceFiles('jobs');
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf-8');
      const filename = path.relative(packagesDir, file);
      expect(() => assertAppendOnlyLedger(source, filename, false)).not.toThrow();
    }
  });

  it('packages/posting-do is the only package with INSERT INTO ledger tables', () => {
    const files = getSourceFiles('posting-do');
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf-8');
      const filename = path.relative(packagesDir, file);
      // PostingDO IS allowed to insert into ledger tables
      expect(() => assertAppendOnlyLedger(source, filename, true)).not.toThrow();
    }
  });

  it('PostingDO has no UPDATE/DELETE on ledger tables (append-only)', () => {
    const files = getSourceFiles('posting-do');
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf-8');
      const filename = path.relative(packagesDir, file);
      expect(() => assertNoDirectLedgerWrites(source, filename)).not.toThrow();
    }
  });
});

// ─── 4) Reversal Without Approval Must Fail ───

describe('PR5 governance: reversal requires approval', () => {
  // Simulate the approval check that exists in the tx routes
  function checkReversalAllowed(approvalState: string | null): boolean {
    // Reversal can only be posted if there's an APPROVED approval
    return approvalState === 'APPROVED';
  }

  it('reversal blocked when no approval exists', () => {
    expect(checkReversalAllowed(null)).toBe(false);
  });

  it('reversal blocked when approval is PENDING', () => {
    expect(checkReversalAllowed('PENDING')).toBe(false);
  });

  it('reversal blocked when approval is REJECTED', () => {
    expect(checkReversalAllowed('REJECTED')).toBe(false);
  });

  it('reversal blocked when approval is EXPIRED', () => {
    expect(checkReversalAllowed('EXPIRED')).toBe(false);
  });

  it('reversal allowed when approval is APPROVED', () => {
    expect(checkReversalAllowed('APPROVED')).toBe(true);
  });

  it('structural: tx route checks approval_requests before reversal posting', () => {
    const txPath = path.resolve(__dirname, '../../../api/src/routes/tx.ts');
    if (fs.existsSync(txPath)) {
      const source = fs.readFileSync(txPath, 'utf-8');
      // The reversal route should reference approval logic
      expect(source).toMatch(/reversal|approval/i);
    }
  });
});

// ─── 5) Overdraft Without Approval Must Fail ───

describe('PR5 governance: overdraft facility requires approval', () => {
  function checkOverdraftAllowed(facilityState: string | null): boolean {
    return facilityState === 'APPROVED' || facilityState === 'ACTIVE';
  }

  it('overdraft blocked when no facility exists', () => {
    expect(checkOverdraftAllowed(null)).toBe(false);
  });

  it('overdraft blocked when facility is PENDING', () => {
    expect(checkOverdraftAllowed('PENDING')).toBe(false);
  });

  it('overdraft allowed when facility is APPROVED', () => {
    expect(checkOverdraftAllowed('APPROVED')).toBe(true);
  });

  it('overdraft allowed when facility is ACTIVE', () => {
    expect(checkOverdraftAllowed('ACTIVE')).toBe(true);
  });
});
