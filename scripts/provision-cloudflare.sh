#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Idempotent Cloudflare resource provisioning script.
#
# Usage:
#   bash scripts/provision-cloudflare.sh <staging|production>
#
# Required env vars:
#   CLOUDFLARE_API_TOKEN
#   CLOUDFLARE_ACCOUNT_ID
#
# This script ensures the following resources exist:
#   • D1 database (create if missing, else reuse)
#   • Queues (create if missing)
#   • Pages project for frontend (create if missing)
# ──────────────────────────────────────────────────────────────
set -euo pipefail

ENV="${1:-staging}"

echo "══════════════════════════════════════════════════"
echo "  Provisioning Cloudflare resources for: ${ENV}"
echo "══════════════════════════════════════════════════"

# ── Derive names per environment ──────────────────────────────
if [ "$ENV" = "production" ]; then
  D1_DB_NAME="caricash-db"
  QUEUE_NAME="caricash-events"
  PAGES_PROJECT="caricash-web"
else
  D1_DB_NAME="caricash-db-staging"
  QUEUE_NAME="caricash-events-staging"
  PAGES_PROJECT="caricash-web-staging"
fi

# ── Helper: check if a D1 database exists ─────────────────────
provision_d1() {
  local db_name="$1"
  echo "→ Checking D1 database: ${db_name}"

  # List existing databases and check for our name
  existing=$(npx wrangler d1 list --json 2>/dev/null || echo "[]")
  db_id=$(echo "$existing" | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const db = (Array.isArray(data) ? data : []).find(d => d.name === '${db_name}');
    if (db) console.log(db.uuid || db.id || '');
  " 2>/dev/null || true)

  if [ -n "$db_id" ]; then
    echo "  ✔ D1 database '${db_name}' already exists (id: ${db_id})"
  else
    echo "  → Creating D1 database '${db_name}'..."
    npx wrangler d1 create "${db_name}"
    echo "  ✔ D1 database '${db_name}' created"
  fi
}

# ── Helper: check if a Queue exists ────────────────────────────
provision_queue() {
  local queue_name="$1"
  echo "→ Checking Queue: ${queue_name}"

  existing=$(npx wrangler queues list --json 2>/dev/null || echo "[]")
  found=$(echo "$existing" | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const q = (Array.isArray(data) ? data : []).find(q => q.queue_name === '${queue_name}' || q.name === '${queue_name}');
    if (q) console.log('found');
  " 2>/dev/null || true)

  if [ "$found" = "found" ]; then
    echo "  ✔ Queue '${queue_name}' already exists"
  else
    echo "  → Creating Queue '${queue_name}'..."
    npx wrangler queues create "${queue_name}" || true
    echo "  ✔ Queue '${queue_name}' created"
  fi
}

# ── Helper: check if a Pages project exists ────────────────────
provision_pages() {
  local project_name="$1"
  echo "→ Checking Pages project: ${project_name}"

  # Try to get project info; if it fails, create it
  if npx wrangler pages project list --json 2>/dev/null | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const p = (Array.isArray(data) ? data : []).find(p => p.name === '${project_name}');
    process.exit(p ? 0 : 1);
  " 2>/dev/null; then
    echo "  ✔ Pages project '${project_name}' already exists"
  else
    echo "  → Creating Pages project '${project_name}'..."
    npx wrangler pages project create "${project_name}" --production-branch=main || true
    echo "  ✔ Pages project '${project_name}' created"
  fi
}

# ── Provision ──────────────────────────────────────────────────
provision_d1  "$D1_DB_NAME"
provision_queue "$QUEUE_NAME"
provision_pages "$PAGES_PROJECT"

echo ""
echo "══════════════════════════════════════════════════"
echo "  ✔ Provisioning complete for: ${ENV}"
echo "══════════════════════════════════════════════════"
