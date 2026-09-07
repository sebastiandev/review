-- Phase 4: agent review runs. One row per run; findings the user keeps are copied into
-- draft_comment(origin='agent', agent_body, finding_id).
CREATE TABLE agent_review (
  id INTEGER PRIMARY KEY,
  pr_id INTEGER NOT NULL REFERENCES pull_request(id),
  head_sha TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'ready', 'failed')),
  agent TEXT NOT NULL,
  model TEXT,
  variant TEXT,
  session_id TEXT,
  verdict TEXT CHECK(verdict IN ('COMMENT', 'APPROVE', 'REQUEST_CHANGES')),
  summary TEXT,
  error TEXT,
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX agent_review_pr ON agent_review(pr_id, head_sha);
CREATE TABLE agent_finding (
  id INTEGER PRIMARY KEY,
  agent_review_id INTEGER NOT NULL REFERENCES agent_review(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  line INTEGER NOT NULL,
  start_line INTEGER,
  side TEXT NOT NULL CHECK(side IN ('LEFT', 'RIGHT')),
  severity TEXT NOT NULL,
  body TEXT NOT NULL
);
