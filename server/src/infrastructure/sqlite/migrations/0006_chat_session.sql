-- Opencode sessions behind each chat thread, so a server restart reopens the same transcript.
-- scope_key: 'pr:<id>' or 'local:<target path>'; thread_id: 'dock' or 'line:<path>:<line>'.
CREATE TABLE chat_session (
  scope_key TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  anchor_json TEXT,
  PRIMARY KEY (scope_key, thread_id)
);
