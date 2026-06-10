# Streaming API

Gleiche Streaming-Strategie wie Projekt 1 (`rtx_ai_voice_trainer`): Client POSTet JSON,
Server antwortet mit `text/event-stream`, jede Zeile ist ein Frame `data: {json}\n\n`.
Der Client liest `response.body.getReader()` und parst inkrementell mit
`consumeSseEvents` (in `app/src/lib_speech_contract`).

## Endpunkte

Alle Pfade funktionieren in Root- und Subfolder-Deployments: der Worker entfernt
`APP_BASE_PATH` vor dem Routing (`stripBasePath` in `app/src/server/http.ts`), der
Client baut die URL mit `import.meta.env.BASE_URL`.

### `GET /api/improver/health`

```json
{ "ok": true, "hasOpenAiApiKey": true }
```

### `POST /api/improver/text-eval-stream`

Auswertung des getippten/akkumulierten Texts. Wird beim Tippen debounced (~1.5 s) aufgerufen.

Request:

```json
{
  "fullText": "die komplette Erklärung bis jetzt",
  "checklist": [{ "id": "intro", "label": "...", "description": "..." }],
  "language": "Deutsch",
  "promptTemplate": "optional, sonst Default",
  "evalModel": "optional, Default gpt-4o-mini"
}
```

Events: `start` → `checklist_update` → `cost` → `done` (oder `error`).

### `POST /api/improver/voice-eval-stream`

Ein Mikrofon-Chunk. Der Server transkribiert den Chunk, hängt ihn an `transcriptSoFar`
und wertet den Gesamttext aus.

Request:

```json
{
  "audioBase64": "...",
  "audioFormat": "wav",
  "transcriptSoFar": "bisheriges Transkript inkl. getipptem Text",
  "languageCode": "de",
  "checklist": [ ... ],
  "language": "Deutsch",
  "promptTemplate": "optional",
  "evalModel": "optional",
  "transcriptionModel": "optional, Default gpt-4o-mini-transcribe"
}
```

Events: `start` → `transcript` → `checklist_update` → `cost` → `done` (oder `error`).
Leere Transkripte überspringen die Eval: `start` → `transcript` (leer) → `cost` → `done`.

## SSE-Events

```ts
type SpeechEvalStreamEvent =
  | { type: "start"; status: MethodStatus }                 // phase: "streaming"
  | { type: "transcript"; text: string }                    // nur voice: Chunk-Transkript
  | {
      type: "checklist_update";
      fields: { id: string; status: "missing" | "partial" | "fulfilled"; comment: string }[];
      nextRecommendedId: string;   // dieses Feld als Nächstes angehen
      tipNext: string;             // was als Nächstes fehlt (konkret)
      tipMissing: string;          // was insgesamt noch fehlt
      praise: string;              // was schon gut ist
    }
  | { type: "cost"; estimatedCost: number; note: string }   // USD, grobe Schätzung
  | { type: "done"; status: MethodStatus; fullText: string }
  | { type: "error"; status: MethodStatus };
```

`MethodStatus` = `{ method, ok, phase: "streaming"|"done"|"error", startedAt, finishedAt?, error? }`.

## Eval-Modell: vorbereitetes JSON-Schema (Structured Outputs)

Der Server ruft OpenAI `POST /v1/chat/completions` mit
`response_format: { type: "json_schema", json_schema: { strict: true, schema } }` auf.
Das Schema wird aus der Checkliste generiert (`buildEvalJsonSchema`), die Feld-IDs sind
Enums — das Modell kann keine fremden IDs liefern:

```json
{
  "type": "object",
  "properties": {
    "fields": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "enum": ["intro", "topic", "..."] },
          "status": { "type": "string", "enum": ["missing", "partial", "fulfilled"] },
          "comment": { "type": "string" }
        },
        "required": ["id", "status", "comment"]
      }
    },
    "next_recommended_id": { "type": "string", "enum": ["intro", "topic", "..."] },
    "tip_next": { "type": "string" },
    "tip_missing": { "type": "string" },
    "praise": { "type": "string" }
  },
  "required": ["fields", "next_recommended_id", "tip_next", "tip_missing", "praise"]
}
```

`normalizeEvalResult` garantiert danach: genau ein Eintrag pro Checklisten-Feld,
ungültige Status werden zu `missing`, ungültige `next_recommended_id` fällt auf das
erste offene Feld zurück.

## Prompt-Generierung

Der Systemprompt entsteht aus dem editierbaren Template (Config-Seite) durch Ersetzen von:

- `{{CHECKLIST}}` → generierte Liste `- id: Label — Beschreibung` pro Feld
- `{{LANGUAGE}}` → Sprache der Hinweise (z. B. „Deutsch")

Default-Template und Default-Checkliste: `app/src/lib_speech_contract/index.ts`.
