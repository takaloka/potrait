import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const source = await readFile(new URL('../lib/chatgpt-connection.ts', import.meta.url), 'utf8').catch(() => '');
assert.ok(source, 'ChatGPT connection implementation must exist');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { ChatgptConnection } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE photobooth_jobs (id TEXT PRIMARY KEY)');
sqlite.exec(await readFile(new URL('../drizzle/0003_chatgpt_connection.sql', import.meta.url), 'utf8'));
const DB = { prepare(sql) { const statement = params => ({ bind: (...p) => statement(p), first: async () => sqlite.prepare(sql).get(...params) ?? null, run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }) }); return statement([]); } };
const connection = new ChatgptConnection(DB);
const originalFetch = globalThis.fetch;
let calls = [];
try {
  assert.equal((await connection.status()).selected, false);
  const start = await connection.begin('http://127.0.0.1:8787');
  const url = new URL(start.url);
  assert.equal(url.origin, 'https://auth.openai.com');
  assert.equal(url.searchParams.get('agent_name_hint'), 'Loka Portrait');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:8787/auth/callback');
  assert.match(url.searchParams.get('scope'), /chatgpt.tokens.use.direct/);
  assert.equal((await connection.status()).selected, true);
  globalThis.fetch = async (...args) => { calls.push(args); throw new Error('Unexpected external request'); };
  await assert.rejects(connection.complete(new URL('http://127.0.0.1:8787/auth/callback?state=bad&code=bad'), start.browserToken), /kedaluwarsa|cocok/);
  await assert.rejects(connection.complete(new URL(`http://127.0.0.1:8787/auth/callback?state=${url.searchParams.get('state')}&code=bad`), 'other-browser'), /cocok/);
  assert.equal(calls.length, 0, 'invalid callback never reaches token endpoint');
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'fixture' };
  const signedToken = async (nonce, expired = false) => {
    const encode = object => Buffer.from(JSON.stringify(object)).toString('base64url');
    const input = `${encode({ alg: 'RS256', kid: 'fixture' })}.${encode({ iss: 'https://auth.openai.com', aud: 'client-test', nonce, sub: 'fixture-subject', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + (expired ? -10 : 3600) })}`;
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(input));
    return `${input}.${Buffer.from(signature).toString('base64url')}`;
  };
  const callback = new URL(`http://127.0.0.1:8787/auth/callback?state=${url.searchParams.get('state')}&code=fixture&client_id=client-test`);
  const identity = await signedToken(url.searchParams.get('nonce'));
  globalThis.fetch = async (target, init) => {
    if (target.endsWith('/jwks.json')) return Response.json({ keys: [jwk] });
    assert.equal(target, 'https://auth.openai.com/api/accounts/oauth/token');
    assert.equal(init.body.get('grant_type'), 'authorization_code');
    const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(init.body.get('code_verifier')))).toString('base64url');
    assert.equal(challenge, url.searchParams.get('code_challenge'));
    return Response.json({ access_token: 'first-access', refresh_token: 'first-refresh', id_token: identity, expires_in: 1, scope: 'chatgpt.tokens.use.direct resource.invoke' });
  };
  assert.equal((await connection.complete(callback, start.browserToken)).connected, true);
  await assert.rejects(connection.complete(callback, start.browserToken), /kedaluwarsa|cocok/);
  let refreshed = 0;
  globalThis.fetch = async (target, init) => {
    if (target.endsWith('/oauth/token')) {
      refreshed++;
      assert.equal(init.body.get('refresh_token'), 'first-refresh');
      return Response.json({ access_token: 'rotated-access', refresh_token: 'rotated-refresh', expires_in: 3600 });
    }
    assert.equal(init.headers.Authorization, 'Bearer rotated-access');
    return Response.json({ data: [{ id: 'gpt-image-1' }] });
  };
  await connection.check(); await connection.check();
  assert.equal(refreshed, 1, 'refresh once, persist rotated tokens');
  for (const invalid of ['nonce', 'expiry']) {
    const attempt = await connection.begin('http://127.0.0.1:8787'), auth = new URL(attempt.url);
    const token = await signedToken(invalid === 'nonce' ? 'wrong-nonce' : auth.searchParams.get('nonce'), invalid === 'expiry');
    globalThis.fetch = async target => target.endsWith('/jwks.json') ? Response.json({ keys: [jwk] }) : Response.json({ access_token: 'bad-access', id_token: token });
    await assert.rejects(connection.complete(new URL(`http://127.0.0.1:8787/auth/callback?state=${auth.searchParams.get('state')}&code=fixture`), attempt.browserToken), /Identitas/);
  }
  const session = { access_token: 'secret-access', refresh_token: 'secret-refresh', client_id: 'client-test', expires_at: Date.now() + 3600000, scopes: ['chatgpt.tokens.use.direct', 'resource.invoke'], model: null, verified: false };
  sqlite.prepare('UPDATE chatgpt_connection SET session_json = ? WHERE id = 1').run(JSON.stringify(session));
  assert.doesNotMatch(JSON.stringify(await connection.status()), /secret-|access_token|refresh_token/);
  globalThis.fetch = async (url, init) => {
    calls.push([url, init]);
    assert.equal(url, 'https://api.openai.com/v1/models');
    return Response.json({ data: [{ id: 'gpt-4.1' }] });
  };
  assert.equal((await connection.check()).model, null, 'text models do not prove image entitlement');
  await assert.rejects(connection.edit(new Uint8Array([1]), 'image/jpeg', 'portrait'), /gambar/);
  globalThis.fetch = async () => Response.json({ data: [{ id: 'gpt-image-1' }] });
  const checked = await connection.check();
  assert.equal(checked.model, 'gpt-image-1');
  assert.equal(checked.verified, false, 'listing does not verify a generation');
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/images/edits');
    assert.equal(init.body.get('model'), 'gpt-image-1');
    assert.equal(init.body.get('n'), '1');
    assert.equal(init.body.get('prompt'), 'portrait');
    assert.ok(init.body.get('image') instanceof Blob);
    return Response.json({ error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'secret-provider-detail' } }, { status: 429 });
  };
  await assert.rejects(connection.edit(new Uint8Array([1]), 'image/jpeg', 'portrait'), /Kuota/);
  globalThis.fetch = async () => Response.json({ data: [{ b64_json: Buffer.from('not-an-image').toString('base64') }] });
  await assert.rejects(connection.edit(new Uint8Array([1]), 'image/jpeg', 'portrait'), /gambar/);
  const png = await readFile(new URL('../public/samples/before.jpg', import.meta.url));
  globalThis.fetch = async () => Response.json({ data: [{ b64_json: png.toString('base64') }] });
  assert.deepEqual(Buffer.from(await connection.edit(new Uint8Array([1]), 'image/jpeg', 'portrait')), png);
  assert.equal((await connection.status()).verified, true);
  globalThis.fetch = async () => Response.json({ data: [{ id: 'gpt-6-astra' }, { id: 'gpt-6.1-sol' }] });
  const responsesConnection = await connection.check();
  assert.equal(responsesConnection.model, 'gpt-6-astra', 'mainline model with documented image tool support is usable');
  assert.equal(responsesConnection.verified, false, 'new transport must be verified separately');
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'gpt-6-astra');
    assert.equal(body.tools[0].type, 'image_generation');
    assert.equal(body.tools[0].model, 'gpt-image-2');
    assert.equal(body.tools[0].action, 'edit');
    assert.deepEqual(body.tool_choice, { type: 'image_generation' });
    assert.equal(body.store, false); assert.equal(body.stream, true);
    assert.ok(body.input[0].content[1].image_url.startsWith('data:image/jpeg;base64,'));
    assert.ok(body.safety_identifier);
    const completed = { type: 'response.completed', response: { output: [{ type: 'image_generation_call', status: 'completed', result: png.toString('base64') }] } };
    // Fragment the event across arbitrary network boundaries.
    const text = `event: response.created\ndata: {}\n\nevent: response.completed\ndata: ${JSON.stringify(completed)}\n\n`;
    return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(text.slice(0,91)));controller.enqueue(new TextEncoder().encode(text.slice(91)));controller.close();}}), { headers: { 'Content-Type': 'text/event-stream' } });
  };
  assert.deepEqual(Buffer.from(await connection.edit(new Uint8Array([1,2,3]), 'image/jpeg', 'portrait')), png);
  globalThis.fetch = async () => new Response('event: response.failed\ndata: {"response":{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  await assert.rejects(connection.edit(new Uint8Array([1]), 'image/jpeg', 'portrait'), /Kuota/);
  globalThis.fetch = async () => new Response('event: response.completed\ndata: {"response":{"output":[]}}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  await assert.rejects(connection.edit(new Uint8Array([1]), 'image/jpeg', 'portrait'), /gambar/);
  globalThis.fetch = async () => Response.json({ error: { code: 'subscription_sharing_unsupported_capability', param: 'tools', message: "tool image_generation is not supported" } }, { status: 400 });
  const probe = await connection.probeImageAccess();
  assert.equal(probe.accepted, false);
  assert.equal((await connection.status()).imageUnsupported, true, 'persist explicit provider capability denial');
  globalThis.fetch = async () => Response.json({ data: [{ id: 'gpt-6-astra' }] });
  assert.equal((await connection.check()).imageUnsupported, true, 'model listing cannot override explicit capability denial');
  globalThis.fetch = async () => { throw new Error('Denied image access must not send requests'); };
  await assert.rejects(connection.edit(new Uint8Array([1]), 'image/jpeg', 'portrait'), /kuota.*tidak mendukung/i);
  globalThis.fetch = async () => new Response(null, { status: 200 });
  await connection.disconnect();
  const stopped = await connection.status();
  assert.equal(stopped.connected, false);
  assert.equal(stopped.selected, true, 'disconnect must not silently restore demo/provider fallback');
  const late = await connection.begin('http://127.0.0.1:8787'), lateUrl = new URL(late.url);
  const lateIdentity = await signedToken(lateUrl.searchParams.get('nonce'));
  globalThis.fetch = async target => {
    if (target.endsWith('/jwks.json')) return Response.json({ keys: [jwk] });
    await connection.disconnect();
    return Response.json({ access_token: 'late-access', id_token: lateIdentity });
  };
  await assert.rejects(connection.complete(new URL(`http://127.0.0.1:8787/auth/callback?state=${lateUrl.searchParams.get('state')}&code=fixture&client_id=client-test`), late.browserToken), /Koneksi berubah/);
  assert.equal((await connection.status()).connected, false);
  console.log('PASS ChatGPT: separate PKCE flow, callback binding, secret redaction, model checks, image request/output, quota and disconnect (mocked provider).');
} finally { globalThis.fetch = originalFetch; sqlite.close(); }
