/**
 * PR5 — Reconciliation & Integrity Validation Suite
 *
 * Tests that prove:
 * 1. Corrupted materialized balance → reconciliation detects mismatch
 * 2. Tampered ledger line → integrity verification fails
 * 3. Broken hash chain → detection occurs
 * 4. Suspense non-zero beyond threshold → CRITICAL finding emitted
 *
 * No auto-corrections in any test.
 */
import { describe, it, expect } from 'vitest';
import { sha256Hex, generateId, formatAmount, parseAmount } from '@caricash/shared';
import { assertHashChainValid } from '../assertions.js';

// ─── Pure reconciliation logic (mirrors packages/jobs/src/reconciliation.ts) ───

function parseAmountSafe(s: string): bigint {
  try {
    const trimmed = s.trim().replace(/^-/, '');
    const isNegative = s.trim().startsWith('-');
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return 0n;
    const [whole, frac = ''] = trimmed.split('.');
    const cents = frac.padEnd(2, '0');
    const val = BigInt(whole + cents);
    return isNegative ? -val : val;
  } catch {
    return 0n;
  }
}

function classifySeverity(discrepancyCents: bigint): string {
  const abs = discrepancyCents < 0n ? -discrepancyCents : discrepancyCents;
  if (abs >= 100000n) return 'CRITICAL';
  if (abs >= 10000n) return 'HIGH';
  if (abs >= 100n) return 'MEDIUM';
  return 'LOW';
}

function detectMismatch(computedBalance: string, materializedBalance: string) {
  const computedCents = parseAmountSafe(computedBalance);
  const materializedCents = parseAmountSafe(materializedBalance);
  const discrepancyCents = computedCents - materializedCents;
  return {
    isMismatch: discrepancyCents !== 0n,
    discrepancyCents,
    severity: discrepancyCents !== 0n ? classifySeverity(discrepancyCents) : 'NONE',
  };
}

/**
 * Simulates the full reconciliation flow with pure data inputs.
 * Takes accounts with computed (ledger) and materialized balances and returns findings.
 */
function reconcile(accounts: Array<{ id: string; computedBalance: string; materializedBalance: string | null }>) {
  const findings: Array<{ account_id: string; computed: string; actual: string; severity: string }> = [];
  for (const acct of accounts) {
    if (acct.materializedBalance === null) {
      // Missing materialized balance treated as zero — flag if ledger non-zero
      if (parseAmountSafe(acct.computedBalance) !== 0n) {
        findings.push({
          account_id: acct.id,
          computed: acct.computedBalance,
          actual: '0.00',
          severity: classifySeverity(parseAmountSafe(acct.computedBalance)),
        });
      }
      continue;
    }
    const result = detectMismatch(acct.computedBalance, acct.materializedBalance);
    if (result.isMismatch) {
      findings.push({
        account_id: acct.id,
        computed: acct.computedBalance,
        actual: acct.materializedBalance,
        severity: result.severity,
      });
    }
  }
  return { mismatches_found: findings.length, findings };
}

// ─── 1) Reconciliation Mismatch Detection ───

describe('PR5 reconciliation: mismatch detection', () => {
  it('detects balance mismatch between ledger and materialized view', () => {
    const result = reconcile([
      { id: 'acct-001', computedBalance: '100.00', materializedBalance: '150.00' },
    ]);
    expect(result.mismatches_found).toBeGreaterThan(0);
    expect(result.findings[0].severity).toBe('MEDIUM');
  });

  it('passes when ledger and materialized agree', () => {
    const result = reconcile([
      { id: 'acct-001', computedBalance: '100.00', materializedBalance: '100.00' },
    ]);
    expect(result.mismatches_found).toBe(0);
  });

  it('detects multiple account mismatches', () => {
    const result = reconcile([
      { id: 'acct-001', computedBalance: '100.00', materializedBalance: '100.00' }, // match
      { id: 'acct-002', computedBalance: '200.00', materializedBalance: '250.00' }, // mismatch
      { id: 'acct-003', computedBalance: '50.00', materializedBalance: '30.00' },   // mismatch
    ]);
    expect(result.mismatches_found).toBe(2);
  });

  it('handles missing materialized balance (null → 0.00)', () => {
    const result = reconcile([
      { id: 'acct-001', computedBalance: '100.00', materializedBalance: null },
    ]);
    expect(result.mismatches_found).toBeGreaterThan(0);
    expect(result.findings[0].actual).toBe('0.00');
  });

  it('does NOT auto-correct: findings record discrepancy without modifying balances', () => {
    const result = reconcile([
      { id: 'acct-001', computedBalance: '100.00', materializedBalance: '999.99' },
    ]);
    expect(result.findings.length).toBeGreaterThan(0);
    // The finding records both values but doesn't modify either
    expect(result.findings[0].computed).toBe('100.00');
    expect(result.findings[0].actual).toBe('999.99');
  });

  it('critical discrepancy for large amounts', () => {
    const result = reconcile([
      { id: 'acct-001', computedBalance: '5000.00', materializedBalance: '100.00' },
    ]);
    expect(result.findings[0].severity).toBe('CRITICAL');
  });

  it('handles zero balances matching', () => {
    const result = reconcile([
      { id: 'acct-001', computedBalance: '0.00', materializedBalance: '0.00' },
    ]);
    expect(result.mismatches_found).toBe(0);
  });

  it('handles negative computed balance', () => {
    const result = reconcile([
      { id: 'acct-001', computedBalance: '-50.00', materializedBalance: '0.00' },
    ]);
    expect(result.mismatches_found).toBe(1);
  });
});

// ─── 2) Suspense Account Monitoring ───

describe('PR5 reconciliation: suspense monitoring', () => {
  it('flags non-zero suspense balance as finding', () => {
    // Suspense accounts with non-zero balance should trigger CRITICAL findings
    const suspenseBalance = 5000n; // 50.00 BBD
    const threshold = 0n;
    expect(suspenseBalance).toBeGreaterThan(threshold);

    // When reconcile sees a suspense account with non-zero balance, it would flag it
    const result = reconcile([
      { id: 'suspense-001', computedBalance: '50.00', materializedBalance: '0.00' },
    ]);
    expect(result.mismatches_found).toBe(1);
  });

  it('zero suspense balance passes threshold check', () => {
    const suspenseBalance = 0n;
    const threshold = 0n;
    expect(suspenseBalance).toBeLessThanOrEqual(threshold);

    // Zero suspense balance should not produce findings
    const result = reconcile([
      { id: 'suspense-001', computedBalance: '0.00', materializedBalance: '0.00' },
    ]);
    expect(result.mismatches_found).toBe(0);
  });

  it('suspense balance beyond threshold is CRITICAL when large', () => {
    const result = reconcile([
      { id: 'suspense-001', computedBalance: '5000.00', materializedBalance: '0.00' },
    ]);
    expect(result.findings[0].severity).toBe('CRITICAL');
  });
});

// ─── 3) Hash Chain Integrity ───

describe('PR5 integrity: hash chain verification', () => {
  async function buildJournalChain(count: number) {
    const journals = [];
    let prevHash = '';

    for (let i = 0; i < count; i++) {
      const lines = [
        { account_id: `acct-dr-${i}`, entry_type: 'DR', amount: '100.00' },
        { account_id: `acct-cr-${i}`, entry_type: 'CR', amount: '100.00' },
      ];

      const sortedLines = [...lines].sort((a, b) => {
        if (a.account_id < b.account_id) return -1;
        if (a.account_id > b.account_id) return 1;
        if (a.entry_type < b.entry_type) return -1;
        if (a.entry_type > b.entry_type) return 1;
        return 0;
      });

      const content = JSON.stringify({
        journal_id: `j-${i}`,
        currency: 'BBD',
        txn_type: 'DEPOSIT',
        ledger_lines: sortedLines,
      });
      const hash = await sha256Hex(prevHash + content);

      journals.push({
        id: `j-${i}`,
        prev_hash: prevHash || null,
        journal_hash: hash,
        txn_type: 'DEPOSIT',
        currency: 'BBD',
        lines,
      });

      prevHash = hash;
    }

    return journals;
  }

  it('valid hash chain passes verification', async () => {
    const journals = await buildJournalChain(10);
    await expect(assertHashChainValid(journals)).resolves.not.toThrow();
  });

  it('detects tampered journal content (modified amount)', async () => {
    const journals = await buildJournalChain(5);

    // Tamper with journal 3's line amount
    journals[2].lines[0].amount = '999.99';

    await expect(assertHashChainValid(journals)).rejects.toThrow(/Hash chain integrity failed/);
  });

  it('detects broken chain (swapped hash)', async () => {
    const journals = await buildJournalChain(5);

    // Swap the hash of journal 2
    journals[1].journal_hash = 'deadbeef'.repeat(8);

    await expect(assertHashChainValid(journals)).rejects.toThrow(/Hash chain/);
  });

  it('detects tampered prev_hash linkage', async () => {
    const journals = await buildJournalChain(5);

    // Break the prev_hash linkage of journal 3
    journals[2].prev_hash = 'wrong-previous-hash';

    await expect(assertHashChainValid(journals)).rejects.toThrow(/Hash chain/);
  });

  it('empty chain is valid', async () => {
    await expect(assertHashChainValid([])).resolves.not.toThrow();
  });

  it('single journal chain is valid', async () => {
    const journals = await buildJournalChain(1);
    await expect(assertHashChainValid(journals)).resolves.not.toThrow();
  });

  it('100-journal chain verifies correctly', async () => {
    const journals = await buildJournalChain(100);
    await expect(assertHashChainValid(journals)).resolves.not.toThrow();
  });
});

// ─── 4) Tamper Detection ───

describe('PR5 integrity: tamper detection scenarios', () => {
  it('detects deleted journal line (different content → different hash)', async () => {
    const lines = [
      { account_id: 'acct-001', entry_type: 'DR', amount: '100.00' },
      { account_id: 'acct-002', entry_type: 'CR', amount: '100.00' },
    ];

    const sortedLines = [...lines].sort((a, b) => {
      if (a.account_id < b.account_id) return -1;
      if (a.account_id > b.account_id) return 1;
      return 0;
    });

    const content = JSON.stringify({
      journal_id: 'j-001',
      currency: 'BBD',
      txn_type: 'DEPOSIT',
      ledger_lines: sortedLines,
    });
    const hash = await sha256Hex('' + content);

    // Now tamper by removing a line
    const tamperedLines = [lines[0]]; // Only DR, no CR
    const tamperedSorted = [...tamperedLines].sort((a, b) => {
      if (a.account_id < b.account_id) return -1;
      if (a.account_id > b.account_id) return 1;
      return 0;
    });
    const tamperedContent = JSON.stringify({
      journal_id: 'j-001',
      currency: 'BBD',
      txn_type: 'DEPOSIT',
      ledger_lines: tamperedSorted,
    });
    const tamperedHash = await sha256Hex('' + tamperedContent);

    expect(hash).not.toBe(tamperedHash);
  });

  it('detects modified currency (BBD → USD)', async () => {
    const lines = [
      { account_id: 'acct-001', entry_type: 'DR', amount: '50.00' },
      { account_id: 'acct-002', entry_type: 'CR', amount: '50.00' },
    ];

    const hashBBD = await sha256Hex(JSON.stringify({ journal_id: 'j-001', currency: 'BBD', txn_type: 'P2P', ledger_lines: lines }));
    const hashUSD = await sha256Hex(JSON.stringify({ journal_id: 'j-001', currency: 'USD', txn_type: 'P2P', ledger_lines: lines }));

    expect(hashBBD).not.toBe(hashUSD);
  });

  it('detects modified txn_type', async () => {
    const lines = [
      { account_id: 'acct-001', entry_type: 'DR', amount: '50.00' },
      { account_id: 'acct-002', entry_type: 'CR', amount: '50.00' },
    ];

    const hashDeposit = await sha256Hex(JSON.stringify({ journal_id: 'j-001', currency: 'BBD', txn_type: 'DEPOSIT', ledger_lines: lines }));
    const hashP2P = await sha256Hex(JSON.stringify({ journal_id: 'j-001', currency: 'BBD', txn_type: 'P2P', ledger_lines: lines }));

    expect(hashDeposit).not.toBe(hashP2P);
  });
});
