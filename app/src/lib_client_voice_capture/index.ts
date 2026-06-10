export type ClientVoiceLogEvent = {
  level: "info" | "error";
  method: string;
  message: string;
  data?: unknown;
  createdAt: string;
};

export type ClientVoiceLogger = (event: ClientVoiceLogEvent) => void;

export type ClientVoiceConfig = {
  logger?: ClientVoiceLogger;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  abort: () => void;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type BrowserSpeechRecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitAudioContext?: typeof AudioContext;
  }
}

export type MethodStatus = {
  method: string;
  ok: boolean;
  phase: "done" | "error";
  startedAt: string;
  finishedAt: string;
  error?: string;
};

export type SystemMeaningfulAudioChunkInput = {
  maxDurationMs: number;
  silenceMs?: number;
  mediaChunkMs?: number;
  speechCheckLang?: string;
  mimeType?: string;
  energyThreshold?: number;
  minEnergyActiveMs?: number;
};

export type SystemAudioEnergyCheckInput = {
  stream: MediaStream;
  threshold?: number;
  minActiveMs?: number;
  sampleEveryMs?: number;
};

export type SystemAudioEnergyCheckOutput = {
  implemented: true;
  available: boolean;
  threshold: number;
  minActiveMs: number;
  activeMs: number;
  maxRms: number;
  averageRms: number;
  hasSound: boolean;
  sampleCount: number;
  error?: string;
};

export type SystemAudioEnergyCheckController = {
  start: () => void;
  stop: () => void;
  summary: () => SystemAudioEnergyCheckOutput;
};

export type SystemMeaningfulAudioChunkOutput = {
  status: MethodStatus;
  audio: Blob | null;
  mimeType: string;
  durationMs: number;
  chunkReason: "browser_speech_final" | "silence_after_sound" | "max_duration" | "no_speech_checker";
  browserSpeechText?: string;
  mediaChunkMs: number;
  mediaChunkCount: number;
  browserSpeechFinalDetected: boolean;
  energyCheck: SystemAudioEnergyCheckOutput;
};

export async function SYSTEM_MEANINGFUL_AUDIO_CHUNK(config: ClientVoiceConfig, input: SystemMeaningfulAudioChunkInput): Promise<SystemMeaningfulAudioChunkOutput> {
  const startedAt = new Date().toISOString();
  log(config, "info", "SYSTEM_MEANINGFUL_AUDIO_CHUNK", "start", input);
  const unavailableEnergyCheck = emptyEnergyCheck(input.energyThreshold ?? 0.035, input.minEnergyActiveMs ?? 250);
  const mediaChunkMs = Math.max(100, input.mediaChunkMs ?? 250);
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    const error = new Error("client microphone API not available");
    log(config, "error", "SYSTEM_MEANINGFUL_AUDIO_CHUNK", error.message);
    return { status: errorStatus("SYSTEM_MEANINGFUL_AUDIO_CHUNK", startedAt, error), audio: null, mimeType: input.mimeType || "", durationMs: 0, chunkReason: "no_speech_checker", browserSpeechText: "", mediaChunkMs, mediaChunkCount: 0, browserSpeechFinalDetected: false, energyCheck: unavailableEnergyCheck };
  }
  if (typeof MediaRecorder === "undefined") {
    const error = new Error("client MediaRecorder API not available");
    log(config, "error", "SYSTEM_MEANINGFUL_AUDIO_CHUNK", error.message);
    return { status: errorStatus("SYSTEM_MEANINGFUL_AUDIO_CHUNK", startedAt, error), audio: null, mimeType: input.mimeType || "", durationMs: 0, chunkReason: "no_speech_checker", browserSpeechText: "", mediaChunkMs, mediaChunkCount: 0, browserSpeechFinalDetected: false, energyCheck: unavailableEnergyCheck };
  }
  if (input.mimeType && typeof MediaRecorder.isTypeSupported === "function" && !MediaRecorder.isTypeSupported(input.mimeType)) {
    const error = new Error(`client MediaRecorder MIME type not supported: ${input.mimeType}`);
    log(config, "error", "SYSTEM_MEANINGFUL_AUDIO_CHUNK", error.message);
    return { status: errorStatus("SYSTEM_MEANINGFUL_AUDIO_CHUNK", startedAt, error), audio: null, mimeType: input.mimeType, durationMs: 0, chunkReason: "no_speech_checker", browserSpeechText: "", mediaChunkMs, mediaChunkCount: 0, browserSpeechFinalDetected: false, energyCheck: unavailableEnergyCheck };
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (error) {
    log(config, "error", "SYSTEM_MEANINGFUL_AUDIO_CHUNK", error instanceof Error ? error.message : "microphone permission failed");
    return { status: errorStatus("SYSTEM_MEANINGFUL_AUDIO_CHUNK", startedAt, error), audio: null, mimeType: input.mimeType || "", durationMs: 0, chunkReason: "no_speech_checker", browserSpeechText: "", mediaChunkMs, mediaChunkCount: 0, browserSpeechFinalDetected: false, energyCheck: unavailableEnergyCheck };
  }

  const chunks: Blob[] = [];
  const startedMs = Date.now();
  const energyThreshold = input.energyThreshold ?? 0.035;
  const minEnergyActiveMs = input.minEnergyActiveMs ?? 250;
  const energyCheck = SYSTEM_AUDIO_ENERGY_CHECK(config, { stream, threshold: energyThreshold, minActiveMs: minEnergyActiveMs });
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, input.mimeType ? { mimeType: input.mimeType } : undefined);
  } catch (error) {
    energyCheck.stop();
    stream.getTracks().forEach((track) => track.stop());
    log(config, "error", "SYSTEM_MEANINGFUL_AUDIO_CHUNK", error instanceof Error ? error.message : "MediaRecorder creation failed");
    return { status: errorStatus("SYSTEM_MEANINGFUL_AUDIO_CHUNK", startedAt, error), audio: null, mimeType: input.mimeType || "", durationMs: 0, chunkReason: "no_speech_checker", browserSpeechText: "", mediaChunkMs, mediaChunkCount: 0, browserSpeechFinalDetected: false, energyCheck: energyCheck.summary() };
  }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition: BrowserSpeechRecognition | null = null;
  let browserSpeechText = "";
  let stopReason: SystemMeaningfulAudioChunkOutput["chunkReason"] = Recognition ? "max_duration" : "no_speech_checker";
  let browserSpeechFinalDetected = false;
  let finished = false;
  let speechCheckerAbortExpected = false;
  let silenceTimer: number | undefined;
  let maxTimer: number | undefined;

  function stop(reason: SystemMeaningfulAudioChunkOutput["chunkReason"]) {
    if (finished) return;
    finished = true;
    stopReason = reason;
    if (silenceTimer) window.clearTimeout(silenceTimer);
    if (maxTimer) window.clearTimeout(maxTimer);
    speechCheckerAbortExpected = true;
    recognition?.abort();
    if (recorder.state === "recording") recorder.stop();
  }

  function scheduleStop(reason: SystemMeaningfulAudioChunkOutput["chunkReason"]) {
    if (finished) return;
    if (silenceTimer) window.clearTimeout(silenceTimer);
    silenceTimer = window.setTimeout(() => stop(reason), input.silenceMs || 1200);
  }

  return new Promise((resolve) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => {
      energyCheck.stop();
      stream.getTracks().forEach((track) => track.stop());
      const error = new Error("client chunk recording failed");
      log(config, "error", "SYSTEM_MEANINGFUL_AUDIO_CHUNK", error.message);
      resolve({ status: errorStatus("SYSTEM_MEANINGFUL_AUDIO_CHUNK", startedAt, error), audio: null, mimeType: recorder.mimeType || input.mimeType || "", durationMs: Date.now() - startedMs, chunkReason: stopReason, browserSpeechText, mediaChunkMs, mediaChunkCount: chunks.length, browserSpeechFinalDetected, energyCheck: energyCheck.summary() });
    };
    recorder.onstop = () => {
      energyCheck.stop();
      stream.getTracks().forEach((track) => track.stop());
      const mimeType = recorder.mimeType || input.mimeType || "audio/webm";
      const audio = new Blob(chunks, { type: mimeType });
      const energySummary = energyCheck.summary();
      const output = {
        status: doneStatus("SYSTEM_MEANINGFUL_AUDIO_CHUNK", startedAt),
        audio,
        mimeType,
        durationMs: Date.now() - startedMs,
        chunkReason: stopReason,
        browserSpeechText,
        mediaChunkMs,
        mediaChunkCount: chunks.length,
        browserSpeechFinalDetected,
        energyCheck: energySummary
      };
      log(config, "info", "SYSTEM_MEANINGFUL_AUDIO_CHUNK", "done", {
        size: audio.size,
        mimeType,
        chunkReason: stopReason,
        browserSpeechText,
        mediaChunkCount: chunks.length,
        energyCheck: energySummary
      });
      resolve(output);
    };

    try {
      recorder.start(mediaChunkMs);
    } catch (error) {
      energyCheck.stop();
      stream.getTracks().forEach((track) => track.stop());
      log(config, "error", "SYSTEM_MEANINGFUL_AUDIO_CHUNK", error instanceof Error ? error.message : "recording start failed");
      resolve({ status: errorStatus("SYSTEM_MEANINGFUL_AUDIO_CHUNK", startedAt, error), audio: null, mimeType: recorder.mimeType || input.mimeType || "", durationMs: Date.now() - startedMs, chunkReason: stopReason, browserSpeechText, mediaChunkMs, mediaChunkCount: chunks.length, browserSpeechFinalDetected, energyCheck: energyCheck.summary() });
      return;
    }
    energyCheck.start();
    maxTimer = window.setTimeout(() => stop(Recognition ? "max_duration" : "no_speech_checker"), input.maxDurationMs);

    if (Recognition) {
      try {
        const recognitionInstance = new Recognition();
        recognition = recognitionInstance;
        recognitionInstance.lang = input.speechCheckLang || "de-DE";
        recognitionInstance.continuous = true;
        recognitionInstance.interimResults = true;
        recognitionInstance.onresult = (event: BrowserSpeechRecognitionEvent) => {
          const transcripts: string[] = [];
          let sawFinal = false;
          for (let index = 0; index < event.results.length; index += 1) {
            const transcript = event.results[index][0].transcript.trim();
            if (transcript) transcripts.push(transcript);
            if (event.results[index].isFinal) sawFinal = true;
          }
          browserSpeechText = transcripts.join(" ").trim();
          if (sawFinal) browserSpeechFinalDetected = true;
          scheduleStop(sawFinal ? "browser_speech_final" : "silence_after_sound");
        };
        recognitionInstance.onerror = (event: { error: string }) => {
          if (event.error === "aborted" && speechCheckerAbortExpected) {
            log(config, "info", "SYSTEM_MEANINGFUL_AUDIO_CHUNK", "browser speech checker stopped after chunk ended");
            return;
          }
          log(config, "error", "SYSTEM_MEANINGFUL_AUDIO_CHUNK", `browser speech checker failed: ${event.error}`);
        };
        recognitionInstance.onend = () => {
          if (browserSpeechText.trim()) scheduleStop(browserSpeechFinalDetected ? "browser_speech_final" : "silence_after_sound");
        };
        recognitionInstance.start();
      } catch (error) {
        log(config, "error", "SYSTEM_MEANINGFUL_AUDIO_CHUNK", error instanceof Error ? error.message : "browser speech checker start failed");
      }
    }
  });
}

export function SYSTEM_AUDIO_ENERGY_CHECK(config: ClientVoiceConfig, input: SystemAudioEnergyCheckInput): SystemAudioEnergyCheckController {
  const method = "SYSTEM_AUDIO_ENERGY_CHECK";
  const threshold = input.threshold ?? 0.035;
  const minActiveMs = input.minActiveMs ?? 250;
  const sampleEveryMs = input.sampleEveryMs ?? 50;
  const browserWindow = getBrowserWindow();
  const AudioContextCtor = browserWindow?.AudioContext || browserWindow?.webkitAudioContext;
  let context: AudioContext | null = null;
  let timer: number | undefined;
  let available = Boolean(AudioContextCtor);
  let error = "";
  let sampleCount = 0;
  let activeMs = 0;
  let maxRms = 0;
  let totalRms = 0;

  function start() {
    log(config, "info", method, "start", { threshold, minActiveMs, sampleEveryMs });
    if (!AudioContextCtor) return;
    try {
      context = new AudioContextCtor();
      const source = context.createMediaStreamSource(input.stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      timer = browserWindow.setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let index = 0; index < samples.length; index += 1) {
          const centered = (samples[index] - 128) / 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / samples.length);
        sampleCount += 1;
        totalRms += rms;
        maxRms = Math.max(maxRms, rms);
        if (rms >= threshold) activeMs += sampleEveryMs;
      }, sampleEveryMs);
    } catch (caught) {
      available = false;
      error = caught instanceof Error ? caught.message : String(caught);
      log(config, "error", method, error);
    }
  }

  function stop() {
    if (timer) browserWindow?.clearInterval(timer);
    void context?.close().catch(() => undefined);
    log(config, "info", method, "done", summary());
  }

  function summary() {
    return {
      implemented: true as const,
      available,
      threshold,
      minActiveMs,
      activeMs,
      maxRms: Number(maxRms.toFixed(5)),
      averageRms: Number((sampleCount ? totalRms / sampleCount : 0).toFixed(5)),
      hasSound: available && activeMs >= minActiveMs,
      sampleCount,
      error: error || undefined
    };
  }

  return { start, stop, summary };
}

export async function AUDIO_BLOB_TO_WAV_BASE64(blob: Blob): Promise<{ audioBase64: string; audioFormat: "wav" | "mp3"; conversion: string }> {
  const normalized = await normalizeAudioBlobForOpenAi(blob);
  return {
    audioBase64: await blobToBase64(normalized.blob),
    audioFormat: normalized.audioFormat,
    conversion: normalized.conversion
  };
}

async function normalizeAudioBlobForOpenAi(blob: Blob): Promise<{ blob: Blob; audioFormat: "wav" | "mp3"; conversion: string }> {
  const type = blob.type.toLowerCase();
  if (type.includes("wav") || type.includes("wave")) {
    return { blob, audioFormat: "wav", conversion: "already_wav" };
  }
  if (type.includes("mpeg") || type.includes("mp3")) {
    return { blob, audioFormat: "mp3", conversion: "already_mp3" };
  }
  return {
    blob: await convertBrowserAudioBlobToWav(blob),
    audioFormat: "wav",
    conversion: `converted_from_${blob.type || "unknown"}_to_wav`
  };
}

async function convertBrowserAudioBlobToWav(blob: Blob): Promise<Blob> {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("Browser cannot convert microphone audio to WAV: AudioContext is unavailable.");
  }
  const context = new AudioContextConstructor();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
    return encodeAudioBufferAsWav(audioBuffer);
  } catch (error) {
    throw new Error(`Browser could not convert microphone audio (${blob.type || "unknown"}) to WAV: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await context.close().catch(() => undefined);
  }
}

function encodeAudioBufferAsWav(audioBuffer: AudioBuffer) {
  const channelCount = audioBuffer.numberOfChannels;
  const frameCount = audioBuffer.length;
  const sampleRate = audioBuffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataSize = frameCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let offset = 0;

  offset = writeAscii(view, offset, "RIFF");
  view.setUint32(offset, 36 + dataSize, true); offset += 4;
  offset = writeAscii(view, offset, "WAVE");
  offset = writeAscii(view, offset, "fmt ");
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint16(offset, channelCount, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * blockAlign, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, bytesPerSample * 8, true); offset += 2;
  offset = writeAscii(view, offset, "data");
  view.setUint32(offset, dataSize, true); offset += 4;

  const channels = Array.from({ length: channelCount }, (_, index) => audioBuffer.getChannelData(index));
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channelIndex][frameIndex]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
  return offset + text.length;
}

async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function getBrowserWindow() {
  return typeof window === "undefined" ? null : window;
}

function log(config: ClientVoiceConfig, level: "info" | "error", method: string, message: string, data?: unknown) {
  config.logger?.({ level, method, message, data, createdAt: new Date().toISOString() });
}

function emptyEnergyCheck(threshold: number, minActiveMs: number): SystemAudioEnergyCheckOutput {
  return {
    implemented: true,
    available: false,
    threshold,
    minActiveMs,
    activeMs: 0,
    maxRms: 0,
    averageRms: 0,
    hasSound: false,
    sampleCount: 0,
    error: "microphone stream was not available"
  };
}

function doneStatus(method: string, startedAt: string): MethodStatus {
  return { method, ok: true, phase: "done", startedAt, finishedAt: new Date().toISOString() };
}

function errorStatus(method: string, startedAt: string, error: unknown): MethodStatus {
  return {
    method,
    ok: false,
    phase: "error",
    startedAt,
    finishedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error)
  };
}
