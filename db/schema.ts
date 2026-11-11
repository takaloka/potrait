import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Server-only; never select these fields into a public/operator status response.
export const chatgptConnection = sqliteTable("chatgpt_connection", {
  id: integer("id").primaryKey(),
  hostId: text("host_id").notNull(),
  selected: integer("selected").notNull().default(0),
  revision: integer("revision").notNull().default(0),
  sessionJson: text("session_json"),
  pendingJson: text("pending_json"),
  refreshUntil: integer("refresh_until").notNull().default(0),
});

export const photoboothSettings = sqliteTable("photobooth_settings", {
  id: integer("id").primaryKey(),
  eventName: text("event_name").notNull().default("Wajah-Wajah Kreatif Bojonegoro"),
  theme: text("theme").notNull().default("Loka Studio"),
  accepting: integer("accepting").notNull().default(1),
  paused: integer("paused").notNull().default(0),
  durationSeconds: integer("duration_seconds").notNull().default(12),
});

export const photoboothJobs = sqliteTable("photobooth_jobs", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull(),
  fingerprint: text("fingerprint").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  mode: text("mode").notNull(),
  isSample: integer("is_sample").notNull().default(0),
  portraitStyle: text("portrait_style").notNull().default("legacy"),
  posterTheme: text("poster_theme").notNull().default("nusantara"),
  aiProvider: text("ai_provider").notNull().default("bfl"),
  resultToken: text("result_token"),
  expiresAt: integer("expires_at"),
  originalKey: text("original_key"),
  originalUrl: text("original_url").notNull(),
  resultUrl: text("result_url"),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
  queuedAt: integer("queued_at").notNull(),
  processingAt: integer("processing_at"),
  readyAt: integer("ready_at"),
  displayedAt: integer("displayed_at"),
  completedAt: integer("completed_at"),
  providerTaskId: text("provider_task_id"),
  providerPollingUrl: text("provider_polling_url"),
  providerPollAfter: integer("provider_poll_after"),
  providerLock: text("provider_lock"),
  providerLockUntil: integer("provider_lock_until"),
}, (table) => [
  uniqueIndex("photobooth_jobs_request_id_unique").on(table.requestId),
  index("photobooth_jobs_queue").on(table.status, table.readyAt, table.createdAt),
]);

export const photoboothScreen = sqliteTable("photobooth_screen", {
  id: integer("id").primaryKey(),
  sessionId: text("session_id"),
  currentJobId: text("current_job_id"),
  startedAt: integer("started_at"),
  endsAt: integer("ends_at"),
  lastSeenAt: integer("last_seen_at"),
  pauseRemainingMs: integer("pause_remaining_ms"),
});
