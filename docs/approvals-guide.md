# Maker-Checker & Approval Process Guide

Complete guide to the CariCash Nova approval system — covering the legacy single-step handler workflow, the policy-driven multi-stage workflow, condition-based routing, delegations, simulation, and all edge case scenarios.

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Architecture Overview](#architecture-overview)
3. [Approval Types](#approval-types)
4. [Legacy Workflow (Single-Step)](#legacy-workflow-single-step)
5. [Policy-Driven Workflow (Multi-Stage)](#policy-driven-workflow-multi-stage)
6. [Policies — CRUD & Lifecycle](#policies--crud--lifecycle)
7. [Conditions](#conditions)
8. [Bindings](#bindings)
9. [Stages](#stages)
10. [Time Constraints](#time-constraints)
11. [Delegations](#delegations)
12. [Simulation & Explain](#simulation--explain)
13. [API Reference](#api-reference)
14. [Scenario Walkthroughs](#scenario-walkthroughs)
15. [Error Codes](#error-codes)
16. [Adding a New Approval Type](#adding-a-new-approval-type)
17. [Dynamic Approval Types](#dynamic-approval-types)

---

## Core Concepts

### Maker-Checker

Every approval request follows the **maker-checker** principle:

- **Maker** — the staff member who creates/initiates the request
- **Checker** — the staff member who approves or rejects it

The system **always** enforces that the maker cannot approve their own request. This is a hard constraint that applies in both legacy and policy-driven workflows.

### Two Workflow Modes

| Mode | When Used | Stages | Authorization |
|------|-----------|--------|---------------|
| **Legacy** | No policy attached to request (`policy_id` is null) | 1 | Handler's `allowedCheckerRoles` |
| **Policy-driven** | Request has a `policy_id` | 1–N (configurable stages) | Policy stages define who can approve at each level |

Both modes share the same `POST /approvals/:id/approve` and `POST /approvals/:id/reject` endpoints. The system auto-detects which mode to use based on whether the request has a `policy_id`.

### States

**Approval Request States:**

| State | Description |
|-------|-------------|
| `PENDING` | Awaiting decision — may be at any stage in a multi-stage workflow |
| `APPROVED` | All required approvals granted; handler side-effects executed |
| `REJECTED` | Rejected at any point; handler rejection side-effects executed |
| `EXPIRED` | Request timed out (SLA breach) |

**Policy States:**

| State | Description |
|-------|-------------|
| `DRAFT` | Being configured; cannot match requests |
| `ACTIVE` | Live and evaluated against incoming requests |
| `INACTIVE` | Temporarily disabled; existing in-flight requests continue but new ones won't match |
| `ARCHIVED` | Permanently retired; cannot be modified |

**Workflow States** (for policy-driven requests):

| State | Description |
|-------|-------------|
| `STAGE_PENDING` | Waiting for approvals at the current stage |
| `STAGE_COMPLETE` | Current stage's threshold met (transitional) |
| `ALL_STAGES_COMPLETE` | All stages done — request is APPROVED or REJECTED |
| `ESCALATED` | Stage timed out and escalated to a wider group |
| `EXPIRED` | Whole workflow timed out |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     Request Creation                          │
│  (any endpoint that inserts into approval_requests)           │
│                                                               │
│  1. evaluatePolicies() → find matching policy                 │
│  2. Attach policy_id, total_stages, current_stage=1           │
│  3. Store PolicyDecision audit trail                          │
│  4. If no policy matches → legacy (no policy_id)             │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│              POST /approvals/:id/approve                      │
│                                                               │
│  ┌─ policy_id present? ─────────────────────────────────┐    │
│  │ YES: Policy-driven workflow                          │    │
│  │  1. Find current stage definition from policy        │    │
│  │  2. checkStageAuthorization(stage, decider, maker)   │    │
│  │  3. Record ApprovalStageDecision                     │    │
│  │  4. Count approvals vs min_approvals                 │    │
│  │  5. If threshold met:                                │    │
│  │     - Last stage → APPROVED → run handler.onApprove  │    │
│  │     - Not last → advance to next stage               │    │
│  │  6. If not met → stay at current stage               │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌─ policy_id absent? ──────────────────────────────────┐    │
│  │ NO: Legacy workflow                                  │    │
│  │  1. Maker ≠ checker check                            │    │
│  │  2. Role check (handler.allowedCheckerRoles)         │    │
│  │  3. handler.validateApproval()                       │    │
│  │  4. Update to APPROVED                               │    │
│  │  5. Run handler.onApprove()                          │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Handler Registry | `api/src/lib/approval-handlers.ts` | Maps approval types to handler logic |
| Handler Implementations | `api/src/lib/approval-handler-impls.ts` | 6 concrete handlers (reversal, adjustment, etc.) |
| Policy Engine | `api/src/lib/policy-engine.ts` | Evaluates policies, checks stage authorization |
| Approval Routes | `api/src/routes/approvals.ts` | `GET/POST` for listing, approving, rejecting |
| Policy Routes | `api/src/routes/approval-policies.ts` | Policy CRUD, simulate, explain, delegations |
| DB Migration | `db/migrations/0014_approval_policies.sql` | 7 new tables + ALTER on `approval_requests` |

---

## Approval Types

Currently registered handlers:

| Type | Label | Allowed Checker Roles | Side-Effects |
|------|-------|----------------------|--------------|
| `REVERSAL_REQUESTED` | Journal Reversal | Any staff | Posts reversal journal with mirrored entries |
| `MANUAL_ADJUSTMENT_REQUESTED` | Manual Adjustment (Suspense Funding) | `FINANCE` | Posts suspense funding transaction, updates balances |
| `OVERDRAFT_FACILITY_REQUESTED` | Overdraft Facility | Any staff | Activates/rejects the overdraft facility |
| `MERCHANT_WITHDRAWAL_REQUESTED` | Merchant Withdrawal | `OPERATIONS`, `SUPER_ADMIN` | Posts withdrawal via PostingDO |
| `FEE_MATRIX_CHANGE_REQUESTED` | Fee Matrix Change | `FINANCE`, `SUPER_ADMIN` | *(stub — no side-effects yet)* |
| `COMMISSION_MATRIX_CHANGE_REQUESTED` | Commission Matrix Change | `FINANCE`, `SUPER_ADMIN` | *(stub — no side-effects yet)* |

List all registered types at runtime:

```bash
GET /approvals/types
```

---

## Legacy Workflow (Single-Step)

This is the original flow, used when an approval request has **no `policy_id`** attached.

### Flow

1. **Maker** creates the request (recorded in `approval_requests` with `state = PENDING`)
2. **Checker** calls `POST /approvals/:id/approve` or `POST /approvals/:id/reject`
3. System validates:
   - Request is still `PENDING`
   - Checker is not the maker (`maker_staff_id ≠ staff_id`)
   - Checker has an allowed role (per handler's `allowedCheckerRoles`; empty = any staff)
   - Handler's `validateApproval()` passes (if defined)
4. On approve:
   - Request state → `APPROVED`
   - Audit log recorded
   - Domain event emitted + sent to queue
   - Handler's `onApprove()` side-effects execute (post transactions, activate facilities, etc.)
5. On reject:
   - Request state → `REJECTED`
   - Handler's `onReject()` side-effects execute (if defined)

### Example: Approving a Reversal

```bash
# Maker creates the request (done upstream when reversal is initiated)
# Request ID: req_01HXYZ...

# Checker approves
POST /approvals/req_01HXYZ.../approve
{
  "staff_id": "staff_checker_001",
  "correlation_id": "corr_abc123"
}

# Response
{
  "request_id": "req_01HXYZ...",
  "type": "REVERSAL_REQUESTED",
  "state": "APPROVED",
  "handler": "Journal Reversal",
  "result": {
    "reversal_journal_id": "jnl_02...",
    "original_journal_id": "jnl_01...",
    "posting": { ... }
  },
  "correlation_id": "corr_abc123"
}
```

### Example: Rejecting a Request

```bash
POST /approvals/req_01HXYZ.../reject
{
  "staff_id": "staff_checker_001",
  "reason": "Insufficient documentation provided"
}

# Response
{
  "request_id": "req_01HXYZ...",
  "type": "REVERSAL_REQUESTED",
  "state": "REJECTED",
  "handler": "Journal Reversal",
  "result": {},
  "correlation_id": "..."
}
```

---

## Policy-Driven Workflow (Multi-Stage)

When an approval request has a **`policy_id`** attached, the system uses the policy's stage definitions to control who can approve, how many approvals are needed, and in what order.

### How Policies Get Attached

When creating an approval request, the caller should:

1. Call `evaluatePolicies(db, context)` with the request details
2. If a policy matches, set `policy_id`, `current_stage = 1`, `total_stages`, `workflow_state = 'STAGE_PENDING'` on the request
3. Store a `PolicyDecision` audit record

If no policy matches, the request proceeds without a `policy_id` (legacy mode).

### Multi-Stage Approve Flow

```
Stage 1                    Stage 2                    Stage 3
┌─────────────┐           ┌─────────────┐           ┌─────────────┐
│ min: 2      │           │ min: 1      │           │ min: 1      │
│ roles:      │──stage──▶ │ roles:      │──stage──▶ │ roles:      │──▶ APPROVED
│  OPERATIONS │  complete │  COMPLIANCE │  complete │  SUPER_ADMIN│    + handler
│  SUPPORT    │           │             │           │             │    side-effects
└─────────────┘           └─────────────┘           └─────────────┘
  2 approvals               1 approval                1 approval
  needed                    needed                    needed
```

### Step-by-Step

1. Request created with `policy_id`, `current_stage = 1`, `total_stages = 3`
2. **First checker** approves → stage decision recorded, count = 1/2 → stays at stage 1
3. **Second checker** approves → count = 2/2 → stage 1 complete → advance to stage 2
4. **Compliance officer** approves → count = 1/1 → stage 2 complete → advance to stage 3
5. **Super admin** approves → count = 1/1 → stage 3 complete → ALL_STAGES_COMPLETE → request state = APPROVED → handler side-effects run

### Rejection Behavior

A **rejection at any stage** immediately rejects the entire request:

- Stage rejection decision recorded
- `workflow_state` → `ALL_STAGES_COMPLETE`
- `state` → `REJECTED`
- Handler `onReject()` side-effects execute

There is no "partial rejection" — any authorized checker rejecting at any stage terminates the workflow.

---

## Policies — CRUD & Lifecycle

### Create a Policy

```bash
POST /approvals/policies
{
  "name": "High-Value Merchant Withdrawals",
  "description": "Three-tier approval for withdrawals over $10,000",
  "approval_type": "MERCHANT_WITHDRAWAL_REQUESTED",
  "priority": 10,
  "staff_id": "staff_admin_001",
  "conditions": [
    { "field": "amount", "operator": "gte", "value": 10000 }
  ],
  "stages": [
    {
      "stage_no": 1,
      "min_approvals": 1,
      "roles": ["OPERATIONS"],
      "exclude_maker": true
    },
    {
      "stage_no": 2,
      "min_approvals": 1,
      "roles": ["COMPLIANCE"],
      "exclude_maker": true,
      "exclude_previous_approvers": true
    },
    {
      "stage_no": 3,
      "min_approvals": 1,
      "roles": ["SUPER_ADMIN", "FINANCE"],
      "exclude_maker": true,
      "exclude_previous_approvers": true
    }
  ],
  "bindings": [
    { "binding_type": "all" }
  ]
}
```

Policy is created in `DRAFT` state.

### Activate a Policy

A policy must have at least one stage to be activated:

```bash
POST /approvals/policies/{id}/activate
{ "staff_id": "staff_admin_001" }
```

Activation increments the `version` number and sets state to `ACTIVE`.

### Deactivate a Policy

```bash
POST /approvals/policies/{id}/deactivate
{ "staff_id": "staff_admin_001" }
```

Sets state to `INACTIVE`. Existing in-flight requests using this policy continue; new requests won't match it.

### Update a Policy

```bash
PATCH /approvals/policies/{id}
{
  "staff_id": "staff_admin_001",
  "name": "Updated name",
  "conditions": [ ... ],
  "stages": [ ... ],
  "bindings": [ ... ]
}
```

Providing `conditions`, `stages`, or `bindings` in the PATCH body **replaces** the entire set (delete-and-reinsert). You cannot update an `ARCHIVED` policy.

### Delete a Policy

```bash
DELETE /approvals/policies/{id}
```

Only `DRAFT` or `INACTIVE` policies can be deleted. `ACTIVE` policies must be deactivated first.

### List Policies

```bash
GET /approvals/policies?state=ACTIVE&approval_type=MERCHANT_WITHDRAWAL_REQUESTED&limit=50
```

### Get Policy Detail

```bash
GET /approvals/policies/{id}
```

Returns the full policy with nested conditions, stages, and bindings.

### Policy Lifecycle Diagram

```
  ┌───────┐    activate    ┌────────┐   deactivate   ┌──────────┐
  │ DRAFT │───────────────▶│ ACTIVE │────────────────▶│ INACTIVE │
  └───┬───┘                └────┬───┘                 └─────┬────┘
      │                         │                           │
      │         deactivate      │     activate              │
      │    ◀────────────────────┘  ◀────────────────────────┘
      │                         │
      └─── delete               └──── (cannot delete while active)
                                │
                                ▼
                           ┌──────────┐
                           │ ARCHIVED │ ← manual transition
                           └──────────┘
```

---

## Conditions

Conditions define **what** the policy matches against. All conditions within a policy are **AND-ed** — every condition must pass for the policy to match.

### Condition Fields

The engine resolves fields from the request context:

| Field | Source | Example |
|-------|--------|---------|
| `approval_type` | Request type | `"MERCHANT_WITHDRAWAL_REQUESTED"` |
| `actor_type` | Maker's actor type | `"STAFF"` |
| `actor_id` | Maker's actor ID | `"staff_001"` |
| `staff_role` | Maker's staff role | `"OPERATIONS"` |
| `amount` | Payload field | `10000` |
| `currency` | Payload field | `"BBD"` |
| `merchant_id` | Payload field | `"merch_001"` |
| `payload.risk_score` | Nested payload field | `85` |
| `payload.channel` | Nested payload field | `"MOBILE"` |
| Any dotted path | Deep payload lookup | `payload.meta.country` |

### Operators

| Operator | Description | Value Example |
|----------|-------------|---------------|
| `eq` | Equals | `"BBD"` |
| `neq` | Not equals | `"USD"` |
| `gt` | Greater than | `5000` |
| `gte` | Greater than or equal | `10000` |
| `lt` | Less than | `100` |
| `lte` | Less than or equal | `500` |
| `in` | Value in list | `["BBD", "USD"]` |
| `not_in` | Value not in list | `["BLOCKED_COUNTRY"]` |
| `contains` | String contains substring | `"HIGH"` |
| `regex` | Matches regular expression | `"^VIP_"` |
| `between` | Numeric range (inclusive) | `[1000, 50000]` |
| `exists` | Field exists/not null | `true` or `false` |

### Examples

```json
// Amount over $10,000
{ "field": "amount", "operator": "gte", "value": 10000 }

// Currency is BBD or USD
{ "field": "currency", "operator": "in", "value": ["BBD", "USD"] }

// Risk score above threshold
{ "field": "payload.risk_score", "operator": "gt", "value": 75 }

// Only mobile channel
{ "field": "payload.channel", "operator": "eq", "value": "MOBILE" }

// Amount between 5000 and 50000
{ "field": "amount", "operator": "between", "value": [5000, 50000] }

// KYC tier exists
{ "field": "payload.kyc_tier", "operator": "exists", "value": true }
```

---

## Bindings

Bindings define **who** the policy applies to — which makers/contexts trigger this policy. Bindings are **OR-ed** — any single binding matching is sufficient.

| Binding Type | Value | Description |
|-------------|-------|-------------|
| `all` | `{}` | Universal — applies to everyone |
| `actor` | `{"actor_id": "staff_001"}` | Specific maker |
| `actor_type` | `{"actor_type": "STAFF"}` | All makers of this actor type |
| `role` | `{"role": "OPERATIONS"}` | Makers with this staff role |
| `currency` | `{"currency": "USD"}` | Requests in this currency |
| `hierarchy` | `{"parent_id": "merch_parent_001"}` | Requests under this merchant parent |
| `business_unit` | `{"unit_id": "unit_001"}` | Requests from this business unit |

### Examples

```json
// Apply to all (universal)
{ "binding_type": "all", "binding_value": {} }

// Only operations staff
{ "binding_type": "role", "binding_value": { "role": "OPERATIONS" } }

// Only USD transactions
{ "binding_type": "currency", "binding_value": { "currency": "USD" } }

// Specific merchant hierarchy
{ "binding_type": "hierarchy", "binding_value": { "parent_id": "merch_parent_001" } }
```

---

## Stages

Each policy has one or more **stages** that define the approval workflow. Stages are processed sequentially (stage 1 → stage 2 → ... → stage N).

### Stage Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `stage_no` | number | auto-increment | Sequential stage number (1-based) |
| `min_approvals` | number | 1 | How many approve decisions needed to complete this stage |
| `roles` | string[] | `[]` (any) | Which staff roles can decide at this stage |
| `actor_ids` | string[] | `[]` (any) | Specific staff who can decide at this stage |
| `exclude_maker` | boolean | true | Prevent the request maker from approving |
| `exclude_previous_approvers` | boolean | false | Prevent approvers from earlier stages from acting |
| `timeout_minutes` | number | null | Auto-escalate if stage not completed in time |
| `escalation_roles` | string[] | null | Who gets escalated to on timeout |
| `escalation_actor_ids` | string[] | null | Specific escalation targets |

### Authorization Logic

For each stage decision, the system checks (in order):

1. **Maker ≠ Checker** — if `exclude_maker` is true and the decider is the maker → `403`
2. **Previous-approver exclusion** — if `exclude_previous_approvers` is true and the decider decided a prior stage → `403`
3. **Role check** — if `roles` is non-empty, the decider's `staff_role` must be in the list
4. **Actor check** — if `actor_ids` is non-empty, the decider's ID must be in the list
5. **Delegation fallback** — if direct authorization fails, check if there's an active delegation from an authorized user to this decider

If both `roles` and `actor_ids` are empty, any staff can decide (subject to maker/previous-approver exclusions).

### Example: Two-Stage Policy

```json
{
  "stages": [
    {
      "stage_no": 1,
      "min_approvals": 2,
      "roles": ["OPERATIONS", "SUPPORT"],
      "exclude_maker": true,
      "timeout_minutes": 60,
      "escalation_roles": ["ADMIN"]
    },
    {
      "stage_no": 2,
      "min_approvals": 1,
      "roles": ["FINANCE", "SUPER_ADMIN"],
      "exclude_maker": true,
      "exclude_previous_approvers": true
    }
  ]
}
```

Stage 1 requires **2** approvals from OPERATIONS or SUPPORT staff. If not completed within 60 minutes, ADMIN staff are added. Stage 2 requires **1** approval from FINANCE or SUPER_ADMIN, and none of the stage-1 approvers can participate.

---

## Time Constraints

Policies can restrict **when** they are active.

### Top-Level Validity Window

```json
{
  "valid_from": "2026-01-01T00:00:00Z",
  "valid_to": "2026-12-31T23:59:59Z"
}
```

Policy only matches requests created within this window.

### Fine-Grained Time Constraints

```json
{
  "time_constraints": {
    "weekdays": [1, 2, 3, 4, 5],
    "active_from_time": "08:00",
    "active_to_time": "17:00",
    "blackout_dates": ["2026-12-25", "2026-01-01"]
  }
}
```

| Constraint | Format | Description |
|-----------|--------|-------------|
| `weekdays` | `number[]` | ISO day-of-week: 1=Monday ... 7=Sunday |
| `active_from_time` | `"HH:MM"` | Earliest time of day (UTC) |
| `active_to_time` | `"HH:MM"` | Latest time of day (UTC) |
| `blackout_dates` | `"YYYY-MM-DD"[]` | Dates when policy does not apply |

If a request is created outside the time window, the policy does not match and the engine falls through to the next policy (by priority).

### Expiry & Escalation

| Field | Description |
|-------|-------------|
| `expiry_minutes` | How long the request can stay pending before expiring |
| `escalation_minutes` | How long before the current stage escalates |
| `escalation_group` | JSON array of staff IDs or role names for escalation targets |

---

## Delegations

Delegations allow a staff member to designate a substitute who can approve on their behalf during a specified time window (e.g., vacation, leave).

### Create a Delegation

```bash
POST /approvals/delegations
{
  "delegator_id": "staff_finance_001",
  "delegate_id": "staff_finance_002",
  "approval_type": "MERCHANT_WITHDRAWAL_REQUESTED",
  "valid_from": "2026-03-01T00:00:00Z",
  "valid_to": "2026-03-15T23:59:59Z",
  "reason": "Annual leave",
  "staff_id": "staff_admin_001"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `delegator_id` | Yes | Staff ID of the person delegating authority |
| `delegate_id` | Yes | Staff ID receiving delegated authority |
| `approval_type` | No | Scope to a specific approval type (null = all types) |
| `valid_from` | Yes | Start of delegation window (ISO timestamp) |
| `valid_to` | Yes | End of delegation window (ISO timestamp) |
| `reason` | No | Human-readable reason for the delegation |
| `staff_id` | Yes | Who is creating this delegation (audit) |

### How Delegation Works

When a checker tries to approve/reject a stage and fails the direct role/actor check, the system looks for active delegations:

1. Find active delegations where `delegate_id = checker` and current time is within `valid_from–valid_to`
2. If a delegation exists, check whether the **delegator** would have been authorized for this stage
3. If yes → the delegate inherits that authorization; the delegation is recorded in the audit

### List Delegations

```bash
GET /approvals/delegations?delegator_id=staff_001&state=ACTIVE
```

### Revoke a Delegation

```bash
POST /approvals/delegations/{id}/revoke
{ "staff_id": "staff_admin_001" }
```

### Delegation States

| State | Description |
|-------|-------------|
| `ACTIVE` | Currently in effect |
| `REVOKED` | Manually cancelled |
| `EXPIRED` | Past `valid_to` — automatically no longer matches |

---

## Simulation & Explain

### Simulate (Dry-Run)

Test which policy would match a hypothetical request **without creating one**:

```bash
POST /approvals/policies/simulate
{
  "approval_type": "MERCHANT_WITHDRAWAL_REQUESTED",
  "maker_id": "staff_ops_001",
  "payload": {
    "amount": 25000,
    "currency": "BBD",
    "merchant_id": "merch_001"
  }
}
```

**Response:**

```json
{
  "simulation": true,
  "matched": true,
  "policy_id": "pol_01HX...",
  "policy_name": "High-Value Merchant Withdrawals",
  "total_stages": 3,
  "stages": [
    {
      "stage_no": 1,
      "min_approvals": 1,
      "allowed_roles": ["OPERATIONS"],
      "allowed_actors": [],
      "timeout_minutes": null
    },
    {
      "stage_no": 2,
      "min_approvals": 1,
      "allowed_roles": ["COMPLIANCE"],
      "allowed_actors": [],
      "timeout_minutes": null
    },
    {
      "stage_no": 3,
      "min_approvals": 1,
      "allowed_roles": ["SUPER_ADMIN", "FINANCE"],
      "allowed_actors": [],
      "timeout_minutes": null
    }
  ],
  "reasons": [
    "No time constraints",
    "Universal binding",
    "amount (25000) >= 10000"
  ],
  "all_evaluated": [
    {
      "policy_id": "pol_01HX...",
      "policy_name": "High-Value Merchant Withdrawals",
      "matched": true,
      "reasons": ["No time constraints", "Universal binding", "amount (25000) >= 10000"]
    },
    {
      "policy_id": "pol_02HX...",
      "policy_name": "Standard Withdrawals",
      "matched": false,
      "reasons": ["amount (25000) not between [0, 9999]"]
    }
  ]
}
```

The `all_evaluated` array shows **every active policy** that was considered and why it matched or didn't. This is invaluable for debugging policy configuration.

### Explain (Policy Decision)

View the policy decision and stage progress for an existing request:

```bash
GET /approvals/policies/requests/{request_id}/policy-decision
```

**Response:**

```json
{
  "request_id": "req_01HX...",
  "request_type": "MERCHANT_WITHDRAWAL_REQUESTED",
  "request_state": "PENDING",
  "policy_id": "pol_01HX...",
  "current_stage": 2,
  "total_stages": 3,
  "workflow_state": "STAGE_PENDING",
  "policy_decision": {
    "evaluation": { ... },
    "matched_policy_id": "pol_01HX...",
    "total_stages": 3,
    "created_at": "2026-02-20T10:00:00Z"
  },
  "stage_decisions": [
    {
      "stage_no": 1,
      "decision": "APPROVE",
      "decider_id": "staff_ops_001",
      "decider_role": "OPERATIONS",
      "reason": null,
      "decided_at": "2026-02-20T10:30:00Z"
    }
  ]
}
```

---

## API Reference

### Approval Requests

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/approvals` | List requests (`?status=PENDING&type=...&pageSize=50`) |
| `GET` | `/approvals/types` | List registered approval types with handler metadata |
| `GET` | `/approvals/:id` | Get request detail with parsed payload |
| `POST` | `/approvals/:id/approve` | Approve (or record stage approval) |
| `POST` | `/approvals/:id/reject` | Reject (or record stage rejection → terminates workflow) |

### Approval Policies

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/approvals/policies` | Create policy (DRAFT) |
| `GET` | `/approvals/policies` | List policies (`?state=ACTIVE&approval_type=...`) |
| `GET` | `/approvals/policies/:id` | Get full policy with conditions/stages/bindings |
| `PATCH` | `/approvals/policies/:id` | Update policy (replaces nested arrays if provided) |
| `DELETE` | `/approvals/policies/:id` | Delete (only DRAFT/INACTIVE) |
| `POST` | `/approvals/policies/:id/activate` | Activate (DRAFT/INACTIVE → ACTIVE) |
| `POST` | `/approvals/policies/:id/deactivate` | Deactivate (ACTIVE → INACTIVE) |
| `POST` | `/approvals/policies/simulate` | Dry-run policy evaluation |
| `GET` | `/approvals/policies/requests/:id/policy-decision` | Explain policy decision + stage audit |

### Delegations

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/approvals/delegations` | Create delegation |
| `GET` | `/approvals/delegations` | List (`?delegator_id=...&delegate_id=...&state=ACTIVE`) |
| `POST` | `/approvals/delegations/:id/revoke` | Revoke delegation |

---

## Scenario Walkthroughs

### Scenario 1: Simple Single-Step Approval (Legacy)

**Context:** A staff member requests a journal reversal. No policy is configured for reversals.

```
1. Maker (staff_ops_001, role=OPERATIONS) creates reversal request
   → approval_requests row: type=REVERSAL_REQUESTED, state=PENDING, policy_id=NULL

2. Checker (staff_ops_002, role=OPERATIONS) approves
   POST /approvals/{id}/approve { "staff_id": "staff_ops_002" }
   → System detects no policy_id → legacy flow
   → Maker ≠ checker ✓
   → allowedCheckerRoles is empty → any staff can approve ✓
   → State → APPROVED
   → Reversal journal posted
```

### Scenario 2: Maker Tries to Approve Own Request

```
1. Maker (staff_ops_001) creates request

2. Same person tries to approve
   POST /approvals/{id}/approve { "staff_id": "staff_ops_001" }
   → 403: "Maker cannot approve their own request"
```

This is enforced in **both** legacy and policy-driven workflows.

### Scenario 3: Unauthorized Role

**Context:** A `SUPPORT` staff tries to approve a merchant withdrawal (requires OPERATIONS or SUPER_ADMIN).

```
1. Request: MERCHANT_WITHDRAWAL_REQUESTED (legacy, no policy)

2. Support staff tries to approve
   POST /approvals/{id}/approve { "staff_id": "staff_support_001" }
   → Handler allowedCheckerRoles = ["OPERATIONS", "SUPER_ADMIN"]
   → staff_support_001 role = "SUPPORT"
   → 403: "Only OPERATIONS, SUPER_ADMIN can approve Merchant Withdrawal requests"
```

### Scenario 4: Policy-Driven Three-Stage Withdrawal

**Context:** A withdrawal of $50,000 matches the "High-Value Merchant Withdrawals" policy with 3 stages.

```
1. Request created with policy_id, current_stage=1, total_stages=3

2. OPERATIONS staff (staff_ops_001) approves
   → Stage 1: min_approvals=1, roles=["OPERATIONS"]
   → Authorization ✓
   → Approval count = 1/1 → Stage 1 COMPLETE
   → Advance to stage 2
   Response: { state: "PENDING", current_stage: 2, stage_completed: 1 }

3. COMPLIANCE staff (staff_comp_001) approves
   → Stage 2: min_approvals=1, roles=["COMPLIANCE"], exclude_previous_approvers=true
   → staff_comp_001 not in previous deciders ✓
   → Approval count = 1/1 → Stage 2 COMPLETE
   → Advance to stage 3
   Response: { state: "PENDING", current_stage: 3, stage_completed: 2 }

4. SUPER_ADMIN (staff_admin_001) approves
   → Stage 3: min_approvals=1, roles=["SUPER_ADMIN", "FINANCE"]
   → Authorization ✓
   → Approval count = 1/1 → Stage 3 COMPLETE → ALL_STAGES_COMPLETE
   → State → APPROVED
   → Withdrawal transaction posted via handler.onApprove()
   Response: { state: "APPROVED", workflow_state: "ALL_STAGES_COMPLETE" }
```

### Scenario 5: Multiple Approvals Needed at One Stage

**Context:** Stage 1 requires 2 approvals from OPERATIONS staff.

```
1. First OPERATIONS staff approves
   → Approval count = 1/2 → Stage not yet complete
   Response: { state: "PENDING", stage_approvals: 1, stage_required: 2 }

2. Second OPERATIONS staff approves (different person)
   → Approval count = 2/2 → Stage 1 COMPLETE → advance to stage 2
   Response: { state: "PENDING", current_stage: 2, stage_completed: 1 }
```

### Scenario 6: Duplicate Decision at Same Stage

```
1. staff_ops_001 approves stage 1
   → Decision recorded ✓

2. staff_ops_001 tries to approve stage 1 again
   → 409: "You have already decided on this stage"
```

### Scenario 7: Previous Approver Excluded from Later Stage

**Context:** `exclude_previous_approvers = true` on stage 2.

```
1. staff_ops_001 approves stage 1 → stage advances to 2

2. staff_ops_001 tries to approve stage 2
   → Previous decider IDs include staff_ops_001
   → 403: "Already decided in a previous stage"
```

### Scenario 8: Rejection at Stage 2 of 3

**Context:** Request is at stage 2, compliance officer rejects.

```
1. Request at stage 2/3

2. COMPLIANCE staff rejects
   POST /approvals/{id}/reject { "staff_id": "staff_comp_001", "reason": "AML flag" }
   → Stage rejection recorded (stage_no=2, decision=REJECT)
   → workflow_state → ALL_STAGES_COMPLETE
   → state → REJECTED
   → handler.onReject() executes
   Response: { state: "REJECTED", rejected_at_stage: 2, total_stages: 3 }
```

The entire request is terminated — there is no recovery from a stage rejection.

### Scenario 9: Delegation — Approval on Behalf of Another

**Context:** Finance lead (staff_fin_001) is on leave. Delegated authority to staff_fin_002 for merchant withdrawals.

```
1. Delegation created
   POST /approvals/delegations
   {
     "delegator_id": "staff_fin_001",
     "delegate_id": "staff_fin_002",
     "approval_type": "MERCHANT_WITHDRAWAL_REQUESTED",
     "valid_from": "2026-03-01T00:00:00Z",
     "valid_to": "2026-03-15T23:59:59Z",
     "staff_id": "staff_admin_001"
   }

2. Request reaches stage 3, requiring FINANCE role
   → staff_fin_002 (role=FINANCE) tries to approve
   → Direct authorization succeeds (role=FINANCE matches)
   → Approved ✓

   OR if staff_fin_002 has a different role:
   → Direct authorization fails
   → System checks delegations for staff_fin_002
   → Finds active delegation from staff_fin_001 (who has FINANCE authority)
   → Delegate inherits delegator's authorization
   → Approved with reason: "Delegated by staff_fin_001"
```

### Scenario 10: No Policy Matches — Fallback to Legacy

```
1. Request for REVERSAL_REQUESTED created
   → evaluatePolicies() runs, no active policy matches reversals
   → Request created with policy_id = NULL

2. Any staff (non-maker) approves via legacy handler flow
   → No stage progression — single-step approve
```

### Scenario 11: Policy with Time Window — Request Outside Hours

**Context:** Policy only active weekdays 08:00–17:00 UTC.

```
1. Request created at Saturday 14:00 UTC
   → evaluatePolicies() evaluates the time-restricted policy
   → Day-of-week = 6 (Saturday) not in [1,2,3,4,5]
   → Policy does NOT match
   → Falls through to next lower-priority policy (or no match)
```

### Scenario 12: Policy with Amount Bands

**Context:** Two policies for merchant withdrawals at different priorities.

```
Policy A (priority=10): amount >= 10000 → 3 stages
Policy B (priority=20): amount between [0, 9999] → 1 stage

Request for $5,000:
  → Policy A: amount (5000) not >= 10000 → no match
  → Policy B: amount (5000) between [0, 9999] → MATCH
  → 1-stage workflow attached

Request for $25,000:
  → Policy A: amount (25000) >= 10000 → MATCH (first match wins)
  → Policy B: not evaluated (Policy A already matched)
  → 3-stage workflow attached
```

Policy evaluation is **first-match-by-priority** (lower number = higher priority).

### Scenario 13: Simulate Before Creating

```
POST /approvals/policies/simulate
{
  "approval_type": "MERCHANT_WITHDRAWAL_REQUESTED",
  "payload": { "amount": 15000, "currency": "BBD" }
}

Response shows which policy matches, how many stages, and detailed
reasons for every policy evaluated — without creating any records.
```

### Scenario 14: Request Already Acted Upon

```
1. Request is APPROVED (or REJECTED)

2. Someone tries to approve/reject again
   → 409: "Request is already APPROVED"
```

### Scenario 15: No Handler Registered for Approval Type

```
1. Request has type "UNKNOWN_TYPE"

2. Checker tries to approve
   → 501: "No approval handler registered for type: UNKNOWN_TYPE"
```

### Scenario 16: Policy-Driven Request — Unauthorized Checker at Stage

```
1. Request at stage 1, roles = ["COMPLIANCE"]

2. OPERATIONS staff tries to approve
   → checkStageAuthorization: role OPERATIONS not in ["COMPLIANCE"]
   → No active delegation found
   → 403: "Role OPERATIONS not in allowed roles [COMPLIANCE]"
```

### Scenario 17: Blackout Date Policy

```
Policy with blackout_dates: ["2026-12-25"]
Request created on 2026-12-25:
  → checkTimeConstraints: "Date 2026-12-25 is a blackout date"
  → Policy does not match → falls through
```

### Scenario 18: Concurrent Stage Approvals

```
1. Stage requires 2 approvals
2. Two checkers approve simultaneously
   → Each records a stage decision
   → Each counts approvals
   → The second one to commit will see count=2 and trigger stage advancement
   → No double-advancement: the approval_request.current_stage is atomically updated
```

### Scenario 19: Revoking a Delegation Mid-Flight

```
1. staff_fin_002 has active delegation from staff_fin_001
2. Admin revokes the delegation
   POST /approvals/delegations/{id}/revoke

3. staff_fin_002 tries to approve next stage
   → Delegation state = REVOKED → not found in active delegations
   → If no direct authorization → 403
```

### Scenario 20: Policy with Specific Actor IDs

```yaml
stages:
  - stage_no: 1
    actor_ids: ["staff_ceo_001", "staff_cfo_001"]
    roles: []    # empty = no role restriction beyond actor IDs
    min_approvals: 1
```

Only the CEO or CFO can approve this stage, regardless of their role.

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `POLICY_NOT_FOUND` | 404 | Referenced policy does not exist |
| `POLICY_INACTIVE` | 409 | Policy is not in ACTIVE state |
| `NO_MATCHING_POLICY` | — | No active policy matched (informational in simulate) |
| `STAGE_NOT_READY` | 400 | Current stage definition not found in policy |
| `ALREADY_DECIDED_STAGE` | 409 | Decider already submitted a decision for this stage |
| `DELEGATION_NOT_FOUND` | 404 | Referenced delegation does not exist |
| `DELEGATION_EXPIRED` | 409 | Delegation is past its valid_to window |
| `CHECKER_NOT_AUTHORIZED` | 403 | Checker does not have permission for this stage |
| `TIME_WINDOW_CLOSED` | — | Request created outside policy's active time window |

---

## Adding a New Approval Type

### Step 1: Add the type to the enum

In `packages/shared/src/enums.ts`:

```typescript
export const ApprovalType = {
  // ... existing types
  MY_NEW_TYPE_REQUESTED: 'MY_NEW_TYPE_REQUESTED',
} as const;
```

### Step 2: Create a handler

In `packages/api/src/lib/approval-handler-impls.ts`:

```typescript
const myNewTypeHandler: ApprovalHandler = {
  label: 'My New Approval Type',
  allowedCheckerRoles: [StaffRole.FINANCE],  // or [] for any staff

  async validateApproval(ctx) {
    // Optional: return error string to block approval
    return null;
  },

  async onApprove(ctx) {
    // Execute side-effects: post transactions, update records, etc.
    return { some: 'result' };
  },

  async onReject(ctx) {
    // Optional: clean up on rejection
    return {};
  },

  eventNames: {
    onApprove: EventName.MY_CUSTOM_EVENT,
    onReject: EventName.MY_CUSTOM_REJECT_EVENT,
  },
};

// Register
approvalRegistry.register(ApprovalType.MY_NEW_TYPE_REQUESTED, myNewTypeHandler);
```

### Step 3: Create a policy (optional)

If you want multi-stage approval for this type, create and activate a policy via the API. Without a policy, the handler's `allowedCheckerRoles` controls authorization (legacy mode).

### Step 4: Wire request creation

Wherever the approval request is created, optionally evaluate policies:

```typescript
import { evaluatePolicies } from '../lib/policy-engine.js';

// Evaluate
const policyResult = await evaluatePolicies(c.env.DB, {
  approval_type: ApprovalType.MY_NEW_TYPE_REQUESTED,
  maker_actor: makerActor,
  payload: requestPayload,
  now: nowISO(),
});

// Attach to request if matched
const workflowFields = policyResult.matched
  ? {
      policy_id: policyResult.policy_id,
      current_stage: 1,
      total_stages: policyResult.total_stages,
      workflow_state: 'STAGE_PENDING',
    }
  : {};

// Insert approval request with workflowFields
```

---

## Priority & Evaluation Order

When multiple active policies could apply, the engine evaluates them in **priority order** (ascending — lower number = higher priority). The **first policy** that matches all conditions, bindings, and time constraints is selected.

```
Priority 10: High-value (amount >= 10000) → 3 stages
Priority 20: Medium-value (amount between 1000–9999) → 2 stages
Priority 100: Default (no conditions) → 1 stage
```

A request for $500 skips priorities 10 and 20 (conditions don't match) and falls to the default at priority 100.

**Best practice:** Always have a low-priority catch-all policy for each approval type to ensure every request gets a policy match.

---

## Database Schema

### Core Tables (migration 0014)

| Table | Purpose |
|-------|---------|
| `approval_policies` | Policy definitions (name, type, priority, state, time constraints, version) |
| `approval_policy_conditions` | WHERE-clause conditions per policy (field, operator, value) |
| `approval_policy_stages` | Stage definitions per policy (stage_no, min_approvals, roles, exclusions) |
| `approval_policy_bindings` | WHO the policy applies to (actor, role, currency, etc.) |
| `approval_stage_decisions` | Individual decisions recorded per stage (who, when, approve/reject) |
| `approval_delegations` | Delegation records (delegator → delegate, time window, approval type) |
| `approval_policy_decisions` | Full evaluation audit trail per request (which policies tested, why matched) |

### Extended Fields on `approval_requests`

| Column | Type | Description |
|--------|------|-------------|
| `policy_id` | TEXT | References the matched policy (null for legacy) |
| `current_stage` | INTEGER | Current stage number (default 1) |
| `total_stages` | INTEGER | Total stages from policy (default 1) |
| `workflow_state` | TEXT | `STAGE_PENDING`, `ALL_STAGES_COMPLETE`, etc. |

---

## Audit & Events

Every approval action generates both an **audit log** entry and a **domain event** (sent to the events queue).

### Events Emitted

| Event | When |
|-------|------|
| `APPROVAL_APPROVED` | Request fully approved (all stages complete or legacy) |
| `APPROVAL_REJECTED` | Request rejected |
| `APPROVAL_STAGE_DECIDED` | Individual stage decision recorded |
| `APPROVAL_STAGE_ADVANCED` | Stage threshold met, advanced to next stage |
| `APPROVAL_ESCALATED` | Stage timed out and escalated |
| `APPROVAL_POLICY_CREATED` | New policy created |
| `APPROVAL_POLICY_UPDATED` | Policy modified |
| `APPROVAL_POLICY_ACTIVATED` | Policy set to ACTIVE |
| `APPROVAL_POLICY_DEACTIVATED` | Policy set to INACTIVE |
| `APPROVAL_DELEGATION_CREATED` | New delegation created |
| `APPROVAL_DELEGATION_REVOKED` | Delegation revoked |

Each handler can override event names (e.g., `REVERSAL_POSTED` instead of generic `APPROVAL_APPROVED`) via the `eventNames` config on the handler.

---

## Dynamic Approval Types

> **Migration 0015** — Approval types and endpoint bindings can be configured at runtime via API, without code changes.

### Overview

Previously, adding a new approval type required:
1. Adding a value to the `ApprovalType` enum
2. Creating a handler implementation
3. Registering the handler
4. Deploying new code

Now, approval types can be configured dynamically:
- **Type definitions** are stored in `approval_type_configs`
- **Endpoint bindings** map `(route, method) → approval_type`
- Types without code handlers use a **generic fallback handler** (approve/reject gate with no side-effects)
- Types with complex side-effects still use code handlers

### Approval Type Config

Each type config defines:

| Field | Description |
|-------|-------------|
| `type_key` | Unique key (UPPER_SNAKE_CASE), e.g. `STORE_CLOSURE_REQUESTED` |
| `label` | Human-readable name for UI display |
| `description` | Explanation of what this approval type covers |
| `default_checker_roles` | JSON array of roles allowed to check, e.g. `["FINANCE","SUPER_ADMIN"]` |
| `require_reason` | Whether the maker must provide a reason |
| `has_code_handler` | Whether a code-level handler is registered (auto-detected) |
| `auto_policy_id` | Default policy to attach to new requests of this type |
| `enabled` | Whether this type is active |

### Type Config CRUD

```http
# List all type configs
GET /approvals/types/config
GET /approvals/types/config?enabled_only=true

# Get a specific type config
GET /approvals/types/config/:typeKey

# Create a new type config
POST /approvals/types/config
{
  "staff_id": "staff_abc",
  "type_key": "STORE_CLOSURE_REQUESTED",
  "label": "Store Closure",
  "description": "Close a merchant store location",
  "default_checker_roles": ["OPERATIONS", "SUPER_ADMIN"],
  "require_reason": true
}

# Update an existing type config
PATCH /approvals/types/config/:typeKey
{
  "staff_id": "staff_abc",
  "label": "Store Closure Request",
  "default_checker_roles": ["OPERATIONS", "ADMIN", "SUPER_ADMIN"],
  "enabled": true
}

# Delete a type config (cannot delete built-in types with code handlers)
DELETE /approvals/types/config/:typeKey?staff_id=staff_abc
```

### Endpoint Bindings

An endpoint binding maps a route pattern + HTTP method to an approval type. When a bound endpoint is called, the system can intercept the request and create an approval request instead.

| Field | Description |
|-------|-------------|
| `route_pattern` | The route path, e.g. `/merchants/:id/close` |
| `http_method` | HTTP method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE` |
| `approval_type` | The type_key to use for the approval request |
| `description` | Human-readable explanation |
| `extract_payload` | JSON template for extracting payload from request body |
| `enabled` | Whether this binding is active |

### Endpoint Binding CRUD

```http
# List all endpoint bindings
GET /approvals/endpoint-bindings
GET /approvals/endpoint-bindings?approval_type=STORE_CLOSURE_REQUESTED
GET /approvals/endpoint-bindings?enabled_only=true

# Lookup a specific route/method binding
GET /approvals/endpoint-bindings/lookup?route=/merchants/:id/close&method=POST

# Get binding by ID
GET /approvals/endpoint-bindings/:id

# Create a binding
POST /approvals/endpoint-bindings
{
  "staff_id": "staff_abc",
  "route_pattern": "/merchants/:id/close",
  "http_method": "POST",
  "approval_type": "STORE_CLOSURE_REQUESTED",
  "description": "Require approval before closing a merchant store"
}

# Update a binding
PATCH /approvals/endpoint-bindings/:id
{
  "staff_id": "staff_abc",
  "enabled": false
}

# Delete a binding
DELETE /approvals/endpoint-bindings/:id?staff_id=staff_abc
```

### Generic Fallback Handler

When an approval request has a type that has no code-level handler registered, the system builds a **generic handler** from the type config:

- **Checker roles** come from `default_checker_roles_json`
- **No `onApprove` side-effects** — the approval is a pure gate
- **No `onReject` side-effects** — rejection simply marks the request as rejected
- **Generic event names** (`APPROVAL_APPROVED` / `APPROVAL_REJECTED`)

This means you can create a new approval type entirely via the API, attach a policy with conditions and multi-stage rules, and the system will enforce the workflow without any code changes.

For types that need side-effects (e.g., posting a journal on approval, activating a facility), you still need a code handler.

### Using checkEndpointBinding() in Routes

The `checkEndpointBinding()` helper can be used in any route to check for an active binding:

```typescript
import { checkEndpointBinding } from '../lib/endpoint-binding-helper.js';

// Inside a route handler:
const intercepted = await checkEndpointBinding(c, '/merchants/:id/close', 'POST', {
  staff_id: maker.id,
  payload: { merchant_id, reason },
  correlation_id: correlationId,
});
if (intercepted) return intercepted.response;

// Normal execution continues if no binding...
```

The helper:
1. Checks if a binding exists for the route/method
2. Evaluates policies to find a matching policy
3. Creates the approval request
4. Returns a `202 Accepted` response with the request ID

### Built-in Types (Seeded)

The following 6 types are seeded by migration 0015:

| Type Key | Label | Code Handler |
|----------|-------|:---:|
| `REVERSAL_REQUESTED` | Transaction Reversal | ✅ |
| `MANUAL_ADJUSTMENT_REQUESTED` | Manual Adjustment | ✅ |
| `FEE_MATRIX_CHANGE_REQUESTED` | Fee Matrix Change | ✅ |
| `COMMISSION_MATRIX_CHANGE_REQUESTED` | Commission Matrix Change | ✅ |
| `OVERDRAFT_FACILITY_REQUESTED` | Overdraft Facility | ✅ |
| `MERCHANT_WITHDRAWAL_REQUESTED` | Merchant Withdrawal | ✅ |

### Adding a Dynamic Approval Type (No Code)

1. **Create the type config:**
   ```http
   POST /approvals/types/config
   { "staff_id": "...", "type_key": "AGENT_SUSPENSION_REQUESTED", "label": "Agent Suspension", "default_checker_roles": ["COMPLIANCE", "SUPER_ADMIN"] }
   ```

2. **Optionally create a policy:**
   ```http
   POST /approvals/policies
   { "staff_id": "...", "name": "Agent Suspension Policy", "approval_type": "AGENT_SUSPENSION_REQUESTED", ... }
   ```

3. **Optionally bind to an endpoint:**
   ```http
   POST /approvals/endpoint-bindings
   { "staff_id": "...", "route_pattern": "/agents/:id/suspend", "http_method": "POST", "approval_type": "AGENT_SUSPENSION_REQUESTED" }
   ```

4. **Done!** The type is live, no deployment needed.
