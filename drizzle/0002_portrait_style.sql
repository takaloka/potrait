ALTER TABLE photobooth_jobs ADD COLUMN portrait_style TEXT NOT NULL DEFAULT 'legacy'
  CHECK (portrait_style IN ('legacy', 'beskap', 'kebaya', 'jas'));
