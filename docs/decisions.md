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
- **Idempotency scope hash**: SHA-256 of `{initiator}:{txn_type}:{idempotency_key}`
- **Payload hash**: SHA-256 of canonical JSON.stringify of the posting command payload
- **Journal hash chain**: SHA-256 of canonical journal content + prev_hash (optional feature)

## Durable Object Sharding
- **Key format**: `wallet:{owner_type}:{owner_id}:{currency}`
- **Rationale**: One DO per wallet-per-currency ensures serialized access for balance checks
- **Concurrency**: `blockConcurrencyWhile()` serializes all posting operations within a single DO instance

## Reconciliation
- **Schedule**: Configurable; hourly in dev, nightly in production
- **Suspense aging threshold**: 72 hours
- **Auto-repair scope**: Only safe backfills (e.g., missing idempotency records for existing journals)
- **Balance corrections**: Always require maker-checker approval

## Maker-Checker Policy
- **Enforced for**: Reversals, manual adjustments, fee matrix changes, commission matrix changes, overdraft facility requests
- **Rule**: maker_staff_id must differ from checker_staff_id
- **Enforcement**: Both application-level and DB-level (CHECK constraint where possible)

## Queue Processing
- **Delivery guarantee**: At-least-once
- **Consumer idempotency**: All queue consumers check for existing processed state before acting
- **Dead letter**: Failed messages logged as events; manual intervention via ops endpoints

## Request Envelope Standard
All API requests include:
- `correlation_id`: Trace ID for the request chain
- `idempotency_key`: Deduplication key for money-moving operations
- `actor_context`: Actor type and ID of the requester
- `timestamp`: ISO 8601 timestamp of the request
- `payload`: The actual request data
