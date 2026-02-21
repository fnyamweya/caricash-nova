-- Migration 0016: KYC requirements and linked KYC profiles

CREATE TABLE IF NOT EXISTS kyc_requirements (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('CUSTOMER','AGENT','MERCHANT','STAFF')),
  requirement_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_required INTEGER NOT NULL DEFAULT 1,
  config_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(actor_type, requirement_code)
);

CREATE TABLE IF NOT EXISTS kyc_profiles (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL UNIQUE REFERENCES actors(id),
  actor_type TEXT NOT NULL CHECK(actor_type IN ('CUSTOMER','AGENT','MERCHANT','STAFF')),
  status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK(status IN ('NOT_STARTED','PENDING','APPROVED','REJECTED')),
  verification_level TEXT,
  submitted_at TEXT,
  reviewed_at TEXT,
  reviewer_actor_id TEXT REFERENCES actors(id),
  documents_json TEXT DEFAULT '{}',
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_kyc_profiles_actor_type ON kyc_profiles(actor_type);
CREATE INDEX IF NOT EXISTS idx_kyc_profiles_status ON kyc_profiles(status);
CREATE INDEX IF NOT EXISTS idx_kyc_requirements_actor_type ON kyc_requirements(actor_type);

-- Customer requirements
INSERT OR IGNORE INTO kyc_requirements (id, actor_type, requirement_code, display_name, is_required, config_json)
VALUES
  ('kyc_req_customer_nid', 'CUSTOMER', 'NATIONAL_ID', 'National ID', 1, '{"min_docs":1}'),
  ('kyc_req_customer_selfie', 'CUSTOMER', 'SELFIE', 'Live Selfie', 1, '{"liveness":true}'),
  ('kyc_req_customer_poa', 'CUSTOMER', 'PROOF_OF_ADDRESS', 'Proof of Address', 0, '{"valid_days":90}');

-- Agent requirements
INSERT OR IGNORE INTO kyc_requirements (id, actor_type, requirement_code, display_name, is_required, config_json)
VALUES
  ('kyc_req_agent_nid', 'AGENT', 'NATIONAL_ID', 'National ID', 1, '{"min_docs":1}'),
  ('kyc_req_agent_business', 'AGENT', 'BUSINESS_LICENSE', 'Business License', 1, '{"must_be_active":true}'),
  ('kyc_req_agent_poa', 'AGENT', 'PROOF_OF_ADDRESS', 'Proof of Address', 1, '{"valid_days":90}');

-- Merchant requirements
INSERT OR IGNORE INTO kyc_requirements (id, actor_type, requirement_code, display_name, is_required, config_json)
VALUES
  ('kyc_req_merchant_reg', 'MERCHANT', 'BUSINESS_REGISTRATION', 'Business Registration', 1, '{"must_be_active":true}'),
  ('kyc_req_merchant_tax', 'MERCHANT', 'TAX_CERTIFICATE', 'Tax Certificate', 1, '{"must_be_valid":true}'),
  ('kyc_req_merchant_owner', 'MERCHANT', 'OWNER_ID', 'Owner Identification', 1, '{"min_docs":1}');

-- Staff baseline requirements
INSERT OR IGNORE INTO kyc_requirements (id, actor_type, requirement_code, display_name, is_required, config_json)
VALUES
  ('kyc_req_staff_id', 'STAFF', 'STAFF_ID', 'Staff Identification', 1, '{"issuer":"company"}');

-- Backfill profile rows for existing actors
INSERT OR IGNORE INTO kyc_profiles (id, actor_id, actor_type, status, created_at, updated_at)
SELECT 'kyc_' || id, id, type, kyc_state, created_at, updated_at
FROM actors;
