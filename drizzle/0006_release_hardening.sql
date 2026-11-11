ALTER TABLE photobooth_jobs ADD COLUMN result_token TEXT;
ALTER TABLE photobooth_jobs ADD COLUMN expires_at INTEGER;
CREATE TABLE IF NOT EXISTS photobooth_admission (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS photobooth_budget (id INTEGER PRIMARY KEY CHECK(id=1), used INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO photobooth_budget(id,used) VALUES(1,0);
CREATE TABLE IF NOT EXISTS photobooth_cleanup (key TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS photobooth_jobs_expiry ON photobooth_jobs(expires_at);
