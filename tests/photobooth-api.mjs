/** Local integration checks against the real D1/R2 preview, never production.
 * Usage: node tests/photobooth-api.mjs http://127.0.0.1:4173
 * Requires an idle local screen and no active participants. Creates QA records
 * only in the local preview database; restores event settings on completion.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const origin = new URL(process.argv[2] ?? "http://127.0.0.1:4173");
if (!["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)) {
  throw new Error("This verification script only mutates a loopback preview, never a hosted Site.");
}
const base = origin.origin;
const created = new Set();
const sessionA = randomUUID();
const sessionB = randomUUID();
let baseline;
let started = false;
let assertions = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function api(path, { method = "GET", body, headers = {}, expected = 200 } = {}) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`); assertions++;
  return data;
}
function sample(name, requestId) {
  const form = new FormData(); form.set("name", name); form.set("requestId", requestId); form.set("sample", "true"); return form;
}
async function screen(action, sessionId = sessionA, jobId, expected = 200) {
  return api("/api/screen", { method: "POST", body: { action, sessionId, ...(jobId ? { jobId } : {}) }, expected });
}
async function until(predicate, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = await predicate(); if (result) return result; await sleep(250); }
  throw new Error("Timed out while waiting for expected API state");
}

try {
  baseline = await api("/api/state");
  assert.equal(baseline.mode, "demo", "Integration tests must not run real AI requests"); assertions++;
  assert.equal(baseline.screen.connected, false, "Close the local preview screen before running tests"); assertions++;
  assert.equal(baseline.jobs.some(j => ["queued", "processing", "ready", "displaying"].includes(j.status)), false, "Use an idle local test database"); assertions++;
  started = true;
  await api("/api/settings", { method: "PATCH", body: { accepting: true, paused: false, durationSeconds: 5 } });

  const key = randomUUID();
  const duplicates = await Promise.all([0,1,2].map(() => api("/api/jobs", { method: "POST", body: sample("QA Idempotensi", key), expected: 201 })));
  duplicates.forEach(({ job }) => created.add(job.id));
  assert.equal(created.size, 1, "Concurrent submissions create one job only"); assertions++;
  const firstId = duplicates[0].job.id;
  assert.equal(duplicates[0].job.posterTheme, "nusantara", "Old clients default to Jendela Nusantara"); assertions++;
  const changedTheme = sample("QA Idempotensi", key); changedTheme.set("posterTheme", "kolase");
  await api("/api/jobs", { method: "POST", body: changedTheme, expected: 409 });
  const invalidTheme = sample("QA Tema Salah", randomUUID()); invalidTheme.set("posterTheme", "unknown");
  await api("/api/jobs", { method: "POST", body: invalidTheme, expected: 400 });
  await api("/api/jobs", { method: "POST", body: sample("QA Berbeda", key), expected: 409 });
  await api("/api/settings", { method: "PATCH", body: { accepting: false } });
  await api("/api/jobs", { method: "POST", body: sample("QA Ditutup", randomUUID()), expected: 409 });
  const resumed = await api("/api/jobs", { method: "POST", body: sample("QA Idempotensi", key), expected: 201 });
  assert.equal(resumed.job.id, firstId, "Existing submission survives a temporary submission closure"); assertions++;
  await api("/api/settings", { method: "PATCH", body: { accepting: true } });
  await api("/api/settings", { method: "PATCH", body: { durationSeconds: 12 }, headers: { Origin: "https://unrelated.example" }, expected: 403 });

  const invalid = sample("QA Berkas Salah", randomUUID()); invalid.delete("sample"); invalid.set("consent", "true");
  invalid.set("image", new Blob(["<script>not a jpeg</script>"], { type: "image/jpeg" }), "fake.jpg");
  await api("/api/jobs", { method: "POST", body: invalid, expected: 415 });

  const { default: sharp } = await import("sharp");
  const png = await sharp({create:{width:120,height:150,channels:3,background:"#abcdef"}}).png().toBuffer();
  const upload = sample("QA Unggahan", randomUUID()); upload.delete("sample"); upload.set("consent", "true");
  upload.set("posterTheme", "kolase");
  upload.set("image", new Blob([png], { type: "image/png" }), "sample.png");
  const uploaded = await api("/api/jobs", { method: "POST", body: upload, expected: 201 }); created.add(uploaded.job.id);
  const uploadRetry = await api("/api/jobs", { method: "POST", body: upload, expected: 201 });
  assert.equal(uploadRetry.job.id, uploaded.job.id, "Same photo and theme retry reuses the saved job"); assertions++;
  upload.set("posterTheme", "nusantara");
  await api("/api/jobs", { method: "POST", body: upload, expected: 409 });
  assert.equal(uploaded.job.originalUrl, "", "Public payload never exposes original media"); assertions++;

  await until(async () => { const state = await api("/api/state"); return state.jobs.filter(j => created.has(j.id)).every(j => j.status === "ready") ? state : null; });
  const imageResult = await api(`/api/jobs/${uploaded.job.id}`);
  assert.match(imageResult.job.resultUrl, /-result\.jpg$/, "Demo has a separate normalized result copy"); assertions++;
  assert.equal(imageResult.job.mode, "demo"); assertions++;
  assert.equal(imageResult.job.posterTheme, "kolase", "Selected theme survives persistence and processing"); assertions++;

  await screen("heartbeat");
  await screen("heartbeat", sessionB, undefined, 409);
  let state = await screen("claim", sessionA, firstId);
  assert.equal(state.screen.currentJobId, firstId, "Oldest ready job claimed"); assertions++;
  assert.equal(state.jobs.find(j => j.id === firstId).status, "displaying"); assertions++;
  state = await screen("claim", sessionA, firstId);
  assert.equal(state.screen.currentJobId, firstId, "Repeated claim does not advance queue"); assertions++;
  await screen("complete", sessionA, firstId, 409);
  const oldDeadline = state.screen.endsAt;
  await api("/api/settings", { method: "PATCH", body: { paused: true } });
  await sleep(1200);
  state = await screen("complete", sessionA, firstId);
  assert.equal(state.jobs.find(j => j.id === firstId).status, "displaying", "Pause does not complete current participant"); assertions++;
  assert.equal(state.screen.endsAt, null, "Pause freezes deadline"); assertions++;
  state = await api("/api/settings", { method: "PATCH", body: { paused: false } });
  assert.ok(state.screen.endsAt > oldDeadline + 1000, "Resume preserves remaining visible duration"); assertions++;
  while (Date.now() <= state.screen.endsAt + 80) { await screen("heartbeat"); await sleep(300); }
  state = await screen("complete", sessionA, firstId);
  assert.equal(state.jobs.find(j => j.id === firstId).status, "done"); assertions++;
  assert.equal(state.screen.currentJobId, null); assertions++;
  await screen("complete", sessionA, firstId);

  state = await screen("claim", sessionA, uploaded.job.id);
  assert.equal(state.jobs.find(j => j.id === uploaded.job.id).posterTheme, "kolase", "Screen carries participant theme"); assertions++;
  assert.equal(state.screen.currentJobId, uploaded.job.id); assertions++;
  await sleep(15400);
  state = await api("/api/state");
  assert.equal(state.screen.connected, false, "Expired screen is offline"); assertions++;
  assert.equal(state.jobs.find(j => j.id === uploaded.job.id).status, "ready", "Interrupted participant returns to queue"); assertions++;
  await screen("claim", sessionB, uploaded.job.id);
  await screen("complete", sessionA, uploaded.job.id, 409);
  await screen("release", sessionB);
  state = await api("/api/state");
  assert.equal(state.jobs.find(j => j.id === uploaded.job.id).status, "ready", "Release preserves participant opportunity"); assertions++;

  const backing = process.env.PHOTOBOOTH_TEST_ADAPTER === "sqlite-memory-r2" ? "in-process SQLite + in-memory R2 adapter" : "real local D1/R2";
  for (const style of ["batik", "kebaya-kasual", "retro-festival"]) {
    const form = sample("QA Kolase", randomUUID());
    form.set("portraitStyle", style);
    await api("/api/jobs", { method: "POST", body: form, expected: 400 });
    form.set("posterTheme", "kolase");
    const result = await api("/api/jobs", { method: "POST", body: form, expected: 201 }); created.add(result.job.id);
    assert.equal(result.job.portraitStyle, style); assertions++;
    const retry = await api("/api/jobs", { method: "POST", body: form, expected: 201 });
    assert.equal(retry.job.id, result.job.id); assertions++;
    form.set("portraitStyle", style === "batik" ? "retro-festival" : "batik");
    await api("/api/jobs", { method: "POST", body: form, expected: 409 });
  }
  console.log(`PASS: ${assertions} API and invariant checks; ${backing}, demo mode, no paid AI calls.`);
} finally {
  if (baseline && started) {
    for (const id of created) await api(`/api/jobs/${id}/action`, { method: "POST", body: { action: "skip" } }).catch(() => {});
    await screen("release", sessionA).catch(() => {});
    await screen("release", sessionB).catch(() => {});
    await api("/api/settings", { method: "PATCH", body: baseline.settings }).catch(() => {});
  }
}
