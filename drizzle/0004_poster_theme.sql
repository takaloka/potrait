ALTER TABLE photobooth_jobs ADD COLUMN poster_theme TEXT NOT NULL DEFAULT 'nusantara' CHECK (poster_theme IN ('nusantara', 'kolase'));
