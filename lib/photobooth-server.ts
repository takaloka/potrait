import { env } from "cloudflare:workers";
import { AiProviderError, getAiConfig, pollAiPortrait, submitAiPortrait, portraitPrompt, type AiEnvironment } from "./ai-provider";
import { ChatgptConnection, ChatgptError, type CodexBackendEnvironment } from "./chatgpt-connection";
import type { Job, JobResponse, JobStatus, ScreenAction, ScreenState, Settings, StateResponse } from "./photobooth-types";

// Participant detail uses capabilities; originals and display mutations require
// operator sessions. Public result images are intentionally used by the display.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SCREEN_LEASE_MS = 15000;
const DEMO_QUEUE_MS = 1500;
const DEMO_PROCESS_MS = 4000;
const SAMPLE_VERSION = "prepared-fictional-sample:persibo-v2";
const SAMPLE_RESULT_URL = "/samples/persibo-player-v2.png";
const SLIDE_DURATION_SQL = "COALESCE(NULLIF((SELECT duration_seconds FROM photobooth_settings WHERE id = 1), 0), 10)";
// Unseen photos always get a turn. Count the current portrait in the replay
// window, and use creation time so repeated displays never refresh membership.
const NEXT_SLIDE_SQL = "SELECT id FROM photobooth_jobs WHERE (status = 'ready' OR (status = 'done' AND id IN (SELECT id FROM photobooth_jobs WHERE status IN ('ready', 'done', 'displaying') AND result_url IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT (SELECT replay_limit FROM photobooth_settings WHERE id = 1)))) AND result_url IS NOT NULL AND id != COALESCE((SELECT current_job_id FROM photobooth_screen WHERE id = 1), '') ORDER BY CASE WHEN status = 'ready' THEN 0 ELSE 1 END, CASE WHEN status = 'ready' THEN COALESCE(ready_at, created_at) ELSE COALESCE(completed_at, displayed_at, created_at) END, id LIMIT 1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Environment extends AiEnvironment, CodexBackendEnvironment { DB?: D1Database; BUCKET?: R2Bucket; IMAGE_NORMALIZER?: Fetcher; EVENT_JOB_LIMIT?: string; MAX_QUEUED_JOBS?: string; UPLOADS_PER_HOUR?: string; RETENTION_DAYS?: string; ALLOW_DEMO_SAMPLES?: string }
interface JobRow {
  id: string; request_id: string; fingerprint: string; name: string; status: JobStatus; mode: "demo" | "live"; result_token: string | null; expires_at: number | null;
  is_sample: number; portrait_style: Job["portraitStyle"]; poster_theme: Job["posterTheme"]; ai_provider: "bfl" | "chatgpt"; original_key: string | null; original_url: string; result_url: string | null; error: string | null;
  created_at: number; queued_at: number; processing_at: number | null; ready_at: number | null;
  displayed_at: number | null; completed_at: number | null; provider_task_id: string | null;
  provider_polling_url: string | null; provider_poll_after: number | null; provider_lock: string | null; provider_lock_until: number | null;
}
interface SettingsRow { id: number; event_name: string; theme: string; accepting: number; paused: number; duration_seconds: number; theme_policy: string; replay_limit: number; screen_rotation: Settings["screenRotation"] }
interface ScreenRow { id: number; session_id: string | null; current_job_id: string | null; started_at: number | null; ends_at: number | null; last_seen_at: number | null; pause_remaining_ms: number | null }

export class ApiFailure extends Error {
  constructor(message: string, public status = 400, public code = "INVALID_REQUEST") { super(message); this.name = "ApiFailure"; }
}

function environment(): Environment { return env as unknown as Environment; }
export function chatgptConnection() { return new ChatgptConnection(database(), environment()); }
async function activeAiConfig() {
  const config = getAiConfig(environment());
  const chatgpt = await chatgptConnection().status();
  return chatgpt.selected
    ? { ...config, mode: "live" as const, configured: chatgpt.connected && (chatgpt.method === "codex" || chatgpt.sharing) && !!chatgpt.model && !chatgpt.imageUnsupported, provider: "chatgpt" as const }
    : { ...config, provider: "bfl" as const };
}
function database(): D1Database {
  const db = environment().DB;
  if (!db) throw new ApiFailure("Penyimpanan acara belum tersedia. Hubungi operator.", 503, "STORAGE_NOT_READY");
  return db;
}
function bucket(): R2Bucket {
  const storage = environment().BUCKET;
  if (!storage) throw new ApiFailure("Penyimpanan foto belum tersedia. Hubungi operator.", 503, "STORAGE_NOT_READY");
  return storage;
}
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new ApiFailure("Permintaan berasal dari halaman yang berbeda.", 403, "ORIGIN_MISMATCH");
}
export function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
export function apiError(error: unknown): Response {
  if (error instanceof ChatgptError) return jsonResponse({ error: error.message, code: "CHATGPT_UNAVAILABLE" }, 503);
  if (error instanceof ApiFailure) return jsonResponse({ error: error.message, code: error.code }, error.status);
  // Never leak SQL, storage paths, provider URLs, or credentials to visitors.
  console.error("photobooth request failed", error instanceof Error ? error.name : "UnknownError");
  return jsonResponse({ error: "Proses belum selesai. Muat ulang halaman atau hubungi operator.", code: "INTERNAL_ERROR" }, 500);
}
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length") ?? 0) > 4096) throw new ApiFailure("Permintaan terlalu besar.", 413);
  const raw = await request.text();
  if (raw.length > 4096) throw new ApiFailure("Permintaan terlalu besar.", 413);
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new ApiFailure("Format permintaan belum sesuai."); }
}
function validId(id: unknown, label = "Nomor peserta"): asserts id is string {
  if (typeof id !== "string" || !UUID.test(id)) throw new ApiFailure(`${label} tidak valid.`);
}
function publicJob(row: JobRow): Job {
  return {
    id: row.id, name: row.name, status: row.status, mode: row.mode, isSample: row.is_sample === 1, portraitStyle: row.portrait_style, posterTheme: row.poster_theme ?? "nusantara",
    originalUrl: "", resultUrl: row.result_url, error: row.error, createdAt: row.created_at,
    readyAt: row.ready_at, displayedAt: row.displayed_at, completedAt: row.completed_at,
  };
}
function publicSettings(row: SettingsRow): Settings {
  return { eventName: row.event_name, theme: row.theme, accepting: row.accepting === 1, paused: row.paused === 1, durationSeconds: row.duration_seconds || 10, replayLimit: row.replay_limit, screenRotation: row.screen_rotation, themePolicy: JSON.parse(row.theme_policy) };
}
function publicScreen(row: ScreenRow, now: number): ScreenState {
  return { connected: !!row.session_id && row.last_seen_at !== null && now - row.last_seen_at < SCREEN_LEASE_MS,
    sessionId: row.session_id, currentJobId: row.current_job_id, startedAt: row.started_at, endsAt: row.ends_at, lastSeenAt: row.last_seen_at };
}
async function initialize(db: D1Database): Promise<void> {
  await db.batch([
    // Explicit application defaults apply only to a missing event row. Existing
    // hosted settings are never reset by a request or by this release.
    db.prepare("INSERT OR IGNORE INTO photobooth_settings (id, event_name, theme, duration_seconds) VALUES (1, ?, ?, ?)")
      .bind("Pemain Inti Persibo Bojonegoro Masa Depan", "Persibo Masa Depan", 10),
    db.prepare("INSERT OR IGNORE INTO photobooth_screen (id) VALUES (1)"),
  ]);
}
async function readSettings(db: D1Database): Promise<SettingsRow> {
  const row = await db.prepare("SELECT * FROM photobooth_settings WHERE id = 1").first<SettingsRow>();
  if (!row) throw new ApiFailure("Pengaturan acara belum tersedia.", 503);
  return row;
}
async function readScreen(db: D1Database): Promise<ScreenRow> {
  const row = await db.prepare("SELECT * FROM photobooth_screen WHERE id = 1").first<ScreenRow>();
  if (!row) throw new ApiFailure("Pengaturan layar belum tersedia.", 503);
  return row;
}
async function findJob(db: D1Database, id: string): Promise<JobRow> {
  validId(id);
  const row = await db.prepare("SELECT * FROM photobooth_jobs WHERE id = ?").bind(id).first<JobRow>();
  if (!row) throw new ApiFailure("Nomor peserta tidak ditemukan.", 404, "JOB_NOT_FOUND");
  return row;
}

export async function deleteJob(id: string): Promise<{ deleted: true; mediaDeleted: boolean }> {
  validId(id);
  const db = database();
  const existing = await findJob(db, id);
  const keys = new Set<string>();
  if (existing.original_key) keys.add(existing.original_key);
  const resultKey = existing.result_url?.match(/^\/api\/media\/([0-9a-f-]{36}-(?:original|result)\.(?:jpg|png|webp))$/i)?.[1];
  if (resultKey) keys.add(resultKey);
  // Record cleanup before deleting the row, in the same transaction. R2 failures
  // remain retryable by scheduled processing, rather than losing the object keys.
  const allowed = "EXISTS (SELECT 1 FROM photobooth_jobs WHERE id = ? AND status != 'displaying' AND NOT EXISTS (SELECT 1 FROM photobooth_screen WHERE current_job_id = ?))";
  const changes = await db.batch([
    ...[...keys].map(key => db.prepare(`INSERT OR IGNORE INTO photobooth_cleanup(key,created_at) SELECT ?,? WHERE ${allowed}`).bind(key,Date.now(),id,id)),
    db.prepare("DELETE FROM photobooth_jobs WHERE id = ? AND status != 'displaying' AND NOT EXISTS (SELECT 1 FROM photobooth_screen WHERE current_job_id = ?)").bind(id,id),
  ]);
  const deleted = changes.at(-1)?.meta.changes;
  if (!deleted) {
    await findJob(db, id);
    throw new ApiFailure("Lewati tayangan peserta ini sebelum menghapusnya.", 409, "JOB_DISPLAYING");
  }
  const cleanup = await Promise.allSettled([...keys].map(async key => { await bucket().delete(key); await db.prepare("DELETE FROM photobooth_cleanup WHERE key = ?").bind(key).run(); }));
  return { deleted: true, mediaDeleted: cleanup.every(result => result.status === "fulfilled") };
}

/** D1 batch is atomic: an expired screen cannot retain a lost participant. */
async function recoverExpiredScreen(db: D1Database, now: number): Promise<void> {
  const cutoff = now - SCREEN_LEASE_MS;
  await db.batch([
    db.prepare("UPDATE photobooth_jobs SET status = 'ready', displayed_at = NULL WHERE status = 'displaying' AND id = (SELECT current_job_id FROM photobooth_screen WHERE id = 1 AND last_seen_at < ?)").bind(cutoff),
    db.prepare("UPDATE photobooth_screen SET session_id = NULL, current_job_id = NULL, started_at = NULL, ends_at = NULL, last_seen_at = NULL, pause_remaining_ms = NULL WHERE id = 1 AND last_seen_at < ?").bind(cutoff),
  ]);
}

async function advanceDemo(db: D1Database, now: number): Promise<void> {
  await db.prepare("UPDATE photobooth_jobs SET status = 'processing', processing_at = queued_at + ? WHERE mode = 'demo' AND status = 'queued' AND queued_at <= ?").bind(DEMO_QUEUE_MS, now - DEMO_QUEUE_MS).run();
  const copies = (await db.prepare("SELECT * FROM photobooth_jobs WHERE mode='demo' AND is_sample=0 AND ((status='processing' AND processing_at <= ? AND result_url IS NULL) OR result_url=original_url) LIMIT 25").bind(now-DEMO_PROCESS_MS).all<JobRow>()).results;
  for (const row of copies) {
    if (!row.original_key) continue;
    const original = await bucket().get(row.original_key);
    if (!original) continue;
    const extension = row.original_key.split(".").at(-1)!;
    const key = `${row.id}-result.${extension}`;
    await bucket().put(key, await original.arrayBuffer(), {httpMetadata:{contentType:original.httpMetadata?.contentType ?? "image/jpeg"}});
    const saved=await db.prepare("UPDATE photobooth_jobs SET result_url=? WHERE id=? AND (result_url IS NULL OR result_url=original_url)").bind(`/api/media/${key}`,row.id).run();
    if(!saved.meta.changes && !(await db.prepare("SELECT id FROM photobooth_jobs WHERE result_url=?").bind(`/api/media/${key}`).first()))await discardMedia(db,key);
  }
  await db.batch([
    // Sample selection is part of the submission fingerprint, so old jobs retain
    // their original visual across upgrades, retries, and repeated displays.
    db.prepare("UPDATE photobooth_jobs SET status = 'ready', ready_at = processing_at + ?, result_url = COALESCE(result_url, CASE WHEN is_sample = 1 THEN CASE WHEN fingerprint LIKE ? THEN ? ELSE '/samples/after.jpg' END END), error = NULL WHERE mode = 'demo' AND status = 'processing' AND processing_at <= ? AND (is_sample=1 OR (result_url IS NOT NULL AND result_url!=original_url))")
      .bind(DEMO_PROCESS_MS, `%|${SAMPLE_VERSION}`, SAMPLE_RESULT_URL, now - DEMO_PROCESS_MS),
  ]);
}

async function advanceLive(db: D1Database, now: number): Promise<void> {
  const config = getAiConfig(environment());
  const chatgpt = await chatgptConnection().status();
  if (config.mode !== "live" && !chatgpt.selected) return;
  // Called by scheduled/local worker ticks; status reads never invoke providers.
  const rows = (await db.prepare("SELECT * FROM photobooth_jobs WHERE mode = 'live' AND status IN ('queued', 'processing') AND (provider_poll_after IS NULL OR provider_poll_after <= ?) ORDER BY CASE WHEN status = 'processing' THEN 0 ELSE 1 END, queued_at, id LIMIT 2").bind(now).all<JobRow>()).results;
  for (const row of rows) {
    if (row.ai_provider === "chatgpt" ? !(chatgpt.connected && (chatgpt.method === "codex" || chatgpt.sharing) && chatgpt.model && !chatgpt.imageUnsupported) : !config.configured) {
      await db.prepare("UPDATE photobooth_jobs SET status = 'failed', error = ? WHERE id = ? AND status IN ('queued', 'processing')").bind("AI belum terhubung. Hubungi operator untuk mengaktifkan akses API.", row.id).run();
      continue;
    }
    if (row.status === "queued") {
      const token = crypto.randomUUID();
      const acquired = await db.prepare("UPDATE photobooth_jobs SET status = 'processing', processing_at = ?, provider_lock = ?, provider_lock_until = ? WHERE id = ? AND status = 'queued' AND (SELECT COUNT(*) FROM photobooth_jobs WHERE mode = 'live' AND status = 'processing') < 2").bind(now, token, now + (row.ai_provider === "chatgpt" ? 240000 : 90000), row.id).run();
      if (!acquired.meta.changes) continue;
      try {
        if (!row.original_key) throw new AiProviderError("Foto sumber belum tersedia. Kirim foto ulang.");
        const object = await bucket().get(row.original_key);
        if (!object) throw new AiProviderError("Foto sumber tidak ditemukan. Kirim foto ulang.");
        const photo = new Uint8Array(await object.arrayBuffer());
        if (row.ai_provider === "chatgpt") {
          const bytes = await chatgptConnection().edit(photo, sniffImage(photo)?.mime ?? "image/jpeg", portraitPrompt(row.portrait_style, row.poster_theme));
          const type = sniffImage(bytes);
          if (!type) throw new AiProviderError("Gambar hasil ChatGPT tidak terbaca.");
          const key = `${crypto.randomUUID()}-result.${type.extension}`;
          await bucket().put(key, bytes, { httpMetadata: { contentType: type.mime } });
          const saved = await db.prepare("UPDATE photobooth_jobs SET status = 'ready', result_url = ?, ready_at = ?, error = NULL, provider_lock = NULL, provider_lock_until = NULL WHERE id = ? AND status = 'processing' AND provider_lock = ?").bind(`/api/media/${key}`, Date.now(), row.id, token).run();
          if (!saved.meta.changes) await discardMedia(db,key);
          continue;
        }
        const result = await submitAiPortrait(config, photo, row.portrait_style, row.poster_theme);
        await db.prepare("UPDATE photobooth_jobs SET provider_task_id = ?, provider_polling_url = ?, provider_poll_after = ?, provider_lock = NULL, provider_lock_until = NULL WHERE id = ? AND status = 'processing' AND provider_lock = ?").bind(result.id, result.pollingUrl, Date.now() + 1500, row.id, token).run();
      } catch (error) {
        if (error instanceof ChatgptError && error.transient) {
          await db.prepare("UPDATE photobooth_jobs SET status = 'queued', processing_at = NULL, provider_poll_after = ?, provider_lock = NULL, provider_lock_until = NULL WHERE id = ? AND status = 'processing' AND provider_lock = ?").bind(Date.now()+5000,row.id,token).run();
          continue;
        }
        console.error(JSON.stringify({ event: "portrait_failed", jobId: row.id, provider: row.ai_provider, error: error instanceof Error ? error.name : "UnknownError" }));
        await db.prepare("UPDATE photobooth_jobs SET status = 'failed', error = ?, provider_lock = NULL, provider_lock_until = NULL WHERE id = ? AND status = 'processing' AND provider_lock = ?").bind(error instanceof AiProviderError || error instanceof ChatgptError ? error.message : "Foto belum berhasil dikirim ke layanan AI. Hubungi operator.", row.id, token).run();
      }
      continue;
    }
    if (!row.provider_polling_url) {
      if (row.provider_lock_until && row.provider_lock_until < now) {
        await db.prepare("UPDATE photobooth_jobs SET status = 'failed', error = ?, provider_lock = NULL, provider_lock_until = NULL WHERE id = ? AND status = 'processing' AND provider_polling_url IS NULL AND provider_lock_until < ?").bind("Status permintaan AI belum terkonfirmasi. Operator perlu memeriksa layanan sebelum mencoba ulang.", row.id, now).run();
      }
      continue;
    }
    if ((row.provider_poll_after ?? 0) > now || (row.provider_lock_until ?? 0) > now) continue;
    if (now - (row.processing_at ?? now) > 10 * 60 * 1000) {
      await db.prepare("UPDATE photobooth_jobs SET status = 'failed', error = ? WHERE id = ? AND status = 'processing'").bind("Waktu tunggu AI terlalu lama. Hubungi operator sebelum mencoba ulang.", row.id).run();
      continue;
    }
    const token = crypto.randomUUID();
    const acquired = await db.prepare("UPDATE photobooth_jobs SET provider_lock = ?, provider_lock_until = ? WHERE id = ? AND status = 'processing' AND (provider_lock_until IS NULL OR provider_lock_until < ?) AND (provider_poll_after IS NULL OR provider_poll_after <= ?)").bind(token, now + 60000, row.id, now, now).run();
    if (!acquired.meta.changes) continue;
    try {
      const result = await pollAiPortrait(row.provider_polling_url);
      if (result.status === "pending") {
        await db.prepare("UPDATE photobooth_jobs SET provider_poll_after = ?, provider_lock = NULL, provider_lock_until = NULL WHERE id = ? AND provider_lock = ?").bind(Date.now() + 2000, row.id, token).run();
      } else {
        const type = sniffImage(result.bytes);
        if (!type) throw new AiProviderError("Berkas hasil AI tidak dapat dibaca sebagai gambar.");
        // Immutable output key: a late response from an older attempt must never
        // overwrite the bytes referenced by a newer successful result.
        const key = `${crypto.randomUUID()}-result.${type.extension}`;
        await bucket().put(key, result.bytes, { httpMetadata: { contentType: type.mime } });
        const saved = await db.prepare("UPDATE photobooth_jobs SET status = 'ready', result_url = ?, ready_at = ?, error = NULL, provider_lock = NULL, provider_lock_until = NULL WHERE id = ? AND status = 'processing' AND provider_lock = ?").bind(`/api/media/${key}`, Date.now(), row.id, token).run();
        if (!saved.meta.changes) await discardMedia(db,key);
      }
    } catch (error) {
      if (error instanceof AiProviderError && error.transient) {
        await db.prepare("UPDATE photobooth_jobs SET provider_poll_after = ?, provider_lock = NULL, provider_lock_until = NULL WHERE id = ? AND provider_lock = ?").bind(Date.now() + 5000, row.id, token).run();
      } else {
        await db.prepare("UPDATE photobooth_jobs SET status = 'failed', error = ?, provider_lock = NULL, provider_lock_until = NULL WHERE id = ? AND status = 'processing' AND provider_lock = ?").bind(error instanceof AiProviderError ? error.message : "Hasil AI belum dapat disimpan. Hubungi operator.", row.id, token).run();
      }
    }
  }
}

async function prepareState(db: D1Database): Promise<void> {
  await initialize(db);
  const now = Date.now();
  await recoverExpiredScreen(db, now);
  await advanceDemo(db, now);
}

/** Scheduled processing is independent of participant/operator request lifetime. */
export async function processJobs(): Promise<void> {
  const db = database();
  await prepareState(db);
  const expired = (await db.prepare("SELECT id FROM photobooth_jobs WHERE expires_at IS NOT NULL AND expires_at <= ? LIMIT 25").bind(Date.now()).all<{id:string}>()).results;
  for (const {id} of expired) { await actOnJob(id,"skip"); await deleteJob(id); }
  const cleanup = (await db.prepare("SELECT key FROM photobooth_cleanup LIMIT 25").all<{key:string}>()).results;
  for (const {key} of cleanup) { try { await bucket().delete(key); await db.prepare("DELETE FROM photobooth_cleanup WHERE key=?").bind(key).run(); } catch { console.error(JSON.stringify({event:"media_cleanup_pending"})); } }
  await db.prepare("DELETE FROM photobooth_admission WHERE expires_at < ?").bind(Date.now()).run();
  await advanceLive(db, Date.now());
}

export async function authorizeJob(request: Request, id: string): Promise<void> {
  const row = await findJob(database(),id);
  if (row.expires_at && row.expires_at <= Date.now()) throw new ApiFailure("Tautan foto sudah kedaluwarsa.",404);
  const token = request.headers.get("x-photo-token") ?? "";
  if (!row.result_token || !/^[a-f0-9]{64}$/.test(token)) throw new ApiFailure("Buka tautan hasil lengkap dari perangkat pengirim atau hubungi operator.",401,"PHOTO_ACCESS_REQUIRED");
  let diff=0; for(let i=0;i<64;i++) diff |= token.charCodeAt(i)^row.result_token.charCodeAt(i);
  if(diff) throw new ApiFailure("Tautan hasil tidak valid.",403,"PHOTO_ACCESS_REQUIRED");
}

export async function participantToken(id: string): Promise<string> {
  const row=await findJob(database(),id);
  if(row.expires_at && row.expires_at<=Date.now())throw new ApiFailure("Foto sudah kedaluwarsa.",404);
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,"0")).join("");
  await database().prepare("UPDATE photobooth_jobs SET result_token=? WHERE id=? AND result_token IS NULL").bind(token,id).run();
  return (await findJob(database(),id)).result_token!;
}

export async function getEventConfig() {
  const db = database();
  await initialize(db);
  const config = await activeAiConfig();
  return { settings: publicSettings(await readSettings(db)), mode: config.mode, aiConfigured: config.configured };
}

type QueueCounts = {ready:number;processing:number};
export async function getState(advance = true, presentationOnly = false): Promise<StateResponse & {queueCounts?:QueueCounts}> {
  const db = database();
  if (advance) await prepareState(db); else await initialize(db);
  const [settings, screen, jobs, next] = await Promise.all([
    readSettings(db), readScreen(db), db.prepare(presentationOnly
      ? `SELECT * FROM photobooth_jobs WHERE id IN (SELECT current_job_id FROM photobooth_screen WHERE id=1) OR id = (${NEXT_SLIDE_SQL}) OR id = (SELECT id FROM photobooth_jobs WHERE status='done' AND displayed_at IS NOT NULL AND result_url IS NOT NULL ORDER BY displayed_at DESC LIMIT 1)`
      : "SELECT * FROM photobooth_jobs ORDER BY created_at DESC, id").all<JobRow>(),
    db.prepare(NEXT_SLIDE_SQL).first<{ id: string }>(),
  ]);
  const config = await activeAiConfig();
  const serverNow = Date.now();
  const queueCounts = presentationOnly ? await db.prepare("SELECT COALESCE(SUM(status='ready' AND result_url IS NOT NULL),0) AS ready, COALESCE(SUM(status IN ('queued','processing')),0) AS processing FROM photobooth_jobs").first<QueueCounts>() : null;
  return { serverNow, nextJobId: next?.id ?? null, settings: publicSettings(settings), jobs: jobs.results.map(publicJob), mode: config.mode, aiConfigured: config.configured, screen: publicScreen(screen, serverNow), ...(queueCounts?{queueCounts}:{}) };
}

// A public display receives presentation data, not the operator's full queue.
export function screenPresentation(state: StateResponse & {queueCounts?:QueueCounts}, ownSessionId?: unknown) {
  const ready = state.jobs.filter(job => job.status === "ready" && job.resultUrl)
    .sort((a, b) => (a.readyAt ?? a.createdAt) - (b.readyAt ?? b.createdAt) || a.id.localeCompare(b.id));
  const current = state.jobs.find(job => job.id === state.screen.currentJobId && job.status === "displaying");
  const next = state.jobs.find(job => job.id === state.nextJobId);
  const last = state.jobs.filter(job => job.status === "done" && job.displayedAt && job.resultUrl)
    .sort((a, b) => (b.displayedAt ?? 0) - (a.displayedAt ?? 0))[0];
  const ids = new Set([current?.id, next?.id, last?.id].filter(Boolean));
  return {
    ...state,
    nextJobId: next?.id ?? null,
    screen: { ...state.screen, sessionId: state.screen.sessionId === ownSessionId ? state.screen.sessionId : null },
    jobs: state.jobs.filter(job => ids.has(job.id)).map(job => ({ ...job, originalUrl: job.resultUrl || "", error: null })),
    queueCounts: state.queueCounts ?? { ready: ready.length, processing: state.jobs.filter(job => job.status === "queued" || job.status === "processing").length },
  };
}

export async function getJob(id: string): Promise<JobResponse> {
  const db = database();
  await prepareState(db);
  const row = await findJob(db, id);
  const screen = await readScreen(db);
  let position: number | null = null;
  if (row.status === "ready") {
    const earlier = await db.prepare("SELECT COUNT(*) AS count FROM photobooth_jobs WHERE status = 'ready' AND (ready_at < ? OR (ready_at = ? AND id <= ?))").bind(row.ready_at, row.ready_at, row.id).first<{ count: number }>();
    position = earlier?.count ?? 1;
  }
  const serverNow = Date.now();
  return { serverNow, job: publicJob(row), position, screenConnected: publicScreen(screen, serverNow).connected, mode: row.mode };
}

/** Read only the saved theme for first paint; do not advance the processing queue. */
export async function getJobTheme(id: string): Promise<Job["posterTheme"]> {
  const row = await findJob(database(), id);
  return row.poster_theme ?? "nusantara";
}

export function sniffImage(bytes: Uint8Array): { mime: string; extension: string } | null {
  if (bytes.length < 16) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", extension: "jpg" };
  if ([137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n)) return { mime: "image/png", extension: "png" };
  if ([82,73,70,70].every((n, i) => bytes[i] === n) && [87,69,66,80].every((n, i) => bytes[i+8] === n)) return { mime: "image/webp", extension: "webp" };
  return null;
}

function cleanName(raw: unknown): string {
  if (typeof raw !== "string") throw new ApiFailure("Isi nama panggilan terlebih dahulu.");
  const value = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (!value || [...value].length > 32 || /[\u0000-\u001f\u007f<>]/u.test(value)) throw new ApiFailure("Gunakan nama panggilan 1–32 karakter tanpa simbol < atau >.");
  return value;
}

async function normalizePhoto(photo: Uint8Array, mime: string): Promise<Uint8Array> {
  const {CODEX_BACKEND_URL,CODEX_BACKEND_KEY,IMAGE_NORMALIZER}=environment();
  if(IMAGE_NORMALIZER){
    const response=await IMAGE_NORMALIZER.fetch(new Request("https://image-normalizer/images/normalize",{method:"POST",headers:{"Content-Type":mime},body:new Uint8Array(photo)}));
    if(!response.ok)throw new ApiFailure("Foto tidak dapat didecode.",415);
    const normalized=new Uint8Array(await response.arrayBuffer());
    if(normalized.length>MAX_IMAGE_BYTES||sniffImage(normalized)?.mime!=="image/jpeg")throw new ApiFailure("Validasi foto gagal.",415);
    return normalized;
  }
  let url:URL;
  try { url=new URL(CODEX_BACKEND_URL||""); } catch {throw new ApiFailure("Layanan validasi foto belum dikonfigurasi.",503,"IMAGE_SERVICE_UNAVAILABLE");}
  const local=["localhost","127.0.0.1","[::1]"].includes(url.hostname);
  if((url.protocol!=="https:"&&!(local&&url.protocol==="http:"))||url.username||url.password||url.pathname!=="/"||url.search||url.hash||!CODEX_BACKEND_KEY||CODEX_BACKEND_KEY.length<32)throw new ApiFailure("Konfigurasi validasi foto tidak aman.",503);
  let response:Response;
  try {response=await fetch(`${url.origin}/images/normalize`,{method:"POST",redirect:"manual",headers:{Authorization:`Bearer ${CODEX_BACKEND_KEY}`,"Content-Type":mime},body:new Uint8Array(photo),signal:AbortSignal.timeout(20000)});}
  catch {throw new ApiFailure("Validasi foto belum tersedia. Coba lagi.",503,"IMAGE_SERVICE_UNAVAILABLE");}
  if(!response.ok)throw new ApiFailure(response.status===422?"Foto rusak atau terlalu besar dimensinya. Pilih foto lain.":"Validasi foto belum tersedia. Coba lagi.",response.status===422?415:503);
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length>MAX_IMAGE_BYTES||sniffImage(bytes)?.mime!=="image/jpeg")throw new ApiFailure("Hasil validasi foto tidak terbaca.",503);
  return bytes;
}

export async function createJob(request: Request): Promise<Job> {
  assertSameOrigin(request);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES + 65536) throw new ApiFailure("Foto maksimal 8 MB.", 413, "IMAGE_TOO_LARGE");
  let form: FormData;
  try {
    const reader=request.body?.getReader();
    if(!reader) throw new ApiFailure("Unggahan kosong.");
    const chunks:Uint8Array[]=[];let size=0;
    try { while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_IMAGE_BYTES+65536)throw new ApiFailure("Foto maksimal 8 MB.",413,"IMAGE_TOO_LARGE");chunks.push(value);} }
    finally { await reader.cancel().catch(()=>{});reader.releaseLock(); }
    form=await new Response(new Blob(chunks.map(c=>new Uint8Array(c))),{headers:{"content-type":request.headers.get("content-type")||""}}).formData();
  } catch(error) { if(error instanceof ApiFailure)throw error;throw new ApiFailure("Unggahan belum terbaca. Pilih foto lalu kirim lagi."); }
  const name = cleanName(form.get("name"));
  const requestId = form.get("requestId");
  validId(requestId, "Kode pengiriman");
  const isSample = form.get("sample") === "true";
  if (isSample && environment().ALLOW_DEMO_SAMPLES !== "true") throw new ApiFailure("Foto contoh tidak diaktifkan pada acara ini.",403,"SAMPLE_DISABLED");
  if (!isSample && form.get("consent") !== "true") throw new ApiFailure("Setujui pemrosesan foto dan penayangan acara sebelum mengirim.",400,"CONSENT_REQUIRED");
  const rawStyle = form.get("portraitStyle");
  if (rawStyle !== null && !["beskap", "kebaya", "jas", "batik", "kebaya-kasual", "retro-festival"].includes(String(rawStyle))) throw new ApiFailure("Pilih gaya potret yang tersedia.", 400, "INVALID_PORTRAIT_STYLE");
  // Missing style is retained only for old clients and already-issued retries.
  const portraitStyle = (rawStyle ?? "legacy") as Job["portraitStyle"];
  const rawTheme = form.get("posterTheme");
  if (rawTheme !== null && !["nusantara", "kolase", "bojonegoro-doelo"].includes(String(rawTheme))) throw new ApiFailure("Pilih tema yang tersedia.", 400, "INVALID_POSTER_THEME");
  const posterTheme = (rawTheme ?? "nusantara") as Job["posterTheme"];
  if (["batik", "kebaya-kasual", "retro-festival"].includes(portraitStyle) && posterTheme !== "kolase") throw new ApiFailure("Gaya ini tersedia untuk tema Kolase Rakyat.", 400, "INVALID_PORTRAIT_STYLE");
  let photo: Uint8Array | null = null;
  let type: ReturnType<typeof sniffImage> = null;
  if (!isSample) {
    const image = form.get("image");
    if (!image || typeof image === "string" || image.size === 0) throw new ApiFailure("Pilih satu foto terlebih dahulu.");
    if (image.size > MAX_IMAGE_BYTES) throw new ApiFailure("Foto maksimal 8 MB.", 413, "IMAGE_TOO_LARGE");
    photo = new Uint8Array(await image.arrayBuffer());
    type = sniffImage(photo);
    if (!type || !["image/jpeg", "image/png", "image/webp"].includes(image.type)) throw new ApiFailure("Gunakan foto JPG, PNG, atau WebP.", 415, "UNSUPPORTED_IMAGE");
  }
  const signature = photo ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(photo).buffer)), n => n.toString(16).padStart(2, "0")).join("") : SAMPLE_VERSION;
  const fingerprint = `${name}|${isSample}|${signature}${portraitStyle === "legacy" ? "" : `|vintage-v1:${portraitStyle}`}${posterTheme === "nusantara" ? "" : `|theme:${posterTheme}`}`;
  const db = database();
  await initialize(db);
  const duplicate = await db.prepare("SELECT * FROM photobooth_jobs WHERE request_id = ?").bind(requestId).first<JobRow>();
  if (duplicate) {
    // A retry of an already-submitted sample still returns that exact sample,
    // even when a newer release changes the sample offered to new submissions.
    const sameSample = isSample && duplicate.is_sample === 1 && duplicate.name === name && duplicate.portrait_style === portraitStyle && duplicate.poster_theme === posterTheme;
    if (duplicate.fingerprint !== fingerprint && !sameSample) throw new ApiFailure("Kode pengiriman sudah dipakai untuk foto lain. Mulai pengiriman baru.", 409, "REQUEST_CONFLICT");
    return publicJob(duplicate);
  }
  const eventSettings = publicSettings(await readSettings(db));
  if (!eventSettings.themePolicy.enabled.includes(posterTheme)) throw new ApiFailure("Tema tidak tersedia di acara ini. Pilih tema aktif lalu kirim kembali.", 409, "THEME_UNAVAILABLE");
  if (!eventSettings.accepting) throw new ApiFailure("Penerimaan foto sedang ditutup. Silakan coba lagi nanti.", 409, "SUBMISSIONS_CLOSED");
  const limit=(value:string|undefined,fallback:number,max:number)=>{const n=Number(value);return Number.isInteger(n)&&n>0&&n<=max?n:fallback;};
  const settings=environment();
  const eventLimit=limit(settings.EVENT_JOB_LIMIT,200,10000),queueLimit=limit(settings.MAX_QUEUED_JOBS,30,500),networkLimit=limit(settings.UPLOADS_PER_HOUR,20,1000);
  // Cloudflare supplies this header at the edge. Local preview shares one bucket.
  const network=request.headers.get("cf-connecting-ip")||"local";
  const networkKey=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(network))),n=>n.toString(16).padStart(2,"0")).join("")+":"+Math.floor(Date.now()/3600000);
  const admitted=await db.prepare("INSERT INTO photobooth_admission(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count < ?").bind(networkKey,Date.now()+3600000,networkLimit).run();
  if(!admitted.meta.changes)throw new ApiFailure("Batas unggahan jaringan ini tercapai. Hubungi operator atau coba lagi nanti.",429,"UPLOAD_LIMIT");
  const used=await db.prepare("SELECT used FROM photobooth_budget WHERE id=1").first<{used:number}>();
  if((used?.used??0)>=eventLimit)throw new ApiFailure("Kuota foto acara tercapai. Hubungi operator.",429,"EVENT_LIMIT");
  const config = await activeAiConfig();
  const mode = isSample ? "demo" : config.mode;
  if (mode === "live" && !config.configured) throw new ApiFailure("AI belum terhubung. Operator perlu mengatur akses API terlebih dahulu.", 503, "AI_NOT_CONFIGURED");
  if(photo){photo=await normalizePhoto(photo,type!.mime);type={mime:"image/jpeg",extension:"jpg"};}
  const id = crypto.randomUUID();
  const key = photo && type ? `${id}-original.${type.extension}` : null;
  const originalUrl = key ? `/api/media/${key}` : "/samples/before.jpg";
  if (key && photo && type) await bucket().put(key, photo, { httpMetadata: { contentType: type.mime } });
  const now = Date.now();
  try {
    const results = await db.batch([
      db.prepare("INSERT OR IGNORE INTO photobooth_jobs (id, request_id, fingerprint, name, status, mode, is_sample, original_key, original_url, created_at, queued_at, portrait_style, ai_provider, poster_theme, expires_at) SELECT ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM photobooth_settings, json_each(theme_policy, '$.enabled') WHERE photobooth_settings.id = 1 AND accepting = 1 AND json_each.value = ?) AND (SELECT used FROM photobooth_budget WHERE id=1) < ? AND (SELECT COUNT(*) FROM photobooth_jobs WHERE status IN ('queued','processing')) < ?")
      .bind(id, requestId, fingerprint, name, mode, isSample ? 1 : 0, key, originalUrl, now, now, portraitStyle, config.provider, posterTheme,now+limit(settings.RETENTION_DAYS,7,90)*86400000,posterTheme,eventLimit,queueLimit),
      db.prepare("UPDATE photobooth_budget SET used=used+1 WHERE id=1 AND EXISTS(SELECT 1 FROM photobooth_jobs WHERE id=?)").bind(id),
    ]);
    const result=results[0];
    if (!result.meta.changes) {
      if (key) await discardMedia(db,key);
      const raced = await db.prepare("SELECT * FROM photobooth_jobs WHERE request_id = ?").bind(requestId).first<JobRow>();
      if (!raced) {
        if (!publicSettings(await readSettings(db)).themePolicy.enabled.includes(posterTheme)) throw new ApiFailure("Tema tidak tersedia di acara ini. Pilih tema aktif lalu kirim kembali.", 409, "THEME_UNAVAILABLE");
        throw new ApiFailure("Antrean atau kuota penuh, atau penerimaan foto ditutup. Coba lagi nanti.", 429, "ADMISSION_CLOSED");
      }
      const sameSample = isSample && raced.is_sample === 1 && raced.name === name && raced.portrait_style === portraitStyle && raced.poster_theme === posterTheme;
      if (raced.fingerprint !== fingerprint && !sameSample) throw new ApiFailure("Kode pengiriman sudah digunakan untuk foto lain.", 409, "REQUEST_CONFLICT");
      return publicJob(raced);
    }
  } catch (error) {
    if (key) await discardMedia(db,key);
    throw error;
  }
  return publicJob(await findJob(db, id));
}

async function discardMedia(db:D1Database,key:string):Promise<void> {
  await db.prepare("INSERT OR IGNORE INTO photobooth_cleanup(key,created_at) VALUES(?,?)").bind(key,Date.now()).run();
  try {await bucket().delete(key);await db.prepare("DELETE FROM photobooth_cleanup WHERE key=?").bind(key).run();}
  catch {console.error(JSON.stringify({event:"media_cleanup_pending"}));}
}

export async function actOnJob(id: string, action: unknown): Promise<Job> {
  const db = database();
  await initialize(db);
  const job = await findJob(db, id);
  const now = Date.now();
  if (action === "skip") {
    await db.batch([
      db.prepare("UPDATE photobooth_jobs SET status = 'skipped', completed_at = ? WHERE id = ? AND status != 'skipped'").bind(now, id),
      db.prepare("UPDATE photobooth_screen SET current_job_id = NULL, started_at = NULL, ends_at = NULL, pause_remaining_ms = NULL WHERE id = 1 AND current_job_id = ?").bind(id),
    ]);
  } else if (action === "retry") {
    if (job.status !== "failed") return publicJob(job);
    const available = job.ai_provider === "chatgpt" ? await activeAiConfig() : getAiConfig(environment());
    if (job.mode === "live" && !available.configured) throw new ApiFailure("Akses API AI belum tersedia.", 503, "AI_NOT_CONFIGURED");
    const configured = Number(environment().EVENT_JOB_LIMIT);
    const limit = Number.isInteger(configured) && configured > 0 && configured <= 10000 ? configured : 200;
    const retried = await db.batch([
      db.prepare("UPDATE photobooth_jobs SET status = 'queued', queued_at = ?, processing_at = NULL, ready_at = NULL, error = NULL, result_url = NULL, provider_task_id = NULL, provider_polling_url = NULL, provider_poll_after = NULL, provider_lock = NULL, provider_lock_until = NULL WHERE id = ? AND status = 'failed' AND (SELECT used FROM photobooth_budget WHERE id=1) < ? AND (expires_at IS NULL OR expires_at > ?)").bind(now, id, limit, now),
      db.prepare("UPDATE photobooth_budget SET used=used+1 WHERE id=1 AND changes()=1"),
    ]);
    if (!retried[0].meta.changes) throw new ApiFailure("Kuota percobaan tercapai atau foto kedaluwarsa.",429,"EVENT_LIMIT");
  } else if (action === "requeue") {
    if (!job.result_url) throw new ApiFailure("Gambar belum siap untuk ditayangkan ulang.", 409, "RESULT_NOT_READY");
    await db.prepare("UPDATE photobooth_jobs SET status = 'ready', ready_at = ?, displayed_at = NULL, completed_at = NULL WHERE id = ? AND status IN ('done', 'skipped')").bind(now, id).run();
  } else throw new ApiFailure("Tindakan peserta tidak dikenal.");
  return publicJob(await findJob(db, id));
}

export async function updateSettings(payload: Record<string, unknown>): Promise<StateResponse> {
  // Old clients used zero for an indefinite hold. It now selects the default loop interval.
  if (payload.durationSeconds === 0) payload = { ...payload, durationSeconds: 10 };
  const allowed = ["eventName", "theme", "accepting", "paused", "durationSeconds", "themePolicy", "replayLimit", "screenRotation"];
  if (Object.keys(payload).some(k => !allowed.includes(k))) throw new ApiFailure("Ada pengaturan yang tidak dikenal.");
  const assignments: string[] = [];
  const values: (string | number)[] = [];
  if ("themePolicy" in payload) {
    const policy = payload.themePolicy as Settings["themePolicy"] | null;
    if (!policy || !Array.isArray(policy.enabled) || !policy.enabled.length || policy.enabled.some(theme => !["nusantara", "kolase", "bojonegoro-doelo"].includes(theme)) || new Set(policy.enabled).size !== policy.enabled.length || !policy.enabled.includes(policy.defaultTheme)) throw new ApiFailure("Aktifkan minimal satu tema dan pilih tema default dari tema aktif.", 400, "INVALID_THEME_POLICY");
    assignments.push("theme_policy = ?"); values.push(JSON.stringify({enabled: policy.enabled, defaultTheme: policy.defaultTheme}));
  }
  if ("eventName" in payload) {
    if (typeof payload.eventName !== "string" || !payload.eventName.trim() || [...payload.eventName.trim()].length > 80 || /[<>\u0000-\u001f]/u.test(payload.eventName)) throw new ApiFailure("Nama acara harus 1–80 karakter.");
    assignments.push("event_name = ?"); values.push(payload.eventName.trim());
  }
  if ("theme" in payload) {
    if (payload.theme !== "Persibo Masa Depan" && payload.theme !== "Loka Studio") throw new ApiFailure("Tema yang tersedia adalah Persibo Masa Depan.");
    // Retain the legacy value for explicit settings restore; never migrate it
    // silently while reading event state.
    assignments.push("theme = ?"); values.push(payload.theme);
  }
  for (const key of ["accepting", "paused"] as const) {
    if (key in payload) {
      if (typeof payload[key] !== "boolean") throw new ApiFailure("Pengaturan status harus aktif atau nonaktif.");
      assignments.push(`${key} = ?`); values.push(payload[key] ? 1 : 0);
    }
  }
  if ("durationSeconds" in payload) {
    if (typeof payload.durationSeconds !== "number" || !Number.isInteger(payload.durationSeconds) || payload.durationSeconds < 5 || payload.durationSeconds > 60) throw new ApiFailure("Gunakan durasi tayang 5–60 detik.");
    assignments.push("duration_seconds = ?"); values.push(payload.durationSeconds);
  }
  if ("replayLimit" in payload) {
    if (typeof payload.replayLimit !== "number" || !Number.isInteger(payload.replayLimit) || payload.replayLimit < 1 || payload.replayLimit > 1000) throw new ApiFailure("Gunakan batas putaran 1–1000 orang.");
    assignments.push("replay_limit = ?"); values.push(payload.replayLimit);
  }
  if ("screenRotation" in payload) {
    if (typeof payload.screenRotation !== "number" || ![0, 90, 270].includes(payload.screenRotation)) throw new ApiFailure("Pilih orientasi layar yang tersedia.");
    assignments.push("screen_rotation = ?"); values.push(payload.screenRotation);
  }
  if (!assignments.length) throw new ApiFailure("Tidak ada pengaturan yang diubah.");
  const db = database();
  await initialize(db);
  const now = Date.now();
  await recoverExpiredScreen(db, now);
  const statements: D1PreparedStatement[] = [];
  if (payload.paused === true) {
    statements.push(db.prepare("UPDATE photobooth_screen SET pause_remaining_ms = MAX(0, ends_at - ?), ends_at = NULL WHERE id = 1 AND current_job_id IS NOT NULL AND ends_at IS NOT NULL AND (SELECT paused FROM photobooth_settings WHERE id = 1) = 0").bind(now));
  } else if (payload.paused === false) {
    statements.push(db.prepare("UPDATE photobooth_screen SET ends_at = ? + pause_remaining_ms, pause_remaining_ms = NULL WHERE id = 1 AND current_job_id IS NOT NULL AND pause_remaining_ms IS NOT NULL AND (SELECT paused FROM photobooth_settings WHERE id = 1) = 1").bind(now));
  }
  if (typeof payload.durationSeconds === "number") {
    // Give old hold-mode records their first timer. Existing slide timers keep
    // their remaining time; a new duration applies to the next portrait.
    const finalPaused = typeof payload.paused === "boolean" ? Number(payload.paused) : null;
    const durationMs = payload.durationSeconds * 1000;
    statements.push(db.prepare("UPDATE photobooth_screen SET ends_at = CASE WHEN COALESCE(?, (SELECT paused FROM photobooth_settings WHERE id = 1)) = 1 THEN NULL ELSE ? + ? END, pause_remaining_ms = CASE WHEN COALESCE(?, (SELECT paused FROM photobooth_settings WHERE id = 1)) = 1 THEN ? ELSE NULL END WHERE id = 1 AND current_job_id IS NOT NULL AND (SELECT duration_seconds FROM photobooth_settings WHERE id = 1) = 0")
      .bind(finalPaused, now, durationMs, finalPaused, durationMs));
  }
  statements.push(db.prepare(`UPDATE photobooth_settings SET ${assignments.join(", ")} WHERE id = 1`).bind(...values));
  await db.batch(statements);
  return getState(false);
}

export async function actOnScreen(payload: Record<string, unknown>, presentationOnly = false): Promise<StateResponse> {
  const readState = () => getState(false, presentationOnly);
  const { sessionId, action, jobId } = payload;
  validId(sessionId, "Sesi layar");
  if (!["heartbeat", "claim", "complete", "release"].includes(String(action))) throw new ApiFailure("Tindakan layar tidak dikenal.");
  if (jobId !== undefined && jobId !== null) validId(jobId);
  const typedAction = action as ScreenAction;
  const db = database();
  await initialize(db);
  const now = Date.now();
  await recoverExpiredScreen(db, now);
  // Keep the screen heartbeat independent of slow external AI calls.
  await advanceDemo(db, now);
  if (typedAction === "release") {
    await db.batch([
      db.prepare("UPDATE photobooth_jobs SET status = 'ready', displayed_at = NULL WHERE status = 'displaying' AND id = (SELECT current_job_id FROM photobooth_screen WHERE id = 1 AND session_id = ?)").bind(sessionId),
      db.prepare("UPDATE photobooth_screen SET session_id = NULL, current_job_id = NULL, started_at = NULL, ends_at = NULL, last_seen_at = NULL, pause_remaining_ms = NULL WHERE id = 1 AND session_id = ?").bind(sessionId),
    ]);
    return readState();
  }
  const lease = await db.prepare("UPDATE photobooth_screen SET session_id = ?, last_seen_at = ? WHERE id = 1 AND (session_id IS NULL OR session_id = ?)").bind(sessionId, now, sessionId).run();
  if (!lease.meta.changes) throw new ApiFailure("Layar acara sudah aktif di tab atau perangkat lain. Tutup layar tersebut sebelum mengambil alih.", 409, "SCREEN_BUSY");
  // Seed a timer for a portrait already on screen when upgrading from hold mode.
  await db.prepare(`UPDATE photobooth_screen SET ends_at = ? + ${SLIDE_DURATION_SQL} * 1000 WHERE id = 1 AND session_id = ? AND current_job_id IS NOT NULL AND ends_at IS NULL AND pause_remaining_ms IS NULL AND (SELECT paused FROM photobooth_settings WHERE id = 1) = 0`).bind(now, sessionId).run();
  if (typedAction === "heartbeat") return readState();
  const storedSettings = await readSettings(db);
  const settings = { ...storedSettings, duration_seconds: storedSettings.duration_seconds || 10 };
  const screen = await readScreen(db);
  if (typedAction === "claim") {
    if (settings.paused || (screen.current_job_id && (screen.ends_at === null || screen.ends_at > now))) return readState();
    const next = await db.prepare(NEXT_SLIDE_SQL).first<{ id: string }>();
    if (!next || (jobId && jobId !== next.id)) return readState();
    // Replacing a visible portrait must explicitly name the preloaded next
    // candidate. A heartbeat or a generic claim can never dismiss the current.
    if (screen.current_job_id && !jobId) return readState();
    if (screen.current_job_id) {
      const previous = screen.current_job_id;
      await db.batch([
        db.prepare(`UPDATE photobooth_jobs SET status = 'done', completed_at = ? WHERE id = ? AND status = 'displaying' AND EXISTS (SELECT 1 FROM photobooth_screen WHERE id = 1 AND session_id = ? AND current_job_id = ? AND ends_at <= ?) AND ? = (${NEXT_SLIDE_SQL}) AND (SELECT paused FROM photobooth_settings WHERE id = 1) = 0`)
          .bind(now, previous, sessionId, previous, now, next.id),
        db.prepare(`UPDATE photobooth_screen SET current_job_id = ?, started_at = ?, ends_at = ? + ${SLIDE_DURATION_SQL} * 1000, pause_remaining_ms = NULL WHERE id = 1 AND session_id = ? AND current_job_id = ? AND ends_at <= ? AND EXISTS (SELECT 1 FROM photobooth_jobs WHERE id = ? AND status = 'done') AND ? = (${NEXT_SLIDE_SQL}) AND (SELECT paused FROM photobooth_settings WHERE id = 1) = 0`)
          .bind(next.id, now, now, sessionId, previous, now, previous, next.id),
        db.prepare("UPDATE photobooth_jobs SET status = 'displaying', displayed_at = ?, completed_at = NULL WHERE id = ? AND status IN ('ready', 'done') AND EXISTS (SELECT 1 FROM photobooth_screen WHERE id = 1 AND session_id = ? AND current_job_id = ?)")
          .bind(now, next.id, sessionId, next.id),
      ]);
      return readState();
    }
    // The UI preloads this candidate before claim. This transaction is the actual
    // display acknowledgement and starts the visible duration, never generation.
    await db.batch([
      db.prepare(`UPDATE photobooth_screen SET current_job_id = ?, started_at = ?, ends_at = ? + ${SLIDE_DURATION_SQL} * 1000, pause_remaining_ms = NULL WHERE id = 1 AND session_id = ? AND current_job_id IS NULL AND (SELECT paused FROM photobooth_settings WHERE id = 1) = 0 AND ? = (${NEXT_SLIDE_SQL})`)
        .bind(next.id, now, now, sessionId, next.id),
      db.prepare("UPDATE photobooth_jobs SET status = 'displaying', displayed_at = ?, completed_at = NULL WHERE id = ? AND status IN ('ready', 'done') AND EXISTS (SELECT 1 FROM photobooth_screen WHERE id = 1 AND session_id = ? AND current_job_id = ?)")
        .bind(now, next.id, sessionId, next.id),
    ]);
  } else if (typedAction === "complete") {
    validId(jobId);
    if (screen.current_job_id !== jobId) return readState();
    if (settings.paused || settings.duration_seconds === 0) return readState();
    if (screen.ends_at === null || screen.ends_at > now) throw new ApiFailure("Durasi tayang belum selesai.", 409, "DISPLAY_NOT_FINISHED");
    await db.batch([
      db.prepare("UPDATE photobooth_jobs SET status = 'done', completed_at = ? WHERE id = ? AND status = 'displaying' AND EXISTS (SELECT 1 FROM photobooth_screen WHERE id = 1 AND session_id = ? AND current_job_id = ? AND ends_at <= ?) AND (SELECT paused FROM photobooth_settings WHERE id = 1) = 0")
        .bind(now, jobId, sessionId, jobId, now),
      db.prepare("UPDATE photobooth_screen SET current_job_id = NULL, started_at = NULL, ends_at = NULL, pause_remaining_ms = NULL WHERE id = 1 AND session_id = ? AND current_job_id = ? AND EXISTS (SELECT 1 FROM photobooth_jobs WHERE id = ? AND status = 'done')")
        .bind(sessionId, jobId, jobId),
    ]);
  }
  return readState();
}

export async function getMedia(key: string): Promise<Response> {
  if (!/^[0-9a-f-]{36}-(original|result)\.(jpg|png|webp)$/i.test(key) || !UUID.test(key.slice(0, 36))) throw new ApiFailure("Foto tidak ditemukan.", 404);
  const live=await database().prepare("SELECT id FROM photobooth_jobs WHERE (original_key=? OR result_url=?) AND (expires_at IS NULL OR expires_at>?) LIMIT 1").bind(key,`/api/media/${key}`,Date.now()).first();
  if(!live)throw new ApiFailure("Foto tidak ditemukan atau sudah kedaluwarsa.",404);
  const object = await bucket().get(key);
  if (!object) throw new ApiFailure("Foto tidak ditemukan.", 404);
  return new Response(object.body, { headers: {
    "Content-Type": object.httpMetadata?.contentType ?? "image/jpeg",
    "Content-Disposition": `inline; filename="${key}"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}
