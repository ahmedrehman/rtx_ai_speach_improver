import type { Env } from "./bindings";
import { json, methodNotAllowed, notFound } from "./responses";
import { SPEECH_EVAL_STREAM_TEXT, SPEECH_EVAL_STREAM_VOICE } from "../lib_server_speech_eval";
import type { TextEvalRequest, VoiceEvalRequest } from "../lib_speech_contract";

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const basePath = normalizeBasePath(env.APP_BASE_PATH);
  const pathname = stripBasePath(url.pathname, basePath);

  try {
    if (pathname === "/api/improver/health") {
      if (request.method !== "GET") return methodNotAllowed();
      return json({ ok: true, hasOpenAiApiKey: Boolean(env.OPENAI_API_KEY) });
    }

    if (pathname === "/api/improver/text-eval-stream") {
      if (request.method !== "POST") return methodNotAllowed();
      if (!env.OPENAI_API_KEY) return json({ error: "SPEECH_EVAL_STREAM_TEXT is not connected." }, 503);
      const body = await request.json() as TextEvalRequest;
      return SPEECH_EVAL_STREAM_TEXT({ openAiApiKey: env.OPENAI_API_KEY }, body);
    }

    if (pathname === "/api/improver/voice-eval-stream") {
      if (request.method !== "POST") return methodNotAllowed();
      if (!env.OPENAI_API_KEY) return json({ error: "SPEECH_EVAL_STREAM_VOICE is not connected." }, 503);
      const body = await request.json() as VoiceEvalRequest;
      return SPEECH_EVAL_STREAM_VOICE({ openAiApiKey: env.OPENAI_API_KEY }, body);
    }

    if (pathname.startsWith("/api/")) {
      return notFound();
    }

    return env.ASSETS.fetch(rewriteRequestPath(request, pathname));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return json({ error: message }, 500);
  }
}

function normalizeBasePath(basePath = "/apps/speechimprover/") {
  if (!basePath || basePath === "/") return "/";
  const withLeadingSlash = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function stripBasePath(pathname: string, basePath: string) {
  if (basePath === "/") return pathname;
  const baseWithoutTrailingSlash = basePath.slice(0, -1);
  if (pathname === baseWithoutTrailingSlash) return "/";
  if (!pathname.startsWith(basePath)) return pathname;
  return `/${pathname.slice(basePath.length)}`;
}

function rewriteRequestPath(request: Request, pathname: string) {
  const url = new URL(request.url);
  if (url.pathname === pathname) return request;
  url.pathname = pathname;
  return new Request(url.toString(), request);
}
