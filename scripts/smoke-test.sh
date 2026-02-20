#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Post-deploy smoke tests.
#
# Usage:
#   DEPLOY_URL=https://api-staging.caricash.com bash scripts/smoke-test.sh
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
SMOKE_RETRIES="${SMOKE_RETRIES:-12}"
SMOKE_RETRY_DELAY_SECONDS="${SMOKE_RETRY_DELAY_SECONDS:-5}"

echo "══════════════════════════════════════════════════"
echo "  Smoke Tests: ${URL}"
echo "══════════════════════════════════════════════════"

check() {
  local name="$1"
  local endpoint="$2"
  local expect_body="${3:-}"

  echo -n "→ ${name} (${endpoint})... "

  local http_code
  local curl_exit=0
  http_code=$(curl -s -o /tmp/smoke_body.txt -w "%{http_code}" --max-time 30 "${URL}${endpoint}") || curl_exit=$?

  if [ "$curl_exit" -ne 0 ]; then
    HTTP_CODE="000"
  else
    HTTP_CODE="$http_code"
  fi

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

wait_for_health() {
  local retries="$1"
  local delay_seconds="$2"
  local attempt=1

  echo "→ Waiting for service readiness (/health)..."
  while [ "$attempt" -le "$retries" ]; do
    local http_code
    local curl_exit=0
    http_code=$(curl -s -o /tmp/smoke_body.txt -w "%{http_code}" --max-time 15 "${URL}/health") || curl_exit=$?

    if [ "$curl_exit" -eq 0 ] && [ "$http_code" = "200" ] && grep -qi "ok" /tmp/smoke_body.txt; then
      echo "  ✔ Service ready (attempt ${attempt}/${retries})"
      return 0
    fi

    echo "  …not ready yet (attempt ${attempt}/${retries}), retrying in ${delay_seconds}s"
    attempt=$((attempt + 1))
    sleep "$delay_seconds"
  done

  echo "  ✗ Service did not become ready after ${retries} attempts"
  return 1
}

if ! wait_for_health "$SMOKE_RETRIES" "$SMOKE_RETRY_DELAY_SECONDS"; then
  echo ""
  echo "══════════════════════════════════════════════════"
  echo "  ✗ SMOKE TESTS FAILED (service readiness timeout)"
  echo "══════════════════════════════════════════════════"
  exit 1
fi

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
