# Phase 4 — Fraud Engine

## Overview

The fraud engine is a deterministic, rule-based system that evaluates transactions against configurable rules. Rules are versioned and governed by maker-checker approval. The engine produces one of five decision outcomes per evaluation.

---

## Fraud Signal Types

Signals are collected at evaluation time and fed into rule conditions.

| # | Signal Type | Description |
|---|-------------|-------------|
| 1 | `VELOCITY_COUNT` | Number of transactions in a rolling window |
| 2 | `VELOCITY_AMOUNT` | Total amount transacted in a rolling window |
| 3 | `AMOUNT_SINGLE` | Single transaction amount |
| 4 | `AMOUNT_DAILY` | Cumulative daily amount for the actor |
| 5 | `DEVICE_NEW` | Transaction from a device not seen in the last 30 days |
| 6 | `DEVICE_MULTIPLE` | Actor used more than N devices in a rolling window |
| 7 | `GEO_IMPOSSIBLE_TRAVEL` | Two transactions from locations physically impossible to reach in elapsed time |
| 8 | `GEO_NEW_LOCATION` | Transaction from a country/region not previously seen |
| 9 | `RECIPIENT_NEW` | First-ever transfer to this recipient |
| 10 | `RECIPIENT_FREQUENCY` | Transfers to the same recipient exceed threshold in window |
| 11 | `ACCOUNT_AGE` | Account created within N days |
| 12 | `PIN_FAILURES` | Recent failed PIN attempts |
| 13 | `TIME_OF_DAY` | Transaction outside normal hours for this actor |
| 14 | `DORMANT_ACCOUNT` | No activity for N days, then sudden transaction |
| 15 | `BENEFICIARY_RISK` | Recipient is on an internal watch list |
| 16 | `SPLIT_PATTERN` | Multiple small transactions that sum to a large amount (structuring) |

---

## Rules Model

Rules are stored in the `fraud_rules` table with full version history.

### Rule Record

```json
{
  "rule_id": "rule_01JXYZ...",
  "version": 3,
  "name": "high_value_block",
  "description": "Block single transactions above 100,000 BBD",
  "status": "ACTIVE",
  "priority": 100,
  "conditions": {
    "operator": "AND",
    "clauses": [
      { "signal": "AMOUNT_SINGLE", "op": "GT", "value": "100000.00" },
      { "signal": "ACCOUNT_AGE", "op": "LT", "value": "90" }
    ]
  },
  "outcome": "BLOCK",
  "created_by": "staff-001",
  "approved_by": "staff-002",
  "effective_from": "2025-06-01T00:00:00Z",
  "effective_to": null
}
```

### Conditions JSON Format

Conditions support nested logical operators with signal-based clauses.

```json
{
  "operator": "AND | OR",
  "clauses": [
    { "signal": "<signal_type>", "op": "GT | GTE | LT | LTE | EQ | NEQ | IN", "value": "<threshold>" },
    {
      "operator": "OR",
      "clauses": [
        { "signal": "DEVICE_NEW", "op": "EQ", "value": "true" },
        { "signal": "GEO_NEW_LOCATION", "op": "EQ", "value": "true" }
      ]
    }
  ]
}
```

### Rule Governance

| Control | Detail |
|---------|--------|
| Versioning | Every edit creates a new version; old versions are retained |
| Maker-checker | Rule creation and updates require approval by a different staff member |
| Activation | Rules have `effective_from` / `effective_to` dates; only active rules are evaluated |
| Priority | Lower number = higher priority; first matching outcome wins |
| Audit | All rule changes logged with before/after state |

---

## Decision Outcomes

The engine evaluates all active rules in priority order and returns the first matching outcome.

| Outcome | Action | Description |
|---------|--------|-------------|
| `ALLOW` | Proceed | Transaction passes all checks |
| `BLOCK` | Reject | Transaction is rejected immediately |
| `STEP_UP` | Challenge | Require additional authentication (e.g., OTP) before proceeding |
| `HOLD` | Queue | Transaction is queued for manual review; funds reserved |
| `FREEZE` | Lock | Actor's account is frozen; all pending transactions blocked |

### Decision Record

```json
{
  "decision_id": "dec_01JXYZ...",
  "transaction_id": "txn_01JABC...",
  "actor_type": "CUSTOMER",
  "actor_id": "cust_01JDEF...",
  "outcome": "HOLD",
  "matched_rule_id": "rule_01JXYZ...",
  "matched_rule_version": 3,
  "signals_evaluated": {
    "AMOUNT_SINGLE": "55000.00",
    "ACCOUNT_AGE": "12",
    "DEVICE_NEW": "false"
  },
  "created_at": "2025-06-01T14:30:00Z"
}
```

---

## Integration Points

The fraud engine is invoked at four points in the transaction lifecycle:

| Integration Point | Trigger | Scope |
|-------------------|---------|-------|
| **Transaction initiation** | Before posting to ledger | All money-moving transactions |
| **Posting** | After ledger post, before confirmation | Large transactions, new recipients |
| **Bank deposit** | Before accepting inbound funds | External deposits above threshold |
| **Payout initiation** | Before submitting payout to bank | All outbound payouts |

### Evaluation Flow

```
Request ──► Collect Signals ──► Evaluate Rules ──► Decision
                                                     │
                         ┌─────────────┬─────────────┼─────────────┬──────────────┐
                         ▼             ▼             ▼             ▼              ▼
                       ALLOW         BLOCK        STEP_UP        HOLD          FREEZE
                         │             │             │             │              │
                    Continue      Reject 403    Challenge UI   Queue for      Freeze acct
                    pipeline      + event        + event       review + evt   + event
```

---

## Default Thresholds (BBD)

These are the initial production thresholds. All are configurable via rules.

| Signal | Threshold | Outcome |
|--------|-----------|---------|
| `AMOUNT_SINGLE` > 50,000 | Per transaction | `HOLD` |
| `AMOUNT_SINGLE` > 100,000 | Per transaction | `BLOCK` |
| `AMOUNT_DAILY` > 200,000 | Per actor per day | `BLOCK` |
| `VELOCITY_COUNT` > 20 | Transactions per hour | `STEP_UP` |
| `VELOCITY_AMOUNT` > 100,000 | Amount per hour | `HOLD` |
| `DEVICE_NEW` = true AND `AMOUNT_SINGLE` > 10,000 | New device + large amount | `STEP_UP` |
| `ACCOUNT_AGE` < 7 AND `AMOUNT_SINGLE` > 5,000 | New account + large amount | `HOLD` |
| `GEO_IMPOSSIBLE_TRAVEL` = true | Any amount | `BLOCK` |
| `DORMANT_ACCOUNT` = true AND `AMOUNT_SINGLE` > 25,000 | Reactivation + large amount | `HOLD` |
| `SPLIT_PATTERN` = true | Structuring detected | `HOLD` |
| `PIN_FAILURES` >= 3 | Recent failures | `STEP_UP` |
| `BENEFICIARY_RISK` = true | Watch-listed recipient | `BLOCK` |

---

## Interventions — Phase 3 Linkage

Fraud decisions that produce `HOLD` or `FREEZE` outcomes create **intervention records** that integrate with the Phase 3 intervention system.

| Fraud Outcome | Intervention Type | Workflow |
|---------------|-------------------|----------|
| `HOLD` | `FRAUD_HOLD` | Transaction queued → staff reviews → approve or reject |
| `FREEZE` | `FRAUD_FREEZE` | Account frozen → staff investigates → unfreeze or escalate |
| `BLOCK` | — | No intervention; transaction is rejected outright |
| `STEP_UP` | `AUTH_CHALLENGE` | Challenge issued → user responds → re-evaluate |

### Intervention Record

```json
{
  "intervention_id": "intv_01JXYZ...",
  "type": "FRAUD_HOLD",
  "source_decision_id": "dec_01JXYZ...",
  "actor_type": "CUSTOMER",
  "actor_id": "cust_01JDEF...",
  "transaction_id": "txn_01JABC...",
  "status": "PENDING_REVIEW",
  "assigned_to": null,
  "created_at": "2025-06-01T14:30:00Z"
}
```

Staff resolves interventions via the existing Phase 3 ops endpoints. Resolution emits `INTERVENTION_RESOLVED` and either proceeds with or cancels the held transaction.
