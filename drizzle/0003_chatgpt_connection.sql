CREATE TABLE chatgpt_connection (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  host_id TEXT NOT NULL,
  selected INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  session_json TEXT,
  pending_json TEXT,
  refresh_until INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE photobooth_jobs ADD COLUMN ai_provider TEXT NOT NULL DEFAULT 'bfl'
  CHECK (ai_provider IN ('bfl', 'chatgpt'));
