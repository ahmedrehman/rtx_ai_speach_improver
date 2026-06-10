import "./test_env";
import test from "node:test";
import assert from "node:assert/strict";
import { consumeSseEvents, DEFAULT_CHECKLIST, type SpeechEvalStreamEvent } from "../lib_speech_contract";
import { EVAL_TEXT_TO_CHECKLIST, SPEECH_EVAL_STREAM_TEXT } from "../lib_server_speech_eval";

const apiKey = process.env.OPENAI_API_KEY || "";
const skip = apiKey ? false : "OPENAI_API_KEY is not set";

const sampleText = [
  "Hallo zusammen, schön dass ihr da seid.",
  "Ich erkläre euch heute, warum unser Lieferwagen, der weiße Sprinter, morgens nicht anspringt.",
  "Das Kernproblem ist die schwache Batterie."
].join(" ");

test("real eval returns one result per checklist field", { skip }, async () => {
  const output = await EVAL_TEXT_TO_CHECKLIST(
    { openAiApiKey: apiKey },
    { fullText: sampleText, checklist: DEFAULT_CHECKLIST, language: "Deutsch" }
  );
  assert.equal(output.status.ok, true, output.status.error);
  assert.ok(output.result);
  assert.equal(output.result.fields.length, DEFAULT_CHECKLIST.length);
  const ids = new Set(DEFAULT_CHECKLIST.map((field) => field.id));
  assert.ok(ids.has(output.result.nextRecommendedId));
  assert.ok(output.result.tipNext.length > 0);
  assert.ok(output.estimatedCost > 0);
  const topic = output.result.fields.find((field) => field.id === "topic");
  assert.notEqual(topic?.status, "missing", "topic is clearly named in the sample text");
});

test("real text eval stream sends checklist_update and done", { skip }, async () => {
  const response = SPEECH_EVAL_STREAM_TEXT(
    { openAiApiKey: apiKey },
    { fullText: sampleText, checklist: DEFAULT_CHECKLIST, language: "Deutsch" }
  );
  const text = await response.text();
  const { events } = consumeSseEvents<SpeechEvalStreamEvent>(text);
  const types = events.map((event) => event.type);
  assert.deepEqual(types, ["start", "checklist_update", "cost", "done"]);
});
