/**
 * Phase 2 Audit Gate Runner — TypeScript version
 *
 * Runs the full vitest suite and parses the verbose output
 * to produce a formal PASS/FAIL report by invariant category.
 *
 * Run: npx tsx packages/tests/src/auditGate.ts
 * Or:  npm run audit-gate
 *
 * Exit code:
 *   0 = all gates passed
 *   1 = one or more gates failed
 */

import { execSync } from 'child_process';

const categories: Record<string, { patterns: string[]; pass: number; fail: number }> = {
  'Ledger invariants': { patterns: ['ledger balance invariant', 'all journal templates', 'property'], pass: 0, fail: 0 },
  'Idempotency': { patterns: ['idempotency invariant', 'idempotent replay', 'replay storm', 'scope hash'], pass: 0, fail: 0 },
  'Concurrency safety': { patterns: ['parallel spend', 'concurrency', 'cross-DO', 'serializ'], pass: 0, fail: 0 },
  'Replay safety': { patterns: ['queue consumer replay', 'queue replay', 'replay test'], pass: 0, fail: 0 },
  'Integrity verification': { patterns: ['hash chain', 'integrity', 'tamper'], pass: 0, fail: 0 },
  'Reconciliation': { patterns: ['reconciliation', 'suspense', 'mismatch'], pass: 0, fail: 0 },
  'Governance enforcement': { patterns: ['maker-checker', 'governance', 'ops endpoint', 'reversal requires', 'overdraft facility requires', 'no direct ledger'], pass: 0, fail: 0 },
};

function runAuditGate(): void {
  let output = '';
  let testExitCode = 0;

  try {
    output = execSync('npx vitest run --reporter=verbose 2>&1', {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      cwd: process.cwd(),
    });
  } catch (err: unknown) {
    // execSync throws on non-zero exit
    if (err && typeof err === 'object' && 'stdout' in err) {
      output = (err as { stdout: string }).stdout || '';
    }
    testExitCode = 1;
  }

  const lines = output.split('\n');

  for (const line of lines) {
    const lower = line.toLowerCase();
    const passMatch = lower.includes('✓') || lower.includes('√');
    const failMatch = (lower.includes('✗') || lower.includes('×') || lower.includes('fail')) && !passMatch;

    for (const config of Object.values(categories)) {
      for (const pattern of config.patterns) {
        if (lower.includes(pattern.toLowerCase())) {
          if (passMatch) config.pass++;
          if (failMatch) config.fail++;
          break;
        }
      }
    }
  }

  // Extract summary counts
  const summaryMatch = output.match(/(\d+) passed/);
  const failSummary = output.match(/(\d+) failed/);
  const totalPassed = summaryMatch ? parseInt(summaryMatch[1]) : 0;
  const totalFailed = failSummary ? parseInt(failSummary[1]) : 0;

  // Print report
  console.log('');
  console.log('-----------------------------------');
  console.log('PHASE 2 AUDIT GATE REPORT');
  console.log('-----------------------------------');

  let anyFailed = false;

  for (const [category, config] of Object.entries(categories)) {
    const status = config.fail > 0 ? 'FAIL' : (config.pass > 0 ? 'PASS' : 'SKIP');
    if (status === 'FAIL') anyFailed = true;
    console.log(`${category}: ${status}`);
  }

  console.log('-----------------------------------');

  if (totalFailed > 0 || anyFailed || testExitCode !== 0) {
    console.log(`Total: ${totalPassed} passed, ${totalFailed} failed`);
    console.log('');
    console.log('AUDIT GATE: FAILED');
    process.exit(1);
  } else {
    console.log(`Total: ${totalPassed} passed`);
    console.log('');
    console.log('AUDIT GATE: PASSED');
    process.exit(0);
  }
}

runAuditGate();
