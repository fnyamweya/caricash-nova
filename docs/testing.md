# Testing Guide

## Running Tests

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run a specific test file
npx vitest run packages/shared/src/__tests__/utils.test.ts

# Run tests matching a pattern
npx vitest run --reporter verbose -t "idempotency"
```

## Test Suite Overview

### Test Categories

#### 1. Unit Tests — Pure Functions
| File | Tests | What It Verifies |
|------|-------|-----------------|
| `packages/shared/src/__tests__/utils.test.ts` | 21 | `parseAmount`, `formatAmount`, `assertBalanced`, property tests |
| `packages/shared/src/__tests__/currency.test.ts` | 10 | `assertSameCurrency`, `isSupportedCurrency` |
| `packages/shared/src/__tests__/error-codes.test.ts` | 4 | ErrorCode enum completeness |
| `packages/shared/src/__tests__/contracts.test.ts` | 11 | Request envelope, error response, posting receipt schemas |
| `packages/shared/src/__tests__/migrations.test.ts` | 11 | Migration files contain required tables/columns/indexes |

#### 2. Domain Logic Tests
| File | Tests | What It Verifies |
|------|-------|-----------------|
| `packages/posting-do/src/__tests__/journal-templates.test.ts` | 20 | All 6 journal templates (deposit, withdrawal, P2P, payment, B2B, reversal) |
| `packages/posting-do/src/__tests__/fee-calculator.test.ts` | 8 | Fee calculation: flat, percent, min/max clamp, tax |
| `packages/posting-do/src/__tests__/commission-calculator.test.ts` | 5 | Commission calculation: flat, percent, combined |
| `packages/posting-do/src/__tests__/posting.test.ts` | 12 | Posting invariants, balance checks, cross-currency rejection |
| `packages/posting-do/src/__tests__/idempotency.test.ts` | 11 | Scope hash, payload hash, conflict detection |

#### 3. Governance Tests
| File | Tests | What It Verifies |
|------|-------|-----------------|
| `packages/api/src/__tests__/approvals.test.ts` | 7 | Maker-checker enforcement, state transitions |
| `packages/api/src/__tests__/ops.test.ts` | 9 | Journal hash chain, ops auth, maker-checker hardening |

#### 4. Reconciliation & Jobs Tests
| File | Tests | What It Verifies |
|------|-------|-----------------|
| `packages/jobs/src/__tests__/reconciliation.test.ts` | 13 | Severity classification, mismatch detection, amount parsing |
| `packages/jobs/src/__tests__/repair.test.ts` | 5 | Safe backfill rules, state filtering |

#### 5. Property Tests
| File | Tests | What It Verifies |
|------|-------|-----------------|
| `packages/posting-do/src/__tests__/property-tests.test.ts` | ~11 | All templates balance (50 random iterations each), no cross-currency, reversal inverts |

#### 6. Replay / Idempotency Tests
| File | Tests | What It Verifies |
|------|-------|-----------------|
| `packages/posting-do/src/__tests__/replay.test.ts` | 4 | At-least-once delivery simulation, duplicate rejection |

#### 7. Concurrency Harness
| File | Tests | What It Verifies |
|------|-------|-----------------|
| `packages/posting-do/src/__tests__/concurrency.test.ts` | 6 | Parallel spend attempts, balance never negative, exactly-one-succeeds invariant |

## What The Tests Guarantee

### Ledger Correctness
- **Balanced journals**: `sum(DR) == sum(CR)` for ALL journal templates, verified with 50 random iterations per template
- **No cross-currency**: Entry templates cannot produce multi-currency legs; assertSameCurrency blocks mixed currencies
- **Reversal correctness**: Every DR becomes CR and vice versa; reversal entries always balance

### Idempotency
- **Same request twice → same journal_id**: scope_hash lookup returns cached result
- **Same key + different payload → conflict error**: payload_hash comparison prevents silent overwrite
- **Deterministic hashing**: Same inputs always produce same scope_hash and payload_hash

### Serialization & Concurrency
- **Only one of N spends succeeds when total exceeds balance**: Simulated serialization via `blockConcurrencyWhile`
- **Balance never goes negative**: Even under concurrent access
- **All succeed when total within balance**: No false rejections

### Queue Consumer Idempotency
- **Duplicate delivery is rejected**: Consumer tracks processed message IDs
- **Interleaved messages processed correctly**: Order doesn't matter
- **Batch processing**: Only unique messages are processed

### Governance
- **Maker cannot approve own request**: MakerCheckerViolationError thrown
- **State transitions enforced**: Can't approve/reject non-PENDING requests
- **Audit trail**: Before/after state captured in audit log

### Reconciliation
- **Mismatch detection**: Computed vs materialized balance comparison
- **Severity classification**: LOW < 1.00, MEDIUM < 100.00, HIGH < 1000.00, CRITICAL >= 1000.00
- **Safe repair**: Only backfills idempotency records for POSTED journals

## Test Infrastructure

- **Framework**: Vitest (v3.x)
- **Configuration**: `vitest.config.ts` at repo root
- **Pattern**: `packages/*/src/**/*.test.ts`
- **Environment**: Node.js (no browser required)
- **No mocking of D1**: Tests focus on pure logic; DB interactions tested via integration tests in production

## Adding New Tests

1. Create test file in `packages/<package>/src/__tests__/<name>.test.ts`
2. Import from vitest: `import { describe, it, expect } from 'vitest'`
3. Import types/functions from `@caricash/shared`, `@caricash/db`, `@caricash/posting-do`
4. Follow existing patterns for pure function testing
5. Run `npx vitest run` to verify
