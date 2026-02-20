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

# Run the Phase 2 Audit Gate (formal release gate)
npm run audit-gate
```

## Phase 2 Audit Gate

The audit gate is a formal release validation that runs all test suites and produces a PASS/FAIL report for each invariant category:

```
───────────────────────────────────────
  PHASE 2 AUDIT GATE REPORT
───────────────────────────────────────
  ✔ Ledger invariants: PASS/FAIL
  ✔ Idempotency: PASS/FAIL
  ✔ Concurrency safety: PASS/FAIL
  ✔ Replay safety: PASS/FAIL
  ✔ Integrity verification: PASS/FAIL
  ✔ Reconciliation: PASS/FAIL
  ✔ Governance enforcement: PASS/FAIL
───────────────────────────────────────
```

**Exit code 0** = all gates passed (merge allowed)
**Exit code 1** = one or more gates failed (merge blocked)

### Interpreting Failures

| Category | What Failed | Action |
|----------|-------------|--------|
| Ledger invariants | Journal balance (DR≠CR), invalid amounts, cross-currency | Fix journal template or posting logic |
| Idempotency | Duplicate journal created, scope hash collision | Fix scope_hash/payload_hash computation |
| Concurrency safety | Double-spend, negative balance | Fix DO serialization or funds check |
| Replay safety | Duplicate side effect from replay | Fix queue consumer dedupe logic |
| Integrity verification | Hash chain broken, tamper not detected | Fix hash computation or chain linkage |
| Reconciliation | Mismatch not detected, auto-correction | Fix balance recomputation logic |
| Governance enforcement | Maker=checker allowed, unauthorized access | Fix permission checks |

## Test Suite Overview

### Test Categories

#### 1. Unit Tests — Pure Functions
| File | Tests | What It Verifies |
|------|-------|-----------------|
| `packages/shared/src/__tests__/utils.test.ts` | 21 | `parseAmount`, `formatAmount`, `assertBalanced`, property tests |
| `packages/shared/src/__tests__/currency.test.ts` | 10 | `assertSameCurrency`, `isSupportedCurrency` |
| `packages/shared/src/__tests__/error-codes.test.ts` | 4 | ErrorCode enum completeness |
| `packages/shared/src/__tests__/contracts.test.ts` | 11 | Request envelope, error response, posting receipt schemas |
| `packages/shared/src/__tests__/migrations.test.ts` | 17 | Migration files contain required tables/columns/indexes |

#### 2. Domain Logic Tests
| File | Tests | What It Verifies |
|------|-------|-----------------|
| `packages/posting-do/src/__tests__/journal-templates.test.ts` | 20 | All 6 journal templates (deposit, withdrawal, P2P, payment, B2B, reversal) |
| `packages/posting-do/src/__tests__/fee-calculator.test.ts` | 8 | Fee calculation: flat, percent, min/max clamp, tax |
| `packages/posting-do/src/__tests__/commission-calculator.test.ts` | 5 | Commission calculation: flat, percent, combined |
| `packages/posting-do/src/__tests__/posting.test.ts` | 12 | Posting invariants, balance checks, cross-currency rejection |
| `packages/posting-do/src/__tests__/idempotency.test.ts` | 12 | Scope hash, payload hash, conflict detection |

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

#### 5. Property Tests (PR5)
| File | Tests | What It Verifies |
|------|-------|-----------------|
| `packages/posting-do/src/__tests__/property-tests.test.ts` | 11 | All templates balance (50 random iterations each), no cross-currency, reversal inverts |
| `packages/tests/src/__tests__/pr5-invariants.test.ts` | 31 | 100-iteration property tests: balance, idempotency, conflict, negative balance, overdraft boundaries |

#### 6. Replay / Idempotency Tests
| File | Tests | What It Verifies |
|------|-------|-----------------|
| `packages/posting-do/src/__tests__/replay.test.ts` | 4 | At-least-once delivery simulation, duplicate rejection |

#### 7. Concurrency Stress Harness (PR5)
| File | Tests | What It Verifies |
|------|-------|-----------------|
| `packages/posting-do/src/__tests__/concurrency.test.ts` | 6 | Parallel spend attempts, balance never negative, exactly-one-succeeds invariant |
| `packages/tests/src/__tests__/pr5-concurrency.test.ts` | 12 | Stress: 50 parallel spends, replay storm (100 retries), cross-DO race, mixed replay+conflict |

#### 8. Reconciliation & Integrity Validation (PR5)
| File | Tests | What It Verifies |
|------|-------|-----------------|
| `packages/tests/src/__tests__/pr5-reconciliation-integrity.test.ts` | 21 | Mismatch detection, suspense monitoring, hash chain verification (100-journal chain), tamper detection |

#### 9. Governance Bypass Detection (PR5)
| File | Tests | What It Verifies |
|------|-------|-----------------|
| `packages/tests/src/__tests__/pr5-governance.test.ts` | 25 | Maker-checker bypass, non-staff ops access, no direct ledger writes, reversal without approval, overdraft without approval |

#### 10. PR2 Posting Correctness
| File | Tests | What It Verifies |
|------|-------|-----------------|
| `packages/posting-do/src/__tests__/pr2-posting-correctness.test.ts` | 17 | Scope/payload hash correctness, conflict detection, serialization, audit events |

#### 11. PR3+PR4 Hardening
| File | Tests | What It Verifies |
|------|-------|-----------------|
| `packages/jobs/src/__tests__/pr3-pr4-hardening.test.ts` | 33 | Reconciliation runs, state repair, integrity, governance, queue replay |
| `packages/jobs/src/__tests__/pr3-pr4-hardening-enhanced.test.ts` | 18 | Hash chain during posting, integrity findings, targeted repair, governance trigger |

## What The Tests Guarantee

### Ledger Correctness
- **Balanced journals**: `sum(DR) == sum(CR)` for ALL journal templates, verified with 100 random iterations per template
- **No cross-currency**: Entry templates cannot produce multi-currency legs; assertSameCurrency blocks mixed currencies
- **All amounts > 0**: Property tests verify every entry has positive amount
- **Reversal correctness**: Every DR becomes CR and vice versa; reversal entries always balance

### Idempotency
- **Same request twice → same journal_id**: scope_hash lookup returns cached result
- **Same key + different payload → conflict error**: payload_hash comparison prevents silent overwrite
- **Deterministic hashing**: Same inputs always produce same scope_hash and payload_hash
- **Scope hash includes all 4 fields**: Changing any field produces different hash

### Serialization & Concurrency
- **Only one of N spends succeeds when total exceeds balance**: Simulated serialization via `blockConcurrencyWhile`
- **Balance never goes negative**: Even under 100 concurrent random spend attempts
- **No duplicate journal IDs**: Under parallel execution
- **Cross-DO transfers preserve conservation of value**: Both sides balanced

### Queue Consumer Idempotency
- **100 deliveries → 1 side effect**: Replay storm produces exactly one journal
- **Interleaved messages processed correctly**: Order doesn't matter
- **Batch processing**: Only unique messages are processed

### Integrity Verification
- **Valid hash chain passes**: 100-journal chain verifies end-to-end
- **Tampered content detected**: Modified amount, deleted line, changed currency all detected
- **Broken chain detected**: Swapped hash, wrong prev_hash linkage caught
- **Single journal chain valid**: Edge case handled

### Reconciliation
- **Mismatch detection**: Computed vs materialized balance comparison
- **Severity classification**: LOW < 1.00, MEDIUM < 100.00, HIGH < 1000.00, CRITICAL >= 1000.00
- **No auto-correction**: Findings record discrepancy without modifying balances
- **Suspense monitoring**: Non-zero suspense flagged as finding

### Governance
- **Maker cannot approve own request**: MakerCheckerViolationError thrown
- **Non-staff blocked from ops endpoints**: Auth check enforced on all routes
- **No direct ledger writes**: Static analysis confirms only PostingDO writes to ledger tables
- **Append-only ledger**: No UPDATE/DELETE on ledger tables anywhere in codebase
- **Reversal requires approval**: Only APPROVED state allows posting
- **Overdraft requires facility**: Only APPROVED/ACTIVE facility permits negative balance

## Test Infrastructure

- **Framework**: Vitest (v3.x)
- **Configuration**: `vitest.config.ts` at repo root
- **Pattern**: `packages/*/src/**/*.test.ts`
- **Environment**: Node.js (no browser required)
- **Deterministic PRNG**: Tests use seeded Mulberry32 PRNG for reproducibility
- **No mocking of D1**: Tests focus on pure logic; DB interactions tested via integration tests in production
- **Invariant assertion library**: `packages/tests/src/assertions.ts` provides reusable assertion helpers

## Adding New Tests

1. Create test file in `packages/<package>/src/__tests__/<name>.test.ts`
2. Import from vitest: `import { describe, it, expect } from 'vitest'`
3. Import types/functions from `@caricash/shared`, `@caricash/db`, `@caricash/posting-do`
4. For invariant tests, use assertions from `packages/tests/src/assertions.ts`
5. Follow existing patterns for pure function testing
6. Run `npx vitest run` to verify
7. Run `npm run audit-gate` to check formal compliance
