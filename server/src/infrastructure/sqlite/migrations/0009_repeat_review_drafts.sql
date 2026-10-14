-- Preserve comments and submission links while replacing the draft's table-level uniqueness.
CREATE TEMP TABLE saved_draft_comments AS SELECT * FROM draft_comment;
CREATE TEMP TABLE saved_submission_drafts AS SELECT id, draft_id FROM submission WHERE draft_id IS NOT NULL;
UPDATE submission SET draft_id = NULL WHERE draft_id IS NOT NULL;

CREATE TABLE review_draft_new (
  id INTEGER PRIMARY KEY,
  pr_id INTEGER NOT NULL REFERENCES pull_request(id),
  head_sha TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','submitted')),
  created_at TEXT NOT NULL,
  submitted_at TEXT
);
INSERT INTO review_draft_new SELECT * FROM review_draft;
DROP TABLE review_draft;
ALTER TABLE review_draft_new RENAME TO review_draft;
CREATE UNIQUE INDEX review_draft_open_head ON review_draft(pr_id, head_sha) WHERE status = 'open';

INSERT INTO draft_comment SELECT * FROM saved_draft_comments;
UPDATE submission SET draft_id = (SELECT draft_id FROM saved_submission_drafts WHERE saved_submission_drafts.id = submission.id)
  WHERE id IN (SELECT id FROM saved_submission_drafts);
DROP TABLE saved_draft_comments;
DROP TABLE saved_submission_drafts;
