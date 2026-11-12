import { test } from "node:test";
import assert from "node:assert/strict";
import { apiJson } from "../lib/photobooth-client.ts";

test("plain-text 413 identifies an upload limit instead of an unreachable server", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("Payload Too Large", { status: 413 });
    await assert.rejects(apiJson("/api/jobs"), error => {
      assert.equal(error.status, 413);
      assert.match(error.message, /8 MB/);
      assert.doesNotMatch(error.message, /belum dapat dihubungi/);
      return true;
    });
  } finally { globalThis.fetch = original; }
});

test("HTTP errors retain status so permanent failures can stop polling", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: "Nomor peserta tidak valid." }), { status: 400 });
    await assert.rejects(apiJson("/api/jobs/invalid"), error => {
      assert.equal(error.status, 400);
      assert.equal(error.message, "Nomor peserta tidak valid.");
      return true;
    });
  } finally { globalThis.fetch = original; }
});

test("a successful response returns the API payload", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ status: "ready" });
    assert.deepEqual(await apiJson("/api/jobs/example"), { status: "ready" });
  } finally { globalThis.fetch = original; }
});
