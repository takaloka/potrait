/** Legacy sample preservation and timed-rotation upgrade contract. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

if (process.env.PHOTOBOOTH_TEST_ADAPTER !== "sqlite-memory-r2" || !globalThis.__photoboothTestEnvironment) {
  throw new Error("Run only through: node tests/photobooth-offline.mjs persibo-v2");
}
const db = globalThis.__photoboothTestEnvironment.DB;
const realNow = Date.now;
let clock = 1794283200000;
Date.now = () => clock;
let checks = 0;
const session = randomUUID();
const eventName = "Pemain Inti Persibo Bojonegoro Masa Depan";

async function api(path, body, method = "POST", expected = 200) {
  const response = await fetch(`http://127.0.0.1:4173${path}`, {
    method, headers: body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {},
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}`); checks++;
  return result;
}
const state = () => api("/api/state", undefined, "GET");
const screen = (action, jobId, sessionId = session, expected = 200) => api("/api/screen", { action, sessionId, ...(jobId ? { jobId } : {}) }, "POST", expected);
const settings = value => api("/api/settings", value, "PATCH");
function sampleForm(name, requestId = randomUUID()) { const form = new FormData(); form.set("name", name); form.set("requestId", requestId); form.set("sample", "true"); return form; }
const sample = async name => (await api("/api/jobs", sampleForm(name), "POST", 201)).job;
const jobOf = (response, id) => response.jobs.find(job => job.id === id);

try {
  let current = await state();
  assert.equal(current.settings.eventName, eventName); checks++;
  assert.equal(current.settings.theme, "Persibo Masa Depan"); checks++;
  assert.equal(current.settings.durationSeconds, 10, "Fresh event uses ten-second rotation"); checks++;
  assert.equal(current.serverNow, clock, "Clock anchor comes from the server"); checks++;

  // Simulate an existing V1 database. Read/initialize must never reset its row.
  await db.prepare("UPDATE photobooth_settings SET event_name = 'Acara Lama', theme = 'Loka Studio', duration_seconds = 12 WHERE id = 1").run();
  current = await state();
  assert.equal(current.settings.eventName, "Acara Lama"); checks++;
  assert.equal(current.settings.theme, "Loka Studio"); checks++;
  assert.equal(current.settings.durationSeconds, 12, "Upgrade preserves existing settings until explicit PATCH"); checks++;
  current = await settings({ eventName, theme: "Persibo Masa Depan", durationSeconds: 0 });
  assert.equal(current.settings.durationSeconds, 10); checks++;

  const oldId = randomUUID(); const oldRequest = randomUUID();
  await db.prepare("INSERT INTO photobooth_jobs (id, request_id, fingerprint, name, status, mode, is_sample, original_url, created_at, queued_at, processing_at) VALUES (?, ?, ?, ?, 'processing', 'demo', 1, '/samples/before.jpg', ?, ?, ?)")
    .bind(oldId, oldRequest, "QA Lama|true|prepared-fictional-sample", "QA Lama", clock - 10000, clock - 10000, clock - 5000).run();
  current = await state();
  assert.equal(jobOf(current, oldId).resultUrl, "/samples/after.jpg", "Existing pending sample retains its prior visual"); checks++;
  const oldDuplicate = await api("/api/jobs", sampleForm("QA Lama", oldRequest), "POST", 201);
  assert.equal(oldDuplicate.job.id, oldId, "Cross-release duplicate request keeps the old job"); checks++;
  await api(`/api/jobs/${oldId}/action`, { action: "skip" });
  const oldRequeue = await api(`/api/jobs/${oldId}/action`, { action: "requeue" });
  assert.equal(oldRequeue.job.resultUrl, "/samples/after.jpg", "Requeue never rewrites an old result URL"); checks++;
  await api(`/api/jobs/${oldId}/action`, { action: "skip" });

  const first = await sample("QA Pemain Satu");
  assert.equal(first.resultUrl, null, "New sample is not exposed as finished while queued"); checks++;
  clock += 6000;
  current = await state();
  assert.equal(jobOf(current, first.id).resultUrl, "/samples/persibo-player-v2.png"); checks++;
  const detail = await api(`/api/jobs/${first.id}`, undefined, "GET");
  assert.equal(detail.serverNow, clock); checks++;
  current = await screen("claim", first.id);
  assert.equal(current.screen.currentJobId, first.id); checks++;
  assert.equal(current.screen.endsAt, clock + 10000, "Rotation has a deadline"); checks++;
  assert.equal(jobOf(current, first.id).status, "displaying"); checks++;
  for (let i = 0; i < 7; i++) { clock += 10000; current = await screen("heartbeat"); }
  assert.equal(current.screen.currentJobId, first.id, "Still displayed after 70 seconds of healthy heartbeats"); checks++;
  assert.equal(jobOf(current, first.id).status, "displaying"); checks++;
  current = await screen("complete", first.id);
  assert.equal(current.screen.currentJobId, null, "Explicit completion clears an elapsed timed slide"); checks++;
  current = await screen("claim", first.id);
  clock += 10001;
  await screen("heartbeat");

  const next = await sample("QA Pemain Dua");
  clock += 1;
  const later = await sample("QA Pemain Tiga");
  current = await screen("claim", next.id);
  assert.equal(current.screen.currentJobId, first.id, "A merely submitted next participant cannot replace current"); checks++;
  clock += 2000;
  current = await screen("claim", next.id);
  assert.equal(jobOf(current, next.id).status, "processing"); checks++;
  assert.equal(current.screen.currentJobId, first.id, "An AI-processing participant cannot replace current"); checks++;
  clock += 4000;
  await state();
  await settings({ paused: true });
  current = await screen("claim", next.id);
  assert.equal(current.screen.currentJobId, first.id, "Pause blocks replacement"); checks++;
  assert.equal(jobOf(current, next.id).status, "ready"); checks++;
  current = await settings({ paused: false });
  assert.ok(current.screen.endsAt <= clock, "An expired deadline permits the next preloaded result"); checks++;
  current = await screen("claim");
  assert.equal(current.screen.currentJobId, first.id, "Replacement requires an explicitly preloaded candidate ID"); checks++;
  current = await screen("claim", later.id);
  assert.equal(current.screen.currentJobId, first.id, "A later ready result cannot skip the oldest ready result"); checks++;

  const replacements = await Promise.all([screen("claim", next.id), screen("claim", next.id), screen("claim", next.id)]);
  current = await state();
  assert.ok(replacements.every(result => result.screen.currentJobId === next.id)); checks++;
  assert.equal(jobOf(current, first.id).status, "done"); checks++;
  assert.equal(jobOf(current, first.id).completedAt, clock); checks++;
  assert.equal(jobOf(current, next.id).status, "displaying"); checks++;
  assert.equal(current.jobs.filter(job => job.status === "displaying").length, 1, "Atomic concurrent replacement leaves one visible participant"); checks++;
  assert.equal(current.screen.endsAt, clock + 10000); checks++;
  assert.equal(jobOf(current, later.id).status, "ready", "A later result waits for its own explicit preload acknowledgement"); checks++;
  await screen("heartbeat", undefined, randomUUID(), 409);
  current = await screen("claim", next.id);
  assert.equal(current.screen.currentJobId, next.id, "Repeated stale claim cannot replay completed portraits"); checks++;

  // A deliberate configuration transition must preserve the current portrait.
  current = await settings({ durationSeconds: 30 });
  assert.equal(current.screen.currentJobId, next.id); checks++;
  assert.equal(current.screen.endsAt, clock + 10000, "Duration changes apply to the next slide"); checks++;
  current = await settings({ durationSeconds: 0 });
  assert.equal(current.screen.currentJobId, next.id); checks++;
  assert.equal(current.screen.endsAt, clock + 10000); checks++;
  assert.equal(jobOf(current, next.id).status, "displaying"); checks++;

  console.log(`PASS: ${checks} legacy sample upgrade, timed rotation, and atomic-replacement checks; in-process SQLite + R2 adapter, no network or paid AI calls.`);
} finally { Date.now = realNow; }
