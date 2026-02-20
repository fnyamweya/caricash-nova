/**
 * Standalone Stress Harness — PR5
 *
 * Exercises concurrency, idempotency, and serialization invariants
 * outside of the vitest test runner. Prints an invariant report
 * and exits non-zero if any invariant fails.
 *
 * Run: npx tsx packages/tests/src/stressHarness.ts
 * Or:  npm run stress-harness
 *
 * Deterministic seeds for reproducibility.
 * Must complete in < 60s.
 */

import {
  formatAmount,
  parseAmount,
  computeScopeHash,
  computePayloadHash,
} from '@caricash/shared';

// ─── Deterministic PRNG (Mulberry32) ───

function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Simulated Serialized Wallet (mirrors PostingDO behavior) ───

class SerializedWallet {
  private balanceCents: bigint;
  private mutex = false;
  private journals: string[] = [];
  private processedScopes = new Map<string, { payloadHash: string; journalId: string }>();

  constructor(initialBalance: string) {
    this.balanceCents = parseAmount(initialBalance);
  }

  async postTransaction(opts: {
    scopeHash: string;
    payloadHash: string;
    amountCents: bigint;
    journalId: string;
  }): Promise<{ success: boolean; journalId: string; duplicate: boolean; conflict: boolean; insufficientFunds: boolean }> {
    while (this.mutex) {
      await new Promise((r) => setTimeout(r, 0));
    }
    this.mutex = true;

    try {
      const existing = this.processedScopes.get(opts.scopeHash);
      if (existing) {
        if (existing.payloadHash !== opts.payloadHash) {
          return { success: false, journalId: existing.journalId, duplicate: false, conflict: true, insufficientFunds: false };
        }
        return { success: true, journalId: existing.journalId, duplicate: true, conflict: false, insufficientFunds: false };
      }

      if (this.balanceCents < opts.amountCents) {
        return { success: false, journalId: opts.journalId, duplicate: false, conflict: false, insufficientFunds: true };
      }

      this.balanceCents -= opts.amountCents;
      this.journals.push(opts.journalId);
      this.processedScopes.set(opts.scopeHash, { payloadHash: opts.payloadHash, journalId: opts.journalId });

      return { success: true, journalId: opts.journalId, duplicate: false, conflict: false, insufficientFunds: false };
    } finally {
      this.mutex = false;
    }
  }

  getBalance(): string { return formatAmount(this.balanceCents); }
  getBalanceCents(): bigint { return this.balanceCents; }
  getJournals(): string[] { return [...this.journals]; }
}

// ─── Invariant checker helper ───

interface InvariantResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: InvariantResult[] = [];

function assert(condition: boolean, name: string, details: string): void {
  results.push({ name, passed: condition, details });
}

// ─── Test 1: Parallel Spend ───

async function testParallelSpend(): Promise<void> {
  const wallet = new SerializedWallet('100.00');
  const N = 50;
  const amountCents = 300n; // 3.00 each

  const promises = Array.from({ length: N }, (_, i) =>
    wallet.postTransaction({
      scopeHash: `parallel-${i}`,
      payloadHash: `parallel-payload-${i}`,
      amountCents,
      journalId: `j-parallel-${i}`,
    }),
  );

  const all = await Promise.all(promises);
  const successes = all.filter(r => r.success && !r.duplicate);
  const expectedMax = Math.floor(10000 / 300); // floor(100.00 / 3.00) = 33

  assert(
    successes.length <= expectedMax,
    'Parallel spend: at most floor(X/amount) succeed',
    `${successes.length} succeeded (max ${expectedMax})`,
  );
  assert(
    wallet.getBalanceCents() >= 0n,
    'Parallel spend: balance never negative',
    `Final balance: ${wallet.getBalance()}`,
  );

  const journalIds = wallet.getJournals();
  const unique = new Set(journalIds);
  assert(
    unique.size === journalIds.length,
    'Parallel spend: no duplicate journal IDs',
    `${journalIds.length} journals, ${unique.size} unique`,
  );
}

// ─── Test 2: Cross-DO Race Simulation ───

async function testCrossDORace(): Promise<void> {
  const walletA = new SerializedWallet('500.00');
  const N = 10;
  const transferAmount = 2000n; // 20.00

  const promises = Array.from({ length: N }, async (_, i) => {
    const result = await walletA.postTransaction({
      scopeHash: `xdo-${i}-debit`,
      payloadHash: `xdo-${i}-payload`,
      amountCents: transferAmount,
      journalId: `j-xdo-debit-${i}`,
    });
    return result.success && !result.duplicate;
  });

  const transferred = (await Promise.all(promises)).filter(Boolean).length;

  // 500.00 / 20.00 = 25 max, but only N=10 attempts, so all 10 should succeed
  assert(
    transferred === N,
    'Cross-DO: all transfers succeed (sufficient funds)',
    `${transferred} transferred out of ${N} attempts`,
  );
  assert(
    walletA.getBalanceCents() >= 0n,
    'Cross-DO: balance never negative',
    `Final balance: ${walletA.getBalance()}`,
  );
}

// ─── Test 3: Idempotent Replay Storm ───

async function testReplayStorm(): Promise<void> {
  const wallet = new SerializedWallet('1000.00');
  const N = 100;

  const promises = Array.from({ length: N }, () =>
    wallet.postTransaction({
      scopeHash: 'storm-scope-001',
      payloadHash: 'storm-payload-001',
      amountCents: 5000n,
      journalId: 'j-storm-001',
    }),
  );

  const all = await Promise.all(promises);
  const successes = all.filter(r => r.success);
  const duplicates = all.filter(r => r.duplicate);

  assert(
    successes.length === N,
    'Replay storm: all 100 return success',
    `${successes.length} successes`,
  );
  assert(
    duplicates.length === N - 1,
    'Replay storm: 99 are duplicates',
    `${duplicates.length} duplicates`,
  );
  assert(
    wallet.getJournals().length === 1,
    'Replay storm: exactly one journal created',
    `${wallet.getJournals().length} journals`,
  );
  assert(
    wallet.getBalance() === '950.00',
    'Replay storm: balance debited only once',
    `Balance: ${wallet.getBalance()}`,
  );
}

// ─── Test 4: Queue Replay Simulation ───

async function testQueueReplay(): Promise<void> {
  const processed = new Map<string, unknown>();
  const sideEffects: string[] = [];

  async function consume(msg: { id: string; payload: unknown }): Promise<boolean> {
    if (processed.has(msg.id)) return false;
    processed.set(msg.id, msg.payload);
    sideEffects.push(`effect-${msg.id}`);
    return true;
  }

  const msg = { id: 'msg-001', payload: { txn: 'DEPOSIT', amount: '100.00' } };
  const results = await Promise.all(
    Array.from({ length: 100 }, () => consume(msg)),
  );

  const processedCount = results.filter(Boolean).length;

  assert(
    processedCount === 1,
    'Queue replay: exactly 1 processing',
    `${processedCount} processed`,
  );
  assert(
    sideEffects.length === 1,
    'Queue replay: exactly 1 side effect',
    `${sideEffects.length} side effects`,
  );
}

// ─── Test 5: Idempotency Hash Determinism ───

async function testHashDeterminism(): Promise<void> {
  const hashes = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const h = await computeScopeHash('CUSTOMER', 'cust-001', 'DEPOSIT', 'key-001');
    hashes.add(h);
  }

  assert(
    hashes.size === 1,
    'Hash determinism: 50 identical scope hashes',
    `${hashes.size} unique hashes`,
  );

  // Payload hash determinism
  const payloadHashes = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const h = await computePayloadHash({ amount: '100.00', currency: 'BBD' });
    payloadHashes.add(h);
  }

  assert(
    payloadHashes.size === 1,
    'Hash determinism: 50 identical payload hashes',
    `${payloadHashes.size} unique payload hashes`,
  );

  // Conflict: different payloads produce different hashes
  const h1 = await computePayloadHash({ amount: '100.00' });
  const h2 = await computePayloadHash({ amount: '200.00' });
  assert(
    h1 !== h2,
    'Hash conflict: different payloads produce different hashes',
    `hash1=${h1.substring(0, 8)}... hash2=${h2.substring(0, 8)}...`,
  );
}

// ─── Test 6: Randomized balance never negative ───

async function testRandomizedNonNegative(): Promise<void> {
  const rng = mulberry32(12345);
  const wallet = new SerializedWallet('500.00');
  const N = 200;
  let negativeEncountered = false;

  for (let i = 0; i < N; i++) {
    const amountCents = BigInt(Math.floor(rng() * 5000) + 1);
    await wallet.postTransaction({
      scopeHash: `rand-${i}`,
      payloadHash: `rand-payload-${i}`,
      amountCents,
      journalId: `j-rand-${i}`,
    });
    if (wallet.getBalanceCents() < 0n) {
      negativeEncountered = true;
      break;
    }
  }

  assert(
    !negativeEncountered,
    'Randomized: balance never negative (200 rounds, seed=12345)',
    `Final balance: ${wallet.getBalance()}`,
  );
}

// ─── Main ───

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  PHASE 2 STRESS HARNESS');
  console.log('═══════════════════════════════════════════');
  console.log('');

  await testParallelSpend();
  await testCrossDORace();
  await testReplayStorm();
  await testQueueReplay();
  await testHashDeterminism();
  await testRandomizedNonNegative();

  const elapsed = Date.now() - startTime;

  // ─── Print Report ───

  console.log('───────────────────────────────────────────');
  console.log('  STRESS HARNESS INVARIANT REPORT');
  console.log('───────────────────────────────────────────');

  let failures = 0;
  for (const r of results) {
    const icon = r.passed ? '✔' : '✗';
    const status = r.passed ? 'PASS' : 'FAIL';
    console.log(`  ${icon} ${r.name}: ${status}`);
    console.log(`      ${r.details}`);
    if (!r.passed) failures++;
  }

  console.log('───────────────────────────────────────────');
  console.log(`  Total: ${results.length - failures}/${results.length} passed in ${elapsed}ms`);

  if (failures > 0) {
    console.log(`  ✗ STRESS HARNESS: FAILED (${failures} failure${failures > 1 ? 's' : ''})`);
    console.log('───────────────────────────────────────────');
    process.exit(1);
  } else {
    console.log('  ✔ STRESS HARNESS: PASSED');
    console.log('───────────────────────────────────────────');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Stress harness crashed:', err);
  process.exit(1);
});
