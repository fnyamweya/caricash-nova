#!/usr/bin/env node
/**
 * Phase 2 Audit Gate Runner
 *
 * Parses vitest verbose output and produces a formal PASS/FAIL report.
 * Pipe vitest output into this script:
 *   npx vitest run --reporter=verbose 2>&1 | node src/audit-gate.mjs
 *
 * Exit code:
 *   0 = all gates passed
 *   1 = one or more gates failed
 */

const categories = {
  'Ledger invariants': { patterns: ['ledger balance invariant', 'all journal templates', 'property'], pass: 0, fail: 0 },
  'Idempotency': { patterns: ['idempotency invariant', 'idempotent replay', 'replay storm', 'scope hash'], pass: 0, fail: 0 },
  'Concurrency safety': { patterns: ['parallel spend', 'concurrency', 'cross-DO', 'serializ'], pass: 0, fail: 0 },
  'Replay safety': { patterns: ['queue consumer replay', 'queue replay', 'replay test'], pass: 0, fail: 0 },
  'Integrity verification': { patterns: ['hash chain', 'integrity', 'tamper'], pass: 0, fail: 0 },
  'Reconciliation': { patterns: ['reconciliation', 'suspense', 'mismatch'], pass: 0, fail: 0 },
  'Governance enforcement': { patterns: ['maker-checker', 'governance', 'ops endpoint', 'reversal requires', 'overdraft facility requires', 'no direct ledger'], pass: 0, fail: 0 },
};

let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { input += chunk; });

process.stdin.on('end', () => {
  const lines = input.split('\n');

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Match vitest test result lines
    const passMatch = lower.includes('✓') || lower.includes('√');
    const failMatch = lower.includes('✗') || lower.includes('×') || lower.includes('fail');

    for (const [category, config] of Object.entries(categories)) {
      for (const pattern of config.patterns) {
        if (lower.includes(pattern.toLowerCase())) {
          if (passMatch) config.pass++;
          if (failMatch && !passMatch) config.fail++;
          break;
        }
      }
    }
  }

  // Also check summary line
  const summaryMatch = input.match(/(\d+) passed/);
  const failSummary = input.match(/(\d+) failed/);
  const totalPassed = summaryMatch ? parseInt(summaryMatch[1]) : 0;
  const totalFailed = failSummary ? parseInt(failSummary[1]) : 0;

  // Print report
  console.log('');
  console.log('───────────────────────────────────────');
  console.log('  PHASE 2 AUDIT GATE REPORT');
  console.log('───────────────────────────────────────');

  let anyFailed = false;

  for (const [category, config] of Object.entries(categories)) {
    const status = config.fail > 0 ? 'FAIL' : (config.pass > 0 ? 'PASS' : 'SKIP');
    if (status === 'FAIL') anyFailed = true;
    const icon = status === 'PASS' ? '✔' : status === 'FAIL' ? '✗' : '⚠';
    console.log(`  ${icon} ${category}: ${status} (${config.pass} passed, ${config.fail} failed)`);
  }

  console.log('───────────────────────────────────────');
  console.log(`  Total: ${totalPassed} passed, ${totalFailed} failed`);
  console.log('───────────────────────────────────────');

  if (totalFailed > 0 || anyFailed) {
    console.log('  ✗ AUDIT GATE: FAILED');
    console.log('───────────────────────────────────────');
    process.exit(1);
  } else {
    console.log('  ✔ AUDIT GATE: PASSED');
    console.log('───────────────────────────────────────');
    process.exit(0);
  }
});
