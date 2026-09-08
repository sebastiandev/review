-- Comments left on an earlier head keep the line they were on then (`line` is null once GitHub
-- can no longer place them on the current diff).
ALTER TABLE remote_comment ADD COLUMN original_line INTEGER;
ALTER TABLE remote_comment ADD COLUMN original_commit_sha TEXT;
