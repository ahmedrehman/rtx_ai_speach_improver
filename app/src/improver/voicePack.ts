export type VoicePackStatus = {
  method: string;
  ok: boolean;
  phase: "done" | "error";
  startedAt: string;
  finishedAt: string;
  error?: string;
};

export type VoicePackDecision =
  | "send_voice_segment"
  | "skip_no_voice"
  | "skip_too_short"
  | "skip_empty_audio";

export type VoicePack = {
  status: VoicePackStatus;
  decision: VoicePackDecision;
  audio: Blob | null;
  transcript: string;
  debug: {
    threshold: number;
    silenceMs: number;
    preBufferMs: number;
    preBufferIncludedMs: number;
    maxWaitMs: number;
    maxRecordMs: number;
    minVoiceMs: number;
    voiceActiveMs: number;
    durationMs: number;
    maxRms: number;
    averageRms: number;
    mimeType: string;
    size: number;
    reason: string;
    browserSpeechAvailable: boolean;
    browserSpeechFinalDetected: boolean;
    browserSpeechText: string;
  };
};

export type AudioRoundtripResult = {
  status: VoicePackStatus;
  audio: Blob | null;
  debug: {
    endpoint: string;
    requestContentType: string;
    requestSize: number;
    responseContentType: string;
    responseSize: number;
    durationMs: number;
  };
};

type BrowserAudioContextConstructor = typeof AudioContext;
type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  abort: () => void;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};
type BrowserSpeechRecognitionEvent = {
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};
type BrowserSpeechTranscriptCapture = {
  stop: () => { available: boolean; text: string; finalDetected: boolean };
};

export async function OPEN_MICROPHONE(): Promise<{ status: VoicePackStatus; stream: MediaStream | null }> {
  const startedAt = new Date().toISOString();
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Browser microphone API is unavailable.");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });
    return { status: doneStatus("OPEN_MICROPHONE", startedAt), stream };
  } catch (error) {
    return { status: errorStatus("OPEN_MICROPHONE", startedAt, error), stream: null };
  }
}

export async function CAPTURE_VOICE_PACK(input: {
  stream: MediaStream;
  threshold?: number;
  silenceMs?: number;
  preBufferMs?: number;
  maxWaitMs?: number;
  maxRecordMs?: number;
  minVoiceMs?: number;
  mimeType?: string;
  speechRecognitionLang?: string;
  onSample?: (sample: { rms: number; voiceDetected: boolean }) => void;
  shouldStop?: () => boolean;
}): Promise<VoicePack> {
  const startedAt = new Date().toISOString();
  const threshold = input.threshold ?? 0.025;
  const silenceMs = input.silenceMs ?? 650;
  const preBufferMs = input.preBufferMs ?? 1000;
  const maxWaitMs = input.maxWaitMs ?? 8000;
  const maxRecordMs = input.maxRecordMs ?? 6000;
  const minVoiceMs = input.minVoiceMs ?? 180;
  const sampleEveryMs = 50;
  const startedMs = Date.now();
  let voiceActiveMs = 0;
  let maxRms = 0;
  let totalRms = 0;
  let sampleCount = 0;
  let mimeType = "";
  let size = 0;
  let preBufferIncludedMs = 0;
  const speechCapture = startBrowserSpeechTranscriptCapture(input.speechRecognitionLang);

  try {
    if (typeof MediaRecorder === "undefined") throw new Error("Browser MediaRecorder API is unavailable.");
    const AudioContextConstructor = window.AudioContext || browserWindowWithVendors().webkitAudioContext;
    if (!AudioContextConstructor) throw new Error("Browser AudioContext is unavailable.");
    const context = new AudioContextConstructor();
    const source = context.createMediaStreamSource(input.stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const recorderMimeType = chooseMediaRecorderMimeType(input.mimeType);
    const recorder = new MediaRecorder(input.stream, recorderMimeType ? { mimeType: recorderMimeType } : undefined);
    const chunks: Array<{ blob: Blob; receivedAtMs: number }> = [];
    let speechStartedMs = 0;
    let lastVoiceMs = 0;
    let sawVoice = false;
    let stopped = false;

    const audio = await new Promise<Blob | null>((resolve, reject) => {
      const finish = (value: Blob | null) => {
        if (stopped) return;
        stopped = true;
        window.clearInterval(timer);
        source.disconnect();
        void context.close().catch(() => undefined);
        resolve(value);
      };
      const stopRecorder = (sendAudio: boolean) => {
        if (recorder.state === "recording") {
          recorder.onstop = () => {
            if (!sendAudio) {
              finish(null);
              return;
            }
            const includeFromMs = speechStartedMs ? speechStartedMs - preBufferMs : Date.now();
            const selectedChunks = chunks
              .filter((chunk, index) => index === 0 || chunk.receivedAtMs >= includeFromMs)
              .map((chunk) => chunk.blob);
            const blob = new Blob(selectedChunks, { type: mimeType });
            size = blob.size;
            finish(blob);
          };
          recorder.stop();
          return;
        }
        finish(null);
      };
      mimeType = recorder.mimeType || recorderMimeType || "audio/webm";
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push({ blob: event.data, receivedAtMs: Date.now() });
      };
      recorder.onerror = () => reject(new Error("Browser audio pack recording failed."));
      recorder.start(250);

      const timer = window.setInterval(() => {
        if (input.shouldStop?.()) {
          stopRecorder(false);
          return;
        }
        analyser.getByteTimeDomainData(samples);
        const rms = audioRms(samples);
        const voiceDetected = rms >= threshold;
        sampleCount += 1;
        totalRms += rms;
        maxRms = Math.max(maxRms, rms);
        if (voiceDetected) voiceActiveMs += sampleEveryMs;
        input.onSample?.({ rms, voiceDetected });
        const now = Date.now();
        if (voiceDetected) {
          if (!sawVoice) {
            speechStartedMs = now;
            preBufferIncludedMs = Math.min(preBufferMs, Math.max(0, now - startedMs));
          }
          sawVoice = true;
          lastVoiceMs = now;
        }
        if (!sawVoice && now - startedMs >= maxWaitMs) {
          stopRecorder(false);
          return;
        }
        if (sawVoice && now - speechStartedMs >= maxRecordMs) {
          stopRecorder(true);
          return;
        }
        if (sawVoice && now - lastVoiceMs >= silenceMs) {
          stopRecorder(true);
        }
      }, sampleEveryMs);
    });

    const speech = speechCapture.stop();
    const baseDebug = {
      threshold,
      silenceMs,
      preBufferMs,
      preBufferIncludedMs,
      maxWaitMs,
      maxRecordMs,
      minVoiceMs,
      voiceActiveMs,
      durationMs: Date.now() - startedMs,
      maxRms,
      averageRms: averageRms(totalRms, sampleCount),
      mimeType: audio?.type || mimeType,
      size: audio?.size || size,
      browserSpeechAvailable: speech.available,
      browserSpeechFinalDetected: speech.finalDetected,
      browserSpeechText: speech.text
    };
    if (!audio) return voicePackOutput(startedAt, "skip_no_voice", null, { ...baseDebug, reason: "NOT SEND - no voice crossed threshold." }, speech.text);
    if (audio.size <= 0) return voicePackOutput(startedAt, "skip_empty_audio", null, { ...baseDebug, reason: "NOT SEND - recorder produced empty audio." }, speech.text);
    if (voiceActiveMs < minVoiceMs) return voicePackOutput(startedAt, "skip_too_short", audio, { ...baseDebug, reason: "NOT SEND - voice activity was too short." }, speech.text);
    return voicePackOutput(startedAt, "send_voice_segment", audio, { ...baseDebug, reason: "SEND - voice crossed threshold and ended after silence." }, speech.text);
  } catch (error) {
    const speech = speechCapture.stop();
    return {
      status: errorStatus("CAPTURE_VOICE_PACK", startedAt, error),
      decision: "skip_empty_audio",
      audio: null,
      transcript: speech.text,
      debug: {
        threshold,
        silenceMs,
        preBufferMs,
        preBufferIncludedMs,
        maxWaitMs,
        maxRecordMs,
        minVoiceMs,
        voiceActiveMs,
        durationMs: Date.now() - startedMs,
        maxRms,
        averageRms: averageRms(totalRms, sampleCount),
        mimeType,
        size,
        reason: error instanceof Error ? error.message : String(error),
        browserSpeechAvailable: speech.available,
        browserSpeechFinalDetected: speech.finalDetected,
        browserSpeechText: speech.text
      }
    };
  }
}

export async function SERVER_AUDIO_ROUNDTRIP(input: {
  endpoint: string;
  audio: Blob;
}): Promise<AudioRoundtripResult> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const requestContentType = input.audio.type || "application/octet-stream";
  try {
    const response = await fetch(input.endpoint, {
      method: "POST",
      headers: { "Content-Type": requestContentType },
      body: input.audio
    });
    if (!response.ok) throw new Error(await response.text().catch(() => `Audio roundtrip failed with ${response.status}`));
    const audio = await response.blob();
    return {
      status: doneStatus("SERVER_AUDIO_ROUNDTRIP", startedAt),
      audio,
      debug: {
        endpoint: input.endpoint,
        requestContentType,
        requestSize: input.audio.size,
        responseContentType: audio.type || response.headers.get("Content-Type") || "",
        responseSize: audio.size,
        durationMs: Date.now() - startedMs
      }
    };
  } catch (error) {
    return {
      status: errorStatus("SERVER_AUDIO_ROUNDTRIP", startedAt, error),
      audio: null,
      debug: {
        endpoint: input.endpoint,
        requestContentType,
        requestSize: input.audio.size,
        responseContentType: "",
        responseSize: 0,
        durationMs: Date.now() - startedMs
      }
    };
  }
}

export async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

export function audioFormatFromMimeType(mimeType: string) {
  const lower = mimeType.toLowerCase();
  if (lower.includes("webm")) return "webm";
  if (lower.includes("mp4")) return "mp4";
  if (lower.includes("ogg")) return "ogg";
  if (lower.includes("mpeg") || lower.includes("mp3")) return "mp3";
  if (lower.includes("wav") || lower.includes("wave")) return "wav";
  return "webm";
}

function chooseMediaRecorderMimeType(preferred?: string) {
  const candidates = [
    preferred || "",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus"
  ].filter(Boolean);
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return preferred || "";
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
}

function startBrowserSpeechTranscriptCapture(lang = "de-DE"): BrowserSpeechTranscriptCapture {
  const Recognition = browserWindowWithVendors().SpeechRecognition || browserWindowWithVendors().webkitSpeechRecognition;
  if (!Recognition) return { stop: () => ({ available: false, text: "", finalDetected: false }) };
  let text = "";
  let finalDetected = false;
  let abortExpected = false;
  const recognition = new Recognition();
  recognition.lang = lang;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onresult = (event) => {
    const transcripts: string[] = [];
    for (let index = 0; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript.trim();
      if (transcript) transcripts.push(transcript);
      if (event.results[index].isFinal) finalDetected = true;
    }
    text = transcripts.join(" ").trim();
  };
  recognition.onerror = (event) => {
    if (event.error !== "aborted" || !abortExpected) text = text.trim();
  };
  try {
    recognition.start();
  } catch {
    return { stop: () => ({ available: false, text: "", finalDetected: false }) };
  }
  return {
    stop: () => {
      abortExpected = true;
      try {
        recognition.abort();
      } catch {
        // Browser cleanup only.
      }
      return { available: true, text: text.trim(), finalDetected };
    }
  };
}

function browserWindowWithVendors() {
  return window as Window & {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitAudioContext?: BrowserAudioContextConstructor;
  };
}

function voicePackOutput(
  startedAt: string,
  decision: VoicePackDecision,
  audio: Blob | null,
  debug: VoicePack["debug"],
  transcript = ""
): VoicePack {
  return { status: doneStatus("CAPTURE_VOICE_PACK", startedAt), decision, audio, transcript, debug };
}

function audioRms(samples: Uint8Array) {
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const centered = (samples[index] - 128) / 128;
    sum += centered * centered;
  }
  return Number(Math.sqrt(sum / samples.length).toFixed(4));
}

function averageRms(totalRms: number, sampleCount: number) {
  return Number((sampleCount ? totalRms / sampleCount : 0).toFixed(4));
}

function doneStatus(method: string, startedAt: string): VoicePackStatus {
  return { method, ok: true, phase: "done", startedAt, finishedAt: new Date().toISOString() };
}

function errorStatus(method: string, startedAt: string, error: unknown): VoicePackStatus {
  return { method, ok: false, phase: "error", startedAt, finishedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) };
}
