// Server-only OAuth session. Never return stored records or provider bodies to clients.
const AUTH = "https://auth.openai.com";
const API = "https://api.openai.com/v1";
// Codex device OAuth and image route from the installed OpenCode provider.
const CODEX_API = "https://chatgpt.com/backend-api/codex";
const CODEX_CLIENT = "app_EMoamEEZ73f0CkXaXp7hrann";
const SCOPE = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
// Documented image_generation tool support, checked 10 Nov 2026:
// https://developers.openai.com/api/docs/guides/tools-image-generation
const IMAGE_TOOL_MODELS = ["gpt-6-astra", "gpt-6-sol", "gpt-6.1-sol", "gpt-6.1-terra", "gpt-6-luna", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.2"];
type Session = { access_token: string; refresh_token?: string; client_id: string; expires_at: number; scopes: string[]; model: string | null; verified: boolean; availableModels?: string[]; imageUnsupported?: boolean; method?: "codex"; accountId?: string };
type Pending = { state: string; nonce: string; verifier: string; browserHash: string; redirect: string; expires: number; client: string };
type DevicePending = { kind: "codex"; deviceId: string; userCode: string; interval: number; nextPoll: number; expires: number };
type RecordRow = { host_id: string; selected: number; revision: number; session_json: string | null; pending_json: string | null };
const encode = (bytes: Uint8Array) => btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join("")).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const random = () => encode(crypto.getRandomValues(new Uint8Array(32)));
const hash = async (value: string) => encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
function decode(value: string) { return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)); }
function codexAccount(token?: string): string | undefined {
  try {
    if (!token) return;
    const claims = JSON.parse(new TextDecoder().decode(decode(token.split(".")[1]))) as { chatgpt_account_id?: string; "https://api.openai.com/auth"?: { chatgpt_account_id?: string }; organizations?: { id?: string }[] };
    const id = claims.chatgpt_account_id || claims["https://api.openai.com/auth"]?.chatgpt_account_id || claims.organizations?.[0]?.id;
    return typeof id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(id) ? id : undefined;
  } catch { return; }
}
function photoBase64(bytes: Uint8Array) {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) parts.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return btoa(parts.join(""));
}
function session(row: RecordRow): Session | null { return row.session_json ? JSON.parse(row.session_json) : null; }
export class ChatgptError extends Error { constructor(message: string, public readonly transient = false) { super(message); this.name = "ChatgptError"; } }
export type CodexBackendEnvironment = { CODEX_BACKEND_URL?: string; CODEX_BACKEND_KEY?: string };

type ImageResponse = { output?: { type?: string; status?: string; result?: string }[]; error?: { code?: string }; status?: string };
function responseImage(response?: ImageResponse) {
  if (response?.error?.code === "subscription_sharing_usage_limit_exceeded") throw new ChatgptError("Kuota ChatGPT untuk aplikasi habis. Periksa Manage usage di ChatGPT.");
  if (response?.error || response?.status === "failed" || response?.status === "incomplete") throw new ChatgptError("ChatGPT belum berhasil membuat gambar melalui koneksi ini. Periksa akses dan penggunaan di operator.");
  return response?.output?.find(item => item.type === "image_generation_call" && item.status === "completed")?.result;
}
async function readResponseImage(response: Response, codex = false): Promise<string | undefined> {
  if (!response.headers.get("Content-Type")?.includes("text/event-stream")) return codex ? (await response.json() as { data?: { b64_json?: string }[] }).data?.[0]?.b64_json : responseImage(await response.json() as ImageResponse);
  const reader = response.body?.getReader();
  if (!reader) throw new ChatgptError("Respons gambar ChatGPT kosong.");
  const decoder = new TextDecoder();
  let buffer = "", total = 0, completed = false, image: string | undefined;
  function event(block: string) {
    const data = block.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    const value = JSON.parse(data) as { type?: string; response?: ImageResponse; error?: { code?: string }; code?: string; b64_json?: string };
    const type = value.type || block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
    if (type === "response.failed" || type === "response.incomplete" || type === "error") {
      responseImage(value.response || { error: value.error || { code: value.code } });
      throw new ChatgptError("Generasi gambar ChatGPT gagal. Periksa akses di operator.");
    }
    if (type === "response.completed") { image = responseImage(value.response); completed = true; }
    if (codex && (type === "image_edit.completed" || type === "image_generation.completed")) { image = value.b64_json; completed = true; }
  }
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > 64 * 1024 * 1024) throw new ChatgptError("Respons gambar ChatGPT melebihi batas ukuran.");
      buffer += decoder.decode(chunk.value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/); buffer = blocks.pop() || "";
      for (const block of blocks) event(block);
      if (buffer.length > 24 * 1024 * 1024) throw new ChatgptError("Data gambar ChatGPT melebihi batas ukuran.");
    }
    buffer += decoder.decode();
    if (buffer.trim()) event(buffer);
    if (!completed) throw new ChatgptError("Aliran gambar ChatGPT terputus. Periksa penggunaan sebelum mencoba ulang.");
    return image;
  } catch (error) {
    if (error instanceof ChatgptError) throw error;
    throw new ChatgptError("Respons gambar ChatGPT terputus atau tidak terbaca. Periksa penggunaan sebelum mencoba ulang.");
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

async function providerError(response: Response): Promise<never> {
  const body = await response.json().catch(() => ({})) as { error?: { code?: string } };
  if (body.error?.code === "subscription_sharing_usage_limit_exceeded" || response.status === 429) throw new ChatgptError("Kuota atau batas permintaan ChatGPT tercapai. Periksa Manage usage di ChatGPT.");
  if (response.status === 401) throw new ChatgptError("Sesi ChatGPT tidak valid. Hubungkan ulang melalui operator.");
  if (response.status === 403 || response.status === 400) throw new ChatgptError("Koneksi ChatGPT belum mendapat akses untuk permintaan ini. Akses gambar dengan kuota langganan belum terkonfirmasi.");
  throw new ChatgptError("ChatGPT belum dapat memproses permintaan. Periksa koneksi melalui operator.");
}

async function verifyIdentity(jwt: string, audience: string, nonce: string) {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new ChatgptError("Identitas ChatGPT tidak valid.");
  const header = JSON.parse(new TextDecoder().decode(decode(parts[0]))) as { alg?: string; kid?: string };
  if (header.alg !== "RS256" || !header.kid) throw new ChatgptError("Tanda tangan identitas ChatGPT tidak didukung.");
  const response = await fetch(`${AUTH}/.well-known/jwks.json`, { redirect: "manual", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new ChatgptError("Identitas ChatGPT belum dapat diverifikasi.");
  const keys = await response.json() as { keys: (JsonWebKey & { kid?: string })[] };
  const jwk = keys.keys.find(key => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) throw new ChatgptError("Kunci identitas ChatGPT tidak ditemukan.");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))) throw new ChatgptError("Tanda tangan ChatGPT tidak cocok.");
  const claims = JSON.parse(new TextDecoder().decode(decode(parts[1]))) as { iss?: string; aud?: string | string[]; nonce?: string; exp?: number; iat?: number; sub?: string };
  const now = Date.now() / 1000;
  if (claims.iss !== AUTH || !(Array.isArray(claims.aud) ? claims.aud.includes(audience) : claims.aud === audience) || claims.nonce !== nonce || !claims.sub || !claims.exp || claims.exp <= now || !claims.iat || claims.iat > now + 5) throw new ChatgptError("Identitas atau masa berlaku ChatGPT tidak cocok.");
}

export class ChatgptConnection {
  constructor(private db: D1Database, private backend: CodexBackendEnvironment = {}) {}
  private async row(): Promise<RecordRow> {
    await this.db.prepare("INSERT OR IGNORE INTO chatgpt_connection (id, host_id) VALUES (1, ?)").bind(`urn:uuid:${crypto.randomUUID()}`).run();
    return (await this.db.prepare("SELECT * FROM chatgpt_connection WHERE id = 1").first<RecordRow>())!;
  }
  async status() {
    const row = await this.row(), current = session(row);
    const pending = row.pending_json ? JSON.parse(row.pending_json) as Partial<DevicePending> : null;
    return { selected: !!row.selected, connected: !!current?.access_token, method: current?.method ?? "subscription-sharing", sharing: current?.scopes.includes("chatgpt.tokens.use.direct") ?? false, model: current?.model ?? null, verified: current?.verified ?? false, availableModels: current?.availableModels ?? [], imageUnsupported: current?.imageUnsupported ?? false,
      pending: pending?.kind === "codex" && pending.userCode && pending.expires! > Date.now() ? { url: `${AUTH}/codex/device`, userCode: pending.userCode, expiresAt: pending.expires!, pollAfter: Math.max(1000, pending.nextPoll! - Date.now()) } : null };
  }
  async beginCodex() {
    await this.row();
    // Reserve a new revision before I/O: cancellation or a newer start wins.
    const row = (await this.db.prepare("UPDATE chatgpt_connection SET selected = 1, pending_json = NULL, revision = revision + 1 WHERE id = 1 RETURNING revision").first<{ revision: number }>())!;
    const response = await fetch(`${AUTH}/api/accounts/deviceauth/usercode`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: CODEX_CLIENT }), redirect: "manual", signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new ChatgptError("Kode login Codex belum tersedia. Periksa apakah device login diizinkan pada akun ChatGPT.");
    const body = await response.json() as { device_auth_id?: string; user_code?: string; interval?: string | number; expires_in?: number };
    if (typeof body.device_auth_id !== "string" || !body.device_auth_id || typeof body.user_code !== "string" || !/^[A-Za-z0-9-]{4,32}$/.test(body.user_code)) throw new ChatgptError("Respons kode login Codex tidak valid.");
    const seconds = Number(body.interval ?? 5), lifetime = Number(body.expires_in ?? 900);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 900 || !Number.isFinite(lifetime) || lifetime <= 0) throw new ChatgptError("Masa berlaku kode Codex tidak valid.");
    const interval = Math.max(5, seconds) * 1000 + 3000;
    const pending: DevicePending = { kind: "codex", deviceId: body.device_auth_id, userCode: body.user_code, interval, nextPoll: Date.now() + interval, expires: Date.now() + Math.min(lifetime, 900) * 1000 };
    const saved = await this.db.prepare("UPDATE chatgpt_connection SET pending_json = ? WHERE id = 1 AND revision = ? AND pending_json IS NULL").bind(JSON.stringify(pending), row.revision).run();
    if (!saved.meta.changes) throw new ChatgptError("Koneksi berubah saat meminta kode. Hubungkan ulang.");
    return this.status();
  }
  async cancelCodex() {
    await this.db.prepare("UPDATE chatgpt_connection SET pending_json = NULL, revision = revision + 1 WHERE id = 1").run();
    return this.status();
  }
  async pollCodex() {
    const row = await this.row();
    const pending = row.pending_json ? JSON.parse(row.pending_json) as DevicePending : null;
    if (pending?.kind !== "codex") return this.status();
    if (pending.expires <= Date.now()) {
      await this.db.prepare("UPDATE chatgpt_connection SET pending_json = NULL WHERE id = 1 AND pending_json = ?").bind(row.pending_json).run();
      throw new ChatgptError("Kode login Codex kedaluwarsa. Hubungkan ulang.");
    }
    if (pending.nextPoll > Date.now()) return this.status();
    // Atomic reservation prevents concurrent tabs polling the same device grant.
    const reserved = JSON.stringify({ ...pending, nextPoll: Date.now() + Math.max(pending.interval, 25000) });
    const locked = await this.db.prepare("UPDATE chatgpt_connection SET pending_json = ? WHERE id = 1 AND pending_json = ? AND revision = ?").bind(reserved, row.pending_json, row.revision).run();
    if (!locked.meta.changes) return this.status();
    const response = await fetch(`${AUTH}/api/accounts/deviceauth/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device_auth_id: pending.deviceId, user_code: pending.userCode }), redirect: "manual", signal: AbortSignal.timeout(20000) });
    if (response.status === 403 || response.status === 404 || response.status === 429) {
      const retry = Number(response.headers.get("Retry-After"));
      const delay = response.status === 429 ? Math.max(pending.interval + 5000, Number.isFinite(retry) ? Math.min(retry * 1000, 900000) : 0) : pending.interval;
      await this.db.prepare("UPDATE chatgpt_connection SET pending_json = ? WHERE id = 1 AND pending_json = ? AND revision = ?").bind(JSON.stringify({ ...pending, interval: delay, nextPoll: Date.now() + delay }), reserved, row.revision).run();
      return this.status();
    }
    if (!response.ok) {
      await this.db.prepare("UPDATE chatgpt_connection SET pending_json = NULL WHERE id = 1 AND pending_json = ?").bind(reserved).run();
      throw new ChatgptError("Login Codex ditolak atau kedaluwarsa. Hubungkan ulang.");
    }
    const body = await response.json() as { authorization_code?: string; code_verifier?: string };
    if (!body.authorization_code || !body.code_verifier) throw new ChatgptError("Respons login Codex tidak lengkap.");
    const claimed = await this.db.prepare("UPDATE chatgpt_connection SET pending_json = NULL WHERE id = 1 AND pending_json = ? AND revision = ?").bind(reserved, row.revision).run();
    if (!claimed.meta.changes) throw new ChatgptError("Koneksi berubah atau login dibatalkan.");
    const tokens = await this.tokens(new URLSearchParams({ grant_type: "authorization_code", code: body.authorization_code, code_verifier: body.code_verifier, client_id: CODEX_CLIENT, redirect_uri: `${AUTH}/deviceauth/callback` }), true);
    // As in OpenCode, account routing metadata comes from the token response
    // received directly over TLS. This is not used as local operator identity.
    const accountId = codexAccount(tokens.id_token) || codexAccount(tokens.access_token);
    const next: Session = { method: "codex", accountId, access_token: tokens.access_token!, refresh_token: tokens.refresh_token, client_id: CODEX_CLIENT, expires_at: Date.now() + Number(tokens.expires_in || 3600) * 1000, scopes: (tokens.scope || "openid profile email offline_access").split(/\s+/), model: "gpt-image-2", verified: false };
    const saved = await this.db.prepare("UPDATE chatgpt_connection SET session_json = ? WHERE id = 1 AND pending_json IS NULL AND revision = ?").bind(JSON.stringify(next), row.revision).run();
    if (!saved.meta.changes) throw new ChatgptError("Koneksi berubah saat login. Hubungkan ulang.");
    return this.status();
  }
  async begin(origin: string) {
    const base = new URL(origin);
    if (base.protocol !== "https:" && !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) throw new ChatgptError("Koneksi ChatGPT membutuhkan HTTPS atau localhost.");
    const row = await this.row();
    const browserToken = random();
    const pending: Pending = { state: random(), nonce: random(), verifier: random(), browserHash: await hash(browserToken), redirect: `${base.origin}/auth/callback`, expires: Date.now() + 300000, client: session(row)?.client_id || "dynamic_agent_client" };
    await this.db.prepare("UPDATE chatgpt_connection SET selected = 1, revision = revision + 1, pending_json = ? WHERE id = 1").bind(JSON.stringify(pending)).run();
    const params = new URLSearchParams({ client_id: pending.client, response_type: "code", redirect_uri: pending.redirect, scope: SCOPE, resource: API, state: pending.state, nonce: pending.nonce, code_challenge_method: "S256", code_challenge: await hash(pending.verifier), ext_agent_host_id: row.host_id });
    if (pending.client === "dynamic_agent_client") params.set("agent_name_hint", "Loka Portrait");
    return { url: `${AUTH}/api/accounts/authorize?${params}`, browserToken };
  }
  private async tokens(body: URLSearchParams, codex = false) {
    // workerd supports follow/manual only. Every caller rejects non-2xx responses,
    // so manual also prevents forwarding credentials through provider redirects.
    const response = await fetch(`${AUTH}${codex ? "/oauth/token" : "/api/accounts/oauth/token"}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body, redirect: "manual", signal: AbortSignal.timeout(20000) });
    if (!response.ok) await providerError(response);
    const tokens = await response.json() as { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number; scope?: string };
    if (!tokens.access_token) throw new ChatgptError("Login ChatGPT tidak mengembalikan akses.");
    return tokens;
  }
  async complete(url: URL, browserToken: string) {
    const row = await this.row();
    const pending: Pending | null = row.pending_json ? JSON.parse(row.pending_json) : null;
    if (!pending || pending.expires < Date.now() || url.searchParams.get("state") !== pending.state) throw new ChatgptError("Login ChatGPT kedaluwarsa atau state tidak cocok. Hubungkan ulang.");
    if (!browserToken || await hash(browserToken) !== pending.browserHash || `${url.origin}${url.pathname}` !== pending.redirect) throw new ChatgptError("Browser callback ChatGPT tidak cocok.");
    const claimed = await this.db.prepare("UPDATE chatgpt_connection SET pending_json = NULL WHERE id = 1 AND pending_json = ?").bind(row.pending_json).run();
    if (!claimed.meta.changes) throw new ChatgptError("Callback ChatGPT sudah digunakan.");
    if (url.searchParams.has("error")) {
      const denied: Record<string, string> = {
        access_denied: "Izin koneksi ChatGPT ditolak atau dibatalkan.",
        invalid_client: "Pendaftaran aplikasi Loka Portrait ditolak oleh ChatGPT (invalid_client).",
        invalid_scope: "Izin berbagi kuota belum didukung untuk koneksi ini (invalid_scope).",
        invalid_request: "Permintaan login Loka Portrait ditolak oleh ChatGPT (invalid_request).",
        unsupported_response_type: "Jenis login ini belum didukung oleh ChatGPT (unsupported_response_type).",
      };
      throw new ChatgptError(denied[url.searchParams.get("error")!] || "ChatGPT menolak permintaan login aplikasi.");
    }
    const code = url.searchParams.get("code"), client = url.searchParams.get("client_id") || (pending.client !== "dynamic_agent_client" ? pending.client : "");
    if (!code || !client || client === "dynamic_agent_client" || (pending.client !== "dynamic_agent_client" && client !== pending.client)) throw new ChatgptError("Pendaftaran ChatGPT tidak mengembalikan client yang sesuai.");
    const tokens = await this.tokens(new URLSearchParams({ grant_type: "authorization_code", client_id: client, code, code_verifier: pending.verifier, redirect_uri: pending.redirect, resource: API }));
    if (!tokens.id_token) throw new ChatgptError("Identitas ChatGPT tidak tersedia.");
    await verifyIdentity(tokens.id_token, client, pending.nonce);
    const next: Session = { access_token: tokens.access_token!, refresh_token: tokens.refresh_token, client_id: client, expires_at: Date.now() + Number(tokens.expires_in || 3600) * 1000, scopes: (tokens.scope || "").split(/\s+/).filter(Boolean), model: null, verified: false };
    // A disconnect/reconnect during the token exchange invalidates this callback.
    const saved = await this.db.prepare("UPDATE chatgpt_connection SET session_json = ? WHERE id = 1 AND pending_json IS NULL AND session_json IS ? AND revision = ?").bind(JSON.stringify(next), row.session_json, row.revision).run();
    if (!saved.meta.changes) throw new ChatgptError("Koneksi berubah saat login. Hubungkan ulang.");
    return this.status();
  }
  private async live(): Promise<Session> {
    const row = await this.row(), current = session(row);
    if (!current?.access_token || (current.method !== "codex" && !current.scopes.includes("chatgpt.tokens.use.direct"))) throw new ChatgptError("Hubungkan ChatGPT melalui operator terlebih dahulu.");
    if (current.expires_at > Date.now() + 60000) return current;
    if (!current.refresh_token) throw new ChatgptError("Sesi ChatGPT kedaluwarsa. Hubungkan ulang.");
    const lock = Date.now() + 30000;
    const acquired = await this.db.prepare("UPDATE chatgpt_connection SET refresh_until = ? WHERE id = 1 AND refresh_until < ? AND session_json = ?").bind(lock, Date.now(), row.session_json).run();
    if (!acquired.meta.changes) throw new ChatgptError("Sesi ChatGPT sedang diperbarui. Coba lagi sebentar.", true);
    try {
      const tokens = await this.tokens(new URLSearchParams({ grant_type: "refresh_token", client_id: current.client_id, refresh_token: current.refresh_token, ...(current.method === "codex" ? {} : { resource: API }) }), current.method === "codex");
      const next: Session = { ...current, access_token: tokens.access_token!, refresh_token: tokens.refresh_token || current.refresh_token, expires_at: Date.now() + Number(tokens.expires_in || 3600) * 1000, scopes: tokens.scope ? tokens.scope.split(/\s+/) : current.scopes };
      const saved = await this.db.prepare("UPDATE chatgpt_connection SET session_json = ? WHERE id = 1 AND session_json = ?").bind(JSON.stringify(next), row.session_json).run();
      if (!saved.meta.changes) throw new ChatgptError("Koneksi ChatGPT sudah berubah.");
      if (next.method !== "codex" && !next.scopes.includes("chatgpt.tokens.use.direct")) throw new ChatgptError("Izin kuota ChatGPT tidak tersedia lagi.");
      return next;
    } finally { await this.db.prepare("UPDATE chatgpt_connection SET refresh_until = 0 WHERE id = 1 AND refresh_until = ?").bind(lock).run(); }
  }
  async check() {
    const current = await this.live();
    // Codex image models are configured by OpenCode's provider, not the text
    // models endpoint. Refresh validates tokens; only an edit verifies images.
    if (current.method === "codex") return this.status();
    const response = await fetch(`${API}/models`, { headers: { Authorization: `Bearer ${current.access_token}` }, redirect: "manual", signal: AbortSignal.timeout(20000) });
    if (!response.ok) await providerError(response);
    const body = await response.json() as { data?: { id: string }[]; models?: { slug?: string; id?: string }[] };
    const models = (body.data || body.models || []).map(item => "slug" in item ? item.slug || item.id : item.id);
    const model = [...IMAGE_TOOL_MODELS, "gpt-image-2", "gpt-image-1.5", "gpt-image-1"].find(id => models.includes(id)) ?? null;
    const availableModels = models.filter((id): id is string => typeof id === "string" && /^[a-zA-Z0-9._:/-]{1,120}$/.test(id)).slice(0, 100);
    const next = { ...current, model, availableModels, verified: model === current.model ? current.verified : false };
    await this.db.prepare("UPDATE chatgpt_connection SET session_json = ? WHERE id = 1 AND session_json = ?").bind(JSON.stringify(next), JSON.stringify(current)).run();
    return this.status();
  }
  async edit(photo: Uint8Array, mime: string, prompt: string): Promise<Uint8Array> {
    const current = await this.live();
    if (current.imageUnsupported) throw new ChatgptError("Koneksi kuota ChatGPT tidak mendukung pembuatan gambar. Operator perlu menggunakan akses API gambar.");
    if (!current.model) throw new ChatgptError("Akses model gambar ChatGPT belum tersedia. Periksa akses di operator.");
    const codex = current.method === "codex";
    const responses = !codex && IMAGE_TOOL_MODELS.includes(current.model);
    let body: FormData | string;
    if (responses) {
      body = JSON.stringify({
        model: current.model, store: false, stream: true,
        safety_identifier: await hash(photoBase64(photo)),
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: `data:${mime};base64,${photoBase64(photo)}` }] }],
        tools: [{ type: "image_generation", model: "gpt-image-2", action: "edit", size: "1024x1280", quality: "medium", output_format: "jpeg" }],
        tool_choice: { type: "image_generation" },
      });
    } else {
      body = new FormData();
      body.set("model", current.model); body.set("prompt", prompt); body.set("n", "1");
      body.set(codex ? "image[]" : "image", new Blob([new Uint8Array(photo)], { type: mime }), `portrait.${mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"}`);
      if (codex) { body.set("size", "1024x1280"); body.set("stream", "true"); body.set("partial_images", "0"); }
    }
    let target = `${codex ? CODEX_API : API}/${responses ? "responses" : "images/edits"}`;
    const headers: Record<string, string> = { Authorization: `Bearer ${current.access_token}`, ...(codex ? { originator: "opencode", ...(current.accountId ? { "chatgpt-account-id": current.accountId } : {}) } : {}), ...(responses ? { "Content-Type": "application/json" } : {}) };
    if (codex && (this.backend.CODEX_BACKEND_URL || this.backend.CODEX_BACKEND_KEY)) {
      let url: URL;
      try { url = new URL(this.backend.CODEX_BACKEND_URL || ""); } catch { throw new ChatgptError("Alamat backend Codex tidak valid."); }
      const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
      if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.username || url.password || url.search || url.hash || url.pathname !== "/" || !this.backend.CODEX_BACKEND_KEY || this.backend.CODEX_BACKEND_KEY.length < 32) throw new ChatgptError("Backend Codex membutuhkan HTTPS (kecuali localhost) dan kunci server yang valid.");
      target = `${url.origin}/images/edits`;
      headers.Authorization = `Bearer ${this.backend.CODEX_BACKEND_KEY}`;
      headers["x-codex-access-token"] = current.access_token;
      if (current.accountId) headers["x-codex-account-id"] = current.accountId;
      delete headers["chatgpt-account-id"]; delete headers.originator;
    }
    let response: Response;
    try {
      response = await fetch(target, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(180000) });
    } catch { throw new ChatgptError("Status generasi ChatGPT belum terkonfirmasi. Periksa penggunaan sebelum mencoba ulang."); }
    if (!response.ok) {
      if (codex && response.status === 403 && response.headers.get("content-type")?.includes("text/html")) {
        await response.body?.cancel();
        throw new ChatgptError("Jalur akses gambar Codex dari runtime server ditolak (HTTP 403 HTML). Operator perlu memeriksa koneksi backend; login ulang belum tentu menyelesaikannya.");
      }
      const failure = await response.clone().json().catch(() => ({})) as { error?: { code?: string } };
      if (failure.error?.code === "subscription_sharing_unsupported_capability") {
        await this.recordImageDenial(current);
        throw new ChatgptError("Koneksi kuota ChatGPT tidak mendukung pembuatan gambar. Operator perlu menggunakan akses API gambar.");
      }
      await providerError(response);
    }
    const encoded = responses || codex ? await readResponseImage(response, codex) : (await response.json() as { data?: { b64_json?: string }[] }).data?.[0]?.b64_json;
    if (!encoded || encoded.length > 16 * 1024 * 1024) throw new ChatgptError("ChatGPT tidak mengembalikan gambar yang valid.");
    let bytes: Uint8Array;
    try { bytes = decode(encoded); } catch { throw new ChatgptError("Data gambar ChatGPT tidak valid."); }
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const png = [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n);
    const webp = [82,73,70,70].every((n, i) => bytes[i] === n) && [87,69,66,80].every((n, i) => bytes[i + 8] === n);
    if (bytes.length < 16 || (!jpeg && !png && !webp)) throw new ChatgptError("Hasil ChatGPT bukan gambar yang dapat digunakan.");
    await this.db.prepare("UPDATE chatgpt_connection SET session_json = ? WHERE id = 1 AND session_json = ?").bind(JSON.stringify({ ...current, verified: true }), JSON.stringify(current)).run();
    return bytes;
  }
  private async recordImageDenial(current: Session) {
    await this.db.prepare("UPDATE chatgpt_connection SET session_json = ? WHERE id = 1 AND session_json = ?").bind(JSON.stringify({ ...current, imageUnsupported: true, verified: false }), JSON.stringify(current)).run();
  }
  // Operator diagnostic: validates tool availability without invoking the image
  // tool. It can consume a small amount of text quota, never an image generation.
  async probeImageAccess() {
    const current = await this.live();
    if (!current.model || !IMAGE_TOOL_MODELS.includes(current.model)) throw new ChatgptError("Model Responses belum dipilih.");
    const response = await fetch(`${API}/responses`, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${current.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: current.model, store: false, stream: true, input: [{ role: "user", content: [{ type: "input_text", text: "Reply OK. Do not generate any image." }] }], tools: [{ type: "image_generation", model: "gpt-image-2", action: "edit", size: "1024x1280", quality: "medium", output_format: "jpeg" }], tool_choice: "none" }),
    });
    if (response.ok) { await response.body?.cancel(); return { accepted: true, generationVerified: false }; }
    const body = await response.json().catch(() => ({})) as { error?: { code?: string; param?: string; message?: string }; detail?: string; message?: string };
    if (body.error?.code === "subscription_sharing_unsupported_capability") await this.recordImageDenial(current);
    const safe = (value: unknown) => typeof value === "string" ? value.replaceAll(current.access_token, "[redacted]").replaceAll(current.refresh_token || "__absent_refresh_token__", "[redacted]").replace(/sk-[\w-]+/g, "[redacted]").slice(0, 400) : null;
    return { accepted: false, status: response.status, code: safe(body.error?.code), param: safe(body.error?.param), message: safe(body.error?.message || body.detail || body.message), fields: Object.keys(body) };
  }
  async disconnect() {
    const current = session(await this.row());
    await this.db.prepare("UPDATE chatgpt_connection SET session_json = NULL, pending_json = NULL, refresh_until = 0, revision = revision + 1 WHERE id = 1").run();
    if (current?.refresh_token && current.method !== "codex") await fetch(`${AUTH}/api/accounts/oauth/revoke`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: current.refresh_token, token_type_hint: "refresh_token", client_id: current.client_id }), redirect: "manual", signal: AbortSignal.timeout(10000) }).catch(() => {});
    return this.status();
  }
}
