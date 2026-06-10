import test from "node:test";
import assert from "node:assert/strict";
import { consumeSseEvents, DEFAULT_CHECKLIST, type SpeechEvalStreamEvent } from "../lib_speech_contract";
import { EVAL_TEXT_TO_CHECKLIST, SPEECH_EVAL_STREAM_TEXT, SPEECH_EVAL_STREAM_VOICE, TRANSCRIBE_AUDIO_CHUNK } from "../lib_server_speech_eval";

const baseRequest = {
  fullText: "Hallo, ich erkläre euch heute etwas.",
  checklist: DEFAULT_CHECKLIST,
  language: "Deutsch"
};

test("EVAL_TEXT_TO_CHECKLIST without key returns error status", async () => {
  const output = await EVAL_TEXT_TO_CHECKLIST({}, baseRequest);
  assert.equal(output.status.ok, false);
  assert.match(output.status.error || "", /OPENAI_API_KEY/);
  assert.equal(output.result, null);
});

test("EVAL_TEXT_TO_CHECKLIST with empty text returns error status", async () => {
  const output = await EVAL_TEXT_TO_CHECKLIST({ openAiApiKey: "test-key" }, { ...baseRequest, fullText: "  " });
  assert.equal(output.status.ok, false);
  assert.match(output.status.error || "", /fullText/);
});

test("TRANSCRIBE_AUDIO_CHUNK without key returns error status", async () => {
  const output = await TRANSCRIBE_AUDIO_CHUNK({}, { audioBase64: "AAAA", audioFormat: "wav" });
  assert.equal(output.status.ok, false);
  assert.match(output.status.error || "", /OPENAI_API_KEY/);
});

test("SPEECH_EVAL_STREAM_TEXT without key streams start then error", async () => {
  const response = SPEECH_EVAL_STREAM_TEXT({}, baseRequest);
  assert.equal(response.headers.get("Content-Type"), "text/event-stream; charset=utf-8");
  const text = await response.text();
  const { events } = consumeSseEvents<SpeechEvalStreamEvent>(text);
  assert.equal(events[0]?.type, "start");
  const errorEvent = events.find((event) => event.type === "error");
  assert.ok(errorEvent, "stream should contain an error event");
  assert.match(errorEvent.type === "error" ? errorEvent.status.error || "" : "", /OPENAI_API_KEY/);
});

test("SPEECH_EVAL_STREAM_VOICE without key streams start then error", async () => {
  const response = SPEECH_EVAL_STREAM_VOICE({}, {
    audioBase64: "AAAA",
    audioFormat: "wav",
    transcriptSoFar: "",
    checklist: DEFAULT_CHECKLIST,
    language: "Deutsch"
  });
  const text = await response.text();
  const { events } = consumeSseEvents<SpeechEvalStreamEvent>(text);
  assert.equal(events[0]?.type, "start");
  assert.ok(events.some((event) => event.type === "error"));
});
