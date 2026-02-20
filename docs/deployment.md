# CariCash Nova — Deployment Guide

## Overview

CariCash Nova uses **GitHub Actions** for CI/CD and deploys to **Cloudflare** (Workers, D1, Durable Objects, Queues, Pages).

Two workflows exist:

| Workflow | File | Trigger |
|----------|------|---------|
| **CI** | `.github/workflows/ci.yml` | PR and push to `main`/`develop` |
| **Deploy** | `.github/workflows/deploy.yml` | Push to `main` (staging), release/tag (production), manual dispatch |

---

## GitHub Environments

Create two environments in **Settings → Environments**:

| Environment | Protection Rules |
|-------------|-----------------|
| `staging` | None (auto-deploy on push to main) |
| `production` | **Required reviewers** (at least 1 approval before deploy) |

---

## Required GitHub Secrets

Set these in **Settings → Secrets and variables → Actions** (or scoped per environment).

### Repository-level Secrets

| Secret | Description | Required |
|--------|-------------|----------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token (see permissions below) | ✅ |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID | ✅ |

### Environment: `staging`

| Secret | Description | Required |
|--------|-------------|----------|
| `CLOUDFLARE_D1_DATABASE_ID_STAGING` | D1 database UUID for staging | ✅ |
| `JWT_SIGNING_SECRET` | JWT secret for staging | ✅ |
| `PIN_PEPPER` | PIN hashing pepper for staging | ✅ |
| `OAUTH_JWKS_URL` | Staff OAuth JWKS URL (can be placeholder) | Optional |
| `OAUTH_CLIENT_ID` | Staff OAuth client ID (can be placeholder) | Optional |
| `CLOUDFLARE_ZONE_ID` | Zone ID for custom domain routing | Optional |

### Environment: `production`

| Secret | Description | Required |
|--------|-------------|----------|
| `CLOUDFLARE_D1_DATABASE_ID_PROD` | D1 database UUID for production | ✅ |
| `JWT_SIGNING_SECRET` | JWT secret for production | ✅ |
| `PIN_PEPPER` | PIN hashing pepper for production | ✅ |
| `OAUTH_JWKS_URL` | Staff OAuth JWKS URL | Optional |
| `OAUTH_CLIENT_ID` | Staff OAuth client ID | Optional |
| `CLOUDFLARE_ZONE_ID` | Zone ID for custom domain routing | Optional |

---

## Cloudflare API Token Permissions

Create a **custom API token** in the Cloudflare dashboard with these permissions:

| Permission | Access Level |
|------------|-------------|
| **Workers Scripts** | Edit |
| **D1** | Edit |
| **Queues** | Edit |
| **Pages** | Edit |
| **Account Settings** | Read |
| **Workers KV** | Edit (if KV is used in future) |

**Scope:** Limit to the specific Cloudflare account used for CariCash.

---

## D1 Database Setup (One-time)

The recommended strategy is to **pre-create D1 databases once** and store their IDs as GitHub Secrets. The pipeline only runs migrations.

```bash
# Create staging DB
npx wrangler d1 create caricash-db-staging
# → note the UUID, set as CLOUDFLARE_D1_DATABASE_ID_STAGING

# Create production DB
npx wrangler d1 create caricash-db
# → note the UUID, set as CLOUDFLARE_D1_DATABASE_ID_PROD
```

Update `packages/api/wrangler.toml` with the actual UUIDs in the `env.staging` and `env.production` sections, or let the pipeline substitute them from secrets.

> **Note:** The deploy workflow uses `sed` to replace placeholder values (`REPLACE_WITH_STAGING_D1_DATABASE_ID` and `REPLACE_WITH_PRODUCTION_D1_DATABASE_ID`) in `wrangler.toml` with the actual D1 database UUIDs from GitHub Secrets at deploy time. You can alternatively hardcode the UUIDs directly in `wrangler.toml`.

---

## Queues Setup

Queues are created automatically by the provisioning script (`scripts/provision-cloudflare.sh`) if they do not exist.

| Queue | Environment |
|-------|-------------|
| `caricash-events-staging` | staging |
| `caricash-events` | production |

---

## Wrangler Configuration

The main wrangler config is at `packages/api/wrangler.toml` with:

- **`env.staging`**: Staging bindings (D1, DO, Queues, vars)
- **`env.production`**: Production bindings (D1, DO, Queues, vars)

The Durable Object worker is at `packages/posting-do/wrangler.toml`.

### Setting Worker Secrets

After initial deploy, set secrets per environment:

```bash
# Staging
cd packages/api
npx wrangler secret put PIN_PEPPER --env staging
npx wrangler secret put JWT_SIGNING_SECRET --env staging

# Production
npx wrangler secret put PIN_PEPPER --env production
npx wrangler secret put JWT_SIGNING_SECRET --env production
```

---

## Deploy Pipeline Flow

```
Push to main
  └─ CI Gate (lint, test, openapi validate, audit gate, build)
       └─ Deploy Staging
            ├─ Provision resources (idempotent)
            ├─ Apply D1 migrations
            ├─ Deploy API Worker
            ├─ Deploy Posting DO Worker
            ├─ Build & deploy frontend to Pages
            └─ Run smoke tests

Release tag / Manual dispatch
  └─ CI Gate
       └─ Deploy Production (requires reviewer approval)
            ├─ Provision resources (idempotent)
            ├─ Apply D1 migrations
            ├─ Deploy API Worker
            ├─ Deploy Posting DO Worker
            ├─ Build & deploy frontend to Pages
            └─ Run smoke tests
```

---

## Smoke Tests

Post-deploy smoke tests (`scripts/smoke-test.sh`) validate:

| Check | Endpoint | Expected |
|-------|----------|----------|
| Health | `GET /health` | 200, body contains `"ok"` |
| OpenAPI spec | `GET /openapi.yaml` | 200, body contains `openapi` |
| Swagger UI | `GET /docs` | 200, body contains `swagger` |
| Root | `GET /` | 200, body contains `CariCash` |

If any check fails, the workflow fails and the deploy is marked as unsuccessful.

---

## Provisioning Script

`scripts/provision-cloudflare.sh` idempotently creates:

- D1 database (if not pre-created)
- Cloudflare Queue
- Pages project

Run manually for first-time setup:

```bash
export CLOUDFLARE_API_TOKEN="..."
export CLOUDFLARE_ACCOUNT_ID="..."

bash scripts/provision-cloudflare.sh staging
bash scripts/provision-cloudflare.sh production
```

---

## Local Development

```bash
pnpm install

# Run API locally (uses miniflare/wrangler dev)
pnpm dev:api

# Run frontend locally
pnpm dev:web

# Apply D1 migrations locally
pnpm db:migrate

# Run tests
pnpm test

# Validate OpenAPI
pnpm openapi:validate

# Run audit gate
pnpm audit-gate
```

---

## Troubleshooting

| Issue | Solution |
|-------|---------|
| D1 migration fails | Ensure `CLOUDFLARE_D1_DATABASE_ID_*` secrets match actual D1 UUIDs |
| Worker deploy fails | Verify `CLOUDFLARE_API_TOKEN` has Workers Scripts:Edit permission |
| Pages deploy fails | Verify token has Pages:Edit permission; project may need manual creation first |
| Smoke tests fail | Check Worker logs via `wrangler tail --env <env>`; verify DNS/routes configured |
| Queue not found | Run provisioning script or create manually: `npx wrangler queues create <name>` |
