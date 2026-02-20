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
WRANGLER_CMD=(pnpm --filter @caricash/api exec wrangler)
ZONE_NAME="${CLOUDFLARE_ZONE_NAME:-caricash.com}"

echo "══════════════════════════════════════════════════"
echo "  Provisioning Cloudflare resources for: ${ENV}"
echo "══════════════════════════════════════════════════"

# ── Derive names per environment ──────────────────────────────
if [ "$ENV" = "production" ]; then
  D1_DB_NAME="caricash-db"
  QUEUE_NAME="caricash-events"
  PAGES_PROJECT="caricash-web"
  API_HOSTNAME="api.${ZONE_NAME}"
else
  D1_DB_NAME="caricash-db-staging"
  QUEUE_NAME="caricash-events-staging"
  PAGES_PROJECT="caricash-web-staging"
  API_HOSTNAME="api-staging.${ZONE_NAME}"
fi

cf_api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local url="https://api.cloudflare.com/client/v4${path}"

  if [ -n "$data" ]; then
    curl -sS -X "$method" "$url" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "$data"
  else
    curl -sS -X "$method" "$url" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json"
  fi
}

get_zone_id() {
  local zone_name="$1"
  local response
  local zone_id

  response=$(cf_api GET "/zones?name=${zone_name}&status=active")
  zone_id=$(echo "$response" | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    if (!data.success || !Array.isArray(data.result) || data.result.length === 0) process.exit(1);
    console.log(data.result[0].id || '');
  " 2>/dev/null || true)

  if [ -z "$zone_id" ]; then
    echo "  ✗ Could not find active zone '${zone_name}'. Ensure zone exists in this Cloudflare account." >&2
    exit 1
  fi

  echo "$zone_id"
}

provision_dns_record() {
  local zone_name="$1"
  local hostname="$2"

  echo "→ Checking DNS record: ${hostname}"

  local zone_id
  zone_id=$(get_zone_id "$zone_name")

  local response
  response=$(cf_api GET "/zones/${zone_id}/dns_records?name=${hostname}")

  local record
  record=$(echo "$response" | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    if (!data.success || !Array.isArray(data.result)) process.exit(1);
    const r = data.result.find((x) => x.name === '${hostname}');
    if (r) console.log(JSON.stringify({ id: r.id, type: r.type, name: r.name, content: r.content, proxied: !!r.proxied }));
  " 2>/dev/null || true)

  if [ -z "$record" ]; then
    echo "  → Creating proxied A record for '${hostname}'..."
    local create_payload
    create_payload=$(node -e "
      console.log(JSON.stringify({
        type: 'A',
        name: '${hostname}',
        content: '192.0.2.1',
        ttl: 1,
        proxied: true
      }));
    ")

    response=$(cf_api POST "/zones/${zone_id}/dns_records" "$create_payload")
    local created
    created=$(echo "$response" | node -e "
      const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      process.exit(data.success ? 0 : 1);
    " 2>/dev/null || true)
    if [ -z "$created" ] && echo "$response" | node -e "
      const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      process.exit(data.success ? 0 : 1);
    " 2>/dev/null; then
      echo "  ✔ DNS record '${hostname}' created (proxied)"
    else
      echo "  ✗ Failed to create DNS record '${hostname}': ${response}" >&2
      exit 1
    fi
    return
  fi

  local record_id record_type record_name record_content record_proxied
  record_id=$(echo "$record" | node -e "const r=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(r.id);")
  record_type=$(echo "$record" | node -e "const r=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(r.type);")
  record_name=$(echo "$record" | node -e "const r=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(r.name);")
  record_content=$(echo "$record" | node -e "const r=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(r.content);")
  record_proxied=$(echo "$record" | node -e "const r=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(r.proxied ? 'true' : 'false');")

  if [ "$record_proxied" = "true" ]; then
    echo "  ✔ DNS record '${hostname}' already exists and is proxied"
    return
  fi

  echo "  → Enabling proxy for existing DNS record '${hostname}'..."
  local update_payload
  update_payload=$(node -e "
    console.log(JSON.stringify({
      type: '${record_type}',
      name: '${record_name}',
      content: '${record_content}',
      ttl: 1,
      proxied: true
    }));
  ")

  response=$(cf_api PUT "/zones/${zone_id}/dns_records/${record_id}" "$update_payload")
  if echo "$response" | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    process.exit(data.success ? 0 : 1);
  " 2>/dev/null; then
    echo "  ✔ DNS record '${hostname}' updated (proxied)"
  else
    echo "  ✗ Failed to update DNS record '${hostname}': ${response}" >&2
    exit 1
  fi
}

# ── Helper: check if a D1 database exists ─────────────────────
provision_d1() {
  local db_name="$1"
  echo "→ Checking D1 database: ${db_name}"

  # List existing databases and check for our name
  existing=$("${WRANGLER_CMD[@]}" d1 list --json 2>/dev/null || echo "[]")
  db_id=$(echo "$existing" | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const db = (Array.isArray(data) ? data : []).find(d => d.name === '${db_name}');
    if (db) console.log(db.uuid || db.id || '');
  " 2>/dev/null || true)

  if [ -n "$db_id" ]; then
    echo "  ✔ D1 database '${db_name}' already exists (id: ${db_id})"
  else
    echo "  → Creating D1 database '${db_name}'..."
    if output=$("${WRANGLER_CMD[@]}" d1 create "${db_name}" 2>&1); then
      echo "  ✔ D1 database '${db_name}' created"
    else
      if echo "$output" | grep -qi "already exists"; then
        echo "  ✔ D1 database '${db_name}' already exists (confirmed via create)"
      else
        echo "  ✗ Failed to create D1 database '${db_name}': ${output}" >&2
        exit 1
      fi
    fi
  fi
}

# ── Helper: check if a Queue exists ────────────────────────────
provision_queue() {
  local queue_name="$1"
  echo "→ Checking Queue: ${queue_name}"

  existing=$("${WRANGLER_CMD[@]}" queues list --json 2>/dev/null || echo "[]")
  found=$(echo "$existing" | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const q = (Array.isArray(data) ? data : []).find(q => q.queue_name === '${queue_name}' || q.name === '${queue_name}');
    if (q) console.log('found');
  " 2>/dev/null || true)

  if [ "$found" = "found" ]; then
    echo "  ✔ Queue '${queue_name}' already exists"
  else
    echo "  → Creating Queue '${queue_name}'..."
    if output=$("${WRANGLER_CMD[@]}" queues create "${queue_name}" 2>&1); then
      echo "  ✔ Queue '${queue_name}' created"
    else
      if echo "$output" | grep -Eqi "already exists|already taken|\[code:[[:space:]]*11009\]"; then
        echo "  ✔ Queue '${queue_name}' already exists (confirmed via create)"
      else
        echo "  ✗ Failed to create queue '${queue_name}': ${output}" >&2
        exit 1
      fi
    fi
  fi
}

# ── Helper: check if a Pages project exists ────────────────────
provision_pages() {
  local project_name="$1"
  echo "→ Checking Pages project: ${project_name}"

  # Try to get project info; if it fails, create it
  if "${WRANGLER_CMD[@]}" pages project list --json 2>/dev/null | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const p = (Array.isArray(data) ? data : []).find(p => p.name === '${project_name}');
    process.exit(p ? 0 : 1);
  " 2>/dev/null; then
    echo "  ✔ Pages project '${project_name}' already exists"
  else
    echo "  → Creating Pages project '${project_name}'..."
    if output=$("${WRANGLER_CMD[@]}" pages project create "${project_name}" --production-branch=main 2>&1); then
      echo "  ✔ Pages project '${project_name}' created"
    else
      if echo "$output" | grep -qi "already exists"; then
        echo "  ✔ Pages project '${project_name}' already exists (confirmed via create)"
      else
        echo "  ✗ Failed to create Pages project '${project_name}': ${output}" >&2
        exit 1
      fi
    fi
  fi
}

# ── Provision ──────────────────────────────────────────────────
provision_d1  "$D1_DB_NAME"
provision_queue "$QUEUE_NAME"
provision_pages "$PAGES_PROJECT"
provision_dns_record "$ZONE_NAME" "$API_HOSTNAME"

echo ""
echo "══════════════════════════════════════════════════"
echo "  ✔ Provisioning complete for: ${ENV}"
echo "══════════════════════════════════════════════════"
