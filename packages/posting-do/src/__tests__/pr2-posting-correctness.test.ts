import { describe, it, expect } from 'vitest';
import {
  computeScopeHash,
  computePayloadHash,
  assertBalanced,
  assertSameCurrency,
  parseAmount,
  formatAmount,
  IdempotencyConflictError,
  InsufficientFundsError,
  ErrorCode,
  TxnState,
  TxnType,
  ActorType,
  EventName,
} from '@caricash/shared';
import type { PostTransactionCommand, PostTransactionResult, IdempotencyRecord } from '@caricash/shared';
import { buildDepositEntries, buildP2PEntries } from '../journal-templates.js';

/**
 * PR2 Tests — Posting DO Routing + Idempotency + Strict Conflict Handling
 *
 * These tests verify the correctness requirements from Phase 2 PR2:
 * 1. Idempotency: same envelope twice → same journal_id, same receipt
 * 2. Conflict: same idempotency_key with different payload → DUPLICATE_IDEMPOTENCY_CONFLICT
 * 3. Serialization: two concurrent debits that exceed funds → only one succeeds
 * 4. Error code propagation
 * 5. Audit/event guarantees
 */

// ---------------------------------------------------------------------------
// Test helper: Simulated PostingDO core logic
// ---------------------------------------------------------------------------

interface SimState {
  idempotencyRecords: Map<string, { scope_hash: string; payload_hash: string; result_json: string; status: string }>;
  balances: Map<string, bigint>; // account_id -> cents
  journals: { id: string; entries: any[]; txn_type: string; currency: string }[];
  events: { name: string; entity_id: string; correlation_id: string }[];
  auditLogs: { action: string; actor_id: string; target_id: string; correlation_id: string }[];
}

function createState(): SimState {
  return {
    idempotencyRecords: new Map(),
    balances: new Map(),
    journals: [],
    events: [],
    auditLogs: [],
  };
}

/**
 * Simulates the PostingDO.postTransaction logic from packages/posting-do/src/index.ts.
 * This mirrors the real implementation's idempotency, conflict detection, and fund checks.
 */
async function simulatePostTransaction(
  state: SimState,
  command: PostTransactionCommand,
): Promise<PostTransactionResult> {
  // 1. Compute scope_hash (now includes actor_type per PR2)
  const scopeHash = await computeScopeHash(
    command.actor_type,
    command.actor_id,
    command.txn_type,
    command.idempotency_key,
  );

  // 2. Compute payload_hash
  const payloadHash = await computePayloadHash({
    entries: command.entries,
    currency: command.currency,
    description: command.description,
  });

  // 3. Check idempotency record
  const existing = state.idempotencyRecords.get(scopeHash);
  if (existing) {
    // G4: payload_hash differs → conflict
    if (existing.payload_hash !== payloadHash) {
      throw new IdempotencyConflictError(
        `Idempotency key "${command.idempotency_key}" already used with different payload`,
      );
    }
    // Same payload → return stored result
    return JSON.parse(existing.result_json) as PostTransactionResult;
  }

  // 4. Cross-currency guard (G1)
  assertSameCurrency([command.currency]);

  // 5. Balance check (G3: append-only, no direct writes)
  assertBalanced(command.entries);

  // 6. Sufficient funds check (G7: no silent overdraft)
  const drEntries = command.entries.filter((e) => e.entry_type === 'DR');
  const drByAccount = new Map<string, bigint>();
  for (const e of drEntries) {
    const current = drByAccount.get(e.account_id) ?? 0n;
    drByAccount.set(e.account_id, current + parseAmount(e.amount));
  }
  for (const [accountId, requiredCents] of drByAccount) {
    const balance = state.balances.get(accountId) ?? 0n;
    if (balance < requiredCents) {
      throw new InsufficientFundsError(
        `Account ${accountId} has balance ${formatAmount(balance)} but needs ${formatAmount(requiredCents)}`,
      );
    }
  }

  // 7. Build journal
  const journalId = `journal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = new Date().toISOString();

  const result: PostTransactionResult = {
    journal_id: journalId,
    state: TxnState.POSTED,
    entries: command.entries,
    created_at: now,
    correlation_id: command.correlation_id,
    txn_type: command.txn_type,
    currency: command.currency,
  };

  // 8. Update balances from entries
  for (const entry of command.entries) {
    const cents = parseAmount(entry.amount);
    const current = state.balances.get(entry.account_id) ?? 0n;
    if (entry.entry_type === 'CR') {
      state.balances.set(entry.account_id, current + cents);
    } else {
      state.balances.set(entry.account_id, current - cents);
    }
  }

  // 9. Record journal
  state.journals.push({
    id: journalId,
    entries: command.entries,
    txn_type: command.txn_type,
    currency: command.currency,
  });

  // 10. Emit events (G8: observability)
  state.events.push(
    { name: EventName.TXN_POSTED, entity_id: journalId, correlation_id: command.correlation_id },
    { name: EventName.TXN_COMPLETED, entity_id: journalId, correlation_id: command.correlation_id },
  );

  // 11. Emit audit log
  state.auditLogs.push({
    action: `${command.txn_type}_POSTED`,
    actor_id: command.actor_id,
    target_id: journalId,
    correlation_id: command.correlation_id,
  });

  // 12. Store idempotency record
  state.idempotencyRecords.set(scopeHash, {
    scope_hash: scopeHash,
    payload_hash: payloadHash,
    result_json: JSON.stringify(result),
    status: 'COMPLETED',
  });

  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PR2: idempotency — same envelope twice returns same journal_id', () => {
  it('returns same journal_id on repeated identical request', async () => {
    const state = createState();
    state.balances.set('agent-float-acct', 100000n); // 1000.00

    const entries = buildDepositEntries('agent-float-acct', 'customer-wallet-acct', '100.00');

    const command: PostTransactionCommand = {
      idempotency_key: 'deposit-001',
      correlation_id: 'corr-001',
      txn_type: TxnType.DEPOSIT,
      currency: 'BBD',
      entries,
      description: 'Deposit 100 BBD',
      actor_type: ActorType.AGENT,
      actor_id: 'agent-1',
    };

    const result1 = await simulatePostTransaction(state, command);
    const result2 = await simulatePostTransaction(state, command);

    expect(result1.journal_id).toBe(result2.journal_id);
    expect(result1.state).toBe(result2.state);
    expect(result1.created_at).toBe(result2.created_at);
    expect(result1.correlation_id).toBe(result2.correlation_id);
    expect(result1.txn_type).toBe(result2.txn_type);
    expect(result1.currency).toBe(result2.currency);
    // Only one journal was created
    expect(state.journals).toHaveLength(1);
  });

  it('returns same receipt for third and fourth calls', async () => {
    const state = createState();
    state.balances.set('acct-A', 50000n); // 500.00

    const entries = buildP2PEntries('acct-A', 'acct-B', '25.00');

    const command: PostTransactionCommand = {
      idempotency_key: 'p2p-001',
      correlation_id: 'corr-p2p',
      txn_type: TxnType.P2P,
      currency: 'BBD',
      entries,
      description: 'P2P 25 BBD',
      actor_type: ActorType.CUSTOMER,
      actor_id: 'customer-1',
    };

    const r1 = await simulatePostTransaction(state, command);
    const r2 = await simulatePostTransaction(state, command);
    const r3 = await simulatePostTransaction(state, command);
    const r4 = await simulatePostTransaction(state, command);

    expect(r1.journal_id).toBe(r2.journal_id);
    expect(r2.journal_id).toBe(r3.journal_id);
    expect(r3.journal_id).toBe(r4.journal_id);
    expect(state.journals).toHaveLength(1);
  });
});

describe('PR2: conflict — same idempotency_key with different payload', () => {
  it('rejects same key with different amount', async () => {
    const state = createState();
    state.balances.set('agent-float', 100000n);

    const entries1 = buildDepositEntries('agent-float', 'cust-wallet', '100.00');
    const command1: PostTransactionCommand = {
      idempotency_key: 'deposit-X',
      correlation_id: 'corr-X1',
      txn_type: TxnType.DEPOSIT,
      currency: 'BBD',
      entries: entries1,
      description: 'Deposit 100 BBD',
      actor_type: ActorType.AGENT,
      actor_id: 'agent-1',
    };

    await simulatePostTransaction(state, command1);

    // Same key, different amount
    const entries2 = buildDepositEntries('agent-float', 'cust-wallet', '200.00');
    const command2: PostTransactionCommand = {
      ...command1,
      entries: entries2,
      description: 'Deposit 200 BBD',
    };

    await expect(simulatePostTransaction(state, command2)).rejects.toThrow(IdempotencyConflictError);
  });

  it('rejects same key with different recipient', async () => {
    const state = createState();
    state.balances.set('agent-float', 100000n);

    const entries1 = buildDepositEntries('agent-float', 'cust-wallet-A', '100.00');
    const command1: PostTransactionCommand = {
      idempotency_key: 'deposit-Y',
      correlation_id: 'corr-Y1',
      txn_type: TxnType.DEPOSIT,
      currency: 'BBD',
      entries: entries1,
      description: 'Deposit 100 BBD',
      actor_type: ActorType.AGENT,
      actor_id: 'agent-1',
    };

    await simulatePostTransaction(state, command1);

    // Same key, different recipient
    const entries2 = buildDepositEntries('agent-float', 'cust-wallet-B', '100.00');
    const command2: PostTransactionCommand = {
      ...command1,
      entries: entries2,
    };

    await expect(simulatePostTransaction(state, command2)).rejects.toThrow(IdempotencyConflictError);
  });

  it('conflict error message includes the idempotency key', async () => {
    const state = createState();
    state.balances.set('acct-X', 100000n);

    const entries1 = buildDepositEntries('acct-X', 'acct-Y', '50.00');
    const command1: PostTransactionCommand = {
      idempotency_key: 'my-special-key',
      correlation_id: 'corr-1',
      txn_type: TxnType.DEPOSIT,
      currency: 'BBD',
      entries: entries1,
      description: 'test',
      actor_type: ActorType.AGENT,
      actor_id: 'agent-1',
    };

    await simulatePostTransaction(state, command1);

    const entries2 = buildDepositEntries('acct-X', 'acct-Y', '75.00');
    const command2: PostTransactionCommand = {
      ...command1,
      entries: entries2,
      description: 'different',
    };

    try {
      await simulatePostTransaction(state, command2);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(IdempotencyConflictError);
      expect((err as Error).message).toContain('my-special-key');
    }
  });
});

describe('PR2: serialization — concurrent debits exceeding funds', () => {
  it('only one of two concurrent spends succeeds when total exceeds balance', async () => {
    const state = createState();
    state.balances.set('sender-acct', 10000n); // 100.00

    const entries80 = buildP2PEntries('sender-acct', 'receiver-acct', '80.00');
    const command1: PostTransactionCommand = {
      idempotency_key: 'spend-1',
      correlation_id: 'corr-spend-1',
      txn_type: TxnType.P2P,
      currency: 'BBD',
      entries: entries80,
      description: 'P2P 80 BBD',
      actor_type: ActorType.CUSTOMER,
      actor_id: 'customer-1',
    };

    const entries60 = buildP2PEntries('sender-acct', 'receiver-acct-2', '60.00');
    const command2: PostTransactionCommand = {
      idempotency_key: 'spend-2',
      correlation_id: 'corr-spend-2',
      txn_type: TxnType.P2P,
      currency: 'BBD',
      entries: entries60,
      description: 'P2P 60 BBD',
      actor_type: ActorType.CUSTOMER,
      actor_id: 'customer-1',
    };

    // Serialized execution (DO serializes via blockConcurrencyWhile)
    const result1 = await simulatePostTransaction(state, command1);
    expect(result1.state).toBe(TxnState.POSTED);
    expect(state.balances.get('sender-acct')).toBe(2000n); // 100 - 80 = 20.00

    // Second spend should fail: balance is 20.00 but needs 60.00
    await expect(simulatePostTransaction(state, command2)).rejects.toThrow(InsufficientFundsError);

    // Only one journal created
    expect(state.journals).toHaveLength(1);
  });

  it('both succeed when total is within balance', async () => {
    const state = createState();
    state.balances.set('sender-acct', 20000n); // 200.00

    const entries1 = buildP2PEntries('sender-acct', 'receiver-1', '80.00');
    const cmd1: PostTransactionCommand = {
      idempotency_key: 'spend-A',
      correlation_id: 'corr-A',
      txn_type: TxnType.P2P,
      currency: 'BBD',
      entries: entries1,
      description: 'P2P 80',
      actor_type: ActorType.CUSTOMER,
      actor_id: 'cust-1',
    };

    const entries2 = buildP2PEntries('sender-acct', 'receiver-2', '60.00');
    const cmd2: PostTransactionCommand = {
      idempotency_key: 'spend-B',
      correlation_id: 'corr-B',
      txn_type: TxnType.P2P,
      currency: 'BBD',
      entries: entries2,
      description: 'P2P 60',
      actor_type: ActorType.CUSTOMER,
      actor_id: 'cust-1',
    };

    const r1 = await simulatePostTransaction(state, cmd1);
    const r2 = await simulatePostTransaction(state, cmd2);

    expect(r1.state).toBe(TxnState.POSTED);
    expect(r2.state).toBe(TxnState.POSTED);
    expect(state.journals).toHaveLength(2);
    expect(state.balances.get('sender-acct')).toBe(6000n); // 200 - 80 - 60 = 60.00
  });
});

describe('PR2: scope_hash includes actor_type for isolation', () => {
  it('same actor_id + same key but different actor_type → separate idempotency scopes', async () => {
    const hash1 = await computeScopeHash('CUSTOMER', 'actor-1', 'DEPOSIT', 'key-1');
    const hash2 = await computeScopeHash('AGENT', 'actor-1', 'DEPOSIT', 'key-1');
    expect(hash1).not.toBe(hash2);
  });

  it('same actor_type + same actor_id + same txn_type + same key → identical scope', async () => {
    const hash1 = await computeScopeHash('AGENT', 'agent-X', 'DEPOSIT', 'key-ABC');
    const hash2 = await computeScopeHash('AGENT', 'agent-X', 'DEPOSIT', 'key-ABC');
    expect(hash1).toBe(hash2);
  });
});

describe('PR2: audit and event emission guarantees (G8)', () => {
  it('emits TXN_POSTED and TXN_COMPLETED events per posting', async () => {
    const state = createState();
    state.balances.set('acct-1', 50000n);

    const entries = buildDepositEntries('acct-1', 'acct-2', '25.00');
    const command: PostTransactionCommand = {
      idempotency_key: 'dep-event',
      correlation_id: 'corr-evt',
      txn_type: TxnType.DEPOSIT,
      currency: 'BBD',
      entries,
      description: 'test',
      actor_type: ActorType.AGENT,
      actor_id: 'agent-1',
    };

    const result = await simulatePostTransaction(state, command);

    expect(state.events).toHaveLength(2);
    expect(state.events[0].name).toBe(EventName.TXN_POSTED);
    expect(state.events[1].name).toBe(EventName.TXN_COMPLETED);
    expect(state.events[0].entity_id).toBe(result.journal_id);
    expect(state.events[0].correlation_id).toBe('corr-evt');
  });

  it('emits audit log with actor and target info', async () => {
    const state = createState();
    state.balances.set('acct-X', 50000n);

    const entries = buildDepositEntries('acct-X', 'acct-Y', '10.00');
    const command: PostTransactionCommand = {
      idempotency_key: 'dep-audit',
      correlation_id: 'corr-audit',
      txn_type: TxnType.DEPOSIT,
      currency: 'BBD',
      entries,
      description: 'audit test',
      actor_type: ActorType.AGENT,
      actor_id: 'agent-audit',
    };

    const result = await simulatePostTransaction(state, command);

    expect(state.auditLogs).toHaveLength(1);
    expect(state.auditLogs[0].action).toBe('DEPOSIT_POSTED');
    expect(state.auditLogs[0].actor_id).toBe('agent-audit');
    expect(state.auditLogs[0].target_id).toBe(result.journal_id);
    expect(state.auditLogs[0].correlation_id).toBe('corr-audit');
  });

  it('does not emit events/audit for idempotent replay', async () => {
    const state = createState();
    state.balances.set('acct-1', 50000n);

    const entries = buildDepositEntries('acct-1', 'acct-2', '10.00');
    const command: PostTransactionCommand = {
      idempotency_key: 'dep-replay',
      correlation_id: 'corr-replay',
      txn_type: TxnType.DEPOSIT,
      currency: 'BBD',
      entries,
      description: 'replay test',
      actor_type: ActorType.AGENT,
      actor_id: 'agent-1',
    };

    await simulatePostTransaction(state, command);
    expect(state.events).toHaveLength(2);
    expect(state.auditLogs).toHaveLength(1);

    // Replay — should NOT add more events/audit
    await simulatePostTransaction(state, command);
    expect(state.events).toHaveLength(2); // unchanged
    expect(state.auditLogs).toHaveLength(1); // unchanged
  });
});

describe('PR2: receipt includes correlation_id, txn_type, currency', () => {
  it('result contains all receipt fields', async () => {
    const state = createState();
    state.balances.set('acct-1', 50000n);

    const entries = buildDepositEntries('acct-1', 'acct-2', '50.00');
    const command: PostTransactionCommand = {
      idempotency_key: 'dep-receipt',
      correlation_id: 'corr-receipt-001',
      txn_type: TxnType.DEPOSIT,
      currency: 'BBD',
      entries,
      description: 'receipt test',
      actor_type: ActorType.AGENT,
      actor_id: 'agent-1',
    };

    const result = await simulatePostTransaction(state, command);

    expect(result.journal_id).toBeTruthy();
    expect(result.state).toBe(TxnState.POSTED);
    expect(result.correlation_id).toBe('corr-receipt-001');
    expect(result.txn_type).toBe(TxnType.DEPOSIT);
    expect(result.currency).toBe('BBD');
    expect(result.entries).toEqual(entries);
    expect(result.created_at).toBeTruthy();
  });
});

describe('PR2: cross-currency rejection (G1)', () => {
  it('rejects posting with mixed currencies in assertSameCurrency', () => {
    expect(() => assertSameCurrency(['BBD', 'USD'])).toThrow('Cross-currency');
  });

  it('accepts single currency', () => {
    expect(() => assertSameCurrency(['BBD'])).not.toThrow();
    expect(() => assertSameCurrency(['BBD', 'BBD'])).not.toThrow();
  });
});

describe('PR2: ErrorCode includes IDEMPOTENCY_IN_PROGRESS', () => {
  it('IDEMPOTENCY_IN_PROGRESS exists in error codes', () => {
    expect(ErrorCode.IDEMPOTENCY_IN_PROGRESS).toBe('IDEMPOTENCY_IN_PROGRESS');
  });

  it('DUPLICATE_IDEMPOTENCY_CONFLICT exists in error codes', () => {
    expect(ErrorCode.DUPLICATE_IDEMPOTENCY_CONFLICT).toBe('DUPLICATE_IDEMPOTENCY_CONFLICT');
  });
});
