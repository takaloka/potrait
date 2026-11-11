import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const source = await readFile(new URL('../lib/chatgpt-connection.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { ChatgptConnection } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE photobooth_jobs (id TEXT PRIMARY KEY)');
sqlite.exec(await readFile(new URL('../drizzle/0003_chatgpt_connection.sql', import.meta.url), 'utf8'));
const DB = { prepare(sql) { const statement = params => ({ bind: (...p) => statement(p), first: async () => sqlite.prepare(sql).get(...params) ?? null, run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }) }); return statement([]); } };
const connection = new ChatgptConnection(DB), originalFetch = globalThis.fetch, originalNow = Date.now;
let now = originalNow(); Date.now = () => now;
const readSession = () => JSON.parse(sqlite.prepare('SELECT session_json FROM chatgpt_connection').get().session_json);
const writeSession = value => sqlite.prepare('UPDATE chatgpt_connection SET session_json = ?').run(JSON.stringify(value));
const CLIENT = 'app_EMoamEEZ73f0CkXaXp7hrann';
const startFetch = async (url, init) => {
  assert.equal(url, 'https://auth.openai.com/api/accounts/deviceauth/usercode');
  assert.equal(JSON.parse(init.body).client_id, CLIENT);
  assert.equal(init.redirect, 'manual');
  return Response.json({ device_auth_id: 'private-device-id', user_code: 'TEST-CODE', interval: '5', expires_in: 900 });
};
try {
  assert.equal(typeof connection.beginCodex, 'function', 'Codex device authorization must exist');
  globalThis.fetch = startFetch;
  const started = await connection.beginCodex();
  assert.equal(started.pending.url, 'https://auth.openai.com/codex/device');
  assert.equal(started.pending.userCode, 'TEST-CODE');
  assert.doesNotMatch(JSON.stringify(started), /private-device|device_auth_id|access_token|refresh_token/);
  let polls = 0;
  globalThis.fetch = async () => { polls++; return new Response(null, { status: 403 }); };
  await connection.pollCodex(); assert.equal(polls, 0, 'respect first polling interval');
  now += 8000;
  await Promise.all([connection.pollCodex(), connection.pollCodex()]);
  assert.equal(polls, 1, 'parallel operator tabs do not duplicate polls');
  now += 901000;
  await assert.rejects(connection.pollCodex(), /kedaluwarsa/);
  assert.equal(polls, 1, 'expired code is never polled');

  globalThis.fetch = startFetch; await connection.beginCodex();
  now += 8000;
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `fixture.${encode({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture-account' } })}.fixture`;
  globalThis.fetch = async (url, init) => {
    if (url.endsWith('/deviceauth/token')) {
      assert.deepEqual(JSON.parse(init.body), { device_auth_id: 'private-device-id', user_code: 'TEST-CODE' });
      return Response.json({ authorization_code: 'private-code', code_verifier: 'private-verifier' });
    }
    assert.equal(url, 'https://auth.openai.com/oauth/token');
    assert.equal(init.body.get('client_id'), CLIENT);
    assert.equal(init.body.get('redirect_uri'), 'https://auth.openai.com/deviceauth/callback');
    assert.equal(init.body.get('code_verifier'), 'private-verifier');
    assert.equal(init.body.has('resource'), false);
    return Response.json({ access_token: token, refresh_token: 'private-refresh', expires_in: 3600 });
  };
  const loggedIn = await connection.pollCodex();
  assert.equal(loggedIn.method, 'codex'); assert.equal(loggedIn.connected, true);
  assert.equal(loggedIn.model, 'gpt-image-2'); assert.equal(loggedIn.verified, false);
  assert.equal(loggedIn.pending, null);
  assert.doesNotMatch(JSON.stringify(loggedIn), /fixture-account|private-|access_token|refresh_token/);
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('no model discovery required'); };
  await connection.check(); assert.equal(calls, 0);
  const image = await readFile(new URL('../public/samples/before.jpg', import.meta.url));
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://chatgpt.com/backend-api/codex/images/edits');
    assert.equal(init.headers['chatgpt-account-id'], 'fixture-account');
    assert.equal(init.headers.originator, 'opencode');
    assert.equal(init.body.get('model'), 'gpt-image-2');
    assert.equal(init.body.get('n'), '1');
    assert.equal(init.body.get('size'), '1024x1280');
    assert.ok(init.body.get('image[]') instanceof Blob);
    assert.equal(init.body.has('image'), false);
    const text = `event: image_edit.partial_image\ndata: {"type":"image_edit.partial_image","b64_json":"ignore"}\r\n\r\nevent: image_edit.completed\ndata: ${JSON.stringify({ type: 'image_edit.completed', b64_json: image.toString('base64'), output_format: 'jpeg' })}\r\n\r\n`;
    return new Response(new ReadableStream({ start(c) { for (const part of [text.slice(0, 127), text.slice(127, 150), text.slice(150)]) c.enqueue(new TextEncoder().encode(part)); c.close(); } }), { headers: { 'Content-Type': 'text/event-stream' } });
  };
  assert.deepEqual(Buffer.from(await connection.edit(image, 'image/jpeg', 'beskap')), image);
  assert.equal((await connection.status()).verified, true);
  globalThis.fetch = async () => new Response('<html>Unable to load site private-detail</html>', { status: 403, headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
  await assert.rejects(connection.edit(image, 'image/jpeg', 'beskap'), error => /jalur akses|runtime/i.test(error.message) && !/kuota|private-detail/.test(error.message), 'HTML routing block is not an entitlement denial');
  globalThis.fetch = async () => new Response('event: image_edit.partial_image\ndata: {"type":"image_edit.partial_image","b64_json":"partial"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  await assert.rejects(connection.edit(image, 'image/jpeg', 'beskap'), /terputus|gambar/);
  globalThis.fetch = async () => new Response('event: error\ndata: {"type":"error","error":{"message":"private-error"}}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  await assert.rejects(connection.edit(image, 'image/jpeg', 'beskap'), e => !e.message.includes('private-error'));
  const backend = new ChatgptConnection(DB, { CODEX_BACKEND_URL: 'http://127.0.0.1:8790', CODEX_BACKEND_KEY: 'fixture-service-key'.repeat(3) });
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:8790/images/edits');
    assert.equal(init.headers.Authorization, `Bearer ${'fixture-service-key'.repeat(3)}`);
    assert.equal(init.headers['x-codex-access-token'], token);
    assert.equal(init.headers['x-codex-account-id'], 'fixture-account');
    return Response.json({ data: [{ b64_json: image.toString('base64') }] });
  };
  assert.deepEqual(Buffer.from(await backend.edit(image,'image/jpeg','beskap')),image);
  globalThis.fetch = async () => { throw new Error('invalid transport must not leak credentials'); };
  await assert.rejects(new ChatgptConnection(DB, { CODEX_BACKEND_URL: 'http://remote.example', CODEX_BACKEND_KEY: 'x'.repeat(32) }).edit(image,'image/jpeg','beskap'), /HTTPS|backend/i);
  await assert.rejects(new ChatgptConnection(DB, { CODEX_BACKEND_URL: 'https://user:password@remote.example', CODEX_BACKEND_KEY: 'x'.repeat(32) }).edit(image,'image/jpeg','beskap'), /backend/i);
  writeSession({ ...readSession(), expires_at: now - 1 });
  let refreshes = 0;
  globalThis.fetch = async (url, init) => {
    refreshes++; assert.equal(url, 'https://auth.openai.com/oauth/token');
    assert.equal(init.body.get('refresh_token'), 'private-refresh');
    assert.equal(init.body.has('resource'), false);
    return Response.json({ access_token: token, refresh_token: 'rotated-refresh', expires_in: 3600 });
  };
  await connection.check(); await connection.check(); assert.equal(refreshes, 1);
  assert.equal(readSession().refresh_token, 'rotated-refresh');

  globalThis.fetch = startFetch; await connection.beginCodex(); now += 8000;
  globalThis.fetch = async () => { await connection.cancelCodex(); return Response.json({ authorization_code: 'late-code', code_verifier: 'late-verifier' }); };
  await assert.rejects(connection.pollCodex(), /berubah|dibatalkan/);
  assert.equal(readSession().refresh_token, 'rotated-refresh', 'cancellation preserves existing connection');
  globalThis.fetch = startFetch; await connection.beginCodex(); now += 8000;
  globalThis.fetch = async url => {
    if (url.endsWith('/deviceauth/token')) return Response.json({ authorization_code: 'late-code', code_verifier: 'late-verifier' });
    await connection.disconnect(); return Response.json({ access_token: token, refresh_token: 'late-refresh' });
  };
  await assert.rejects(connection.pollCodex(), /berubah/);
  assert.equal((await connection.status()).connected, false, 'late exchange cannot undo disconnect');
  console.log('PASS Codex: device lifecycle, intervals/concurrency, expiry, cancellation, refresh, redaction, image stream and error handling (mocked provider).');
} finally { globalThis.fetch = originalFetch; Date.now = originalNow; sqlite.close(); }
