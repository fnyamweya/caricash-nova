-- Migration 0013: Merchant hierarchy (closure table) & merchant-user auth hardening
--
-- 1. Removes duplicate profile fields from merchant_users (first_name, last_name,
--    email, display_name) since those live on the actors table already.
-- 2. Adds msisdn + name to merchant_users as the login identifier and display name.
-- 3. Creates a closure table for parent-child merchant (store/branch) relationships.
-- 4. Adds unique index on (actor_id, msisdn) so each phone number is unique per store.
-- ---------------------------------------------------------------------------

-- ── 1. Merchant store hierarchy (closure table) ─────────────────────────────
-- Every merchant actor gets a self-referencing row at depth 0.
-- When store B is made a child of store A we insert:
--   (ancestor=X, descendant=B, depth=depth_of_X_to_A + 1) for every ancestor X of A
--   plus (A, B, 1).
-- Queries: "all descendants of A" → WHERE ancestor_id = A AND depth > 0
--          "all ancestors of B" → WHERE descendant_id = B AND depth > 0

CREATE TABLE IF NOT EXISTS merchant_store_closure (
  ancestor_id   TEXT NOT NULL REFERENCES actors(id),
  descendant_id TEXT NOT NULL REFERENCES actors(id),
  depth         INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (ancestor_id, descendant_id)
);

CREATE INDEX IF NOT EXISTS idx_closure_ancestor   ON merchant_store_closure(ancestor_id);
CREATE INDEX IF NOT EXISTS idx_closure_descendant  ON merchant_store_closure(descendant_id);
CREATE INDEX IF NOT EXISTS idx_closure_depth       ON merchant_store_closure(depth);

-- ── 2. Add msisdn + name to merchant_users ──────────────────────────────────
ALTER TABLE merchant_users ADD COLUMN msisdn TEXT;
ALTER TABLE merchant_users ADD COLUMN name TEXT;

-- Back-fill name from existing display_name
UPDATE merchant_users SET name = display_name WHERE name IS NULL;

-- Back-fill msisdn from the parent actor's msisdn for store_owners
UPDATE merchant_users
SET msisdn = (SELECT a.msisdn FROM actors a WHERE a.id = merchant_users.actor_id)
WHERE msisdn IS NULL AND role = 'store_owner';

-- Unique: one phone number per store
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_users_actor_msisdn
  ON merchant_users(actor_id, msisdn) WHERE msisdn IS NOT NULL;

-- ── 3. Drop redundant profile columns from merchant_users ───────────────────
-- These duplicate data already present on the actors table.
DROP INDEX IF EXISTS idx_merchant_users_email;
DROP INDEX IF EXISTS idx_merchant_users_actor_email;
ALTER TABLE merchant_users DROP COLUMN first_name;
ALTER TABLE merchant_users DROP COLUMN last_name;
ALTER TABLE merchant_users DROP COLUMN email;
ALTER TABLE merchant_users DROP COLUMN display_name;

-- ── 4. Seed self-closure rows for every existing merchant ───────────────────
INSERT OR IGNORE INTO merchant_store_closure (ancestor_id, descendant_id, depth)
SELECT id, id, 0 FROM actors WHERE type = 'MERCHANT';

-- ── 5. Add parent_actor_id to actors for quick parent lookup ────────────────
ALTER TABLE actors ADD COLUMN parent_actor_id TEXT REFERENCES actors(id);
