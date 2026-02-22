# Operations Guide

## Overview

This document describes operational procedures for the CariCash Nova platform.
All financial operations are staff-only and require maker-checker approval where specified.

## Reconciliation

### Purpose
Reconciliation verifies that ledger-derived balances match materialized `wallet_balances`.
Discrepancies are flagged, classified by severity, and never auto-corrected.

### Running Reconciliation
```bash
# Via API (staff auth required)
curl -X POST http://localhost:8787/ops/reconciliation/run \
  -H "X-Staff-Id: staff-001"

# Response includes run_id, accounts_checked, mismatches_found, findings[]
```

### Viewing Results
```bash
# All findings
curl http://localhost:8787/ops/reconciliation/findings \
  -H "X-Staff-Id: staff-001"

# Filter by status
curl "http://localhost:8787/ops/reconciliation/findings?status=OPEN" \
  -H "X-Staff-Id: staff-001"

# All runs
curl http://localhost:8787/ops/reconciliation/runs \
  -H "X-Staff-Id: staff-001"
```

### Severity Classification
| Severity | Threshold | Action |
|----------|-----------|--------|
| LOW      | < 1.00 BBD | Monitor |
| MEDIUM   | 1.00 – 99.99 BBD | Investigate |
| HIGH     | 100.00 – 999.99 BBD | Alert raised, urgent investigation |
| CRITICAL | >= 1000.00 BBD | Alert raised, account flagged, immediate investigation |

### Important
- Reconciliation **NEVER** auto-corrects financial discrepancies (G2).
- All balance corrections require maker-checker approval via manual adjustment.
- CRITICAL findings emit `ALERT_RAISED` events for monitoring systems.

## Integrity Verification

### Purpose
The journal hash chain provides tamper detection. Each journal stores:
- `prev_hash`: hash of the previous journal
- `hash`: SHA-256 of canonical journal content + prev_hash

### Running Verification
```bash
# Full verification
curl "http://localhost:8787/ops/ledger/verify" \
  -H "X-Staff-Id: staff-001"

# Date range verification
curl "http://localhost:8787/ops/ledger/verify?from=2025-01-01&to=2025-01-31" \
  -H "X-Staff-Id: staff-001"
```

### If Integrity Check Fails
1. `INTEGRITY_CHECK_FAILED` event is emitted with `broken_at_journal_id`
2. **DO NOT** attempt to fix the hash chain automatically
3. Investigate the specific journal entry for tampering
4. Escalate to compliance and engineering leadership

## Repair Procedures

### Idempotency Record Backfill
Safe repair for a specific journal missing its idempotency record (e.g., pre-Phase 2 data).

```bash
curl -X POST http://localhost:8787/ops/repair/idempotency/{journal_id} \
  -H "X-Staff-Id: staff-001"
```

**Safety rules:**
- Targets a specific journal only (not batch repair)
- Only creates records, never modifies journals (G1)
- Emits `REPAIR_EXECUTED` event
- Backfilled records use `UNKNOWN` actor_type (documented limitation)

### Stale State Repair
Repairs a specific journal's `IN_PROGRESS` idempotency record.

```bash
curl -X POST http://localhost:8787/ops/repair/state/{journal_id} \
  -H "X-Staff-Id: staff-001"
```

**Safety rules:**
- Targets a specific journal only
- Only marks `IN_PROGRESS` → `COMPLETED` if corresponding journal is `POSTED`
- Emits `STATE_REPAIRED` event
- Never modifies ledger entries or amounts (G1)

### What Repairs NEVER Do
- Modify `ledger_journals` or `ledger_lines` (G1)
- Modify monetary amounts
- Silence discrepancies (G2)
- Bypass maker-checker (G3)

## Suspense Monitoring

Suspense accounts with non-zero balances beyond 72 hours trigger alerts.
```bash
# Suspense aging is run automatically or via reconciliation
# Emits SUSPENSE_AGING_DETECTED and ALERT_RAISED events
```

## Overdraft Management

### Request Overdraft Facility
```bash
curl -X POST http://localhost:8787/ops/overdraft/request \
  -H "X-Staff-Id: staff-001" \
  -H "Content-Type: application/json" \
  -d '{"account_id": "acct-001", "limit_amount": "500.00", "currency": "BBD"}'
```

### Approve (different staff)
```bash
curl -X POST http://localhost:8787/ops/overdraft/{request_id}/approve \
  -H "X-Staff-Id: staff-002" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Reject
```bash
curl -X POST http://localhost:8787/ops/overdraft/{request_id}/reject \
  -H "X-Staff-Id: staff-002" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Insufficient credit history"}'
```

**Governance:**
- Maker cannot approve their own request (maker-checker enforcement)
- All approvals emit audit log with before/after state
- All rejections emit `OVERDRAFT_FACILITY_REJECTED` event

## Incident Playbook

### Balance Discrepancy Detected
1. Check reconciliation findings: `GET /ops/reconciliation/findings?status=OPEN`
2. Review the affected account's journal entries: `GET /ops/ledger/journal/{id}`
3. Run integrity verification: `GET /ops/ledger/verify`
4. If integrity passes, investigate materialized balance source
5. Create manual adjustment via maker-checker if correction needed

### Hash Chain Broken
1. Identify the broken journal: check `broken_at_journal_id` in verification result
2. Compare journal content with expected hash
3. Check audit_log for any unauthorized modifications
4. Escalate to compliance team
5. Do NOT auto-fix — this may indicate tampering

### Stuck IN_PROGRESS Transaction
1. Check how long the transaction has been IN_PROGRESS
2. If beyond 5 minutes, use repair endpoint: `POST /ops/repair/state/{journal_id}`
3. Repair only marks COMPLETED if journal is POSTED
4. If journal doesn't exist, investigate the failure

### Queue Message Failure
1. Check events table for `CONSUMER_ERROR` events
2. Review the message body and error in the event payload
3. Fix the root cause and replay the message
4. Queue consumers are idempotent — safe to replay

---

## Audit Gate (Release Validation)

### Purpose
The Phase 2 Audit Gate is a formal release validation that runs all test suites and produces a PASS/FAIL report. It acts as a merge gate — no code should merge to main if the audit gate fails.

### Running the Audit Gate
```bash
# Full audit gate with formatted report
npm run audit-gate

# Or manually:
npx vitest run --reporter=verbose 2>&1 | node packages/tests/src/audit-gate.mjs
```

### Categories Checked
| Category | What It Validates |
|----------|------------------|
| Ledger invariants | DR==CR for all journals, amounts > 0, single currency |
| Idempotency | Same key → same result, conflict detection |
| Concurrency safety | No double-spend, no negative balances |
| Replay safety | Queue consumer idempotent under replay storm |
| Integrity verification | Hash chain valid, tamper detection works |
| Reconciliation | Mismatch detection, suspense monitoring |
| Governance enforcement | Maker-checker, staff auth, no direct ledger writes |

### CI Integration
The audit gate should run on every PR. Exit code 1 means the gate failed and merge should be blocked:

```yaml
# Example CI step
- name: Run Audit Gate
  run: npm run audit-gate
```

### Interpreting Results
- **PASS**: All invariant checks passed for that category
- **FAIL**: One or more tests failed — see verbose output for details
- **SKIP**: No tests matched that category (may indicate test naming issue)

---

## Phase 4 — Operational Runbooks

### Bank Outage Procedures

**Symptoms:** Bank API returns 5xx errors; circuit breaker opens; payout submissions fail.

1. Confirm outage: check `GET /ops/health/bank` for circuit breaker state
2. If circuit breaker is OPEN, no action needed — calls will fail fast and retry automatically after cooldown
3. Enable feature flag `bank_outage_mode`:
   ```bash
   curl -X POST http://localhost:8787/ops/flags/bank_outage_mode \
     -H "X-Staff-Id: staff-001" \
     -d '{"enabled": true}'
   ```
4. While enabled: new payout requests are queued (not submitted to bank); customer withdrawals show "temporarily unavailable"
5. Monitor bank status via `GET /citi/accounts/CARI_SETTLEMENT_BBD/balance` (returns error while down)
6. When bank recovers: disable feature flag → queued payouts drain automatically
7. Run settlement reconciliation after recovery to verify no missed webhooks

### Stuck Transfer Handling

**Symptoms:** Transfer stuck in `PENDING` for more than 30 minutes.

1. Query transfer status:
   ```bash
   curl http://localhost:8787/ops/transfers/{transfer_id} \
     -H "X-Staff-Id: staff-001"
   ```
2. Poll the bank directly:
   ```bash
   curl http://localhost:8787/ops/transfers/{transfer_id}/poll-bank \
     -H "X-Staff-Id: staff-001"
   ```
3. If bank returns a terminal status (SETTLED/FAILED) that we missed:
   - The poll endpoint processes it as if it were a webhook
   - Idempotency ensures no double-processing
4. If bank still returns PENDING after 2 hours:
   - Escalate to bank operations team
   - Do NOT reverse the transfer unilaterally — funds may still settle
5. If bank confirms the transfer is lost (no record):
   ```bash
   curl -X POST http://localhost:8787/ops/transfers/{transfer_id}/force-fail \
     -H "X-Staff-Id: staff-001" \
     -H "X-Approver-Id: staff-002" \
     -d '{"reason": "Bank confirmed no record of transfer"}'
   ```
   - Requires maker-checker approval
   - Reverses the fund reservation (DR suspense → CR wallet)

### Webhook Replay Procedures

**When:** Webhooks were missed due to endpoint downtime or deployment.

1. Check for gaps in webhook processing:
   ```bash
   curl "http://localhost:8787/ops/webhooks/gaps?from=2025-06-01&to=2025-06-02" \
     -H "X-Staff-Id: staff-001"
   ```
2. Request replay from bank (mock supports this directly):
   ```bash
   curl -X POST http://localhost:8787/ops/webhooks/replay \
     -H "X-Staff-Id: staff-001" \
     -d '{"from": "2025-06-01T00:00:00Z", "to": "2025-06-02T00:00:00Z"}'
   ```
3. Webhook processing is idempotent — replaying already-processed webhooks is safe
4. After replay, verify transfer statuses match bank:
   ```bash
   curl http://localhost:8787/ops/reconciliation/run \
     -H "X-Staff-Id: staff-001" \
     -d '{"type": "SETTLEMENT"}'
   ```

### Mass-Freeze Feature Flag

**When:** Suspected systemic fraud; need to halt all outbound money movement.

1. Enable mass freeze:
   ```bash
   curl -X POST http://localhost:8787/ops/flags/mass_freeze \
     -H "X-Staff-Id: staff-001" \
     -d '{"enabled": true, "reason": "Suspected systemic fraud – incident INC-2025-042"}'
   ```
2. **Effect:** All transactions evaluated by the fraud engine receive `FREEZE` outcome regardless of rules. Existing in-flight bank transfers continue (cannot be recalled).
3. **Scope:** Affects all actors — customers, merchants, agents.
4. Investigation:
   - Review fraud decision logs: `GET /ops/fraud/decisions?outcome=BLOCK&from=...`
   - Identify affected actors and transactions
5. Selective unfreeze (per actor):
   ```bash
   curl -X POST http://localhost:8787/ops/fraud/unfreeze/{actor_id} \
     -H "X-Staff-Id: staff-001" \
     -H "X-Approver-Id: staff-002" \
     -d '{"reason": "Cleared after investigation"}'
   ```
6. Disable mass freeze only after root cause is identified and mitigated.

### Settlement Batch Stuck Recovery

**Symptoms:** Settlement batch stuck in `REQUESTED` or `PROCESSING` for more than 1 hour.

1. Check batch status:
   ```bash
   curl http://localhost:8787/ops/settlement/batches/{batch_id} \
     -H "X-Staff-Id: staff-001"
   ```
2. Check individual payouts in the batch:
   ```bash
   curl http://localhost:8787/ops/settlement/batches/{batch_id}/payouts \
     -H "X-Staff-Id: staff-001"
   ```
3. If batch is stuck in `REQUESTED` (never submitted to bank):
   - Check bank health: `GET /ops/health/bank`
   - If bank is healthy, retry submission:
     ```bash
     curl -X POST http://localhost:8787/ops/settlement/batches/{batch_id}/retry \
       -H "X-Staff-Id: staff-001"
     ```
4. If batch is stuck in `PROCESSING` (some payouts settled, some pending):
   - Poll bank for each pending payout (see Stuck Transfer Handling above)
   - Batch auto-completes when all payouts reach terminal status
5. If batch cannot recover:
   ```bash
   curl -X POST http://localhost:8787/ops/settlement/batches/{batch_id}/force-complete \
     -H "X-Staff-Id: staff-001" \
     -H "X-Approver-Id: staff-002" \
     -d '{"reason": "Manual recovery after bank confirmation"}'
   ```
   - Requires maker-checker approval
   - Creates reconciliation finding for audit trail

### Reconciliation Failure Procedures

**Symptoms:** Daily settlement reconciliation reports mismatches or fails to complete.

1. Check latest reconciliation run:
   ```bash
   curl http://localhost:8787/ops/reconciliation/runs?type=SETTLEMENT&limit=1 \
     -H "X-Staff-Id: staff-001"
   ```
2. **If run status is FAILED:**
   - Check error in run record — common causes: bank statement API timeout, D1 query timeout
   - Fix root cause and re-run:
     ```bash
     curl -X POST http://localhost:8787/ops/reconciliation/run \
       -H "X-Staff-Id: staff-001" \
       -d '{"type": "SETTLEMENT", "date": "2025-06-02"}'
     ```
3. **If run completed with CRITICAL findings:**
   - Review findings:
     ```bash
     curl "http://localhost:8787/ops/reconciliation/findings?severity=CRITICAL&status=OPEN" \
       -H "X-Staff-Id: staff-001"
     ```
   - Amount mismatch: compare internal record vs bank statement; create manual adjustment if needed
   - Orphan bank debit: investigate via bank transfer ID; route unmatched amount to suspense
   - Missing from bank: re-poll bank; if still missing after T+2, escalate to bank ops
4. **Resolve findings** after investigation:
   ```bash
   curl -X POST http://localhost:8787/ops/reconciliation/findings/{finding_id}/resolve \
     -H "X-Staff-Id: staff-001" \
     -d '{"resolution": "Amount confirmed with bank; manual adjustment applied", "adjustment_journal_id": "jrnl_01JXYZ..."}'
   ```
5. All CRITICAL findings must be resolved within 24 hours (compliance requirement).
