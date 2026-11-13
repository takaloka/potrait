/**
 * Runs the API contract without a network server. Actual migration SQL and all
 * application SQL execute in node:sqlite; R2 is a small in-memory test adapter.
 * This does not prove Cloudflare connectivity or real R2 behavior.
 */
import { DatabaseSync } from "node:sqlite";
import { readFile, readdir } from "node:fs/promises";
import ts from "typescript";
import sharp from "sharp";

const sqlite = new DatabaseSync(":memory:");
for (const file of (await readdir(new URL("../drizzle/", import.meta.url))).filter(name => name.endsWith(".sql")).sort()) {
  sqlite.exec(await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
}

class Prepared {
  constructor(sql, params = []) { this.sql = sql; this.params = params; }
  bind(...params) { return new Prepared(this.sql, params); }
  async first(column) { const row = sqlite.prepare(this.sql).get(...this.params); return column ? row?.[column] ?? null : row ?? null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.params), success: true, meta: {} }; }
  runSync() { const result = sqlite.prepare(this.sql).run(...this.params); return { results: [], success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; }
  async run() { return this.runSync(); }
}
const DB = {
  prepare: sql => new Prepared(sql),
  async batch(statements) {
    sqlite.exec("BEGIN");
    try { const result = statements.map(statement => statement.runSync()); sqlite.exec("COMMIT"); return result; }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  },
};
const files = new Map();
const BUCKET = {
  async put(key, value, options) {
    const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
    files.set(key, { bytes, httpMetadata: options?.httpMetadata }); return { key };
  },
  async get(key) {
    const object = files.get(key); if (!object) return null;
    return { body: object.bytes, httpMetadata: object.httpMetadata, arrayBuffer: async () => new Uint8Array(object.bytes).buffer };
  },
  async delete(key) { files.delete(key); },
};

const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const dataModule = source => `data:text/javascript;base64,${Buffer.from(compile(source)).toString("base64")}`;
const aiModule = dataModule(await readFile(new URL("../lib/ai-provider.ts", import.meta.url), "utf8"));
const chatgptModule = dataModule(await readFile(new URL("../lib/chatgpt-connection.ts", import.meta.url), "utf8"));
const serverSource = (await readFile(new URL("../lib/photobooth-server.ts", import.meta.url), "utf8"))
  .replace('import { env } from "cloudflare:workers";', "const env = globalThis.__photoboothTestEnvironment;")
  .replace('from "./ai-provider";', `from ${JSON.stringify(aiModule)};`)
  .replace('from "./chatgpt-connection";', `from ${JSON.stringify(chatgptModule)};`);
globalThis.__photoboothTestEnvironment = { DB, BUCKET, ALLOW_DEMO_SAMPLES:"true",UPLOADS_PER_HOUR:"1000",MAX_QUEUED_JOBS:"500",IMAGE_NORMALIZER:{async fetch(request){try{return new Response(await sharp(Buffer.from(await request.arrayBuffer()),{limitInputPixels:25000000,failOn:'warning'}).rotate().jpeg().toBuffer(),{headers:{'Content-Type':'image/jpeg'}});}catch{return new Response(null,{status:422});}}} };
const app = await import(dataModule(serverSource));
const originalFetch = globalThis.fetch;
const oldAdapter = process.env.PHOTOBOOTH_TEST_ADAPTER;
const oldArgument = process.argv[2];
const selectedSuite = oldArgument === "screen-public" ? "./screen-public.mjs" : oldArgument === "persibo-v2" ? "./photobooth-persibo-v2.mjs" : "./photobooth-api.mjs";
let screenRoute;
if (oldArgument === "screen-public") {
  const authSource = (await readFile(new URL("../lib/operator-auth.ts", import.meta.url), "utf8")).replace('import { env } from "cloudflare:workers";', "const env = globalThis.__photoboothTestEnvironment;").replace('from "./photobooth-server";', `from ${JSON.stringify(dataModule(serverSource))};`);
  const source = (await readFile(new URL("../app/api/screen/route.ts", import.meta.url), "utf8")).replaceAll('"@/lib/photobooth-server"', JSON.stringify(dataModule(serverSource))).replaceAll('"@/lib/operator-auth"', JSON.stringify(dataModule(authSource)));
  screenRoute = await import(dataModule(source));
}
process.env.PHOTOBOOTH_TEST_ADAPTER = "sqlite-memory-r2";
process.argv[2] = "http://127.0.0.1:4173";

globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.origin !== "http://127.0.0.1:4173") throw new Error("External network forbidden by test harness");
  const path = url.pathname;
  try {
    if (path === "/api/screen" && screenRoute) return screenRoute[request.method](request);
    if (path === "/api/state" && request.method === "GET") return app.jsonResponse(await app.getState());
    if (path === "/api/jobs" && request.method === "POST") return app.jsonResponse({ job: await app.createJob(request) }, 201);
    if (path === "/api/settings" && request.method === "PATCH") {
      app.assertSameOrigin(request); return app.jsonResponse(await app.updateSettings(await app.readJson(request)));
    }
    if (path === "/api/screen" && request.method === "POST") {
      app.assertSameOrigin(request); return app.jsonResponse(await app.actOnScreen(await app.readJson(request)));
    }
    const action = path.match(/^\/api\/jobs\/([^/]+)\/action$/);
    if (action && request.method === "POST") {
      app.assertSameOrigin(request); return app.jsonResponse({ job: await app.actOnJob(action[1], (await app.readJson(request)).action) });
    }
    const job = path.match(/^\/api\/jobs\/([^/]+)$/);
    if (job && request.method === "GET") return app.jsonResponse(await app.getJob(job[1]));
    const media = path.match(/^\/api\/media\/([^/]+)$/);
    if (media && request.method === "GET") return app.getMedia(media[1]);
    return Response.json({ error: "No test route" }, { status: 404 });
  } catch (error) { return app.apiError(error); }
};

try {
  if (oldArgument === "display-settings") {
    const { default: assert } = await import('node:assert/strict');
    assert.equal((await app.getState()).settings.replayLimit, 10);
    assert.equal((await app.getState()).settings.screenRotation, 0);
    await app.updateSettings({replayLimit: 2, screenRotation: 90, durationSeconds: 5});
    for (const invalid of [{replayLimit:0},{replayLimit:1001},{replayLimit:1.5},{replayLimit:'10'},{screenRotation:180},{screenRotation:'90'}]) {
      await assert.rejects(app.updateSettings({...invalid, durationSeconds:30}));
      assert.equal((await app.getState()).settings.durationSeconds, 5);
    }
    const ids = Array.from({length:4}, () => crypto.randomUUID());
    ids.forEach((id,i) => sqlite.prepare("INSERT INTO photobooth_jobs(id,request_id,fingerprint,name,status,mode,original_url,result_url,created_at,queued_at,ready_at,completed_at) VALUES(?,?,?,?,?,'demo','/sample.jpg','/result.jpg',?,?,?,?)").run(id,id,id,'Test',i===0?'ready':'done',i+1,i+1,i+1,i+1));
    const sessionId = crypto.randomUUID();
    let state = await app.actOnScreen({sessionId,action:'claim'});
    assert.equal(state.screen.currentJobId,ids[0],'unseen old photo takes priority over newest repeats');
    const advance = async () => {
      sqlite.exec('UPDATE photobooth_screen SET ends_at=0');
      const next = app.screenPresentation(await app.getState(false,true),sessionId);
      return app.actOnScreen({sessionId,action:'claim',jobId:next.nextJobId});
    };
    const seen=[];
    for(let i=0;i<6;i++) seen.push((await advance()).screen.currentJobId);
    assert.deepEqual(seen,[ids[2],ids[3],ids[2],ids[3],ids[2],ids[3]],'repeat only newest two, including active participant');
    await app.updateSettings({replayLimit:1,screenRotation:270});
    assert.equal(app.screenPresentation(await app.getState(false,true),sessionId).nextJobId,null,'single newest portrait stays visible');
    assert.equal((await app.getState()).jobs.length,4,'window does not delete photos');
    console.log('PASS display settings: validation, atomic saves, FIFO priority, bounded replay and one-photo hold.');
  } else if (oldArgument === "theme-policy") {
    const { default: assert } = await import('node:assert/strict');
    const original = (await app.getState()).settings.themePolicy;
    assert.deepEqual(original, {enabled: ['nusantara', 'kolase', 'bojonegoro-doelo'], defaultTheme: 'nusantara'});
    const submit = (theme, requestId = crypto.randomUUID()) => {
      const body = new FormData();
      body.set('name', 'Theme test'); body.set('sample', 'true'); body.set('requestId', requestId);
      if (theme) body.set('posterTheme', theme);
      return app.createJob(new Request('http://127.0.0.1:4173/api/jobs', {method:'POST', body}));
    };
    const retryId = crypto.randomUUID();
    const old = await submit('nusantara', retryId);
    const policy = {enabled:['bojonegoro-doelo'], defaultTheme:'bojonegoro-doelo'};
    await app.updateSettings({themePolicy:policy});
    assert.deepEqual((await app.getState()).settings.themePolicy, policy);
    assert.equal((await submit('nusantara', retryId)).id, old.id, 'existing retries survive locking');
    for (const theme of ['nusantara','kolase',null]) await assert.rejects(submit(theme), e => e.code === 'THEME_UNAVAILABLE');
    assert.equal((await submit('bojonegoro-doelo')).posterTheme, 'bojonegoro-doelo');
    for (const invalid of [null, {}, {enabled:[],defaultTheme:'nusantara'}, {enabled:['unknown'],defaultTheme:'unknown'}, {enabled:['kolase'],defaultTheme:'nusantara'}, {enabled:['kolase','kolase'],defaultTheme:'kolase'}]) {
      await assert.rejects(app.updateSettings({themePolicy:invalid}));
      assert.deepEqual((await app.getState()).settings.themePolicy, policy, 'invalid update is atomic');
    }
    // Operator locking a theme while its photo is normalized must win admission.
    await app.updateSettings({themePolicy:original});
    const put = BUCKET.put;
    BUCKET.put = async (...args) => { await put(...args); await app.updateSettings({themePolicy:policy}); };
    const body = new FormData();
    body.set('name','Race'); body.set('consent','true'); body.set('requestId',crypto.randomUUID()); body.set('posterTheme','kolase');
    body.set('image',new Blob([await sharp({create:{width:20,height:20,channels:3,background:'white'}}).png().toBuffer()],{type:'image/png'}),'photo.png');
    await assert.rejects(app.createJob(new Request('http://127.0.0.1:4173/api/jobs',{method:'POST',body})), e => e.code === 'THEME_UNAVAILABLE');
    assert.equal(files.size,0,'rejected racing upload is cleaned up');
    BUCKET.put = put;
    console.log('PASS theme policy: persistence, validation, locks, legacy retries and atomic admission.');
  } else if (oldArgument === "chatgpt") {
    const { default: assert } = await import("node:assert/strict");
    const authSource = (await readFile(new URL("../lib/operator-auth.ts", import.meta.url), "utf8")).replace('import { env } from "cloudflare:workers";', "const env = globalThis.__photoboothTestEnvironment;").replace('from "./photobooth-server";', `from ${JSON.stringify(dataModule(serverSource))};`);
    const routeSource = (await readFile(new URL("../app/api/operator/chatgpt/route.ts", import.meta.url), "utf8")).replaceAll('"@/lib/photobooth-server"', JSON.stringify(dataModule(serverSource))).replaceAll('"@/lib/operator-auth"', JSON.stringify(dataModule(authSource)));
    const route = await import(dataModule(routeSource));
    const endpoint = "http://127.0.0.1:4173/api/operator/chatgpt";
    assert.equal((await route.GET(new Request(endpoint))).status, 401);
    assert.equal((await route.POST(new Request(endpoint, { method: "POST", body: '{"action":"connect"}' }))).status, 401);
    const cookie = 'a'.repeat(64), tokenHash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cookie))).toString('hex');
    sqlite.prepare("INSERT INTO operator_sessions (token_hash, expires_at) VALUES (?, ?)").run(tokenHash, Date.now() + 60000);
    const headers = { Cookie: `loka_operator=${cookie}`, Origin: "http://127.0.0.1:4173" };
    assert.equal((await route.POST(new Request(endpoint, { method: "POST", headers: { ...headers, Origin: "https://other.example" }, body: '{"action":"connect"}' }))).status, 403);
    globalThis.fetch = async () => Response.json({ device_auth_id: "private-device", user_code: "TEST-CODE", interval: "5" });
    const login = await route.POST(new Request(endpoint, { method: "POST", headers, body: '{"action":"connect"}' }));
    assert.equal(login.status, 200);
    const device = await login.json();
    assert.equal(device.pending.userCode, "TEST-CODE");
    assert.doesNotMatch(JSON.stringify(device), /device_auth_id|private-device|verifier|access_token/);
    const connection = app.chatgptConnection();
    await connection.begin("http://127.0.0.1:4173");
    assert.equal((await app.getEventConfig()).mode, "live");
    assert.equal((await app.getEventConfig()).aiConfigured, false);
    const photo = await readFile(new URL("../public/samples/before.jpg", import.meta.url));
    const makeRequest = requestId => {
      const body = new FormData(); body.set("consent", "true"); body.set("name", "Portrait test"); body.set("requestId", requestId); body.set("portraitStyle", "beskap");
      body.set("image", new Blob([photo], { type: "image/jpeg" }), "photo.jpg");
      return new Request("http://127.0.0.1:4173/api/jobs", { method: "POST", body });
    };
    await assert.rejects(app.createJob(makeRequest(crypto.randomUUID())), e => e.code === "AI_NOT_CONFIGURED");
    sqlite.prepare("UPDATE chatgpt_connection SET session_json = ?").run(JSON.stringify({ method: "codex", access_token: "test-access", client_id: "test-client", expires_at: Date.now() + 3600000, scopes: ["openid"], model: "gpt-image-2", verified: false }));
    assert.equal((await app.getEventConfig()).aiConfigured, true, "Codex does not require subscription sharing scopes");
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "https://chatgpt.com/backend-api/codex/images/edits");
      assert.match(init.body.get("prompt"), /Javanese beskap/);
      calls++;
      return Response.json({ data: [{ b64_json: photo.toString("base64") }] });
    };
    const requestId = crypto.randomUUID(), job = await app.createJob(makeRequest(requestId));
    assert.equal(job.mode, "live");
    assert.equal(sqlite.prepare("SELECT ai_provider FROM photobooth_jobs WHERE id = ?").get(job.id).ai_provider, "chatgpt");
    await Promise.all([app.processJobs(), app.processJobs()]);
    const result = (await app.getState()).jobs.find(row => row.id === job.id);
    assert.equal(result.status, "ready"); assert.notEqual(result.resultUrl, result.originalUrl);
    assert.deepEqual(files.get(result.resultUrl.split("/").at(-1)).bytes, new Uint8Array(photo));
    assert.equal((await app.createJob(makeRequest(requestId))).id, job.id);
    await app.getState(); assert.equal(calls, 1, "concurrent polling and duplicate submission generate once");
    sqlite.exec("UPDATE chatgpt_connection SET session_json = json_set(session_json, '$.imageUnsupported', json('true'))");
    assert.equal((await app.getEventConfig()).aiConfigured, false, "provider capability denial blocks new uploads despite a listed model");
    await assert.rejects(app.createJob(makeRequest(crypto.randomUUID())), e => e.code === "AI_NOT_CONFIGURED");
    await connection.disconnect();
    assert.equal((await app.getEventConfig()).aiConfigured, false);
    assert.equal((await app.getEventConfig()).mode, "live");
    assert.equal((await app.getState()).jobs.find(row => row.id === job.id).resultUrl, result.resultUrl);
    console.log("PASS ChatGPT pipeline: disconnected uploads blocked, provider persisted, one generation under concurrent polling, stored result reused, no original-photo fallback (mocked provider).");
  } else if (oldArgument === "styles") {
    const { default: assert } = await import("node:assert/strict");
    const photo = await readFile(new URL("../public/samples/before.jpg", import.meta.url));
    const request = (style, requestId = crypto.randomUUID(), theme = "nusantara") => {
      const form = new FormData(); form.set("consent", "true"); form.set("name", "Style test"); form.set("requestId", requestId);
      if (style !== undefined) form.set("portraitStyle", style);
      form.set("posterTheme", theme);
      form.set("image", new Blob([photo], { type: "image/jpeg" }), "test.jpg");
      return new Request("http://127.0.0.1:4173/api/jobs", { method: "POST", body: form });
    };
    await assert.rejects(app.createJob(request("unknown")), e => e.code === "INVALID_PORTRAIT_STYLE");
    const legacy = await app.createJob(request(undefined)); assert.equal(legacy.portraitStyle, "legacy");
    const adapterFetch = globalThis.fetch, submitted = [];
    Object.assign(globalThis.__photoboothTestEnvironment, { AI_MODE: "live", BFL_API_KEY: "isolated-test-only" });
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "https://api.bfl.ai/v1/flux-2-pro");
      submitted.push(JSON.parse(init.body));
      return Response.json({ id: crypto.randomUUID(), polling_url: "https://api.bfl.ai/v1/get_result?id=fixture" });
    };
    try {
      for (const [style, prompt] of [["beskap", /Javanese beskap/], ["kebaya", /Indonesian kebaya/], ["jas", /waistcoat/]]) {
        const requestId = crypto.randomUUID(), job = await app.createJob(request(style, requestId));
        assert.equal(job.portraitStyle, style);
        assert.equal((await app.createJob(request(style, requestId))).id, job.id, "duplicate submit reuses job");
        await assert.rejects(app.createJob(request(style === "beskap" ? "kebaya" : "beskap", requestId)), e => e.code === "REQUEST_CONFLICT");
        await app.processJobs();
        assert.match(submitted.at(-1).prompt, prompt, "saved style reaches provider");
        const count = submitted.length;
        await app.getState(); assert.equal(submitted.length, count, "polling does not resubmit generation");
        sqlite.prepare("UPDATE photobooth_jobs SET status = 'failed' WHERE id = ?").run(job.id);
        assert.equal((await app.actOnJob(job.id, "retry")).portraitStyle, style);
        sqlite.prepare("UPDATE photobooth_jobs SET status = 'failed' WHERE id = ?").run(job.id);
      }
      assert.equal(submitted.length, 3);
      const doeloRequestId = crypto.randomUUID();
      const doelo = await app.createJob(request("beskap", doeloRequestId, "bojonegoro-doelo"));
      assert.equal(doelo.posterTheme, "bojonegoro-doelo");
      assert.equal((await app.createJob(request("beskap", doeloRequestId, "bojonegoro-doelo"))).id, doelo.id);
      await assert.rejects(app.createJob(request("beskap", doeloRequestId, "nusantara")), e => e.code === "REQUEST_CONFLICT");
      await app.processJobs();
      assert.match(submitted.at(-1).prompt, /Bojonegoro Doelo/);
      assert.match(submitted.at(-1).prompt, /plain uncarved wooden studio chair/);
      assert.equal(await app.getJobTheme(doelo.id), "bojonegoro-doelo");
      await assert.rejects(app.createJob(request("batik", crypto.randomUUID(), "bojonegoro-doelo")), e => e.code === "INVALID_PORTRAIT_STYLE");
      console.log("PASS Bojonegoro theme: API persistence, duplicate reuse, cross-theme conflict, provider prompt, result theme and clothing restrictions.");
      console.log("PASS: style validation/storage/provider dispatch, legacy record support, style-aware idempotency, retry persistence and no generation resubmission on poll (SQLite/R2 and mocked BFL).");
    } finally { globalThis.fetch = adapterFetch; }
  } else if (oldArgument === "slideshow") {
    const { default: assert } = await import("node:assert/strict");
    const realNow = Date.now;
    let now = realNow();
    Date.now = () => now;
    try {
      assert.equal((await app.getState()).settings.durationSeconds, 10);
      const seed = (name, status = "done") => {
        const id = crypto.randomUUID();
        sqlite.prepare("INSERT INTO photobooth_jobs (id, request_id, fingerprint, name, status, mode, is_sample, original_url, result_url, created_at, queued_at, ready_at, displayed_at, completed_at) VALUES (?, ?, 'loop', ?, ?, 'demo', 1, '/samples/before.jpg', '/samples/persibo-player-v2.png', ?, ?, ?, ?, ?)").run(id, crypto.randomUUID(), name, status, now, now, now, status === "done" ? now : null, status === "done" ? now : null);
        now += 1; return id;
      };
      const a = seed("A"), b = seed("B"), sessionId = crypto.randomUUID();
      const act = (action, jobId) => app.actOnScreen({ sessionId, action, ...(jobId ? { jobId } : {}) });
      let state = await act("heartbeat");
      const next = () => app.screenPresentation(state, sessionId).nextJobId;
      assert.equal(next(), a);
      state = await act("claim", a);
      assert.equal(state.screen.currentJobId, a);
      assert.equal(state.screen.endsAt, now + 10000);
      assert.equal((await act("claim", b)).screen.currentJobId, a, "do not replace before duration");
      now += 10001;
      state = await act("claim", b);
      assert.equal(state.screen.currentJobId, b);
      assert.equal(next(), a, "finished portraits return to rotation");
      now += 10001; state = await act("claim", a);
      assert.equal(state.screen.currentJobId, a, "A → B → A loop");
      const fresh = seed("New upload", "ready");
      state = await act("heartbeat"); assert.equal(next(), fresh, "new uploads before repeats");
      assert.equal((await act("claim", fresh)).screen.currentJobId, a);
      now += 10001; state = await act("claim", fresh);
      assert.equal(state.screen.currentJobId, fresh);
      assert.equal(state.jobs.filter(j => j.status === "displaying").length, 1);
      now += 3000; await app.updateSettings({ paused: true });
      now += 5000; state = await act("heartbeat");
      assert.equal((await act("claim", b)).screen.currentJobId, fresh, "pause stops loop");
      state = await app.updateSettings({ paused: false });
      assert.equal(state.screen.endsAt, now + 7000);
      now += 7001; state = await act("claim", b);
      assert.equal(state.screen.currentJobId, b);
      await app.actOnJob(a, "skip");
      state = await act("heartbeat"); assert.equal(next(), fresh, "skipped excluded");
      await app.deleteJob(fresh);
      state = await act("heartbeat"); assert.equal(next(), null);
      now += 10001; state = await act("claim", b);
      assert.equal(state.screen.currentJobId, b, "only one photo stays visible");
      assert.equal(state.jobs.filter(j => j.status === "displaying").length, 1);
      const again = seed("Next", "ready");
      state = await act("claim", again); assert.equal(state.screen.currentJobId, again);
      const stale = await act("claim", again); assert.equal(stale.screen.startedAt, state.screen.startedAt, "duplicate claim does not reset timer");
      await assert.rejects(app.actOnScreen({ sessionId: crypto.randomUUID(), action: "claim", jobId: b }), e => e.code === "SCREEN_BUSY");
      sqlite.exec("UPDATE photobooth_settings SET duration_seconds = 0; UPDATE photobooth_screen SET ends_at = NULL");
      state = await act("heartbeat");
      assert.equal(state.settings.durationSeconds, 10); assert.equal(state.screen.endsAt, now + 10000, "old hold-mode data gets a loop timer");
      console.log("PASS slideshow: A→B→A, 10s guard, new-upload priority, pause/resume, skip/delete exclusion, single-photo hold, duplicate claim, lease and legacy timer upgrade (isolated SQLite).");
    } finally { Date.now = realNow; }
  } else if (oldArgument === "delete") {
    const { default: assert } = await import("node:assert/strict");
    await app.getState();
    const seed = (status, originalKey = null, resultUrl = "/samples/persibo-player-v2.png") => {
      const id = crypto.randomUUID();
      sqlite.prepare("INSERT INTO photobooth_jobs (id, request_id, fingerprint, name, status, mode, is_sample, original_key, original_url, result_url, created_at, queued_at) VALUES (?, ?, 'test', 'Delete fixture', ?, 'demo', 0, ?, '/test.png', ?, ?, ?)").run(id, crypto.randomUUID(), status, originalKey, resultUrl, Date.now(), Date.now());
      return id;
    };
    for (const status of ["queued", "processing", "ready", "done", "failed", "skipped"]) {
      const original = `${crypto.randomUUID()}-original.png`, result = `${crypto.randomUUID()}-result.png`;
      files.set(original, {}); files.set(result, {});
      const id = seed(status, original, `/api/media/${result}`);
      assert.deepEqual(await app.deleteJob(id), { deleted: true, mediaDeleted: true });
      assert.equal(files.has(original), false); assert.equal(files.has(result), false);
      await assert.rejects(app.getJob(id), e => e.status === 404);
      await assert.rejects(app.deleteJob(id), e => e.status === 404);
    }
    const displaying = seed("displaying");
    await assert.rejects(app.deleteJob(displaying), e => e.status === 409);
    const referenced = seed("ready");
    sqlite.prepare("UPDATE photobooth_screen SET current_job_id = ? WHERE id = 1").run(referenced);
    await assert.rejects(app.deleteJob(referenced), e => e.status === 409);
    sqlite.exec("UPDATE photobooth_screen SET current_job_id = NULL");
    const shared = "/samples/persibo-player-v2.png";
    files.set(shared, {});
    await app.deleteJob(seed("done"));
    assert.equal(files.has(shared), true);
    await assert.rejects(app.deleteJob("invalid"), e => e.status === 400);
    const remove = BUCKET.delete;
    BUCKET.delete = async () => { throw new Error("storage unavailable"); };
    assert.equal((await app.deleteJob(seed("done", `${crypto.randomUUID()}-original.png`))).mediaDeleted, false);
    BUCKET.delete = remove;
    console.log("PASS deletion: six removable states, original/result cleanup, shared sample retained, missing/invalid IDs, active screen guard, storage-failure reporting (isolated SQLite/R2).");
  } else await import(selectedSuite);
}
finally {
  globalThis.fetch = originalFetch;
  delete globalThis.__photoboothTestEnvironment;
  if (oldAdapter === undefined) delete process.env.PHOTOBOOTH_TEST_ADAPTER; else process.env.PHOTOBOOTH_TEST_ADAPTER = oldAdapter;
  process.argv[2] = oldArgument;
  sqlite.close();
}
