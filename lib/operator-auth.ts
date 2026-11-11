import { env } from "cloudflare:workers";
import { ApiFailure, assertSameOrigin, readJson } from "./photobooth-server";

const COOKIE = "loka_operator";
const SESSION_SECONDS = 8 * 60 * 60;
function db() {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) throw new ApiFailure("Penyimpanan login belum tersedia.", 503);
  return database;
}
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, "0")).join("");
async function digest(value: string) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); }
async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", iterations: 100000, salt: new TextEncoder().encode(salt) }, key, 256));
}
function same(a: string, b: string) {
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return difference === 0;
}
function token(request: Request) { return request.headers.get("cookie")?.split(";").map(p => p.trim()).find(p => p.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? ""; }
function cookie(request: Request, value: string, age: number) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export function localSetupAllowed(request: Request) {
  const url = new URL(request.url);
  return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && request.headers.get("origin") === url.origin;
}
export async function operatorSignedIn(request: Request) {
  const value = token(request);
  if (!/^[a-f0-9]{64}$/.test(value)) return false;
  const row = await db().prepare("SELECT expires_at FROM operator_sessions WHERE token_hash = ?").bind(await digest(value)).first<{ expires_at: number }>();
  return !!row && row.expires_at > Date.now();
}
export async function requireOperator(request: Request) {
  if (!await operatorSignedIn(request)) throw new ApiFailure("Masuk sebagai operator untuk melanjutkan.", 401, "OPERATOR_REQUIRED");
}
export async function authStatus(request: Request) {
  const account = await db().prepare("SELECT id FROM operator_account WHERE id = 1").first();
  return { authenticated: await operatorSignedIn(request), configured: !!account, setupAllowed: !account && ["127.0.0.1", "localhost", "[::1]"].includes(new URL(request.url).hostname) };
}
export async function signIn(request: Request) {
  assertSameOrigin(request);
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new ApiFailure("Buka formulir login dari aplikasi ini.", 403);
  const body = await readJson(request);
  if (typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128) throw new ApiFailure("Gunakan kata sandi 12–128 karakter.");
  const database = db();
  let account = await database.prepare("SELECT * FROM operator_account WHERE id = 1").first<{ salt: string; password_hash: string; failures: number; locked_until: number }>();
  if (!account) {
    if (body.action !== "setup" || !localSetupAllowed(request)) throw new ApiFailure("Operator belum dikonfigurasi. Lakukan penyiapan melalui server lokal.", 403);
    const salt = crypto.randomUUID();
    const hash = await passwordHash(body.password, salt);
    const inserted = await database.prepare("INSERT OR IGNORE INTO operator_account (id, salt, password_hash) VALUES (1, ?, ?)").bind(salt, hash).run();
    if (!inserted.meta.changes) throw new ApiFailure("Akun sudah dibuat. Silakan masuk.", 409);
    account = { salt, password_hash: hash, failures: 0, locked_until: 0 };
  } else {
    if (body.action === "setup") throw new ApiFailure("Akun operator sudah tersedia.", 409);
    if (account.locked_until > Date.now()) throw new ApiFailure("Terlalu banyak percobaan. Coba lagi dalam 15 menit.", 429);
    // Reserve an attempt before hashing so concurrent failures cannot bypass the limit.
    const now = Date.now();
    const reserved = await database.prepare("UPDATE operator_account SET failures = CASE WHEN locked_until > 0 AND locked_until <= ? THEN 1 ELSE failures + 1 END, locked_until = CASE WHEN locked_until > 0 AND locked_until <= ? THEN 0 WHEN failures >= 4 THEN ? ELSE locked_until END WHERE id = 1 AND locked_until <= ? AND (failures < 5 OR locked_until > 0)").bind(now, now, now + 15 * 60 * 1000, now).run();
    if (!reserved.meta.changes) throw new ApiFailure("Terlalu banyak percobaan. Coba lagi nanti.", 429);
    if (!same(await passwordHash(body.password, account.salt), account.password_hash)) {
      await database.prepare("UPDATE operator_account SET locked_until = CASE WHEN failures >= 5 THEN ? ELSE locked_until END WHERE id = 1").bind(Date.now() + 15 * 60 * 1000).run();
      throw new ApiFailure("Kata sandi tidak cocok.", 401);
    }
  }
  await database.prepare("UPDATE operator_account SET failures = 0, locked_until = 0 WHERE id = 1").run();
  await database.prepare("DELETE FROM operator_sessions WHERE expires_at <= ?").bind(Date.now()).run();
  const value = hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  await database.prepare("INSERT INTO operator_sessions (token_hash, expires_at) VALUES (?, ?)").bind(await digest(value), Date.now() + SESSION_SECONDS * 1000).run();
  return cookie(request, value, SESSION_SECONDS);
}
export async function signOut(request: Request) {
  assertSameOrigin(request);
  const value = token(request);
  if (value) await db().prepare("DELETE FROM operator_sessions WHERE token_hash = ?").bind(await digest(value)).run();
  return cookie(request, "", 0);
}
