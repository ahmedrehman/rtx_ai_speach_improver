export type MethodStatus = {
  method: string;
  ok: boolean;
  phase: "streaming" | "done" | "error";
  startedAt: string;
  finishedAt?: string;
  error?: string;
};

export type ChecklistFieldDefinition = {
  id: string;
  label: string;
  description: string;
};

export type ChecklistFieldStatus = "missing" | "partial" | "fulfilled";

export type ChecklistFieldResult = {
  id: string;
  status: ChecklistFieldStatus;
  comment: string;
};

export type SpeechEvalResult = {
  fields: ChecklistFieldResult[];
  nextRecommendedId: string;
  tipNext: string;
  tipMissing: string;
  praise: string;
  chatText: string;
};

export type TextEvalRequest = {
  fullText: string;
  checklist: ChecklistFieldDefinition[];
  language: string;
  promptTemplate?: string;
  evalModel?: string;
};

export type VoiceEvalRequest = {
  audioBase64: string;
  audioFormat: string;
  transcriptSoFar: string;
  languageCode?: string;
  checklist: ChecklistFieldDefinition[];
  language: string;
  promptTemplate?: string;
  evalModel?: string;
  transcriptionModel?: string;
};

export type SpeechEvalStreamEvent =
  | { type: "start"; status: MethodStatus }
  | { type: "transcript"; text: string }
  | {
      type: "checklist_update";
      fields: ChecklistFieldResult[];
      nextRecommendedId: string;
      tipNext: string;
      tipMissing: string;
      praise: string;
      chatText: string;
    }
  | { type: "cost"; estimatedCost: number; note: string }
  | { type: "done"; status: MethodStatus; fullText: string }
  | { type: "error"; status: MethodStatus };

export const DEFAULT_CHECKLIST: ChecklistFieldDefinition[] = [
  {
    id: "intro",
    label: "Hörer abholen / Einstieg",
    description: "Der Sprecher holt die Zuhörer ab: kurzer Einstieg, Anlass und Situation sind klar (wo sind wir, worum geht es gleich)."
  },
  {
    id: "topic",
    label: "Thema klar benennen",
    description: "Das Thema ist konkret benannt: worum genau geht es (zum Beispiel welches Auto, welches Projekt), nicht nur eine vage Andeutung."
  },
  {
    id: "precision",
    label: "Präzise auf den Punkt",
    description: "Die Erklärung ist präzise: nicht zu vage, nicht überdetailliert, sie trifft den Punkt."
  },
  {
    id: "core_problem",
    label: "Kernproblem benennen",
    description: "Das Kernproblem oder die Kernaussage ist klar herausgearbeitet."
  },
  {
    id: "why",
    label: "Warum / Relevanz",
    description: "Es wird klar, warum das gesagt wird, wofür es wichtig ist und warum es die Zuhörer interessieren soll."
  },
  {
    id: "proof",
    label: "Beispiel / Beweis / Begründung",
    description: "Mindestens ein Beispiel, ein Beleg oder eine nachvollziehbare Begründung stützt die Aussage."
  }
];

export const DEFAULT_PROMPT_TEMPLATE = [
  "You are SPEECH_IMPROVER, a strict but friendly speaking coach.",
  "The user is explaining something out loud or in writing. You receive the full explanation so far.",
  "The user may still be in the middle of the explanation. Judge only what is there so far, item by item.",
  "Evaluate the explanation against this checklist:",
  "{{CHECKLIST}}",
  "Rules:",
  "- status \"fulfilled\": green. The item is sufficiently covered / OK.",
  "- status \"partial\": yellow. The item is present but improvable.",
  "- status \"missing\": red. The item is missing, unclear, or wrong.",
  "- comment: one short sentence per item in {{LANGUAGE}} (empty string if there is nothing useful to say).",
  "- next_recommended_id: the single checklist id the speaker should work on next.",
  "- tip_next: one short, concrete tip in {{LANGUAGE}} telling the speaker what to add next.",
  "- tip_missing: one short sentence in {{LANGUAGE}} summarizing everything that is still missing.",
  "- praise: one short sentence in {{LANGUAGE}} about what is already good (empty string if nothing yet).",
  "- chat_text: one short coach message in {{LANGUAGE}} that can be shown directly in the chat. It must combine useful praise and the next concrete instruction.",
  "- Address the user directly and informally.",
  "- Answer only through the JSON schema, nothing else."
].join("\n");

export function buildChecklistPromptList(checklist: ChecklistFieldDefinition[]) {
  assertChecklist(checklist);
  return checklist.map((field) => `- ${field.id}: ${field.label} — ${field.description}`).join("\n");
}

export function buildEvalSystemPrompt(input: {
  checklist: ChecklistFieldDefinition[];
  language: string;
  promptTemplate?: string;
}) {
  const template = (input.promptTemplate || "").trim() || DEFAULT_PROMPT_TEMPLATE;
  const language = input.language.trim() || "Deutsch";
  return template
    .split("{{CHECKLIST}}").join(buildChecklistPromptList(input.checklist))
    .split("{{LANGUAGE}}").join(language);
}

export function buildEvalJsonSchema(checklist: ChecklistFieldDefinition[]) {
  assertChecklist(checklist);
  const ids = checklist.map((field) => field.id);
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      fields: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string", enum: ids },
            status: { type: "string", enum: ["missing", "partial", "fulfilled"] },
            comment: { type: "string" }
          },
          required: ["id", "status", "comment"]
        }
      },
      next_recommended_id: { type: "string", enum: ids },
      tip_next: { type: "string" },
      tip_missing: { type: "string" },
      praise: { type: "string" },
      chat_text: { type: "string" }
    },
    required: ["fields", "next_recommended_id", "tip_next", "tip_missing", "praise", "chat_text"]
  };
}

export function normalizeEvalResult(raw: unknown, checklist: ChecklistFieldDefinition[]): SpeechEvalResult {
  assertChecklist(checklist);
  const parsed = (raw && typeof raw === "object" ? raw : {}) as {
    fields?: Array<{ id?: string; status?: string; comment?: string }>;
    next_recommended_id?: string;
    tip_next?: string;
    tip_missing?: string;
    praise?: string;
    chat_text?: string;
  };
  const byId = new Map<string, ChecklistFieldResult>();
  for (const item of parsed.fields || []) {
    if (!item?.id) continue;
    byId.set(item.id, {
      id: item.id,
      status: item.status === "fulfilled" || item.status === "partial" ? item.status : "missing",
      comment: String(item.comment || "")
    });
  }
  const fields = checklist.map((field) => byId.get(field.id) || { id: field.id, status: "missing" as const, comment: "" });
  const ids = new Set(checklist.map((field) => field.id));
  const firstOpenId = fields.find((field) => field.status !== "fulfilled")?.id || checklist[0].id;
  const nextRecommendedId = parsed.next_recommended_id && ids.has(parsed.next_recommended_id)
    ? parsed.next_recommended_id
    : firstOpenId;
  const praise = String(parsed.praise || "");
  const tipNext = String(parsed.tip_next || "");
  const chatText = String(parsed.chat_text || [praise, tipNext].filter(Boolean).join(" "));
  return {
    fields,
    nextRecommendedId,
    tipNext,
    tipMissing: String(parsed.tip_missing || ""),
    praise,
    chatText
  };
}

export function formatSseEvent(event: SpeechEvalStreamEvent) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function consumeSseEvents<T = SpeechEvalStreamEvent>(text: string): { events: T[]; remaining: string } {
  const parts = text.split("\n\n");
  const remaining = parts.pop() || "";
  const events = parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.startsWith("data:") ? part.slice(5).trim() : part))
    .map((jsonText) => {
      try {
        return JSON.parse(jsonText) as T;
      } catch {
        return null;
      }
    })
    .filter((event): event is T => Boolean(event));
  return { events, remaining };
}

function assertChecklist(checklist: ChecklistFieldDefinition[]) {
  if (!Array.isArray(checklist) || checklist.length === 0) {
    throw new Error("Checklist needs at least one field.");
  }
  const seen = new Set<string>();
  for (const field of checklist) {
    const id = (field.id || "").trim();
    if (!id) throw new Error("Every checklist field needs a non-empty id.");
    if (seen.has(id)) throw new Error(`Checklist field id is duplicated: ${id}`);
    seen.add(id);
  }
}
