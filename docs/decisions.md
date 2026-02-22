# Architecture Decisions

Record of defaults and design choices made during implementation.

## ID Generation
- **Decision**: Use ULID (Universally Unique Lexicographically Sortable Identifier)
- **Rationale**: ULIDs are time-sortable, unique, and URL-safe. They provide chronological ordering which is useful for ledger entries.
- **Library**: `ulid` npm package

## Timeouts & Retries
- **DO request timeout**: 30 seconds (Cloudflare default)
- **Idempotency record expiry**: 90 days
- **Rate limit window**: 15 minutes per identifier
- **Account lockout duration**: 30 minutes after 5 failed attempts
- **Retry policy**: Callers should retry with exponential backoff; the DO enforces idempotency so retries are safe.

## Monetary Amounts
- **Storage format**: Decimal string with up to 2 decimal places (e.g., "100.00")
- **Internal computation**: BigInt cents (1 BBD = 100 cents)
- **Rationale**: Avoids floating-point precision issues

## Currency Rules
- **Supported currencies**: BBD (base), USD
- **Cross-currency**: Blocked in Phase 1 and Phase 2 — all journal entries must share a single currency
- **FX**: Not implemented; will be a future phase

## Hashing
- **PIN hashing**: PBKDF2-SHA256, 100,000 iterations, 16-byte random salt, pepper from env secret
- **Idempotency scope hash**: SHA-256 of `{initiator_actor_type}:{initiator_actor_id}:{txn_type}:{idempotency_key}`
- **Payload hash**: SHA-256 of canonical JSON (recursive key-sorted) of `{entries, currency, description}`
- **Journal hash chain**: SHA-256 of canonical journal content + prev_hash (optional feature)

## Durable Object Sharding
- **Key format**: `wallet:{owner_type}:{owner_id}:{currency}`
- **Rationale**: One DO per wallet-per-currency ensures serialized access for balance checks
- **Concurrency**: `blockConcurrencyWhile()` serializes all posting operations within a single DO instance
- **Multi-account journals**: The sender's DO posts all legs (including receiver credit) in one journal. The DO serializes the debiting wallet; since the ledger is centralized in D1, both legs are written atomically.

## In-Progress Idempotency Policy
- **Chosen approach**: Option 1 — return `409 IDEMPOTENCY_IN_PROGRESS` with existing `correlation_id` and let the client poll
- **Rationale**: Simpler than blocking; avoids DO timeout issues; callers retry with exponential backoff
- **Implementation**: If `scope_hash` exists with status `IN_PROGRESS` and `correlation_id` matches, return the in-progress indicator. If `payload_hash` differs, return `DUPLICATE_IDEMPOTENCY_CONFLICT`.

## Canonical JSON Hashing
- **Algorithm**: SHA-256 of recursively key-sorted JSON
- **Implementation**: Custom `canonicalStringify()` that sorts keys at all nesting levels and uses standard JSON encoding
- **Scope**: Hashes `{entries, currency, description}` from the posting command
- **Purpose**: Deterministic payload fingerprint for conflict detection

## D1 Transaction Strategy
- **Approach**: Use `db.batch()` (D1 batch API) for atomic writes
- **Guarantee**: All-or-nothing: journal header, lines, events, audit log, and idempotency record are written in a single batch
- **Limitation**: D1 batch is not a true transaction with rollback, but guarantees atomicity for the batch. If batch fails, no partial writes occur.
- **Repair strategy**: Reconciliation job detects orphaned idempotency records and backfills if needed

## Reconciliation
- **Schedule**: Configurable; hourly in dev, nightly in production
- **Suspense aging threshold**: 72 hours
- **Auto-repair scope**: Only safe backfills (e.g., missing idempotency records for existing journals)
- **Balance corrections**: Always require maker-checker approval
- **Run tracking**: Each reconciliation run persisted in `reconciliation_runs` table with status (RUNNING/COMPLETED/FAILED)
- **Findings include**: account_id, expected vs actual balance, discrepancy, severity, currency
- **Integrity findings**: Hash chain mismatches also produce reconciliation_findings with severity=CRITICAL

## Maker-Checker DB Enforcement
- **Trigger**: `trg_approval_maker_ne_checker` prevents UPDATE on approval_requests where `maker_staff_id = checker_staff_id`
- **Application guard**: Also enforced in code before DB write
- **Rationale**: Defense in depth — both app-level and DB-level enforcement (per G3)

## Stale State Repair
- **Timeout threshold**: 5 minutes (DEFAULT_STALE_TIMEOUT_MINUTES)
- **Scope**: Only IN_PROGRESS idempotency records older than threshold
- **Action**: Mark as COMPLETED only if corresponding journal exists and is POSTED
- **Guarantee**: Never modifies ledger entries or amounts; emits STATE_REPAIRED event

## Maker-Checker Policy
- **Enforced for**: Reversals, manual adjustments, fee matrix changes, commission matrix changes, overdraft facility requests
- **Rule**: maker_staff_id must differ from checker_staff_id
- **Enforcement**: Both application-level and DB-level (CHECK constraint where possible)
- **Audit**: Before/after state logged for all approval actions

## Queue Processing
- **Delivery guarantee**: At-least-once
- **Consumer idempotency**: All queue consumers use message_id as dedupe key; check events table for QUEUE_MESSAGE_PROCESSED
- **In-memory dedupe**: processedMessages Set prevents duplicate processing within a single consumer run
- **Error handling**: CONSUMER_ERROR event emitted on handler failure with message body summary
- **Dead letter**: Failed messages logged as events; manual intervention via ops endpoints

## Request Envelope Standard
All API requests include:
- `correlation_id`: Trace ID for the request chain
- `idempotency_key`: Deduplication key for money-moving operations
- `actor_context`: Actor type and ID of the requester
- `timestamp`: ISO 8601 timestamp of the request
- `payload`: The actual request data

## Phase 4 Decisions

### Two-Phase Accounting for External Transfers
- **Decision**: Use two-phase accounting model for external transfers
- **Rationale**: Funds are first reserved (DR wallet → CR suspense) when the transfer is initiated, then settled (DR suspense → CR settlement) when the bank confirms. This ensures wallet balances reflect pending obligations and prevents double-spend during bank processing delays.

### Settlement as Wallet Withdrawal
- **Decision**: Settlement is a withdrawal from the merchant wallet, not collection of an accrued receivable
- **Rationale**: Merchants own their wallet balance. Settlement pays out what they already hold, which is simpler to reconcile and avoids an accrual/receivable accounting layer. The ledger entry is DR `liability:merchant:wallet` → CR `liability:settlement:outbound`.

### Mock Citibank API Shape
- **Decision**: Mock Citibank uses the same API shape as the real integration, with chaos configuration
- **Rationale**: The mock supports configurable failure modes (latency injection, random errors, status stuck in PENDING) via environment variables. Using the identical API contract means switching from mock to production requires only a base URL change — no adapter code changes.

### Deterministic Rule-Based Fraud Engine
- **Decision**: Fraud engine is deterministic, rule-based, and versioned with maker-checker governance
- **Rationale**: Deterministic rules are auditable, explainable, and testable. Every rule change is versioned with full before/after state. Maker-checker prevents a single actor from deploying a rule that weakens fraud controls. ML-based scoring may augment this in a future phase.

### Circuit Breaker for Bank Calls
- **Decision**: Circuit breaker + retry wraps all external bank API calls
- **Rationale**: Bank APIs are an external dependency with unpredictable availability. The circuit breaker prevents cascading failures: after N consecutive failures, the circuit opens and calls fail fast for a cooldown period. Retries use exponential backoff with jitter. State is tracked per-endpoint.

### Webhook Idempotency
- **Decision**: Webhook idempotency via `bank_transfer_id` + `status` composite key
- **Rationale**: Banks may deliver the same webhook multiple times (at-least-once delivery). Using the composite key means processing the same status transition twice is a no-op, while still allowing legitimate status progressions (e.g., PENDING → SETTLED) for the same transfer.

### Settlement Reconciliation Schedule
- **Decision**: Settlement reconciliation runs daily as a scheduled job
- **Rationale**: Daily reconciliation balances timeliness against cost. It compares internal payout records with bank statement data, detects mismatches, orphans, and missing entries. Critical findings trigger alerts; non-critical findings are queued for the next business day.

### Default BBD Fraud Thresholds
- **Decision**: Default BBD thresholds — 50,000 HOLD, 100,000 BLOCK
- **Rationale**: Initial thresholds based on Barbados market transaction patterns. Single transactions above 50K BBD are held for manual review; above 100K BBD are blocked outright. These are configurable via the fraud rules engine and can be tuned per merchant segment.

## Phase 4 Addendum Decisions

### Reconciliation State Machine (Section A2)
- **Decision**: Bank statement entries follow a strict 9-state lifecycle (NEW → CANDIDATE_MATCHED → MATCHED → SETTLED or NEW → UNMATCHED → DISPUTED → RESOLVED, with ESCALATED as a terminal escalation)
- **Rationale**: Invalid transitions throw InvalidTransitionError and are logged. This prevents reconciliation state corruption, ensures audit trail completeness, and surfaces issues early.

### Matching Modes (Section A3)
- **Decision**: Support both line-item matching (1:1) and batch matching (1:N)
- **Rationale**: Citibank may aggregate multiple platform transfers into a single statement entry. Batch matching with ±24h tolerance window handles this case while maintaining reconciliation accuracy.

### Unmatched Escalation SLA (Section A4)
- **Decision**: Unmatched entries older than 24h are posted to BANK_SUSPENSE and create a reconciliation case
- **Rationale**: No silent auto-resolution. Every unmatched entry gets explicit case tracking to prevent funds from being lost or misattributed.

### Idempotency TTL (Section B)
- **Decision**: Money tx = 30 days, Bank transfers = 90 days, Webhook dedupe = 180 days, Ops/config = 365 days
- **Rationale**: Graduated TTL based on risk profile. Longer-lived idempotency keys for bank interactions (which may have extended settlement cycles) reduce the risk of duplicate external transfers.

### Rounding (Section W)
- **Decision**: BBD precision 2 decimal places, HALF_UP rounding, remainder to ROUNDING_ADJUSTMENT account
- **Rationale**: Fractional cent ledger entries are forbidden. All rounding differences are captured in the ROUNDING_ADJUSTMENT system account, ensuring the ledger always balances to the cent.

### Settlement Timezone (Section V)
- **Decision**: All settlement cutoffs at 17:00 AST (America/Barbados, UTC-4), T+1 = next business day
- **Rationale**: Barbados jurisdiction requires local business day handling. Weekend days (Saturday/Sunday) are skipped for T+1 calculations.

### Currency Anomaly (Section D)
- **Decision**: If webhook currency differs from expected, mark ANOMALY_CURRENCY, do NOT settle, create case
- **Rationale**: Never auto-convert currency. Currency mismatches indicate either bank error or configuration issue and must be investigated manually.

### Beneficiary Verification (Section E)
- **Decision**: Full beneficiary lifecycle: DRAFT → PENDING_VERIFICATION → PENDING_APPROVAL → ACTIVE with maker-checker and fraud evaluation on all changes
- **Rationale**: Bank account beneficiary changes are a high-risk operation. Multi-step verification prevents fraudulent beneficiary additions.

### Fraud Rule Coverage (Section F)
- **Decision**: Minimum 6 TXN + 6 BANK_DEPOSIT + 8 PAYOUT rules; all rules have reason_code and create_case flag
- **Rationale**: Comprehensive coverage across all contexts ensures no fraud vector is unmonitored. Reason codes enable automated case categorization; create_case flags enable selective case creation.

### ML/Scoring Placeholder (Section H)
- **Decision**: FraudScoringProvider interface with stub returning score=0.0
- **Rationale**: Architecture supports future ML integration. The stub provider allows the system to run deterministically with rules only, while the interface is ready for model-based scoring.

### Holdback Reserve (Section J)
- **Decision**: MERCHANT_HOLDBACK_RESERVE ledger account with holdback_percentage on settlement profiles
- **Rationale**: Holdback protects against chargebacks and refunds. The holdback amount is reserved from each payment and released after a configurable period.

### Settlement Netting (Section K)
- **Decision**: Support both GROSS and NET netting modes per merchant profile
- **Rationale**: GROSS mode settles sales independently of refunds; NET mode subtracts refunds/chargebacks before payout. This accommodates different merchant risk profiles and regulatory requirements.

### Data Retention (Section O)
- **Decision**: Ledger/audit 7 years, webhooks 90 days hot, fraud 2 years hot, reconciliation 2 years
- **Rationale**: Barbados regulatory requirements and operational best practices. Hot retention keeps data readily queryable; archival moves to cold storage after the hot period.
