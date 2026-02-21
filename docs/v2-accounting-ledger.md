# V2 Accounting Ledger — Business & Technical Reference

## 1. Executive Summary

CariCash Nova V2 Accounting Ledger introduces IFRS-aligned double-entry bookkeeping with a formal **Chart of Accounts (CoA)**, **account instances**, **accounting periods**, **posting batches**, **sub-ledger accounts**, and **canonical reporting views**. These changes provide:

- **Regulatory compliance**: IFRS-mapped account hierarchy satisfies Central Bank of Barbados reporting requirements.
- **Audit readiness**: Every posting carries line numbers, minor-unit integers, period references, and immutable hash chains.
- **Operational safety**: Period close/lock prevents back-dated entries; account freeze/close halts erroneous activity.
- **Scalability**: Sub-ledger rollup enables agent-network and merchant-hierarchy reporting without scanning every line.

## 2. Chart of Accounts (CoA)

The CoA defines the **accounting structure** — the classification of all financial activity.

### 2.1 Design

| Field | Purpose |
|---|---|
| `code` | Unique account code (e.g., `1100` for Cash & Equivalents) |
| `name` | Human-readable label |
| `account_class` | `ASSET`, `LIABILITY`, `EQUITY`, `INCOME`, `EXPENSE` |
| `normal_balance` | `DEBIT` or `CREDIT` |
| `parent_code` | Hierarchy linkage for roll-up |
| `ifrs_mapping` | IFRS standard reference (e.g., "IAS 7 — Cash & Equivalents") |
| `is_header` | Header accounts are grouping-only; leaf accounts hold balances |
| `active_from/to` | Time-bound validity for account lifecycle |

### 2.2 Seed Structure

```
1000 Assets (Header)
├── 1100 Cash & Equivalents     → IAS 7
├── 1200 E-Money Float          → IFRS 9
├── 1300 Receivables & Advances → IAS 32 / IFRS 9
├── 1400 Agent Cash Floats      → (Operational)
├── 1500 Merchant Settlements   → (Operational)
├── 1600 Suspense & Clearing    → IAS 37

2000 Liabilities (Header)
├── 2100 Customer E-Money       → IFRS 9 — Financial Liabilities
├── 2200 Payables & Accruals    → IAS 37

3000 Equity (Header)

4000 Income (Header)
├── 4100 Fee Income             → IFRS 15
├── 4200 Commission Income      → IFRS 15

5000 Expenses (Header)
```

### 2.3 Business Rules

- **New products** require adding CoA leaf accounts under the correct header.
- **Inactive accounts** can be retired by setting `active_to` without data loss.
- Staff can create new CoA entries via `POST /ops/accounting/coa`.

## 3. Account Instances

An **account instance** is a concrete, currency-specific account belonging to a specific actor. It maps the CoA structure to real participants.

| Field | Purpose |
|---|---|
| `id` | Unique UUID |
| `coa_code` | FK to `chart_of_accounts` |
| `owner_type` | Actor type: `CUSTOMER`, `AGENT`, `MERCHANT`, `STAFF` |
| `owner_id` | Actor UUID |
| `currency` | ISO currency code (`BBD`, `USD`) |
| `status` | `OPEN`, `FROZEN`, `CLOSED` |
| `parent_instance_id` | Optional sub-ledger linkage |
| `legacy_account_id` | FK to `ledger_accounts.id` for backward compatibility |

### 3.1 Lifecycle

```
OPEN ──→ FROZEN ──→ OPEN (unfreeze)
  │                    │
  └──→ CLOSED ←────────┘
```

- **FROZEN**: Blocks new postings but preserves balances for investigation.
- **CLOSED**: Permanent; zero-balance prerequisite should be enforced at the business layer.

### 3.2 Migration from Legacy `ledger_accounts`

The V2 migration automatically creates `account_instances` from existing `ledger_accounts`, mapping `account_type` to the corresponding `coa_code`:

| Legacy `account_type` | CoA Code |
|---|---|
| `WALLET` | `2100` (Customer E-Money) |
| `CASH_FLOAT` | `1400` (Agent Cash Floats) |
| `COMMISSION` | `4200` (Commission Income) |
| `FEE_REVENUE` | `4100` (Fee Income) |
| `SETTLEMENT` | `1500` (Merchant Settlements) |
| `SUSPENSE` | `1600` (Suspense & Clearing) |

## 4. Accounting Periods

Accounting periods protect data integrity by preventing retroactive modifications.

### 4.1 Period Lifecycle

```
OPEN ──→ CLOSING ──→ CLOSED ──→ LOCKED
```

| State | Posting Allowed | Editable |
|---|---|---|
| `OPEN` | Yes | Yes |
| `CLOSING` | Adjustments only | Limited |
| `CLOSED` | No | Re-open possible |
| `LOCKED` | No | Immutable |

### 4.2 Business Process

1. **Monthly roll**: System auto-seeds the current month as `OPEN`.
2. **Period close**: Finance staff triggers close via `POST /ops/accounting/periods/:id/close`.
3. **Lock**: After reconciliation, the period is locked permanently via `POST /ops/accounting/periods/:id/lock`.
4. **Audit**: Locked periods provide immutable audit snapshots.

## 5. Posting Batches

A **posting batch** groups related journals under a single source document.

| Use Case | Example |
|---|---|
| Bulk import | CSV upload of 50 deposits → single batch |
| System events | Nightly interest calculation → batch of accrual journals |
| Manual adjustments | Suspense clearance → batch with approval reference |

### 5.1 Fields

| Field | Purpose |
|---|---|
| `source_system` | Originating system (`MOBILE_APP`, `AGENT_TERMINAL`, `BATCH_JOB`, `API`) |
| `source_doc_type` | Document type (`RECEIPT`, `INVOICE`, `ADJUSTMENT`) |
| `source_doc_id` | External reference |
| `journal_count` | Number of journals in the batch |
| `status` | `PENDING`, `POSTED`, `PARTIALLY_POSTED`, `FAILED` |

## 6. V2 Journal & Line Enhancements

### 6.1 Journal Fields (new)

| Field | Purpose |
|---|---|
| `posting_batch_id` | FK to batch for grouped postings |
| `source_system` | Where the transaction originated |
| `source_doc_type/id` | Paper trail to source documents |
| `reversal_of_journal_id` | For reversal chains |
| `correction_of_journal_id` | For correction chains |
| `accounting_period_id` | FK to period for close controls |
| `effective_date` | Business date (may differ from `created_at`) |
| `total_amount_minor` | Sum of DR amounts in integer cents |

### 6.2 Line Fields (new)

| Field | Purpose |
|---|---|
| `line_number` | Sequential line ordering within journal |
| `debit_amount_minor` | Integer cents if DR, else 0 |
| `credit_amount_minor` | Integer cents if CR, else 0 |
| `account_instance_id` | FK to V2 account instance |
| `coa_code` | FK to chart of accounts |

### 6.3 Minor-Unit Integer Amounts

All V2 fields use **integer minor units** (cents) instead of TEXT decimals:

```
Legacy:  amount = "150.00"   (TEXT, parsed with BigInt at runtime)
V2:      debit_amount_minor = 15000  (INTEGER, no parsing needed)
```

Benefits:
- Eliminates floating-point rounding errors
- Faster aggregation queries (integer arithmetic)
- Compliant with ISO 4217 minor unit convention

## 7. Sub-Ledger Accounts

Sub-ledgers create hierarchical reporting for multi-actor businesses:

```
Agent Network (Parent)
├── Sub-agent A (Child) ── account_instance_id → float balance
├── Sub-agent B (Child) ── account_instance_id → float balance
└── Roll-up view ── total float managed by parent
```

### 7.1 Relationship Types

| Type | Description |
|---|---|
| `AGENT_FLOAT` | Agent manages sub-agent float |
| `MERCHANT_SETTLEMENT` | Merchant manages store settlements |
| `COMMISSION_SHARE` | Commission split structure |

### 7.2 Auto-Seeding

The migration automatically creates sub-ledger relationships from:
- `agent_parent` table → `AGENT_FLOAT` relationships
- `merchant_store_closure` table → `MERCHANT_SETTLEMENT` relationships

## 8. Canonical Reporting Views

Four database views provide standard accounting outputs:

### 8.1 `v_trial_balance`

Aggregates all account instances by CoA code and currency:
- Total debit minor, total credit minor, net balance
- Used verification that debits = credits across the system

### 8.2 `v_gl_detail`

General Ledger line-by-line detail:
- Journal ID, line number, CoA code, account name
- Debit/credit amounts in minor units
- Sorted by posting date and line number

### 8.3 `v_account_statement`

Per-account-instance statement showing:
- Each posting line with journal reference
- Running debit/credit totals
- Suitable for customer/agent statement generation

### 8.4 `v_subledger_rollup`

Aggregates child account balances by parent actor:
- Shows total debit, credit, net balance per child
- Enables network operators to see aggregate positions

## 9. API Endpoints

### 9.1 Chart of Accounts

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/ops/accounting/coa` | List all CoA entries |
| `GET` | `/ops/accounting/coa/:code` | Get single CoA entry |
| `POST` | `/ops/accounting/coa` | Create new CoA entry |

### 9.2 Account Instances

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/ops/accounting/instances/:id` | Get instance by ID |
| `GET` | `/ops/accounting/instances?owner_type=...&owner_id=...` | List by owner |
| `POST` | `/ops/accounting/instances/:id/freeze` | Freeze account |
| `POST` | `/ops/accounting/instances/:id/close` | Close account |

### 9.3 Accounting Periods

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/ops/accounting/periods` | List all periods |
| `GET` | `/ops/accounting/periods/:id` | Get single period |
| `POST` | `/ops/accounting/periods` | Create new period |
| `POST` | `/ops/accounting/periods/:id/close` | Close period |
| `POST` | `/ops/accounting/periods/:id/lock` | Lock period |

### 9.4 Reporting

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/ops/accounting/reports/trial-balance` | Trial balance |
| `GET` | `/ops/accounting/reports/gl-detail` | GL detail |
| `GET` | `/ops/accounting/reports/account-statement/:id` | Account statement |
| `GET` | `/ops/accounting/reports/subledger-rollup/:id` | Sub-ledger rollup |

### 9.5 Sub-Ledger

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/ops/accounting/subledgers/:parent_actor_id` | List sub-ledger accounts |

## 10. Staff Portal UI

The Staff Portal Ledger page now includes five tabs:

1. **Journal Lookup** — Existing journal inspection with DR/CR badges
2. **Integrity Check** — Hash-chain verification over date ranges
3. **Trial Balance** — V2 aggregated view with balance check
4. **Chart of Accounts** — CoA browser showing hierarchy, IFRS mappings
5. **Accounting Periods** — Period management with Close/Lock controls

## 11. Backward Compatibility

The V2 migration is **additive-only**:
- No existing columns are dropped or renamed
- New columns on `ledger_journals` and `ledger_lines` are nullable
- `ledger_accounts` table remains functional with bridging `coa_code` and `account_instance_id` columns
- Legacy TEXT `amount` field remains authoritative; minor-unit fields are supplementary
- The `legacy_account_id` field on `account_instances` links back to existing `ledger_accounts`

All existing API endpoints, posting flows, and queries continue to work unchanged.

## 12. Daily Balance Snapshots

The `daily_balance_snapshots` table captures end-of-day positions per account instance:

| Field | Purpose |
|---|---|
| `account_instance_id` | Which account |
| `snapshot_date` | Which day |
| `opening_balance_minor` | Start of day |
| `debit_total_minor` | Day's total debits |
| `credit_total_minor` | Day's total credits |
| `closing_balance_minor` | End of day |
| `journal_count` | Number of journals that day |

Snapshots enable:
- Fast historical balance queries without scanning all lines
- Month-end reconciliation against period totals
- Trend analysis for monitoring dashboards

## 13. Future Enhancements

- **Multi-currency revaluation**: FX rate tables + period-end revaluation journals
- **Budget vs actual**: Budget lines per CoA code + variance reporting
- **Automated period roll**: Cron job to create next month's period and close the previous
- **Account instance provisioning**: Auto-create instances on actor registration via the CoA template
- **Audit trail export**: XBRL/iXBRL output for regulatory filing
