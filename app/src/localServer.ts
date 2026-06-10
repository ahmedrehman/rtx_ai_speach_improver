import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { createServer as createViteServer } from "vite";
import type { Env } from "./server/bindings";
import { handleRequest } from "./server/http";

loadLocalEnv();

const host = "0.0.0.0";
const port = 5173;

const vite = await createViteServer({
  server: {
    middlewareMode: true,
    hmr: false
  },
  appType: "spa"
});

const env: Env = {
  ASSETS: {
    fetch: async () => new Response("Assets are served by Vite in local Node dev.", { status: 404 })
  },
  APP_BASE_PATH: "/",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY
};

const server = http.createServer(async (request, response) => {
  if (request.url?.startsWith("/api/")) {
    await sendWebResponse(response, await handleRequest(await nodeRequestToWebRequest(request), env));
    return;
  }

  vite.middlewares(request, response, (error: unknown) => {
    if (error) {
      if (error instanceof Error) {
        vite.ssrFixStacktrace(error);
      }
      response.statusCode = 500;
      response.end(error instanceof Error ? error.stack : String(error));
      return;
    }

    response.statusCode = 404;
    response.end("Not found");
  });
});

server.listen(port, host, () => {
  console.log(`Local Node app running at http://127.0.0.1:${port}`);
  for (const address of lanAddresses()) {
    console.log(`LAN access available at http://${address}:${port}`);
  }
});

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flatMap((items) => items || [])
    .filter((item) => item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
}

function loadLocalEnv() {
  for (const fileName of [".env", ".env.local", "app/.env", "app/.env.local"]) {
    try {
      const text = readFileSync(fileName, "utf8");
      loadEnvText(text);
    } catch {
      // Local env files are optional.
    }
  }
}

function loadEnvText(text: string) {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[name]) process.env[name] = value;
  }
}

async function sendWebResponse(response: ServerResponse, webResponse: Response) {
  response.statusCode = webResponse.status;
  webResponse.headers.forEach((value, key) => response.setHeader(key, value));
  if (!webResponse.body) {
    response.end();
    return;
  }
  const reader = webResponse.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    response.write(Buffer.from(value));
  }
  response.end();
}

async function nodeRequestToWebRequest(request: IncomingMessage) {
  const url = new URL(request.url || "/", `http://${request.headers.host || `127.0.0.1:${port}`}`);
  const method = request.method || "GET";
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }
  const body = method === "GET" || method === "HEAD" ? undefined : await readBuffer(request);
  return new Request(url, { method, headers, body });
}

async function readBuffer(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}
