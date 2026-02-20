# CariCash Nova

> Barbados-based mobile payments platform — Phase 1 Foundation

## Overview

CariCash Nova is a Cloudflare-native mobile payments system built for Barbados. It implements a closed-loop wallet system serving customers, agents, and merchants with **BBD** (Barbados Dollar) as the base currency. The core of the system is a **double-entry immutable ledger** with strong consistency guarantees provided by Cloudflare Durable Objects.

## Architecture

The project is organized as a monorepo using **npm workspaces**:

```
packages/
├── api/          Cloudflare Worker (Hono) — HTTP API gateway
├── posting-do/   Durable Object — serialized posting engine
├── db/           D1 schema, migrations, and typed access layer
├── shared/       TypeScript types, Zod schemas, enums, and errors
└── web/          Vite + React frontend
```

| Package | Runtime | Role |
|---------|---------|------|
| `@caricash/api` | Cloudflare Worker | Receives HTTP requests, validates input, orchestrates flows |
| `@caricash/posting-do` | Durable Object | Serializes all money-moving operations per posting domain |
| `@caricash/db` | D1 (SQLite) | Stores actors, ledger, governance, config, and events |
| `@caricash/shared` | Library | Domain model shared across all packages |
| `@caricash/web` | Browser | Customer/agent/merchant/staff-facing UI |

## Key Design Decisions

- **Immutable append-only ledger** — no `UPDATE` or `DELETE` on journals/lines; corrections are made via reversal journals.
- **Durable Object per posting domain** — each combination of `owner_type + owner_id + currency` gets its own DO instance for serialized access.
- **D1 `batch()` for atomic writes** — journal + lines + events are written in a single batch call.
- **Idempotency** — every mutation accepts an `idempotency_key`; duplicate requests return the original result.
- **Maker-checker workflow** — all privileged operations (reversals, manual adjustments, config changes) require approval by a different staff member.
- **PBKDF2-SHA256 PIN hashing** — PINs are hashed with a pepper sourced from an environment secret (`PIN_PEPPER`).
- **String-based monetary amounts** — all amounts are represented as strings (e.g. `"100.00"`) to avoid floating-point precision issues.
- **ULID-based deterministic IDs** — all entity IDs are ULIDs for sortability and uniqueness.

## Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- Wrangler CLI (`npm install -g wrangler`)

## Local Development

### Setup

```bash
# Install dependencies
npm install

# Run D1 migrations locally
npm run db:migrate

# Start API dev server
npm run dev:api

# Start frontend dev server (in another terminal)
npm run dev:web
```

### Environment Variables

For local development, create `packages/api/.dev.vars`:

```
PIN_PEPPER=your-secret-pepper-value
```

## Database Migrations

Migrations live in `packages/db/migrations/` and are applied in order:

| # | File | Description |
|---|------|-------------|
| 1 | `0001_create_actors.sql` | Customers, agents, merchants, and staff tables |
| 2 | `0002_create_auth.sql` | Authentication credentials, sessions, rate-limiting, and lockout |
| 3 | `0003_create_ledger.sql` | Accounts, journals, and journal lines (double-entry ledger) |
| 4 | `0004_create_governance.sql` | Approval requests and audit log |
| 5 | `0005_create_configuration.sql` | Fee matrix and commission matrix |
| 6 | `0006_create_hierarchy.sql` | Agent hierarchy and territory assignments |
| 7 | `0007_create_events.sql` | Domain event store |
| 8 | `0008_create_idempotency.sql` | Idempotency key tracking |

Run migrations locally:

```bash
npm run db:migrate
```

This executes `wrangler d1 migrations apply caricash-db --local` under the hood.

## Durable Objects

The **PostingDO** Durable Object is the heart of the ledger engine.

- Each posting domain gets its own DO instance.
- Domain key format: `{owner_type}:{owner_id}:{currency}` (e.g. `CUSTOMER:01ABC:BBD`).
- The Worker API creates a DO stub using `env.POSTING_DO.idFromName(domainKey)`.
- All money-moving operations (deposits, withdrawals, transfers, payments, reversals) go through the DO for **serialized access**.
- The DO enforces:
  - **Idempotency** — duplicate `idempotency_key` returns the original journal.
  - **Sufficient funds** — debits are rejected if the wallet balance is insufficient.
  - **Balanced double-entry** — sum of debits must equal sum of credits.
  - **Same currency** — all lines in a journal must use the same currency.

## API Endpoints

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/customer/login` | Customer login via MSISDN + PIN |
| `POST` | `/auth/agent/login` | Agent login via MSISDN + PIN |
| `POST` | `/auth/merchant/login` | Merchant login via MSISDN + PIN |
| `POST` | `/auth/staff/login` | Staff login (placeholder OAuth verifier) |

### Actor Management

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/customers` | Register a new customer |
| `POST` | `/customers/:id/kyc` | Initiate KYC for a customer |
| `POST` | `/agents` | Register a new agent |
| `POST` | `/merchants` | Register a new merchant |

### Transactions

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/tx/deposit` | Agent cash-in to customer wallet |
| `POST` | `/tx/withdrawal` | Agent cash-out from customer wallet |
| `POST` | `/tx/p2p` | Person-to-person transfer |
| `POST` | `/tx/payment` | Customer-to-merchant payment |
| `POST` | `/tx/b2b` | Business-to-business transfer |
| `POST` | `/tx/reversal/request` | Request a reversal (enters maker-checker) |

### Approvals (Maker-Checker)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/approvals/:id/approve` | Approve a pending request |
| `POST` | `/approvals/:id/reject` | Reject a pending request |

### Wallets

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/wallets/:owner_type/:owner_id/:currency/balance` | Get wallet balance |

## Example curl Requests

All examples use `http://localhost:8787` as the base URL.

### Create a Customer

```bash
curl -X POST http://localhost:8787/customers \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "+12465551234",
    "name": "Jane Doe",
    "pin": "1234",
    "idempotency_key": "cust-001",
    "correlation_id": "corr-001"
  }'
```

### Customer Login

```bash
curl -X POST http://localhost:8787/auth/customer/login \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "+12465551234",
    "pin": "1234"
  }'
```

### Create an Agent

```bash
curl -X POST http://localhost:8787/agents \
  -H "Content-Type: application/json" \
  -d '{
    "agent_code": "AGT001",
    "name": "Bob Agent",
    "msisdn": "+12465555678",
    "pin": "5678",
    "agent_type": "STANDARD",
    "idempotency_key": "agt-001",
    "correlation_id": "corr-002"
  }'
```

### Deposit (Agent Cash-In)

```bash
curl -X POST http://localhost:8787/tx/deposit \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "<agent_actor_id>",
    "customer_msisdn": "+12465551234",
    "amount": "100.00",
    "currency": "BBD",
    "idempotency_key": "dep-001",
    "correlation_id": "corr-003"
  }'
```

### Check Balance

```bash
curl http://localhost:8787/wallets/CUSTOMER/<customer_id>/BBD/balance
```

### P2P Transfer

```bash
curl -X POST http://localhost:8787/tx/p2p \
  -H "Content-Type: application/json" \
  -d '{
    "sender_msisdn": "+12465551234",
    "receiver_msisdn": "+12465559999",
    "amount": "25.00",
    "currency": "BBD",
    "idempotency_key": "p2p-001",
    "correlation_id": "corr-004"
  }'
```

### Request Reversal

```bash
curl -X POST http://localhost:8787/tx/reversal/request \
  -H "Content-Type: application/json" \
  -d '{
    "original_journal_id": "<journal_id>",
    "reason": "Customer dispute",
    "staff_id": "<staff_id>",
    "idempotency_key": "rev-001",
    "correlation_id": "corr-005"
  }'
```

### Approve Reversal

```bash
curl -X POST http://localhost:8787/approvals/<request_id>/approve \
  -H "Content-Type: application/json" \
  -d '{
    "staff_id": "<different_staff_id>",
    "correlation_id": "corr-006"
  }'
```

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

The test suite (83 unit tests) covers:

- **Journal balancing invariants** — sum of debits equals sum of credits for every journal.
- **Fee and commission calculations** — correct amounts for all transaction types.
- **Cross-currency rejection** — operations spanning different currencies are rejected.
- **Maker-checker enforcement** — the maker and checker must be different staff members.
- **Idempotency behavior** — duplicate requests return the original result without side effects.
- **Property tests for amount parsing** — string-based amount utilities handle edge cases correctly.

## What's Complete vs Stubbed

### ✅ Complete (Phase 1)

- Monorepo structure with all 5 packages
- D1 schema with 8 migration files
- Shared domain model (enums, types, schemas, errors)
- PostingDO Durable Object with serialized posting
- Journal templates for all Phase 1 transaction types
- Fee and commission calculators
- Authentication with PIN hashing, rate limiting, and lockout
- Maker-checker workflow for approvals
- Event emission on all flow steps
- Audit logging for auth and privileged actions
- All 17 API endpoints
- Frontend with login pages and dashboard
- 83 unit tests passing

### 🔲 Stubbed / Future Work

- Staff OAuth (placeholder verifier; real IdP integration planned)
- Queue consumer for async event processing
- Full KYC document verification
- SMS/notification delivery
- Admin UI for fee/commission matrix management
- Production deployment configuration
- End-to-end integration tests

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.