# Phase 4 — External Banking Rails

## Citibank Mock API Contract

The mock Citibank adapter exposes the same API shape as the production integration.
All requests require `Authorization: Bearer <service_token>` and `X-Client-Id` headers.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/citi/transfers` | Initiate an outbound bank transfer |
| `GET` | `/citi/transfers/{id}` | Poll transfer status |
| `GET` | `/citi/accounts/{id}/balance` | Real-time balance inquiry |
| `GET` | `/citi/accounts/{id}/statement` | Statement for date range |

### POST /citi/transfers — Request

```json
{
  "client_reference": "txfr_01JXYZ...",
  "from_account_id": "CARI_SETTLEMENT_BBD",
  "to_account_id": "BENE_EXT_00123",
  "amount": "2500.00",
  "currency": "BBD",
  "narrative": "Merchant payout – June 2025"
}
```

### POST /citi/transfers — Response

```json
{
  "bank_transfer_id": "CTX-20250601-0001",
  "client_reference": "txfr_01JXYZ...",
  "status": "CREATED",
  "created_at": "2025-06-01T14:00:00Z"
}
```

### GET /citi/transfers/{id} — Response

```json
{
  "bank_transfer_id": "CTX-20250601-0001",
  "client_reference": "txfr_01JXYZ...",
  "status": "SETTLED",
  "amount": "2500.00",
  "currency": "BBD",
  "from_account_id": "CARI_SETTLEMENT_BBD",
  "to_account_id": "BENE_EXT_00123",
  "created_at": "2025-06-01T14:00:00Z",
  "updated_at": "2025-06-01T14:02:30Z"
}
```

---

## Transfer Status Lifecycle

```
CREATED ──► PENDING ──┬──► SETTLED
                      ├──► FAILED
                      └──► REVERSED
```

| Status | Meaning |
|--------|---------|
| `CREATED` | Transfer accepted by the bank, not yet processed |
| `PENDING` | Transfer is in-flight within the banking network |
| `SETTLED` | Funds delivered to beneficiary account |
| `FAILED` | Transfer rejected (insufficient funds, invalid account, etc.) |
| `REVERSED` | Previously settled transfer was reversed by the bank |

---

## Webhook Payload Format

The bank delivers status updates via `POST /webhooks/citi` with a JSON payload:

```json
{
  "bank_transfer_id": "CTX-20250601-0001",
  "client_reference": "txfr_01JXYZ...",
  "status": "SETTLED",
  "amount": "2500.00",
  "currency": "BBD",
  "from_account_id": "CARI_SETTLEMENT_BBD",
  "to_account_id": "BENE_EXT_00123",
  "occurred_at": "2025-06-01T14:02:30Z"
}
```

### Webhook Security

| Control | Detail |
|---------|--------|
| Signature | `X-Citi-Signature` header contains HMAC-SHA256 of raw body using shared secret |
| Replay protection | `occurred_at` must be within 5 minutes of server clock; reject stale webhooks |
| Idempotency | Composite key `(bank_transfer_id, status)` — duplicate deliveries are no-ops |
| Processing | Idempotent: re-processing the same webhook produces no additional ledger entries |

**Signature verification pseudocode:**
```ts
const expected = hmacSHA256(sharedSecret, rawBody);
const received = request.headers.get("X-Citi-Signature");
if (!timingSafeEqual(expected, received)) return new Response("Unauthorized", { status: 401 });
```

---

## Bank Account Purposes & Ledger Mapping

Each external bank account maps to a ledger account by purpose.

| Purpose | Bank Account ID Pattern | Ledger Account | Normal Balance |
|---------|------------------------|----------------|----------------|
| `SETTLEMENT_OUTBOUND` | `CARI_SETTLEMENT_BBD` | `liability:settlement:outbound` | CR |
| `SETTLEMENT_INBOUND` | `CARI_COLLECTION_BBD` | `liability:settlement:inbound` | CR |
| `FEE_COLLECTION` | `CARI_FEE_BBD` | `revenue:fees:collected` | CR |
| `MERCHANT_PAYOUT` | `MERCH_PAYOUT_*` | `liability:merchant:payable` | CR |
| `AGENT_PAYOUT` | `AGENT_PAYOUT_*` | `liability:agent:payable` | CR |
| `CUSTOMER_WITHDRAWAL` | `CUST_WD_*` | `liability:customer:wallet` | CR |
| `REFUND_OUTBOUND` | `CARI_REFUND_BBD` | `liability:refund:pending` | CR |
| `FLOAT_FUNDING` | `CARI_FLOAT_BBD` | `asset:float:bank` | DR |
| `SUSPENSE` | `CARI_SUSPENSE_BBD` | `liability:suspense:bank` | CR |

---

## External Transfer Lifecycle

```
┌──────────┐    POST /citi/transfers    ┌──────────┐
│  Client   │ ────────────────────────► │  CariCash │
│  Request  │                           │  Gateway  │
└──────────┘                            └────┬─────┘
                                             │
                              ┌──────────────▼──────────────┐
                              │  1. Fraud check (ALLOW?)     │
                              │  2. Reserve funds (DR wallet) │
                              │  3. CR suspense:bank          │
                              │  4. Call bank API              │
                              └──────────────┬───────────────┘
                                             │
                              ┌──────────────▼──────────────┐
                              │  Bank processes transfer      │
                              │  Webhook: PENDING → SETTLED   │
                              └──────────────┬───────────────┘
                                             │
                              ┌──────────────▼──────────────┐
                              │  5. DR suspense:bank          │
                              │  6. CR settlement:outbound    │
                              │  7. Emit TRANSFER_SETTLED     │
                              └───────────────────────────────┘
```

**On FAILED webhook:**
- DR `suspense:bank` → CR wallet (reverse the reservation)
- Emit `TRANSFER_FAILED` event
- Update transfer record status

**On REVERSED webhook:**
- DR `settlement:outbound` → CR wallet (return funds)
- Emit `TRANSFER_REVERSED` event
- Create reconciliation finding for review

---

## Reconciliation Mapping

Daily reconciliation compares internal transfer records against bank statement data.

| Check | Source A | Source B | Match Key |
|-------|----------|----------|-----------|
| Transfer exists | `external_transfers` table | Bank statement line | `bank_transfer_id` |
| Amount matches | Internal `amount` field | Bank statement amount | Exact decimal match |
| Status agrees | Internal status | Bank final status | Must both be terminal |
| Settlement date | Internal `settled_at` | Bank value date | Within 1 calendar day |

**Mismatch handling:**
- Amount mismatch → `CRITICAL` reconciliation finding, auto-freeze transfer
- Missing from bank → `HIGH` finding after T+2, escalate to ops
- Missing internally → `CRITICAL` finding, possible unrecorded inbound — route to suspense
- Status mismatch → `HIGH` finding, manual investigation required
