# OpenAPI Gaps

Endpoints documented in the OpenAPI spec that currently return **501 Not Implemented**.
These have stub handlers in `packages/api/src/routes/stubs.ts`.

## Customer Endpoints

| Endpoint | Status | TODO |
|----------|--------|------|
| `GET /customers/{customerId}` | 501 Stub | Implement customer profile retrieval by ID |
| `GET /customers/{customerId}/kyc` | 501 Stub | Implement KYC profile/status retrieval |

## Agent Endpoints

| Endpoint | Status | TODO |
|----------|--------|------|
| `GET /agents/{agentId}` | 501 Stub | Implement agent profile retrieval by ID |
| `POST /agents/{agentId}/kyc/initiate` | 501 Stub | Implement agent KYC initiation |
| `GET /agents/{agentId}/kyc` | 501 Stub | Implement agent KYC profile/status retrieval |

## Merchant Endpoints

| Endpoint | Status | TODO |
|----------|--------|------|
| `GET /merchants/{merchantId}` | 501 Stub | Implement merchant profile retrieval by ID |
| `POST /merchants/{merchantId}/kyc/initiate` | 501 Stub | Implement merchant KYC initiation |
| `GET /merchants/{merchantId}/kyc` | 501 Stub | Implement merchant KYC profile/status retrieval |
| `POST /merchants/{merchantId}/stores` | 501 Stub | Implement store creation under merchant |
| `GET /merchants/{merchantId}/stores` | 501 Stub | Implement store listing for merchant |

## Store Endpoints

| Endpoint | Status | TODO |
|----------|--------|------|
| `GET /stores/{storeId}` | 501 Stub | Implement store details by ID |

## Wallet Endpoints

| Endpoint | Status | TODO |
|----------|--------|------|
| `GET /wallets/{ownerType}/{ownerId}/{currency}/statement` | 501 Stub | Implement transaction statement with pagination |

## Transaction Endpoints

| Endpoint | Status | TODO |
|----------|--------|------|
| `GET /tx/{journalId}` | 501 Stub | Implement transaction/journal detail retrieval |
| `GET /tx` | 501 Stub | Implement transaction listing with filters |

## Approval Endpoints

| Endpoint | Status | TODO |
|----------|--------|------|
| `GET /approvals` | 501 Stub | Implement approval listing with filters |
| `GET /approvals/{approvalId}` | 501 Stub | Implement approval detail retrieval |

## Ops Endpoints

| Endpoint | Status | TODO |
|----------|--------|------|
| `GET /ops/overdraft` | 501 Stub | Implement overdraft facility listing with filters |

---

**Total stubbed endpoints**: 17
**Total implemented endpoints**: ~30

All stubs are tracked here and in `packages/api/src/routes/stubs.ts` with TODO comments.
