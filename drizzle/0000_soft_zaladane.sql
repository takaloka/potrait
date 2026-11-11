CREATE TABLE `photobooth_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`mode` text NOT NULL,
	`is_sample` integer DEFAULT 0 NOT NULL,
	`original_key` text,
	`original_url` text NOT NULL,
	`result_url` text,
	`error` text,
	`created_at` integer NOT NULL,
	`queued_at` integer NOT NULL,
	`processing_at` integer,
	`ready_at` integer,
	`displayed_at` integer,
	`completed_at` integer,
	`provider_task_id` text,
	`provider_polling_url` text,
	`provider_poll_after` integer,
	`provider_lock` text,
	`provider_lock_until` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `photobooth_jobs_request_id_unique` ON `photobooth_jobs` (`request_id`);--> statement-breakpoint
CREATE INDEX `photobooth_jobs_queue` ON `photobooth_jobs` (`status`,`ready_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `photobooth_screen` (
	`id` integer PRIMARY KEY NOT NULL,
	`session_id` text,
	`current_job_id` text,
	`started_at` integer,
	`ends_at` integer,
	`last_seen_at` integer,
	`pause_remaining_ms` integer
);
--> statement-breakpoint
CREATE TABLE `photobooth_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`event_name` text DEFAULT 'Wajah-Wajah Kreatif Bojonegoro' NOT NULL,
	`theme` text DEFAULT 'Loka Studio' NOT NULL,
	`accepting` integer DEFAULT 1 NOT NULL,
	`paused` integer DEFAULT 0 NOT NULL,
	`duration_seconds` integer DEFAULT 12 NOT NULL
);
