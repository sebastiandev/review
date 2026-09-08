-- Submissions can now come from GitHub (reviews the user left in the browser), so they carry
-- their own PR + head and the draft is optional. `source` tells the two apart.
CREATE TABLE submission_new (
  id INTEGER PRIMARY KEY,
  pr_id INTEGER NOT NULL REFERENCES pull_request(id),
  head_sha TEXT NOT NULL,
  draft_id INTEGER REFERENCES review_draft(id),
  remote_review_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('app', 'remote')) DEFAULT 'app',
  verdict TEXT NOT NULL,
  body TEXT NOT NULL,
  agent_verdict TEXT,
  submitted_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
INSERT INTO submission_new (id, pr_id, head_sha, draft_id, remote_review_id, source, verdict, body, agent_verdict, submitted_at, payload_json)
  SELECT s.id, d.pr_id, d.head_sha, s.draft_id, s.remote_review_id, 'app', s.verdict, s.body, s.agent_verdict, s.submitted_at, s.payload_json
  FROM submission s JOIN review_draft d ON d.id = s.draft_id;
DROP TABLE submission;
ALTER TABLE submission_new RENAME TO submission;
CREATE UNIQUE INDEX submission_remote ON submission(pr_id, remote_review_id);
CREATE INDEX submission_pr_head ON submission(pr_id, head_sha);
