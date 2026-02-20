import { describe, it, expect } from 'vitest';
import {
  assertBalanced,
  formatAmount,
  InsufficientFundsError,
  IdempotencyConflictError,
  UnbalancedJournalError,
} from '@caricash/shared';

/**
 * Concurrency harness — simulates parallel spend attempts.
 * In a real environment these would call the PostingDO;
 * here we test the invariant logic directly.
 */

describe('concurrency harness: parallel spend simulation', () => {
  /**
   * Simulates a serialized account with a balance.
   * Enforces that only one of N concurrent spends can succeed if total exceeds balance.
   */
  class SimulatedAccount {
    private balanceCents: bigint;
    private postedJournals: string[] = [];
    private processing = false;

    constructor(initialBalance: string) {
      this.balanceCents = BigInt(initialBalance.replace('.', ''));
    }

    // Simulate blockConcurrencyWhile serialization
    async trySpend(journalId: string, amountStr: string): Promise<{ success: boolean; journalId: string }> {
      // Wait if another operation is in progress (simulates DO serialization)
      while (this.processing) {
        await new Promise((r) => setTimeout(r, 1));
      }
      this.processing = true;

      try {
        const amountCents = BigInt(amountStr.replace('.', ''));

        if (this.balanceCents < amountCents) {
          throw new InsufficientFundsError(
            `Balance ${formatAmount(this.balanceCents)} insufficient for ${amountStr}`,
          );
        }

        this.balanceCents -= amountCents;
        this.postedJournals.push(journalId);

        return { success: true, journalId };
      } catch {
        return { success: false, journalId };
      } finally {
        this.processing = false;
      }
    }

    getBalance(): string {
      return formatAmount(this.balanceCents);
    }

    getPostedJournals(): string[] {
      return this.postedJournals;
    }
  }

  it('allows single spend within balance', async () => {
    const account = new SimulatedAccount('100.00');
    const result = await account.trySpend('j-001', '50.00');
    expect(result.success).toBe(true);
    expect(account.getBalance()).toBe('50.00');
  });

  it('rejects spend exceeding balance', async () => {
    const account = new SimulatedAccount('100.00');
    const result = await account.trySpend('j-001', '150.00');
    expect(result.success).toBe(false);
    expect(account.getBalance()).toBe('100.00');
  });

  it('parallel spends: exactly one succeeds when total exceeds balance', async () => {
    const account = new SimulatedAccount('100.00');

    // Two parallel spends of 80.00 each — only one should succeed
    const results = await Promise.all([
      account.trySpend('j-001', '80.00'),
      account.trySpend('j-002', '80.00'),
    ]);

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    expect(account.getBalance()).toBe('20.00');
    expect(account.getPostedJournals()).toHaveLength(1);
  });

  it('parallel spends: all succeed when total within balance', async () => {
    const account = new SimulatedAccount('100.00');

    const results = await Promise.all([
      account.trySpend('j-001', '20.00'),
      account.trySpend('j-002', '30.00'),
      account.trySpend('j-003', '25.00'),
    ]);

    const successes = results.filter((r) => r.success);
    expect(successes.length).toBe(3);
    expect(account.getBalance()).toBe('25.00'); // 100 - 20 - 30 - 25 = 25
  });

  it('N parallel attempts with limited balance', async () => {
    const account = new SimulatedAccount('50.00');
    const N = 10;

    const promises = Array.from({ length: N }, (_, i) =>
      account.trySpend(`j-${i}`, '10.00'),
    );

    const results = await Promise.all(promises);
    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    // Exactly 5 should succeed (50.00 / 10.00 = 5)
    expect(successes.length).toBe(5);
    expect(failures.length).toBe(5);
    expect(account.getBalance()).toBe('0.00');
  });
});

describe('concurrency invariants', () => {
  it('balance never goes negative without overdraft', () => {
    let balance = 10000n; // 100.00 in cents
    const spends = [5000n, 3000n, 2000n, 1000n]; // total = 110.00 > 100.00

    let totalSpent = 0n;
    for (const spend of spends) {
      if (balance >= spend) {
        balance -= spend;
        totalSpent += spend;
      }
    }

    expect(balance).toBeGreaterThanOrEqual(0n);
    expect(totalSpent).toBe(10000n); // Only 100.00 total
  });
});
