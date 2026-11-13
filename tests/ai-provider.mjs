import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Transpile the server-only adapter in memory; all HTTP calls are mocked.
const source = await readFile(new URL("../lib/ai-provider.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const adapter = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const originalFetch = globalThis.fetch;
let calls = [];
let checks = 0;
const key = "test-key-never-sent-to-a-service";

try {
  for (const style of ["beskap", "kebaya", "jas"]) {
    const prompt = adapter.portraitPrompt(style, "bojonegoro-doelo");
    assert.match(prompt, /strictly neutral black.and.white/i);
    assert.match(prompt, /no sepia, orange, brown, yellow tint/i);
    assert.match(prompt, /neutral gray painted studio backdrop/i);
    assert.match(prompt, /recognizable facial features/);
    assert.doesNotMatch(prompt, /warm sepia|warm taupe|faded warm tones|natural skin tone/);
    assert.match(adapter.portraitPrompt(style, "nusantara"), /warm sepia/);
    checks += 6;
  }
  for (const style of ["batik", "kebaya-kasual", "retro-festival"]) {
    const prompt = adapter.portraitPrompt(style);
    assert.match(prompt, /warm full.color/i);
    assert.match(prompt, /recognizable facial/i);
    assert.doesNotMatch(prompt, /seated naturally|silver-gelatin/);
    checks++;
  }
  const configuredDemo = adapter.getAiConfig({ BFL_API_KEY: key });
  assert.equal(configuredDemo.mode, "demo"); checks++;
  assert.equal(configuredDemo.configured, true); checks++;
  globalThis.fetch = async (...args) => { calls.push(args); throw new Error("No network allowed"); };
  await assert.rejects(() => adapter.submitAiPortrait(configuredDemo, new Uint8Array([1,2,3])), /belum terhubung/); checks++;
  assert.equal(calls.length, 0, "A key alone never enables charged AI requests"); checks++;
  await assert.rejects(() => adapter.submitAiPortrait(adapter.getAiConfig({ AI_MODE: "live" }), new Uint8Array([1,2,3])), /belum terhubung/); checks++;

  globalThis.fetch = async (...args) => {
    calls.push(args);
    return Response.json({ id: "test-task", polling_url: "https://api.bfl.ai/v1/get_result?id=test-task" });
  };
  const live = adapter.getAiConfig({ AI_MODE: "live", BFL_API_KEY: key });
  const task = await adapter.submitAiPortrait(live, new Uint8Array([1,2,3]));
  assert.equal(calls[0][0], "https://api.bfl.ai/v1/flux-2-pro"); checks++;
  const payload = JSON.parse(calls[0][1].body);
  assert.equal(payload.input_image, "AQID"); checks++;
  assert.equal(payload.width, 768); checks++;
  assert.equal(payload.height, 1024); checks++;
  assert.equal(payload.safety_tolerance, 2); checks++;
  assert.match(payload.prompt, /orange football jersey with black collar/i); checks++;
  assert.match(payload.prompt, /recognizable facial features/i); checks++;
  assert.match(payload.prompt, /both real hands visible with anatomically correct fingers/i); checks++;
  assert.match(payload.prompt, /do not imply official team membership/i); checks++;
  assert.match(payload.prompt, /no badges, brand marks or sponsor logos/i); checks++;
  assert.doesNotMatch(payload.prompt, /forest-green|hands outside frame/i); checks++;
  assert.equal(task.pollingUrl, "https://api.bfl.ai/v1/get_result?id=test-task"); checks++;
  assert.equal(JSON.stringify(task).includes(key), false, "Provider result contains no secret"); checks++;

  for (const [style, outfit] of [["beskap", /dark Javanese beskap/], ["kebaya", /modest classic Indonesian kebaya/], ["jas", /waistcoat, ivory shirt/]]) {
    await adapter.submitAiPortrait(live, new Uint8Array([1,2,3]), style);
    const body = JSON.parse(calls.at(-1)[1].body);
    assert.match(body.prompt, outfit); checks++;
    assert.match(body.prompt, /recognizable facial features/); checks++;
    assert.match(body.prompt, /Preserve any religious head covering/); checks++;
    assert.match(body.prompt, /jaw, neck, hair, skin and clothing seamlessly/); checks++;
    assert.doesNotMatch(body.prompt, /football|jersey|Persibo/i); checks++;
    assert.equal(body.width / body.height, 4 / 5); checks++;
  }
  await adapter.submitAiPortrait(adapter.getAiConfig({ AI_MODE: "live", BFL_API_KEY: key, BFL_MODEL: "flux-kontext-pro" }), new Uint8Array([1,2,3]), "beskap");
  assert.equal(JSON.parse(calls.at(-1)[1].body).aspect_ratio, "4:5"); checks++;
  const beforeInvalid = calls.length;
  await assert.rejects(adapter.submitAiPortrait(live, new Uint8Array([1,2,3]), "arbitrary-prompt"), /tidak dikenal/); checks++;
  assert.equal(calls.length, beforeInvalid); checks++;

  calls = [];
  for (const url of ["http://api.bfl.ai/v1/get_result", "https://api.bfl.ai.evil.example/task", "https://api.bfl.ai@evil.example/task", "https://api.bfl.ai:8080/task"]) {
    await assert.rejects(() => adapter.pollAiPortrait(url)); checks++;
  }
  assert.equal(calls.length, 0, "Non-provider URLs cannot trigger fetches"); checks++;

  globalThis.fetch = async () => Response.json({ status: "Generating" });
  assert.deepEqual(await adapter.pollAiPortrait(task.pollingUrl), { status: "pending" }); checks++;
  globalThis.fetch = async () => Response.json({ status: "Content Moderated" });
  await assert.rejects(() => adapter.pollAiPortrait(task.pollingUrl), error => error instanceof adapter.AiProviderError && !error.transient); checks++;
  globalThis.fetch = async () => new Response("busy", { status: 503 });
  await assert.rejects(() => adapter.pollAiPortrait(task.pollingUrl), error => error instanceof adapter.AiProviderError && error.transient); checks++;

  const image = new Uint8Array(30); image.set([255,216,255]);
  globalThis.fetch = async url => String(url).includes("get_result")
    ? Response.json({ status: "Ready", result: { sample: "https://delivery-eu1.bfl.ai/test.jpg" } })
    : new Response(image, { headers: { "content-type": "image/jpeg" } });
  const result = await adapter.pollAiPortrait(task.pollingUrl);
  assert.equal(result.status, "ready"); checks++;
  assert.deepEqual(result.bytes, image); checks++;
  assert.equal(result.contentType, "image/jpeg"); checks++;

  globalThis.fetch = async () => { throw new Error("network interruption after request might have been accepted"); };
  await assert.rejects(() => adapter.submitAiPortrait(live, image), error => error instanceof adapter.AiProviderError && !error.transient && error.message.includes("belum terkonfirmasi")); checks++;
  console.log(`PASS: ${checks} provider contract checks, all HTTP mocked, no network and no paid AI calls.`);
} finally { globalThis.fetch = originalFetch; }
