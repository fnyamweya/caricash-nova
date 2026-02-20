#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Post-deploy smoke tests.
#
# Usage:
#   DEPLOY_URL=https://api-staging.caricash.app bash scripts/smoke-test.sh
#
# Validates:
#   1. GET /health         → 200 + { status: "ok" }
#   2. GET /openapi.yaml   → 200 + Content-Type contains yaml
#   3. GET /docs           → 200 + Content-Type contains html
#   4. GET /               → 200 (root info endpoint)
#
# Exits non-zero if any check fails.
# ──────────────────────────────────────────────────────────────
set -euo pipefail

URL="${DEPLOY_URL:?DEPLOY_URL environment variable is required}"
FAILURES=0

echo "══════════════════════════════════════════════════"
echo "  Smoke Tests: ${URL}"
echo "══════════════════════════════════════════════════"

check() {
  local name="$1"
  local endpoint="$2"
  local expect_body="${3:-}"

  echo -n "→ ${name} (${endpoint})... "

  HTTP_CODE=$(curl -s -o /tmp/smoke_body.txt -w "%{http_code}" --max-time 30 "${URL}${endpoint}" || echo "000")

  if [ "$HTTP_CODE" != "200" ]; then
    echo "FAIL (HTTP ${HTTP_CODE})"
    FAILURES=$((FAILURES + 1))
    return
  fi

  if [ -n "$expect_body" ]; then
    if grep -qi "$expect_body" /tmp/smoke_body.txt; then
      echo "OK"
    else
      echo "FAIL (body mismatch, expected '${expect_body}')"
      FAILURES=$((FAILURES + 1))
      return
    fi
  else
    echo "OK"
  fi
}

check "Health check"      "/health"        "ok"
check "OpenAPI spec"       "/openapi.yaml"  "openapi"
check "Swagger UI"         "/docs"          "swagger"
check "Root endpoint"      "/"              "CariCash"

echo ""
echo "══════════════════════════════════════════════════"
if [ "$FAILURES" -gt 0 ]; then
  echo "  ✗ SMOKE TESTS FAILED (${FAILURES} failure(s))"
  echo "══════════════════════════════════════════════════"
  exit 1
else
  echo "  ✔ ALL SMOKE TESTS PASSED"
  echo "══════════════════════════════════════════════════"
  exit 0
fi
