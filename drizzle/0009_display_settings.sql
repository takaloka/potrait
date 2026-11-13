ALTER TABLE photobooth_settings ADD COLUMN replay_limit INTEGER NOT NULL DEFAULT 10;
ALTER TABLE photobooth_settings ADD COLUMN screen_rotation INTEGER NOT NULL DEFAULT 0;
