import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChecklistPromptList,
  buildEvalJsonSchema,
  buildEvalSystemPrompt,
  DEFAULT_CHECKLIST,
  normalizeEvalResult
} from "../lib_speech_contract";

test("system prompt contains every checklist field and no placeholders", () => {
  const prompt = buildEvalSystemPrompt({ checklist: DEFAULT_CHECKLIST, language: "Deutsch" });
  for (const field of DEFAULT_CHECKLIST) {
    assert.ok(prompt.includes(field.id), `prompt should mention id ${field.id}`);
    assert.ok(prompt.includes(field.label), `prompt should mention label ${field.label}`);
  }
  assert.ok(prompt.includes("Deutsch"));
  assert.ok(!prompt.includes("{{CHECKLIST}}"));
  assert.ok(!prompt.includes("{{LANGUAGE}}"));
});

test("custom prompt template is used with placeholders replaced", () => {
  const prompt = buildEvalSystemPrompt({
    checklist: [{ id: "one", label: "Eins", description: "Erster Punkt" }],
    language: "English",
    promptTemplate: "START {{CHECKLIST}} MIDDLE {{LANGUAGE}} END"
  });
  assert.ok(prompt.startsWith("START"));
  assert.ok(prompt.endsWith("END"));
  assert.ok(prompt.includes("- one: Eins — Erster Punkt"));
  assert.ok(prompt.includes("MIDDLE English"));
});

test("json schema enums match checklist ids", () => {
  const schema = buildEvalJsonSchema(DEFAULT_CHECKLIST) as {
    properties: {
      fields: { items: { properties: { id: { enum: string[] } } } };
      next_recommended_id: { enum: string[] };
    };
    required: string[];
  };
  const ids = DEFAULT_CHECKLIST.map((field) => field.id);
  assert.deepEqual(schema.properties.fields.items.properties.id.enum, ids);
  assert.deepEqual(schema.properties.next_recommended_id.enum, ids);
  assert.deepEqual(schema.required, ["fields", "next_recommended_id", "tip_next", "tip_missing", "praise", "chat_text"]);
});

test("empty checklist throws", () => {
  assert.throws(() => buildChecklistPromptList([]));
  assert.throws(() => buildEvalJsonSchema([]));
});

test("duplicate checklist ids throw", () => {
  assert.throws(() => buildEvalJsonSchema([
    { id: "a", label: "A", description: "" },
    { id: "a", label: "B", description: "" }
  ]));
});

test("normalizeEvalResult always returns one entry per checklist field", () => {
  const result = normalizeEvalResult(
    {
      fields: [
        { id: "topic", status: "fulfilled", comment: "Thema klar." },
        { id: "unknown_id", status: "fulfilled", comment: "ignored" },
        { id: "intro", status: "weird_status", comment: "" }
      ],
      next_recommended_id: "unknown_id",
      tip_next: "Sag warum.",
      tip_missing: "Warum und Beispiel fehlen.",
      praise: "Gut angefangen.",
      chat_text: "Gut angefangen. Sag warum."
    },
    DEFAULT_CHECKLIST
  );
  assert.equal(result.fields.length, DEFAULT_CHECKLIST.length);
  assert.equal(result.fields.find((field) => field.id === "topic")?.status, "fulfilled");
  assert.equal(result.fields.find((field) => field.id === "intro")?.status, "missing");
  assert.ok(!result.fields.some((field) => field.id === "unknown_id"));
  assert.equal(result.nextRecommendedId, "intro", "invalid next id falls back to first open field");
  assert.equal(result.tipNext, "Sag warum.");
  assert.equal(result.chatText, "Gut angefangen. Sag warum.");
});
