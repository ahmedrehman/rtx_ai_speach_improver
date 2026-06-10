# lib_speech_contract

- shared contract between client and server
- pure code only: types, defaults, prompt building, SSE encoding
- no fetch calls, no API keys, no browser APIs

## contents

- `ChecklistFieldDefinition` — id, label, description
- `DEFAULT_CHECKLIST` — the six default speech elements from `plan/speach_improver.md`
- `DEFAULT_PROMPT_TEMPLATE` — eval system prompt template with `{{CHECKLIST}}` and `{{LANGUAGE}}` placeholders
- `buildEvalSystemPrompt` — checklist + language + template -> system prompt
- `buildEvalJsonSchema` — checklist -> strict JSON schema for the eval model
- `normalizeEvalResult` — raw model JSON -> `SpeechEvalResult` (always one entry per checklist field)
- `SpeechEvalStreamEvent` — SSE event union: `start`, `transcript`, `checklist_update`, `cost`, `done`, `error`
- `formatSseEvent` / `consumeSseEvents` — SSE `data: {json}\n\n` encoding and incremental parsing
