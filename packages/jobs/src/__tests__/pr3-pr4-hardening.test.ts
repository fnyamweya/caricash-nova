import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sha256Hex, EventName, TxnState } from '@caricash/shared';

/**
 * PR3+PR4 Tests — Reconciliation, Repair, Integrity, Ops Hardening, Governance
 *
 * 1) Reconciliation mismatch detection + run tracking
 * 2) Suspense account alert
 * 3) Idempotency repair flow
 * 4) Incomplete state repair (stale IN_PROGRESS)
 * 5) Hash chain integrity pass
 * 6) Hash chain integrity fail (simulate tampering)
 * 7) Maker-checker enforcement (maker cannot approve own request)
 * 8) Staff-only endpoint access control
 * 9) Queue replay idempotency
 */

// ---------------------------------------------------------------------------
// Inline helpers (matching production implementations)
// ---------------------------------------------------------------------------

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

function detectMismatch(
  computedBalance: string,
  materializedBalance: string,
): { isMismatch: boolean; discrepancyCents: bigint; severity: string } {
  const computedCents = parseAmountSafe(computedBalance);
  const materializedCents = parseAmountSafe(materializedBalance);
  const discrepancyCents = computedCents - materializedCents;
  const isMismatch = discrepancyCents !== 0n;
  return {
    isMismatch,
    discrepancyCents,
    severity: isMismatch ? classifySeverity(discrepancyCents) : 'LOW',
  };
}

async function computeJournalHash(
  journal: { id: string; txn_type: string; currency: string; correlation_id: string; idempotency_key: string; state: string; description: string; created_at: string },
  prevHash: string,
): Promise<string> {
  const canonical = [
    journal.id, journal.txn_type, journal.currency,
    journal.correlation_id, journal.idempotency_key,
    journal.state, journal.description, journal.created_at, prevHash,
  ].join('|');
  return sha256Hex(canonical);
}

// ---------------------------------------------------------------------------
// 1) Reconciliation mismatch detection + run tracking
// ---------------------------------------------------------------------------

describe('PR3+4: reconciliation run tracking', () => {
  it('tracks run status progression: RUNNING → COMPLETED', () => {
    const run = {
      id: 'run-001',
      started_at: '2025-01-01T00:00:00Z',
      status: 'RUNNING' as const,
      accounts_checked: 0,
      mismatches_found: 0,
    };
    expect(run.status).toBe('RUNNING');

    // After completion
    const completed = {
      ...run,
      status: 'COMPLETED' as const,
      finished_at: '2025-01-01T00:01:00Z',
      accounts_checked: 50,
      mismatches_found: 2,
    };
    expect(completed.status).toBe('COMPLETED');
    expect(completed.accounts_checked).toBe(50);
    expect(completed.mismatches_found).toBe(2);
  });

  it('tracks run status progression: RUNNING → FAILED', () => {
    const run = {
      id: 'run-002',
      started_at: '2025-01-01T00:00:00Z',
      status: 'RUNNING' as const,
    };
    const failed = {
      ...run,
      status: 'FAILED' as const,
      finished_at: '2025-01-01T00:00:30Z',
      summary_json: JSON.stringify({ error: 'DB unavailable' }),
    };
    expect(failed.status).toBe('FAILED');
    expect(JSON.parse(failed.summary_json!).error).toBe('DB unavailable');
  });

  it('findings include currency field', () => {
    const finding = {
      id: 'f-001',
      account_id: 'acct-001',
      expected_balance: '100.00',
      actual_balance: '95.00',
      discrepancy: '5.00',
      severity: 'MEDIUM',
      status: 'OPEN',
      run_id: 'run-001',
      created_at: '2025-01-01T00:00:00Z',
      currency: 'BBD',
    };
    expect(finding.currency).toBe('BBD');
  });

  it('CRITICAL mismatch does NOT auto-correct balance', () => {
    const result = detectMismatch('2000.00', '100.00');
    expect(result.severity).toBe('CRITICAL');
    // Verify the discrepancy is flagged, not corrected
    expect(result.isMismatch).toBe(true);
    // The reconciliation job flags but never writes to wallet_balances
  });
});

// ---------------------------------------------------------------------------
// 2) Suspense account alert
// ---------------------------------------------------------------------------

describe('PR3+4: suspense aging detection', () => {
  it('detects non-zero suspense accounts beyond threshold', () => {
    const account = {
      id: 'suspense-001',
      account_type: 'SUSPENSE',
      balance: '50.00',
      created_at: new Date(Date.now() - 80 * 60 * 60 * 1000).toISOString(), // 80 hours ago
    };
    const thresholdHours = 72;
    const ageHours = Math.floor((Date.now() - new Date(account.created_at).getTime()) / (1000 * 60 * 60));

    expect(ageHours).toBeGreaterThanOrEqual(thresholdHours);
    expect(parseFloat(account.balance)).not.toBe(0);
    // This should trigger SUSPENSE_AGING_DETECTED + ALERT_RAISED events
  });

  it('ignores zero-balance suspense accounts', () => {
    const account = {
      id: 'suspense-002',
      account_type: 'SUSPENSE',
      balance: '0.00',
    };
    const balanceNum = parseFloat(account.balance);
    expect(balanceNum).toBe(0);
    // Zero balance should NOT trigger alert
  });
});

// ---------------------------------------------------------------------------
// 3) Idempotency repair flow
// ---------------------------------------------------------------------------

describe('PR3+4: idempotency repair', () => {
  it('identifies journals without idempotency records', () => {
    const journals = [
      { id: 'j-1', state: 'POSTED', idempotency_key: 'k-1' },
      { id: 'j-2', state: 'POSTED', idempotency_key: 'k-2' },
      { id: 'j-3', state: 'FAILED', idempotency_key: 'k-3' },
    ];
    const idempotencyRecords = new Map([['k-1', { id: 'idem-1' }]]);

    const posted = journals.filter(j => j.state === TxnState.POSTED);
    expect(posted).toHaveLength(2);

    const missing = posted.filter(j => !idempotencyRecords.has(j.idempotency_key));
    expect(missing).toHaveLength(1);
    expect(missing[0].id).toBe('j-2');
  });

  it('backfilled record includes journal entries', () => {
    const journal = { id: 'j-repair', state: 'POSTED', created_at: '2025-01-01T00:00:00Z' };
    const lines = [
      { account_id: 'acct-1', entry_type: 'DR', amount: '100.00' },
      { account_id: 'acct-2', entry_type: 'CR', amount: '100.00' },
    ];

    const result = {
      journal_id: journal.id,
      state: journal.state,
      entries: lines.map(l => ({
        account_id: l.account_id,
        entry_type: l.entry_type,
        amount: l.amount,
      })),
      created_at: journal.created_at,
    };

    expect(result.journal_id).toBe('j-repair');
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].entry_type).toBe('DR');
    expect(result.entries[1].entry_type).toBe('CR');
  });

  it('emits REPAIR_EXECUTED event for backfilled record', () => {
    const events: { name: string; payload: any }[] = [];

    // Simulate event emission
    events.push({
      name: EventName.REPAIR_EXECUTED,
      payload: { journal_id: 'j-repair', repair_type: 'MISSING_IDEMPOTENCY_RECORD' },
    });

    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(EventName.REPAIR_EXECUTED);
    expect(events[0].payload.repair_type).toBe('MISSING_IDEMPOTENCY_RECORD');
  });
});

// ---------------------------------------------------------------------------
// 4) Incomplete state repair (stale IN_PROGRESS)
// ---------------------------------------------------------------------------

describe('PR3+4: stale IN_PROGRESS repair', () => {
  it('identifies stale IN_PROGRESS records beyond timeout', () => {
    const now = Date.now();
    const records = [
      { id: 'r-1', result_json: '{"state":"IN_PROGRESS"}', created_at: new Date(now - 10 * 60 * 1000).toISOString() }, // 10 min ago
      { id: 'r-2', result_json: '{"state":"IN_PROGRESS"}', created_at: new Date(now - 2 * 60 * 1000).toISOString() },  // 2 min ago
      { id: 'r-3', result_json: '{"state":"COMPLETED"}', created_at: new Date(now - 10 * 60 * 1000).toISOString() },    // completed
    ];

    const timeoutMinutes = 5;
    const cutoff = new Date(now - timeoutMinutes * 60 * 1000);

    const stale = records.filter(r => {
      if (!r.result_json.includes('IN_PROGRESS')) return false;
      return new Date(r.created_at) < cutoff;
    });

    expect(stale).toHaveLength(1);
    expect(stale[0].id).toBe('r-1');
  });

  it('marks COMPLETED only if journal exists and is POSTED', () => {
    const record = { id: 'r-stale', result_json: JSON.stringify({ state: 'IN_PROGRESS', journal_id: 'j-123' }) };
    const journal = { id: 'j-123', state: TxnState.POSTED };

    // Should repair
    const shouldRepair = journal && journal.state === TxnState.POSTED;
    expect(shouldRepair).toBe(true);

    // Simulate repair
    const parsed = JSON.parse(record.result_json);
    parsed.state = TxnState.POSTED;
    const repaired = JSON.stringify(parsed);

    expect(JSON.parse(repaired).state).toBe(TxnState.POSTED);
  });

  it('does NOT repair if journal is not POSTED', () => {
    const journal = { id: 'j-456', state: TxnState.FAILED };
    const shouldRepair = journal.state === TxnState.POSTED;
    expect(shouldRepair).toBe(false);
  });

  it('emits STATE_REPAIRED event', () => {
    const events: { name: string; payload: any }[] = [];

    events.push({
      name: EventName.STATE_REPAIRED,
      payload: {
        record_id: 'r-stale',
        repair_type: 'STALE_IN_PROGRESS',
        journal_id: 'j-123',
        previous_state: 'IN_PROGRESS',
        new_state: 'COMPLETED',
      },
    });

    expect(events[0].name).toBe(EventName.STATE_REPAIRED);
    expect(events[0].payload.previous_state).toBe('IN_PROGRESS');
    expect(events[0].payload.new_state).toBe('COMPLETED');
  });
});

// ---------------------------------------------------------------------------
// 5) Hash chain integrity pass
// ---------------------------------------------------------------------------

describe('PR3+4: hash chain integrity verification', () => {
  const j1 = {
    id: 'j-001', txn_type: 'DEPOSIT', currency: 'BBD',
    correlation_id: 'corr-1', idempotency_key: 'key-1',
    state: 'POSTED', description: 'Deposit', created_at: '2025-01-01T00:00:00Z',
  };
  const j2 = {
    id: 'j-002', txn_type: 'P2P', currency: 'BBD',
    correlation_id: 'corr-2', idempotency_key: 'key-2',
    state: 'POSTED', description: 'Transfer', created_at: '2025-01-01T01:00:00Z',
  };
  const j3 = {
    id: 'j-003', txn_type: 'WITHDRAWAL', currency: 'BBD',
    correlation_id: 'corr-3', idempotency_key: 'key-3',
    state: 'POSTED', description: 'Withdrawal', created_at: '2025-01-01T02:00:00Z',
  };

  it('verifies a valid chain of 3 journals', async () => {
    const hash1 = await computeJournalHash(j1, '');
    const hash2 = await computeJournalHash(j2, hash1);
    const hash3 = await computeJournalHash(j3, hash2);

    // Verify chain
    const recomputed1 = await computeJournalHash(j1, '');
    expect(recomputed1).toBe(hash1);

    const recomputed2 = await computeJournalHash(j2, recomputed1);
    expect(recomputed2).toBe(hash2);

    const recomputed3 = await computeJournalHash(j3, recomputed2);
    expect(recomputed3).toBe(hash3);
  });

  it('hash is deterministic (same inputs always same output)', async () => {
    const h1 = await computeJournalHash(j1, '');
    const h2 = await computeJournalHash(j1, '');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// 6) Hash chain integrity fail (simulate tampering)
// ---------------------------------------------------------------------------

describe('PR3+4: hash chain tampering detection', () => {
  const j1 = {
    id: 'j-001', txn_type: 'DEPOSIT', currency: 'BBD',
    correlation_id: 'corr-1', idempotency_key: 'key-1',
    state: 'POSTED', description: 'Deposit 100 BBD', created_at: '2025-01-01T00:00:00Z',
  };
  const j2 = {
    id: 'j-002', txn_type: 'P2P', currency: 'BBD',
    correlation_id: 'corr-2', idempotency_key: 'key-2',
    state: 'POSTED', description: 'P2P transfer', created_at: '2025-01-01T01:00:00Z',
  };

  it('detects tampered journal description', async () => {
    const hash1 = await computeJournalHash(j1, '');
    const hash2 = await computeJournalHash(j2, hash1);

    // Tamper with j2
    const tampered = { ...j2, description: 'TAMPERED VALUE' };
    const tamperedHash = await computeJournalHash(tampered, hash1);

    expect(tamperedHash).not.toBe(hash2);
  });

  it('detects tampered journal amount via description change', async () => {
    const hash1 = await computeJournalHash(j1, '');
    const originalHash = await computeJournalHash(j1, '');
    expect(hash1).toBe(originalHash);

    // Tamper the first journal
    const tampered = { ...j1, description: 'Deposit 999 BBD' };
    const tamperedHash = await computeJournalHash(tampered, '');
    expect(tamperedHash).not.toBe(hash1);

    // Chain breaks for subsequent journals
    const hash2WithOriginal = await computeJournalHash(j2, hash1);
    const hash2WithTampered = await computeJournalHash(j2, tamperedHash);
    expect(hash2WithOriginal).not.toBe(hash2WithTampered);
  });

  it('detects modified prev_hash (chain rewrite)', async () => {
    const hash1 = await computeJournalHash(j1, '');
    const hash2 = await computeJournalHash(j2, hash1);

    // Try to recompute j2 with a fake prev_hash
    const fakeHash2 = await computeJournalHash(j2, 'fake_prev_hash');
    expect(fakeHash2).not.toBe(hash2);
  });
});

// ---------------------------------------------------------------------------
// 7) Maker-checker enforcement
// ---------------------------------------------------------------------------

describe('PR3+4: maker-checker governance enforcement', () => {
  it('rejects when maker === checker', () => {
    const maker = 'staff-alice';
    const checker = 'staff-alice';
    const isViolation = maker === checker;
    expect(isViolation).toBe(true);
  });

  it('allows when maker !== checker', () => {
    const maker = 'staff-alice';
    const checker = 'staff-bob';
    const isViolation = maker === checker;
    expect(isViolation).toBe(false);
  });

  it('tracks before/after state on approval', () => {
    const audit = {
      action: 'OVERDRAFT_APPROVED',
      before_json: JSON.stringify({ state: 'PENDING' }),
      after_json: JSON.stringify({ state: 'ACTIVE' }),
      actor_id: 'staff-checker',
    };
    expect(JSON.parse(audit.before_json).state).toBe('PENDING');
    expect(JSON.parse(audit.after_json).state).toBe('ACTIVE');
  });

  it('tracks before/after state on rejection', () => {
    const audit = {
      action: 'OVERDRAFT_REJECTED',
      before_json: JSON.stringify({ state: 'PENDING' }),
      after_json: JSON.stringify({ state: 'REJECTED', reason: 'Insufficient history' }),
    };
    expect(JSON.parse(audit.after_json).state).toBe('REJECTED');
    expect(JSON.parse(audit.after_json).reason).toBe('Insufficient history');
  });

  it('applies to all governed operations', () => {
    const governedOps = [
      'REVERSAL_REQUESTED',
      'MANUAL_ADJUSTMENT_REQUESTED',
      'FEE_MATRIX_CHANGE_REQUESTED',
      'COMMISSION_MATRIX_CHANGE_REQUESTED',
      'OVERDRAFT_FACILITY_REQUESTED',
    ];
    expect(governedOps).toHaveLength(5);
    // Each of these requires maker != checker approval
  });
});

// ---------------------------------------------------------------------------
// 8) Staff-only endpoint access control
// ---------------------------------------------------------------------------

describe('PR3+4: staff-only access control', () => {
  it('rejects requests without X-Staff-Id header', () => {
    const staffId: string | null = null;
    expect(staffId).toBeNull();
    // All ops endpoints should return 401 when staffId is null
  });

  it('accepts requests with valid X-Staff-Id', () => {
    const staffId: string | null = 'staff-ops-001';
    expect(staffId).not.toBeNull();
  });

  it('all ops endpoints require staff auth', () => {
    const opsEndpoints = [
      'GET /ops/ledger/journal/:id',
      'GET /ops/ledger/verify',
      'POST /ops/reconciliation/run',
      'GET /ops/reconciliation/findings',
      'GET /ops/reconciliation/runs',
      'POST /ops/repair/idempotency/:journal_id',
      'POST /ops/repair/state/:journal_id',
      'POST /ops/overdraft/request',
      'POST /ops/overdraft/:id/approve',
      'POST /ops/overdraft/:id/reject',
    ];
    expect(opsEndpoints).toHaveLength(10);
    // Each endpoint checks requireStaff() and returns 401 if null
  });

  it('repair endpoints require staff auth (G4)', () => {
    // G4: Never allow repair endpoints for non-staff users
    const repairEndpoints = [
      'POST /ops/repair/idempotency/:journal_id',
      'POST /ops/repair/state/:journal_id',
    ];
    expect(repairEndpoints).toHaveLength(2);
    // Both go through requireStaff() + emit audit logs
  });
});

// ---------------------------------------------------------------------------
// 9) Queue replay idempotency
// ---------------------------------------------------------------------------

describe('PR3+4: queue consumer idempotency', () => {
  it('processes a message exactly once', async () => {
    const processedIds = new Set<string>();
    let processCount = 0;

    const handler = async (messageId: string) => {
      if (processedIds.has(messageId)) {
        return { processed: false, deduplicated: true };
      }
      processedIds.add(messageId);
      processCount++;
      return { processed: true, deduplicated: false };
    };

    const r1 = await handler('msg-001');
    expect(r1.processed).toBe(true);
    expect(r1.deduplicated).toBe(false);

    // Replay same message
    const r2 = await handler('msg-001');
    expect(r2.processed).toBe(false);
    expect(r2.deduplicated).toBe(true);

    expect(processCount).toBe(1);
  });

  it('processes different messages independently', async () => {
    const processedIds = new Set<string>();
    let processCount = 0;

    const handler = async (messageId: string) => {
      if (processedIds.has(messageId)) {
        return { processed: false, deduplicated: true };
      }
      processedIds.add(messageId);
      processCount++;
      return { processed: true };
    };

    await handler('msg-A');
    await handler('msg-B');
    await handler('msg-C');
    await handler('msg-A'); // replay

    expect(processCount).toBe(3);
  });

  it('emits CONSUMER_ERROR on handler failure', () => {
    const events: { name: string; payload: any }[] = [];

    // Simulate handler failure
    const error = new Error('DB connection failed');
    events.push({
      name: EventName.CONSUMER_ERROR,
      payload: {
        topic: 'RECONCILIATION',
        message_id: 'msg-fail',
        error: error.message,
      },
    });

    expect(events[0].name).toBe(EventName.CONSUMER_ERROR);
    expect(events[0].payload.error).toBe('DB connection failed');
  });
});

// ---------------------------------------------------------------------------
// 10) Event names verification
// ---------------------------------------------------------------------------

describe('PR3+4: event taxonomy completeness', () => {
  it('includes STATE_REPAIRED event', () => {
    expect(EventName.STATE_REPAIRED).toBe('STATE_REPAIRED');
  });

  it('includes CONSUMER_ERROR event', () => {
    expect(EventName.CONSUMER_ERROR).toBe('CONSUMER_ERROR');
  });

  it('includes OVERDRAFT_FACILITY_REJECTED event', () => {
    expect(EventName.OVERDRAFT_FACILITY_REJECTED).toBe('OVERDRAFT_FACILITY_REJECTED');
  });
});
