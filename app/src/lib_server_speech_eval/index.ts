import {
  buildEvalJsonSchema,
  buildEvalSystemPrompt,
  formatSseEvent,
  normalizeEvalResult,
  type ChecklistFieldDefinition,
  type MethodStatus,
  type SpeechEvalResult,
  type SpeechEvalStreamEvent,
  type TextEvalRequest,
  type VoiceEvalRequest
} from "../lib_speech_contract";

export type SpeechEvalLogEvent = {
  level: "info" | "error";
  method: string;
  message: string;
  data?: unknown;
  createdAt: string;
};

export type SpeechEvalConfig = {
  openAiApiKey?: string;
  evalModel?: string;
  transcriptionModel?: string;
  logger?: (event: SpeechEvalLogEvent) => void;
  onCost?: (cost: { kind: "text_eval" | "voice_eval"; estimatedCost: number }) => void | Promise<void>;
};

export type EvalTextOutput = {
  status: MethodStatus;
  result: SpeechEvalResult | null;
  estimatedCost: number;
  debug: {
    model: string;
    promptSent: string;
    rawText: string;
    usage: unknown;
  };
};

export type TranscribeChunkOutput = {
  status: MethodStatus;
  text: string;
  estimatedCost: number;
  debug: {
    model: string;
    audioFormat: string;
    audioByteLength: number;
    estimatedDurationSec: number;
  };
};

const EVAL_COST_PER_INPUT_TOKEN = 0.15 / 1_000_000;
const EVAL_COST_PER_OUTPUT_TOKEN = 0.6 / 1_000_000;
const TRANSCRIPTION_COST_PER_MINUTE = 0.003;

export async function EVAL_TEXT_TO_CHECKLIST(config: SpeechEvalConfig, request: TextEvalRequest): Promise<EvalTextOutput> {
  const startedAt = new Date().toISOString();
  const model = request.evalModel || config.evalModel || "gpt-4o-mini";
  log(config, "info", "EVAL_TEXT_TO_CHECKLIST", "start", { model, textLength: request.fullText.length });
  try {
    if (!config.openAiApiKey) throw new Error("OPENAI_API_KEY is not configured.");
    const fullText = request.fullText.trim();
    if (!fullText) throw new Error("EVAL_TEXT_TO_CHECKLIST requires fullText.");
    const systemPrompt = buildEvalSystemPrompt(request);
    const schema = buildEvalJsonSchema(request.checklist);
    const requestBody = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `EXPLANATION SO FAR:\n${fullText}` }
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "speech_checklist_eval", strict: true, schema }
      }
    };
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.openAiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`OpenAI eval failed with ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const rawText = data.choices?.[0]?.message?.content || "";
    if (!rawText.trim()) throw new Error("OpenAI eval returned no content.");
    const result = normalizeEvalResult(JSON.parse(rawText), request.checklist);
    const estimatedCost = estimateEvalCost(data.usage);
    const output: EvalTextOutput = {
      status: doneStatus("EVAL_TEXT_TO_CHECKLIST", startedAt),
      result,
      estimatedCost,
      debug: { model, promptSent: systemPrompt, rawText, usage: data.usage }
    };
    log(config, "info", "EVAL_TEXT_TO_CHECKLIST", "done", { estimatedCost });
    return output;
  } catch (error) {
    const status = errorStatus("EVAL_TEXT_TO_CHECKLIST", startedAt, error);
    log(config, "error", "EVAL_TEXT_TO_CHECKLIST", status.error || "error");
    return {
      status,
      result: null,
      estimatedCost: 0,
      debug: { model, promptSent: "", rawText: "", usage: null }
    };
  }
}

export async function TRANSCRIBE_AUDIO_CHUNK(config: SpeechEvalConfig, request: {
  audioBase64: string;
  audioFormat: string;
  languageCode?: string;
  transcriptionModel?: string;
}): Promise<TranscribeChunkOutput> {
  const startedAt = new Date().toISOString();
  const model = request.transcriptionModel || config.transcriptionModel || "gpt-4o-mini-transcribe";
  const audioFormat = (request.audioFormat || "wav").replace("audio/", "");
  log(config, "info", "TRANSCRIBE_AUDIO_CHUNK", "start", { model, audioFormat, base64Length: request.audioBase64.length });
  try {
    if (!config.openAiApiKey) throw new Error("OPENAI_API_KEY is not configured.");
    if (!request.audioBase64) throw new Error("TRANSCRIBE_AUDIO_CHUNK requires audioBase64.");
    const bytes = base64ToUint8Array(request.audioBase64);
    const durationSec = estimateWavDurationSec(bytes);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: `audio/${audioFormat}` });
    const formData = new FormData();
    formData.append("file", blob, `chunk.${audioFormat}`);
    formData.append("model", model);
    if (request.languageCode) formData.append("language", request.languageCode);
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${config.openAiApiKey}` },
      body: formData
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`OpenAI transcription failed with ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    const data = await response.json() as { text?: string };
    const output: TranscribeChunkOutput = {
      status: doneStatus("TRANSCRIBE_AUDIO_CHUNK", startedAt),
      text: (data.text || "").trim(),
      estimatedCost: (durationSec / 60) * TRANSCRIPTION_COST_PER_MINUTE,
      debug: { model, audioFormat, audioByteLength: bytes.length, estimatedDurationSec: durationSec }
    };
    log(config, "info", "TRANSCRIBE_AUDIO_CHUNK", "done", { text: output.text, durationSec });
    return output;
  } catch (error) {
    const status = errorStatus("TRANSCRIBE_AUDIO_CHUNK", startedAt, error);
    log(config, "error", "TRANSCRIBE_AUDIO_CHUNK", status.error || "error");
    return {
      status,
      text: "",
      estimatedCost: 0,
      debug: { model, audioFormat, audioByteLength: 0, estimatedDurationSec: 0 }
    };
  }
}

export function SPEECH_EVAL_STREAM_TEXT(config: SpeechEvalConfig, body: TextEvalRequest): Response {
  const startedAt = new Date().toISOString();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: SpeechEvalStreamEvent) => controller.enqueue(encoder.encode(formatSseEvent(event)));
      try {
        send({ type: "start", status: streamingStatus("SPEECH_EVAL_STREAM_TEXT", startedAt) });
        const evalOutput = await EVAL_TEXT_TO_CHECKLIST(config, body);
        if (!evalOutput.status.ok || !evalOutput.result) {
          throw new Error(evalOutput.status.error || "SPEECH_EVAL_STREAM_TEXT eval failed.");
        }
        send(checklistUpdateEvent(evalOutput.result));
        send({ type: "cost", estimatedCost: evalOutput.estimatedCost, note: "text eval" });
        await reportCost(config, "text_eval", evalOutput.estimatedCost);
        send({ type: "done", status: doneStatus("SPEECH_EVAL_STREAM_TEXT", startedAt), fullText: body.fullText.trim() });
      } catch (error) {
        send({ type: "error", status: errorStatus("SPEECH_EVAL_STREAM_TEXT", startedAt, error) });
      } finally {
        controller.close();
      }
    }
  });
  return sseResponse(stream);
}

export function SPEECH_EVAL_STREAM_VOICE(config: SpeechEvalConfig, body: VoiceEvalRequest): Response {
  const startedAt = new Date().toISOString();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: SpeechEvalStreamEvent) => controller.enqueue(encoder.encode(formatSseEvent(event)));
      try {
        send({ type: "start", status: streamingStatus("SPEECH_EVAL_STREAM_VOICE", startedAt) });
        const transcription = await TRANSCRIBE_AUDIO_CHUNK(config, body);
        if (!transcription.status.ok) {
          throw new Error(transcription.status.error || "SPEECH_EVAL_STREAM_VOICE transcription failed.");
        }
        send({ type: "transcript", text: transcription.text });
        const fullText = joinText(body.transcriptSoFar, transcription.text);
        if (!fullText) {
          send({ type: "cost", estimatedCost: transcription.estimatedCost, note: "transcription only, empty chunk" });
          await reportCost(config, "voice_eval", transcription.estimatedCost);
          send({ type: "done", status: doneStatus("SPEECH_EVAL_STREAM_VOICE", startedAt), fullText: "" });
          return;
        }
        const evalOutput = await EVAL_TEXT_TO_CHECKLIST(config, { ...body, fullText });
        if (!evalOutput.status.ok || !evalOutput.result) {
          throw new Error(evalOutput.status.error || "SPEECH_EVAL_STREAM_VOICE eval failed.");
        }
        send(checklistUpdateEvent(evalOutput.result));
        send({
          type: "cost",
          estimatedCost: transcription.estimatedCost + evalOutput.estimatedCost,
          note: "transcription + eval"
        });
        await reportCost(config, "voice_eval", transcription.estimatedCost + evalOutput.estimatedCost);
        send({ type: "done", status: doneStatus("SPEECH_EVAL_STREAM_VOICE", startedAt), fullText });
      } catch (error) {
        send({ type: "error", status: errorStatus("SPEECH_EVAL_STREAM_VOICE", startedAt, error) });
      } finally {
        controller.close();
      }
    }
  });
  return sseResponse(stream);
}

function checklistUpdateEvent(result: SpeechEvalResult): SpeechEvalStreamEvent {
  return {
    type: "checklist_update",
    fields: result.fields,
    nextRecommendedId: result.nextRecommendedId,
    tipNext: result.tipNext,
    tipMissing: result.tipMissing,
    praise: result.praise,
    chatText: result.chatText
  };
}

function sseResponse(stream: ReadableStream<Uint8Array>) {
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function reportCost(config: SpeechEvalConfig, kind: "text_eval" | "voice_eval", estimatedCost: number) {
  try {
    await config.onCost?.({ kind, estimatedCost });
  } catch (error) {
    log(config, "error", "REPORT_COST", error instanceof Error ? error.message : String(error));
  }
}

function joinText(...parts: string[]) {
  return parts.map((part) => (part || "").trim()).filter(Boolean).join(" ");
}

function estimateEvalCost(usage?: { prompt_tokens?: number; completion_tokens?: number }) {
  const inputTokens = usage?.prompt_tokens || 0;
  const outputTokens = usage?.completion_tokens || 0;
  return inputTokens * EVAL_COST_PER_INPUT_TOKEN + outputTokens * EVAL_COST_PER_OUTPUT_TOKEN;
}

function estimateWavDurationSec(bytes: Uint8Array) {
  if (bytes.length > 44 && readAscii(bytes, 0, 4) === "RIFF" && readAscii(bytes, 8, 4) === "WAVE") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const byteRate = view.getUint32(28, true);
    if (byteRate > 0) return (bytes.length - 44) / byteRate;
  }
  return bytes.length / 32_000;
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  let text = "";
  for (let index = 0; index < length; index += 1) text += String.fromCharCode(bytes[offset + index]);
  return text;
}

function base64ToUint8Array(value: string) {
  if (typeof atob === "function") {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  const bufferCtor = (globalThis as unknown as { Buffer?: { from: (value: string, encoding: string) => Uint8Array } }).Buffer;
  if (bufferCtor) return new Uint8Array(bufferCtor.from(value, "base64"));
  throw new Error("Base64 decoding is unavailable.");
}

function streamingStatus(method: string, startedAt: string): MethodStatus {
  return { method, ok: true, phase: "streaming", startedAt };
}

function doneStatus(method: string, startedAt: string): MethodStatus {
  return { method, ok: true, phase: "done", startedAt, finishedAt: new Date().toISOString() };
}

function errorStatus(method: string, startedAt: string, error: unknown): MethodStatus {
  return {
    method,
    ok: false,
    phase: "error",
    startedAt,
    finishedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error)
  };
}

function log(config: SpeechEvalConfig, level: "info" | "error", method: string, message: string, data?: unknown) {
  config.logger?.({ level, method, message, data, createdAt: new Date().toISOString() });
}

export type { ChecklistFieldDefinition, TextEvalRequest, VoiceEvalRequest };
