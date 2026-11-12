ALTER TABLE photobooth_jobs RENAME COLUMN poster_theme TO poster_theme_previous;
ALTER TABLE photobooth_jobs ADD COLUMN poster_theme TEXT NOT NULL DEFAULT 'nusantara'
  CHECK (poster_theme IN ('nusantara', 'kolase', 'bojonegoro-doelo'));
UPDATE photobooth_jobs SET poster_theme = poster_theme_previous;
ALTER TABLE photobooth_jobs DROP COLUMN poster_theme_previous;
