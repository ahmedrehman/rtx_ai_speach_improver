import test from "node:test";
import assert from "node:assert/strict";
import type { Env } from "../server/bindings";
import { handleRequest } from "../server/http";
import { DEFAULT_CHECKLIST } from "../lib_speech_contract";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ASSETS: { fetch: async () => new Response("asset", { status: 200 }) },
    ...overrides
  };
}

function postRequest(url: string, body: unknown) {
  // Node's undici Request constructor requires the duplex option when a body is set.
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    duplex: "half"
  } as RequestInit;
  return new Request(url, init);
}

test("health endpoint answers at root base path", async () => {
  const response = await handleRequest(
    new Request("http://localhost/api/improver/health"),
    makeEnv({ APP_BASE_PATH: "/" })
  );
  assert.equal(response.status, 200);
  const data = await response.json() as { ok: boolean; hasOpenAiApiKey: boolean };
  assert.equal(data.ok, true);
  assert.equal(data.hasOpenAiApiKey, false);
});

test("health endpoint answers under the mounted base path", async () => {
  const response = await handleRequest(
    new Request("http://localhost/apps/speechimprover/api/improver/health"),
    makeEnv({ APP_BASE_PATH: "/apps/speechimprover/" })
  );
  assert.equal(response.status, 200);
});

test("text eval stream without key returns 503", async () => {
  const response = await handleRequest(
    postRequest("http://localhost/api/improver/text-eval-stream", {
      fullText: "Hallo",
      checklist: DEFAULT_CHECKLIST,
      language: "Deutsch"
    }),
    makeEnv({ APP_BASE_PATH: "/" })
  );
  assert.equal(response.status, 503);
  const data = await response.json() as { error: string };
  assert.match(data.error, /not connected/);
});

test("voice eval stream without key returns 503", async () => {
  const response = await handleRequest(
    postRequest("http://localhost/api/improver/voice-eval-stream", {}),
    makeEnv({ APP_BASE_PATH: "/" })
  );
  assert.equal(response.status, 503);
});

test("GET on stream endpoints returns 405", async () => {
  const response = await handleRequest(
    new Request("http://localhost/api/improver/text-eval-stream"),
    makeEnv({ APP_BASE_PATH: "/" })
  );
  assert.equal(response.status, 405);
});

test("unknown api route returns 404", async () => {
  const response = await handleRequest(
    new Request("http://localhost/api/unknown"),
    makeEnv({ APP_BASE_PATH: "/" })
  );
  assert.equal(response.status, 404);
});

test("non-api routes fall through to assets", async () => {
  const response = await handleRequest(
    new Request("http://localhost/index.html"),
    makeEnv({ APP_BASE_PATH: "/" })
  );
  assert.equal(await response.text(), "asset");
});
