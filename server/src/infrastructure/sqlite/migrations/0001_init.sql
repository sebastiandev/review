CREATE TABLE repo (
  id INTEGER PRIMARY KEY, provider TEXT NOT NULL, owner TEXT NOT NULL, name TEXT NOT NULL,
  tracked INTEGER NOT NULL DEFAULT 1, auto_review INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT, sync_error TEXT, UNIQUE(provider, owner, name));
CREATE TABLE pull_request (
  id INTEGER PRIMARY KEY, repo_id INTEGER NOT NULL REFERENCES repo(id), number INTEGER NOT NULL,
  title TEXT NOT NULL, author TEXT NOT NULL, url TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
  head_ref TEXT NOT NULL, base_ref TEXT NOT NULL, head_sha TEXT NOT NULL, base_sha TEXT NOT NULL,
  is_draft INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('open','merged','closed')),
  additions INTEGER NOT NULL, deletions INTEGER NOT NULL, changed_files INTEGER NOT NULL,
  review_requested INTEGER NOT NULL DEFAULT 0, added_by_user INTEGER NOT NULL DEFAULT 0,
  review_on_open INTEGER NOT NULL DEFAULT 0, spec_ref TEXT,
  done_at TEXT, worktree_path TEXT,
  remote_created_at TEXT NOT NULL, remote_updated_at TEXT NOT NULL, synced_at TEXT NOT NULL,
  UNIQUE(repo_id, number));
CREATE INDEX pr_active ON pull_request(repo_id, done_at, state);
CREATE TABLE pr_diff (pr_id INTEGER NOT NULL REFERENCES pull_request(id), head_sha TEXT NOT NULL, base_sha TEXT NOT NULL,
  patch TEXT NOT NULL, files_json TEXT NOT NULL, anchors_json TEXT NOT NULL, fetched_at TEXT NOT NULL, PRIMARY KEY(pr_id, head_sha));
CREATE TABLE remote_comment (id INTEGER PRIMARY KEY, pr_id INTEGER NOT NULL REFERENCES pull_request(id), remote_id TEXT NOT NULL,
  author TEXT NOT NULL, path TEXT, line INTEGER, start_line INTEGER, side TEXT, body TEXT NOT NULL,
  in_reply_to TEXT, remote_created_at TEXT NOT NULL, fetched_at TEXT NOT NULL, UNIQUE(pr_id, remote_id));
CREATE TABLE review_draft (id INTEGER PRIMARY KEY, pr_id INTEGER NOT NULL REFERENCES pull_request(id), head_sha TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','submitted')), created_at TEXT NOT NULL, submitted_at TEXT, UNIQUE(pr_id, head_sha));
CREATE TABLE draft_comment (id INTEGER PRIMARY KEY, draft_id INTEGER NOT NULL REFERENCES review_draft(id) ON DELETE CASCADE,
  path TEXT NOT NULL, line INTEGER NOT NULL, start_line INTEGER, side TEXT NOT NULL CHECK(side IN ('LEFT','RIGHT')),
  body TEXT NOT NULL, agent_body TEXT, origin TEXT NOT NULL CHECK(origin IN ('agent','human')),
  selected INTEGER NOT NULL DEFAULT 1, anchor_valid INTEGER NOT NULL DEFAULT 1,
  in_reply_to TEXT, finding_id INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE submission (id INTEGER PRIMARY KEY, draft_id INTEGER NOT NULL REFERENCES review_draft(id), remote_review_id TEXT NOT NULL,
  verdict TEXT NOT NULL, body TEXT NOT NULL, agent_verdict TEXT, submitted_at TEXT NOT NULL, payload_json TEXT NOT NULL);
CREATE TABLE viewed_file (pr_id INTEGER NOT NULL REFERENCES pull_request(id), path TEXT NOT NULL, head_sha TEXT NOT NULL, PRIMARY KEY(pr_id, path));
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id = 1), json TEXT NOT NULL);
