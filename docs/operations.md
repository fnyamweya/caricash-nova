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
