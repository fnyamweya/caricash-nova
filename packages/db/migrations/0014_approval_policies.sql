-- ═══════════════════════════════════════════════════════════════════════════
-- 0014: Approval Policies — dynamic, configurable maker-checker workflows
-- ═══════════════════════════════════════════════════════════════════════════

-- Approval policies: top-level rule that matches approval requests
CREATE TABLE IF NOT EXISTS approval_policies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  -- Which approval type(s) this policy applies to (NULL = all types)
  approval_type TEXT,
  -- Priority: lower number = higher priority; first match wins
  priority INTEGER NOT NULL DEFAULT 100,
  -- Versioning + activation
  version INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','ACTIVE','INACTIVE','ARCHIVED')),
  -- Validity window
  valid_from TEXT,
  valid_to TEXT,
  -- Time constraints (JSON): { weekdays: [1..7], active_from_time: "09:00", active_to_time: "17:00", timezone: "America/Barbados", blackout_dates: ["2026-12-25"] }
  time_constraints_json TEXT,
  -- Expiry SLA: auto-expire pending requests after N minutes
  expiry_minutes INTEGER,
  -- Escalation: escalate to fallback group after N minutes
  escalation_minutes INTEGER,
  escalation_group_json TEXT,
  -- Metadata
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_by TEXT REFERENCES actors(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_approval_policies_state ON approval_policies(state);
CREATE INDEX IF NOT EXISTS idx_approval_policies_type ON approval_policies(approval_type);
CREATE INDEX IF NOT EXISTS idx_approval_policies_priority ON approval_policies(priority ASC);

-- Policy conditions: attribute-based matching rules
-- All conditions within a policy are AND-ed; multiple policies are evaluated in priority order
CREATE TABLE IF NOT EXISTS approval_policy_conditions (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES approval_policies(id) ON DELETE CASCADE,
  -- Field path to match against (from payload or request context)
  -- e.g. "amount", "currency", "actor_type", "actor_id", "txn_type",
  --      "risk_score", "channel", "country", "kyc_tier", "payload.merchant_id"
  field TEXT NOT NULL,
  -- Comparison operator
  operator TEXT NOT NULL CHECK(operator IN ('eq','neq','gt','gte','lt','lte','in','not_in','contains','regex','between','exists')),
  -- Value(s) to compare against — stored as JSON
  -- For 'in'/'not_in': ["VAL1","VAL2"]
  -- For 'between': [min, max]
  -- For 'eq'/'gt'/etc.: "value" or 123
  value_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_policy_conditions_policy ON approval_policy_conditions(policy_id);

-- Policy stages: sequential approval tiers
-- stage_no = 1 is first tier, 2 is second, etc.
CREATE TABLE IF NOT EXISTS approval_policy_stages (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES approval_policies(id) ON DELETE CASCADE,
  stage_no INTEGER NOT NULL,
  -- Minimum approvals required at this stage to advance
  min_approvals INTEGER NOT NULL DEFAULT 1,
  -- Who can approve at this stage (JSON arrays)
  roles_json TEXT,          -- ["FINANCE","SUPER_ADMIN"] or null = any role
  actor_ids_json TEXT,      -- ["actor-123","actor-456"] or null = any actor (with matching role)
  -- Exclusion rules
  exclude_maker INTEGER NOT NULL DEFAULT 1,  -- 1 = maker cannot approve (default maker≠checker)
  exclude_previous_approvers INTEGER NOT NULL DEFAULT 0,  -- 1 = can't approve if approved earlier stage
  -- SLA for this stage
  timeout_minutes INTEGER,
  -- Escalation target if stage times out
  escalation_roles_json TEXT,
  escalation_actor_ids_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_policy_stages_policy ON approval_policy_stages(policy_id, stage_no);

-- Policy bindings: scope a policy to specific actors, hierarchies, or business units
CREATE TABLE IF NOT EXISTS approval_policy_bindings (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES approval_policies(id) ON DELETE CASCADE,
  -- Binding type: who this policy applies to
  binding_type TEXT NOT NULL CHECK(binding_type IN ('actor','actor_type','role','hierarchy','business_unit','currency','all')),
  -- Binding value (JSON): the scope target
  -- actor: {"actor_id": "..."}, actor_type: {"actor_type": "MERCHANT"}
  -- role: {"role": "OPERATIONS"}, hierarchy: {"parent_id": "...", "include_children": true}
  -- business_unit: {"unit_id": "..."}, currency: {"currency": "BBD"}
  -- all: {} (universal)
  binding_value_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_policy_bindings_policy ON approval_policy_bindings(policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_bindings_type ON approval_policy_bindings(binding_type);

-- ═══════════════════════════════════════════════════════════════════════════
-- Workflow instances: tracks per-request stage progression
-- ═══════════════════════════════════════════════════════════════════════════

-- Extend approval_requests with policy + workflow tracking columns
ALTER TABLE approval_requests ADD COLUMN policy_id TEXT REFERENCES approval_policies(id);
ALTER TABLE approval_requests ADD COLUMN current_stage INTEGER DEFAULT 1;
ALTER TABLE approval_requests ADD COLUMN total_stages INTEGER DEFAULT 1;
ALTER TABLE approval_requests ADD COLUMN workflow_state TEXT DEFAULT 'STAGE_PENDING'
  CHECK(workflow_state IN ('STAGE_PENDING','STAGE_COMPLETE','ALL_STAGES_COMPLETE','ESCALATED','EXPIRED'));

-- Stage-level decisions: individual approver decisions per stage
CREATE TABLE IF NOT EXISTS approval_stage_decisions (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  policy_id TEXT NOT NULL REFERENCES approval_policies(id),
  stage_no INTEGER NOT NULL,
  -- Decision
  decision TEXT NOT NULL CHECK(decision IN ('APPROVE','REJECT')),
  decider_id TEXT NOT NULL REFERENCES actors(id),
  decider_role TEXT,
  reason TEXT,
  -- Timing
  decided_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_stage_decisions_request ON approval_stage_decisions(request_id, stage_no);
CREATE INDEX IF NOT EXISTS idx_stage_decisions_decider ON approval_stage_decisions(decider_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Delegations: temporary checker delegation (OOO / vacation coverage)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS approval_delegations (
  id TEXT PRIMARY KEY,
  -- Who is delegating
  delegator_id TEXT NOT NULL REFERENCES actors(id),
  -- Who receives the delegation
  delegate_id TEXT NOT NULL REFERENCES actors(id),
  -- Scope: which approval types (NULL = all)
  approval_type TEXT,
  -- Validity window
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL,
  reason TEXT,
  state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(state IN ('ACTIVE','REVOKED','EXPIRED')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at TEXT,
  revoked_by TEXT REFERENCES actors(id)
);

CREATE INDEX IF NOT EXISTS idx_delegations_delegate ON approval_delegations(delegate_id, state);
CREATE INDEX IF NOT EXISTS idx_delegations_delegator ON approval_delegations(delegator_id, state);
CREATE INDEX IF NOT EXISTS idx_delegations_validity ON approval_delegations(valid_from, valid_to);

-- ═══════════════════════════════════════════════════════════════════════════
-- Policy decision log: audit trail of why a policy was matched/not matched
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS approval_policy_decisions (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES approval_requests(id),
  -- All policies evaluated (JSON array of { policy_id, matched, reasons })
  evaluation_json TEXT NOT NULL,
  -- The winning policy (if any)
  matched_policy_id TEXT REFERENCES approval_policies(id),
  -- Total stages required
  total_stages INTEGER NOT NULL DEFAULT 1,
  -- Metadata
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_policy_decisions_request ON approval_policy_decisions(request_id);
