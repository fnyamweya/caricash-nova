-- ============================================================================
-- 0020: Drop profile columns from actors table
-- ============================================================================
-- Now that all reads source name/profile fields from the type-specific
-- profile tables (customer_profiles, merchant_profiles, agent_profiles,
-- staff_profiles), the duplicated columns on the actors table are
-- no longer needed.
--
-- Columns dropped:
--   first_name, middle_name, last_name, display_name, email
--
-- Columns KEPT on actors (core identity / lookup keys):
--   id, type, state, name, msisdn, agent_code, agent_type, store_code,
--   staff_code, staff_role, parent_actor_id, kyc_state, created_at, updated_at
-- ============================================================================

ALTER TABLE actors DROP COLUMN first_name;
ALTER TABLE actors DROP COLUMN middle_name;
ALTER TABLE actors DROP COLUMN last_name;
ALTER TABLE actors DROP COLUMN display_name;
ALTER TABLE actors DROP COLUMN email;
