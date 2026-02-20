-- Agent hierarchy (effective-dated)
CREATE TABLE IF NOT EXISTS agent_parent (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES actors(id),
  parent_agent_id TEXT NOT NULL REFERENCES actors(id),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_parent_agent ON agent_parent(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_parent_parent ON agent_parent(parent_agent_id);

-- Agent closure table (for fast upline queries)
CREATE TABLE IF NOT EXISTS agent_closure (
  ancestor_id TEXT NOT NULL REFERENCES actors(id),
  descendant_id TEXT NOT NULL REFERENCES actors(id),
  depth INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ancestor_id, descendant_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_closure_descendant ON agent_closure(descendant_id);
