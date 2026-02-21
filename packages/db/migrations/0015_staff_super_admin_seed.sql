-- Migration 0015: seed super-admin actor safely (no actors-table rebuild).
--
-- NOTE:
-- - Rebuilding `actors` in D1 can fail due to FK dependencies from many tables.
-- - Fresh installs already allow SUPER_ADMIN via 0001.
-- - Existing DBs that still have legacy CHECK constraints will ignore the
--   SUPER_ADMIN insert and fall back to ADMIN below.

-- Try preferred role first (works where SUPER_ADMIN is allowed)
INSERT OR IGNORE INTO actors (
  id, type, state, name, staff_code, staff_role, kyc_state, created_at, updated_at,
  first_name, last_name, display_name
) VALUES (
  'staff_super_admin_seed',
  'STAFF',
  'ACTIVE',
  'CariCash Super Admin',
  'SUPERADMIN001',
  'SUPER_ADMIN',
  'APPROVED',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'Super',
  'Admin',
  'Super Admin'
);

-- Legacy fallback (if SUPER_ADMIN is blocked by old CHECK)
INSERT OR IGNORE INTO actors (
  id, type, state, name, staff_code, staff_role, kyc_state, created_at, updated_at,
  first_name, last_name, display_name
) VALUES (
  'staff_super_admin_seed',
  'STAFF',
  'ACTIVE',
  'CariCash Super Admin',
  'SUPERADMIN001',
  'ADMIN',
  'APPROVED',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'Super',
  'Admin',
  'Super Admin'
);
