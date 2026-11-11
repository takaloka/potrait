ALTER TABLE photobooth_jobs RENAME COLUMN portrait_style TO portrait_style_previous;
ALTER TABLE photobooth_jobs ADD COLUMN portrait_style TEXT NOT NULL DEFAULT 'legacy'
  CHECK (portrait_style IN ('legacy', 'beskap', 'kebaya', 'jas', 'batik', 'kebaya-kasual', 'retro-festival'));
UPDATE photobooth_jobs SET portrait_style = portrait_style_previous;
ALTER TABLE photobooth_jobs DROP COLUMN portrait_style_previous;
