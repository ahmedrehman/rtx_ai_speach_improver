import test from "node:test";
import assert from "node:assert/strict";
import { consumeSseEvents, formatSseEvent, type SpeechEvalStreamEvent } from "../lib_speech_contract";

const startEvent: SpeechEvalStreamEvent = {
  type: "start",
  status: { method: "SPEECH_EVAL_STREAM_TEXT", ok: true, phase: "streaming", startedAt: "2026-01-01T00:00:00.000Z" }
};

const transcriptEvent: SpeechEvalStreamEvent = { type: "transcript", text: "Hallo zusammen" };

test("format and consume round-trips events", () => {
  const wire = formatSseEvent(startEvent) + formatSseEvent(transcriptEvent);
  const parsed = consumeSseEvents(wire);
  assert.equal(parsed.events.length, 2);
  assert.deepEqual(parsed.events[0], startEvent);
  assert.deepEqual(parsed.events[1], transcriptEvent);
  assert.equal(parsed.remaining, "");
});

test("partial frames stay in the remaining buffer", () => {
  const wire = formatSseEvent(startEvent);
  const cut = wire.length - 5;
  const first = consumeSseEvents(wire.slice(0, cut));
  assert.equal(first.events.length, 0);
  const second = consumeSseEvents(first.remaining + wire.slice(cut) + formatSseEvent(transcriptEvent));
  assert.equal(second.events.length, 2);
});

test("invalid json frames are skipped", () => {
  const parsed = consumeSseEvents("data: {broken\n\n" + formatSseEvent(transcriptEvent));
  assert.equal(parsed.events.length, 1);
  assert.deepEqual(parsed.events[0], transcriptEvent);
});
