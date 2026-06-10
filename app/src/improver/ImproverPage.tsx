import { useEffect, useRef, useState } from "react";
import { apiBasePath, languageByCode, type ImproverSettings } from "../clientConfig";
import { AUDIO_BLOB_TO_WAV_BASE64, SYSTEM_MEANINGFUL_AUDIO_CHUNK } from "../lib_client_voice_capture";
import type { ChecklistFieldResult, SpeechEvalStreamEvent } from "../lib_speech_contract";
import { ChecklistPanel } from "./ChecklistPanel";
import { streamEvalRequest } from "./streamClient";

type ChatItem = {
  id: string;
  role: "user" | "coach";
  text: string;
};

const TEXT_DEBOUNCE_MS = 1500;
const CHUNK_MAX_DURATION_MS = 6000;
const CHUNK_SILENCE_MS = 1200;

export function ImproverPage({ settings }: { settings: ImproverSettings }) {
  const language = languageByCode(settings.languageCode);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [fieldResults, setFieldResults] = useState<Record<string, ChecklistFieldResult>>({});
  const [nextRecommendedId, setNextRecommendedId] = useState("");
  const [tipMissing, setTipMissing] = useState("");
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [totalCost, setTotalCost] = useState(0);
  const [storedCost, setStoredCost] = useState<number | null>(null);

  const recordingRef = useRef(false);
  const committedTextRef = useRef("");
  const draftRef = useRef("");
  const evalSeqRef = useRef(0);
  const lastCoachTipRef = useRef("");
  const debounceRef = useRef<number | undefined>(undefined);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const apiBase = apiBasePath();

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items]);

  useEffect(() => {
    void refreshStoredCost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshStoredCost() {
    try {
      const response = await fetch(`${apiBase}api/improver/costs`);
      if (!response.ok) return;
      const data = await response.json() as { totalEstimatedCost?: number };
      if (typeof data.totalEstimatedCost === "number") setStoredCost(data.totalEstimatedCost);
    } catch {
      // Cost display is optional; the trainer keeps working without it.
    }
  }

  useEffect(() => () => {
    recordingRef.current = false;
    window.clearTimeout(debounceRef.current);
  }, []);

  useEffect(() => {
    draftRef.current = draft;
    window.clearTimeout(debounceRef.current);
    if (!draft.trim()) return;
    debounceRef.current = window.setTimeout(() => {
      void runTextEval(joinText(committedTextRef.current, draftRef.current));
    }, TEXT_DEBOUNCE_MS);
    return () => window.clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  function addItem(role: ChatItem["role"], text: string) {
    setItems((current) => [...current, { id: createId(), role, text }]);
  }

  function evalBody(fullText: string) {
    return {
      fullText,
      checklist: settings.checklist,
      language: language.name,
      promptTemplate: settings.promptTemplate,
      evalModel: settings.evalModel
    };
  }

  function handleStreamEvent(event: SpeechEvalStreamEvent, seq: number) {
    if (event.type === "transcript" && event.text.trim()) {
      committedTextRef.current = joinText(committedTextRef.current, event.text);
      addItem("user", event.text);
    }
    if (event.type === "checklist_update") {
      if (seq !== evalSeqRef.current) return;
      const map: Record<string, ChecklistFieldResult> = {};
      for (const field of event.fields) map[field.id] = field;
      setFieldResults(map);
      setNextRecommendedId(event.nextRecommendedId);
      setTipMissing(event.tipMissing);
      const coachText = [event.praise, event.tipNext].filter(Boolean).join(" ");
      if (coachText && coachText !== lastCoachTipRef.current) {
        lastCoachTipRef.current = coachText;
        addItem("coach", coachText);
      }
    }
    if (event.type === "cost") {
      setTotalCost((current) => current + event.estimatedCost);
    }
    if (event.type === "done") {
      void refreshStoredCost();
    }
  }

  async function runTextEval(fullText: string) {
    const trimmed = fullText.trim();
    if (!trimmed) return;
    const seq = ++evalSeqRef.current;
    setBusy(true);
    setError("");
    try {
      const result = await streamEvalRequest(
        `${apiBase}api/improver/text-eval-stream`,
        evalBody(trimmed),
        (event) => handleStreamEvent(event, seq)
      );
      if (!result.ok && seq === evalSeqRef.current) setError(result.error || "Auswertung fehlgeschlagen.");
    } catch (caught) {
      if (seq === evalSeqRef.current) setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (seq === evalSeqRef.current) setBusy(false);
    }
  }

  function commitDraft() {
    const text = draft.trim();
    if (!text) return;
    window.clearTimeout(debounceRef.current);
    committedTextRef.current = joinText(committedTextRef.current, text);
    addItem("user", text);
    setDraft("");
    draftRef.current = "";
    void runTextEval(committedTextRef.current);
  }

  async function startRecording() {
    if (recordingRef.current) return;
    recordingRef.current = true;
    setRecording(true);
    setError("");
    while (recordingRef.current) {
      const chunk = await SYSTEM_MEANINGFUL_AUDIO_CHUNK({}, {
        maxDurationMs: CHUNK_MAX_DURATION_MS,
        silenceMs: CHUNK_SILENCE_MS,
        speechCheckLang: language.recognitionLang
      });
      if (!recordingRef.current) break;
      if (!chunk.status.ok) {
        setError(chunk.status.error || "Mikrofonaufnahme fehlgeschlagen.");
        stopRecording();
        break;
      }
      if (!chunk.audio || chunk.audio.size === 0) continue;
      const heardSomething = Boolean(chunk.browserSpeechText?.trim())
        || !chunk.energyCheck.available
        || chunk.energyCheck.hasSound;
      if (!heardSomething) continue;
      try {
        const wav = await AUDIO_BLOB_TO_WAV_BASE64(chunk.audio);
        const seq = ++evalSeqRef.current;
        setBusy(true);
        const result = await streamEvalRequest(
          `${apiBase}api/improver/voice-eval-stream`,
          {
            audioBase64: wav.audioBase64,
            audioFormat: wav.audioFormat,
            transcriptSoFar: joinText(committedTextRef.current, draftRef.current),
            languageCode: settings.languageCode,
            checklist: settings.checklist,
            language: language.name,
            promptTemplate: settings.promptTemplate,
            evalModel: settings.evalModel,
            transcriptionModel: settings.transcriptionModel
          },
          (event) => handleStreamEvent(event, seq)
        );
        if (!result.ok) setError(result.error || "Auswertung fehlgeschlagen.");
        if (seq === evalSeqRef.current) setBusy(false);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        setBusy(false);
      }
    }
  }

  function stopRecording() {
    recordingRef.current = false;
    setRecording(false);
  }

  function reset() {
    stopRecording();
    window.clearTimeout(debounceRef.current);
    evalSeqRef.current += 1;
    committedTextRef.current = "";
    draftRef.current = "";
    lastCoachTipRef.current = "";
    setItems([]);
    setFieldResults({});
    setNextRecommendedId("");
    setTipMissing("");
    setDraft("");
    setError("");
    setTotalCost(0);
    setBusy(false);
  }

  return (
    <div className="improver-page">
      <div className="toolbar">
        <button
          className={`mic-button${recording ? " recording" : ""}`}
          onClick={() => (recording ? stopRecording() : void startRecording())}
        >
          {recording ? "■ Aufnahme stoppen" : "🎤 Sprechen"}
        </button>
        <button className="secondary" onClick={reset}>Neu starten</button>
        <span className="toolbar-status">
          {busy ? "Auswertung läuft…" : recording ? "Ich höre zu…" : ""}
        </span>
        <span className="toolbar-cost">
          Sitzung ~${totalCost.toFixed(4)}{storedCost !== null ? ` · Gesamt ~$${storedCost.toFixed(4)}` : ""}
        </span>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="improver-layout">
        <section className="chat-panel">
          <div className="chat-messages">
            {items.length === 0 && (
              <p className="chat-empty">
                Erkläre etwas — sprich oder tippe. Während du erklärst, zeigt die Checkliste
                rechts live, was schon erfüllt ist und was dem Zuhörer noch fehlt.
              </p>
            )}
            {items.map((item) => (
              <div key={item.id} className={`chat-item ${item.role}`}>
                <span className="chat-role">{item.role === "user" ? "Du" : "Coach"}</span>
                <p>{item.text}</p>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          {tipMissing && <div className="tip-missing">Fehlt noch: {tipMissing}</div>}
          <div className="chat-input">
            <textarea
              value={draft}
              placeholder="…oder hier tippen (laufende Auswertung beim Schreiben)"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  commitDraft();
                }
              }}
              rows={3}
            />
            <button onClick={commitDraft} disabled={!draft.trim()}>Hinzufügen</button>
          </div>
        </section>
        <ChecklistPanel
          checklist={settings.checklist}
          results={fieldResults}
          nextRecommendedId={nextRecommendedId}
        />
      </div>
    </div>
  );
}

function joinText(...parts: string[]) {
  return parts.map((part) => (part || "").trim()).filter(Boolean).join(" ");
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
