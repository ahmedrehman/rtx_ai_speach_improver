# lib_server_speech_eval

- role: server AI methods for the speech improver
- server-side only
- no DB access
- no app settings access
- prompts and checklist are input values
- caller chooses models and provides the API key
- every method returns `status` (`method`, `ok`, `phase`, `startedAt`, `finishedAt`, `error`)

## `EVAL_TEXT_TO_CHECKLIST`

- role: explanation text -> structured checklist evaluation
- provider call: OpenAI `POST /v1/chat/completions` with strict `json_schema` response format
- input: `fullText`, `checklist`, `language`, optional `promptTemplate`, optional `evalModel`
- output: `status`, `result` (`fields[]`, `nextRecommendedId`, `tipNext`, `tipMissing`, `praise`), `estimatedCost`, `debug`
- the result always contains exactly one entry per checklist field (`normalizeEvalResult`)

## `TRANSCRIBE_AUDIO_CHUNK`

- role: audio chunk -> transcript text
- provider call: OpenAI `POST /v1/audio/transcriptions` (multipart)
- input: `audioBase64`, `audioFormat`, optional `languageCode`, optional `transcriptionModel`
- output: `status`, `text`, `estimatedCost` (from WAV header duration), `debug`
- transcription only, no judgement

## `SPEECH_EVAL_STREAM_TEXT`

- role: SSE endpoint body for typed text
- events: `start` -> `checklist_update` -> `cost` -> `done` (or `error`)
- response: `text/event-stream` with `data: {json}\n\n` frames

## `SPEECH_EVAL_STREAM_VOICE`

- role: SSE endpoint body for one microphone chunk
- transcribes the chunk, joins it with `transcriptSoFar`, then evaluates the joined text
- events: `start` -> `transcript` -> `checklist_update` -> `cost` -> `done` (or `error`)
- empty transcript chunks skip the eval and finish with `done` and an empty `fullText`
