import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(await readFile(new URL("../drizzle/0001_operator_access.sql", import.meta.url), "utf8"));
class Prepared {
  constructor(sql, params = []) { this.sql = sql; this.params = params; }
  bind(...params) { return new Prepared(this.sql, params); }
  async first() { return sqlite.prepare(this.sql).get(...this.params) ?? null; }
  async run() { return { meta: { changes: Number(sqlite.prepare(this.sql).run(...this.params).changes) } }; }
}
globalThis.__operatorEnv = { DB: { prepare: sql => new Prepared(sql) } };
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText).toString("base64")}`;
const ai = moduleUrl(await readFile(new URL("../lib/ai-provider.ts", import.meta.url), "utf8"));
const chatgpt = moduleUrl(await readFile(new URL("../lib/chatgpt-connection.ts",import.meta.url),"utf8"));
const server = moduleUrl((await readFile(new URL("../lib/photobooth-server.ts", import.meta.url), "utf8")).replace('import { env } from "cloudflare:workers";', 'const env = globalThis.__operatorEnv;').replace('from "./ai-provider";', `from ${JSON.stringify(ai)};`).replace('from "./chatgpt-connection";',`from ${JSON.stringify(chatgpt)};`));
const authUrl = moduleUrl((await readFile(new URL("../lib/operator-auth.ts", import.meta.url), "utf8")).replace('import { env } from "cloudflare:workers";', 'const env = globalThis.__operatorEnv;').replace('from "./photobooth-server";', `from ${JSON.stringify(server)};`));
const auth = await import(authUrl);
const request = (body, origin = "http://localhost", cookie) => new Request(`${origin}/api/operator/session`, { method: "POST", headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const password = "isolated-test-password";
try {
  assert.equal((await auth.authStatus(request({}))).configured, false);
  await assert.rejects(auth.signIn(request({ action: "setup", password }, "https://example.test")), e => e.status === 403);
  const cookie = (await auth.signIn(request({ action: "setup", password }))).split(";")[0];
  assert.equal(await auth.operatorSignedIn(request({}, "http://localhost", cookie)), true);
  await assert.rejects(auth.signIn(request({ action: "setup", password })), e => e.status === 409);
  await assert.rejects(auth.requireOperator(request({})), e => e.status === 401);
  for (const [path, method] of [["state", "GET"], ["settings", "PATCH"], ["jobs/[id]/action", "POST"], ["jobs/[id]", "DELETE"]]) {
    const source = (await readFile(new URL(`../app/api/${path}/route.ts`, import.meta.url), "utf8")).replaceAll('"@/lib/photobooth-server"', JSON.stringify(server)).replaceAll('"@/lib/operator-auth"', JSON.stringify(authUrl));
    const route = await import(moduleUrl(source));
    assert.equal((await route[method](request({}), { params: Promise.resolve({ id: "unused" }) })).status, 401, path);
    if (method === "DELETE") assert.equal((await route.DELETE(new Request("http://localhost/api/jobs/unused", { method, headers: { cookie, origin: "https://other.test" } }), { params: Promise.resolve({ id: "unused" }) })).status, 403);
  }
  await auth.signOut(request({}, "http://localhost", cookie));
  assert.equal(await auth.operatorSignedIn(request({}, "http://localhost", cookie)), false);
  const next = await auth.signIn(request({ password }));
  assert.match(next, /HttpOnly; SameSite=Strict/);
  sqlite.exec("UPDATE operator_sessions SET expires_at = 0");
  assert.equal(await auth.operatorSignedIn(request({}, "http://localhost", next.split(";")[0])), false);
  for (let i = 0; i < 5; i++) await assert.rejects(auth.signIn(request({ password: "incorrect-password" })), e => e.status === 401);
  await assert.rejects(auth.signIn(request({ password })), e => e.status === 429);
  sqlite.exec("UPDATE operator_account SET locked_until = 1");
  await auth.signIn(request({ password }));
  // Even if a request dies after reserving the last attempt, the lock must expire.
  sqlite.exec("UPDATE operator_account SET failures = 4, locked_until = 0");
  const realDerive = crypto.subtle.deriveBits.bind(crypto.subtle);
  crypto.subtle.deriveBits = async () => { throw new Error("interrupted hash"); };
  await assert.rejects(auth.signIn(request({ password })), /interrupted hash/);
  crypto.subtle.deriveBits = realDerive;
  assert.ok(sqlite.prepare("SELECT locked_until FROM operator_account").get().locked_until > Date.now(), "interrupted final attempt must not permanently lock the account");
  console.log("PASS: isolated auth setup, origin boundary, sessions, expiry, logout, protected routes, lockout and interrupted-attempt recovery.");
} finally { sqlite.close(); delete globalThis.__operatorEnv; }
