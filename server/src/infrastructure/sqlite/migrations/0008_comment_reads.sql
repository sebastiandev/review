ALTER TABLE remote_comment ADD COLUMN kind TEXT;
CREATE TABLE comment_read (
  pr_id INTEGER NOT NULL REFERENCES pull_request(id) ON DELETE CASCADE,
  remote_id TEXT NOT NULL,
  viewer TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (pr_id, remote_id, viewer)
);
