import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect, useRef, useState } from "react";
import { apiBasePath } from "../clientConfig";
import {
  CAPTURE_VOICE_PACK,
  OPEN_MICROPHONE,
  SERVER_AUDIO_ROUNDTRIP,
  type AudioRoundtripResult,
  type VoicePack
} from "./voicePack";

type RoundtripEvent = {
  id: string;
  createdAt: string;
  type: string;
  data: unknown;
};

export function AudioRoundtripPage() {
  const [running, setRunning] = useState(false);
  const [statusText, setStatusText] = useState("idle");
  const [threshold, setThreshold] = useState(0.025);
  const [silenceMs, setSilenceMs] = useState(650);
  const [maxRecordMs, setMaxRecordMs] = useState(6000);
  const [micLevel, setMicLevel] = useState(0);
  const [voiceDetected, setVoiceDetected] = useState(false);
  const [latestPack, setLatestPack] = useState<VoicePack | null>(null);
  const [latestRoundtrip, setLatestRoundtrip] = useState<AudioRoundtripResult | null>(null);
  const [localAudioUrl, setLocalAudioUrl] = useState("");
  const [serverAudioUrl, setServerAudioUrl] = useState("");
  const [events, setEvents] = useState<RoundtripEvent[]>([]);

  const stopRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const localAudioUrlRef = useRef("");
  const serverAudioUrlRef = useRef("");
  const apiBase = apiBasePath();
  const endpoint = `${apiBase}api/improver/audio-roundtrip`;

  useEffect(() => () => {
    stopRef.current = true;
    cleanup();
    revokeAudioUrl(localAudioUrlRef);
    revokeAudioUrl(serverAudioUrlRef);
  }, []);

  function addEvent(type: string, data: unknown) {
    setEvents((current) => [{ id: createId(), createdAt: new Date().toISOString(), type, data: summarize(data) }, ...current].slice(0, 50));
  }

  async function start() {
    if (running) return;
    stopRef.current = false;
    setRunning(true);
    setStatusText("opening microphone");
    setEvents([]);
    const mic = await OPEN_MICROPHONE();
    addEvent("open_microphone", mic.status);
    if (!mic.status.ok || !mic.stream) {
      setStatusText(mic.status.error || "microphone failed");
      setRunning(false);
      return;
    }
    streamRef.current = mic.stream;
    setStatusText("listening for voice");

    while (!stopRef.current) {
      const pack = await CAPTURE_VOICE_PACK({
        stream: mic.stream,
        threshold,
        silenceMs,
        preBufferMs: 1000,
        maxWaitMs: 8000,
        maxRecordMs,
        minVoiceMs: 180,
        speechRecognitionLang: "de-DE",
        shouldStop: () => stopRef.current,
        onSample: (sample) => {
          setMicLevel(sample.rms);
          setVoiceDetected(sample.voiceDetected);
        }
      });
      setLatestPack(pack);
      addEvent(pack.decision, { status: pack.status, debug: pack.debug, transcript: pack.transcript });

      if (stopRef.current) break;
      if (pack.decision !== "send_voice_segment" || !pack.audio) {
        setStatusText(pack.debug.reason);
        await wait(100);
        continue;
      }

      replaceAudioUrl(setLocalAudioUrl, localAudioUrlRef, pack.audio);
      setStatusText(`sending ${pack.audio.size} bytes to server`);
      const returned = await SERVER_AUDIO_ROUNDTRIP({ endpoint, audio: pack.audio });
      setLatestRoundtrip(returned);
      addEvent(returned.status.ok ? "server_returned_audio" : "server_roundtrip_error", returned);
      if (!returned.status.ok || !returned.audio) {
        setStatusText(returned.status.error || "roundtrip failed");
        await wait(250);
        continue;
      }

      replaceAudioUrl(setServerAudioUrl, serverAudioUrlRef, returned.audio);
      setStatusText("server echo ready");
      await playBlob(returned.audio).catch((error) => addEvent("autoplay_failed", String(error)));
      setStatusText("listening for voice");
    }

    cleanup();
  }

  function stop() {
    stopRef.current = true;
    cleanup();
  }

  function cleanup() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRunning(false);
    setVoiceDetected(false);
    setStatusText("idle");
  }

  return (
    <div className="audio-debug-page">
      <section className="debug-header">
        <div>
          <h2>Audio Roundtrip</h2>
          <p>Listen to the exact voice packs that reach the server and come back unchanged.</p>
        </div>
        <div className="debug-actions">
          <button type="button" onClick={() => void start()} disabled={running}>{running ? "Running" : "Start roundtrip"}</button>
          <button className="secondary" type="button" onClick={stop} disabled={!running}>Stop</button>
        </div>
      </section>

      <section className="debug-grid">
        <div className="debug-panel">
          <h3>Capture</h3>
          <label>
            threshold
            <input type="number" min={0.001} max={0.2} step={0.001} value={threshold} disabled={running} onChange={(event) => setThreshold(Number(event.target.value))} />
          </label>
          <label>
            silence ms
            <input type="number" min={200} step={50} value={silenceMs} disabled={running} onChange={(event) => setSilenceMs(Number(event.target.value))} />
          </label>
          <label>
            max pack ms
            <input type="number" min={1000} step={500} value={maxRecordMs} disabled={running} onChange={(event) => setMaxRecordMs(Number(event.target.value))} />
          </label>
          <div className="meter-row">
            <span className={voiceDetected ? "meter-dot active" : "meter-dot"} />
            <span>{statusText}</span>
            <strong>rms {micLevel.toFixed(4)}</strong>
          </div>
        </div>

        <div className="debug-panel">
          <h3>Playback</h3>
          <p>Local captured pack</p>
          {localAudioUrl ? <audio controls src={localAudioUrl} /> : <span className="muted">No local pack yet.</span>}
          <p>Server returned pack</p>
          {serverAudioUrl ? <audio controls src={serverAudioUrl} /> : <span className="muted">No server echo yet.</span>}
        </div>

        <div className="debug-panel">
          <h3>Latest Pack</h3>
          <pre>{JSON.stringify(latestPack ? { decision: latestPack.decision, debug: latestPack.debug, transcript: latestPack.transcript } : { status: "not run" }, null, 2)}</pre>
        </div>

        <div className="debug-panel">
          <h3>Latest Roundtrip</h3>
          <pre>{JSON.stringify(latestRoundtrip ? { status: latestRoundtrip.status, debug: latestRoundtrip.debug } : { status: "not run" }, null, 2)}</pre>
        </div>
      </section>

      <section className="debug-panel">
        <h3>Events</h3>
        <pre>{JSON.stringify(events, null, 2)}</pre>
      </section>
    </div>
  );
}

function replaceAudioUrl(setter: Dispatch<SetStateAction<string>>, urlRef: MutableRefObject<string>, blob: Blob) {
  revokeAudioUrl(urlRef);
  const url = URL.createObjectURL(blob);
  urlRef.current = url;
  setter(url);
}

function revokeAudioUrl(urlRef: MutableRefObject<string>) {
  if (!urlRef.current) return;
  URL.revokeObjectURL(urlRef.current);
  urlRef.current = "";
}

function playBlob(blob: Blob) {
  return new Promise<void>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    const finish = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onended = finish;
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("server echo playback failed"));
    };
    void audio.play().catch((error) => {
      URL.revokeObjectURL(url);
      reject(error);
    });
  });
}

function summarize(value: unknown) {
  return JSON.parse(JSON.stringify(value, (key, item) => {
    if (typeof item === "string" && (key.toLowerCase().includes("audio") || item.length > 500)) return `[string length=${item.length}]`;
    return item;
  }));
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
