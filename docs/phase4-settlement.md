# Phase 4 — Settlement Engine

## Overview

Settlement is the process of paying out funds from a merchant (or agent) wallet to their external bank account. Settlement is modeled as a **withdrawal from the merchant wallet**, not as collection of an accrued receivable.

---

## Settlement Profiles

Each merchant/agent has a settlement profile that controls payout timing and limits.

| Field | Type | Description |
|-------|------|-------------|
| `profile_id` | ULID | Unique identifier |
| `owner_type` | enum | `MERCHANT` or `AGENT` |
| `owner_id` | ULID | Merchant or agent ID |
| `schedule` | enum | `T0`, `T1`, `T2` |
| `mode` | enum | `AUTO`, `MANUAL` |
| `min_payout` | decimal | Minimum payout amount (BBD) |
| `max_payout` | decimal | Maximum single payout (BBD) |
| `daily_cap` | decimal | Maximum total payouts per calendar day (BBD) |
| `bank_account_id` | string | Destination bank account |
| `currency` | string | Settlement currency |
| `requires_approval` | boolean | Whether payouts need maker-checker |
| `approval_threshold` | decimal | Amount above which two approvals are required |

### Schedule Definitions

| Schedule | Trigger | Description |
|----------|---------|-------------|
| `T0` | Real-time | Payout initiated immediately after each qualifying transaction |
| `T1` | Next business day | Batched at end of day, paid out next business day |
| `T2` | T+2 business days | Batched at end of day, paid out two business days later |

### Auto vs Manual Mode

| Mode | Behavior |
|------|----------|
| `AUTO` | System creates payout batches automatically on schedule |
| `MANUAL` | Merchant/agent must request payout via API; system validates against profile limits |

---

## Limits & Approvals

### Limit Enforcement

| Limit | Enforcement Point | On Violation |
|-------|-------------------|--------------|
| `min_payout` | Batch creation | Skip — accumulate until threshold met |
| `max_payout` | Payout request | Reject with `PAYOUT_EXCEEDS_MAX` |
| `daily_cap` | Payout request | Reject with `DAILY_CAP_EXCEEDED` |

### Approval Rules

| Condition | Requirement |
|-----------|-------------|
| `requires_approval = true` | At least one maker-checker approval before bank submission |
| Amount > `approval_threshold` | Two separate approvals required (different staff members) |
| Any payout | Maker cannot be the same person as any checker (G3) |

---

## Batch Lifecycle

Settlement batches group individual payouts for processing.

```
CREATED ──► READY ──► REQUESTED ──► PROCESSING ──┬──► COMPLETED
                                                  └──► FAILED
```

| Status | Description |
|--------|-------------|
| `CREATED` | Batch record created, payouts being accumulated |
| `READY` | Cutoff time reached, batch frozen for review |
| `REQUESTED` | Approvals obtained, submitted to bank adapter |
| `PROCESSING` | Bank has acknowledged, transfers in-flight |
| `COMPLETED` | All transfers in batch settled successfully |
| `FAILED` | One or more transfers in batch failed; requires investigation |

### Batch Record

```json
{
  "batch_id": "batch_01JXYZ...",
  "profile_id": "prof_01JABC...",
  "schedule": "T1",
  "status": "COMPLETED",
  "payout_count": 3,
  "total_amount": "15000.00",
  "currency": "BBD",
  "created_at": "2025-06-01T23:59:00Z",
  "submitted_at": "2025-06-02T09:00:00Z",
  "completed_at": "2025-06-02T09:05:30Z"
}
```

---

## Payout Lifecycle

Each individual payout within a batch has its own lifecycle.

```
REQUESTED ──► APPROVED ──► PENDING ──┬──► SETTLED
                                     └──► FAILED
```

| Status | Description |
|--------|-------------|
| `REQUESTED` | Payout created, awaiting approval |
| `APPROVED` | Required approvals obtained |
| `PENDING` | Submitted to bank, transfer in-flight |
| `SETTLED` | Bank confirmed funds delivered |
| `FAILED` | Bank rejected or transfer failed |

### Payout Record

```json
{
  "payout_id": "pay_01JXYZ...",
  "batch_id": "batch_01JXYZ...",
  "owner_type": "MERCHANT",
  "owner_id": "merch_01JABC...",
  "amount": "5000.00",
  "currency": "BBD",
  "bank_account_id": "MERCH_PAYOUT_00123",
  "bank_transfer_id": "CTX-20250602-0042",
  "status": "SETTLED",
  "requested_at": "2025-06-01T23:59:00Z",
  "settled_at": "2025-06-02T09:05:30Z"
}
```

### Ledger Entries per Payout

**On APPROVED (funds reserved):**

| DR | CR | Amount |
|----|-----|--------|
| `liability:merchant:wallet` | `liability:settlement:outbound` | Payout amount |

**On SETTLED (bank confirms):**

| DR | CR | Amount |
|----|-----|--------|
| `liability:settlement:outbound` | `asset:float:bank` | Payout amount |

**On FAILED (reverse reservation):**

| DR | CR | Amount |
|----|-----|--------|
| `liability:settlement:outbound` | `liability:merchant:wallet` | Payout amount |

---

## Settlement Reconciliation

Settlement reconciliation runs daily as a scheduled job and compares internal payout records against bank statements.

### Reconciliation Steps

1. **Fetch bank statement** for the settlement account via `GET /citi/accounts/{id}/statement`
2. **Match payouts** by `bank_transfer_id` against statement lines
3. **Verify amounts** — exact decimal match required
4. **Verify statuses** — internal SETTLED must have corresponding bank debit
5. **Detect orphans** — bank debits with no matching internal payout
6. **Detect missing** — internal SETTLED payouts with no bank statement entry after T+2

### Mismatch Classification

| Finding | Severity | Action |
|---------|----------|--------|
| Amount mismatch | CRITICAL | Freeze payout, create finding, alert ops |
| Orphan bank debit | CRITICAL | Route to suspense, alert ops |
| Missing from bank (T+2) | HIGH | Re-query bank; if still missing, escalate |
| Status mismatch | HIGH | Manual investigation |
| Timing variance (< 1 day) | LOW | Log only |

### Reconciliation Report

```json
{
  "run_id": "recon_01JXYZ...",
  "type": "SETTLEMENT",
  "date": "2025-06-02",
  "payouts_checked": 47,
  "matched": 45,
  "mismatches": 1,
  "orphans": 1,
  "missing": 0,
  "status": "COMPLETED_WITH_FINDINGS"
}
```
