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
