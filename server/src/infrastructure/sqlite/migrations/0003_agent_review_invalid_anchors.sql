-- Payload comments dropped at ingest because they did not anchor to the diff.
ALTER TABLE agent_review ADD COLUMN invalid_anchor_count INTEGER NOT NULL DEFAULT 0;
