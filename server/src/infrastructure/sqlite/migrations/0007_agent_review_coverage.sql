-- Existing reviews did not report coverage; do not infer completeness from readiness.
ALTER TABLE agent_review ADD COLUMN coverage TEXT NOT NULL DEFAULT 'unknown'
  CHECK (coverage IN ('complete', 'incomplete', 'unknown'));
