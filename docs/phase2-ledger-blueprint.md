# Phase 2 — Ledger Blueprint

## 1. Durable Object Sharding

Each Posting Durable Object (DO) instance handles a single **posting domain**:

```
wallet:{owner_type}:{owner_id}:{currency}
```

Examples:
- `wallet:CUSTOMER:01HXR3...:BBD`
- `wallet:AGENT:01HXR4...:BBD`

This ensures serialized access per wallet-per-currency, preventing race conditions on balance checks.

**Routing**: The API Worker resolves the posting domain key and calls `env.POSTING_DO.idFromName(domainKey)` to get the DO stub. All money-moving operations go through this stub — no direct ledger writes from Workers.

## 2. Posting Lifecycle States

```
INITIATED → VALIDATED → POSTED → COMPLETED
                                    ↓
                                  FAILED
```

| State              | Description                                      |
|--------------------|--------------------------------------------------|
| `INITIATED`        | Command received, not yet validated               |
| `VALIDATED`        | Invariants checked (same currency, balanced)      |
| `POSTED`           | Journal + lines written atomically to D1          |
| `COMPLETED`        | Post-processing done (events emitted, etc.)       |
| `FAILED`           | Validation or posting failed                      |
| `REVERSED`         | A reversal journal has been posted                |
| `PENDING_APPROVAL` | Requires maker-checker approval (reversals, manual adjustments) |

## 3. Idempotency Rules

### Scope Hash
Each idempotency check uses a **scope hash** combining:
```
scope_hash = SHA-256(initiator_actor_id + ":" + txn_type + ":" + idempotency_key)
```

### Conflict Behavior
| Scenario                              | Behavior                                      |
|---------------------------------------|-----------------------------------------------|
| Same idempotency_key, same payload    | Return stored receipt (journal_id, state, etc.)|
| Same idempotency_key, different payload| Return `DUPLICATE_IDEMPOTENCY_CONFLICT` error |
| New idempotency_key                   | Process normally                               |

### Payload Hash
A SHA-256 hash of the canonical JSON payload is stored alongside the idempotency record. On retry, the incoming payload hash is compared against the stored hash to detect conflicts.

## 4. Reconciliation & Repair

### Balance Reconciliation
- Recomputes balances from `ledger_lines` grouped by `account_id`
- Compares against `wallet_balances` materialized table
- Discrepancies are written to `reconciliation_findings`
- Severe discrepancies emit `ALERT_RAISED` events

### Suspense Aging
- Detects non-zero suspense accounts older than threshold (default: 72 hours)
- Emits alert events for compliance review

### Safe Repair Rules
- Missing idempotency records for existing journals can be safely backfilled
- No automated balance corrections — all adjustments require maker-checker approval
- Hash chain verification detects tampered journal entries

## 5. Append-Only Enforcement

### Application-Level Guards
- No UPDATE/DELETE methods exist in the DB access layer for ledger tables
- All journal and line inserts are append-only by design
- The `getBalance()` function always recomputes from lines

### Database Permission Plan (Production)
- Application DB user should have `INSERT` and `SELECT` only on:
  - `ledger_journals`
  - `ledger_lines`
  - `events`
  - `audit_log`
- `UPDATE` and `DELETE` permissions denied at the DB level
- Only admin/migration users have DDL privileges

## 6. Hash Chain (Optional Feature)

When enabled, each journal entry stores:
- `prev_hash`: hash of the previous journal in the same currency partition
- `hash`: SHA-256 of the canonical journal content + prev_hash

This provides tamper detection for the journal chain. An integrity verification job can walk the chain and detect any inconsistencies.
