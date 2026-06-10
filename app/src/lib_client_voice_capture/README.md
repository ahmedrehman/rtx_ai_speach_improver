# lib_client_voice_capture

- client-side only
- browser APIs only
- no API keys
- no OpenAI calls
- every method returns `status`
- caller evaluates `status`
- adapted from project 1 `lib_client_voice_system`, reduced to chunk capture (no speaker, no TTS)

## `SYSTEM_MEANINGFUL_AUDIO_CHUNK`

- does: client microphone -> useful audio chunk
- input: `maxDurationMs`, `silenceMs`, `speechCheckLang`
- output: `{ audio, mimeType, durationMs, chunkReason, browserSpeechText, energyCheck }`
- uses browser speech checker if available:
  - stops on final speech
  - or stops after silence
- without speech checker: records until max duration, reason `no_speech_checker`
- the energy check reports whether the chunk contained real sound (`energyCheck.hasSound`)

## `SYSTEM_AUDIO_ENERGY_CHECK`

- does: RMS energy measurement on a microphone stream
- used by the chunk method to detect silent chunks

## `AUDIO_BLOB_TO_WAV_BASE64`

- does: browser audio blob (webm/ogg) -> WAV (or passthrough mp3/wav) -> base64
- output: `{ audioBase64, audioFormat, conversion }`
- ready to send to the server voice eval endpoint

## config

```ts
type ClientVoiceConfig = {
  logger?: (event) => void;
};
```
