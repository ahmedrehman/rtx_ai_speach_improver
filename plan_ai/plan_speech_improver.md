# Plan: Speech Improver

## Kontext

Zweites Projekt mit derselben Technik wie `rtx_ai_voice_trainer` (Vite + React + TS, Cloudflare Worker, lokal lauffähig, Root- oder Subfolder-Pfad), aber neuem Ziel aus dessen `plan/speach_improver.md`:

Der Nutzer **erklärt etwas mündlich oder schreibt im Text-Chat**. Die App bewertet die laufende Erklärung **kontinuierlich während des Sprechens/Schreibens** gegen eine konfigurierbare Checkliste guter Rede-Elemente (Hörer abholen, Thema benennen, präzise auf den Punkt, Kernproblem, Warum/Wichtigkeit, Beispiel/Beweis). Die AI-Antwort ist **kein Audio, sondern ausschließlich JSON nach vorbereitetem Schema**: pro Feld Rot/Grün-Status, Tipp was als Nächstes fehlt, was gut ist. Wie ein Trainer, der sagt, was dem Zuhörer noch fehlt.

Entscheidungen:

- Sprache wählbar, Default **Deutsch**
- **Live-Updates während des Sprechens UND beim Tippen** (Text-Chat ist gleichwertiger Eingabeweg)
- Checkliste = **editierbare Liste auf einer Config-Seite**, daraus wird der Prompt generiert; Anzeige als vertikale Rot/Grün-Flag-Liste neben dem Chat, mit Highlight „als Nächstes empfohlen"

## Architektur (übernommen aus Projekt 1)

- **Streaming-Strategie identisch:** Client POSTet JSON (Audio als Base64), Server antwortet `text/event-stream` mit `data: {json}\n\n`-Events; Client liest `response.body.getReader()` und parst SSE inkrementell.
- **Server stateless:** Client sendet pro Request das akkumulierte Transkript + Checklisten-Definition mit. Kein D1 (kein DB-Setup nötig; Kosten werden pro Event im SSE-Stream mitgeliefert und im UI summiert).
- **Lokal + Cloudflare:** `tsx src/localServer.ts` (Node, Vite middlewareMode, lädt `.env.local`) für lokal; `wrangler deploy` mit `[assets]`-Binding für Cloudflare.
- **Pfad-Flexibilität:** `vite.config.ts` mit `base: VITE_BASE_PATH || (prod ? "/apps/speechimprover/" : "/")`, Worker-Var `APP_BASE_PATH`, SPA-Fallback `not_found_handling = "single-page-application"`.

## Pipeline

1. **Voice:** Mikrofon → sinnvolle Chunks (Stille-Erkennung, max ~6s) → `POST /api/improver/voice-eval-stream` → Server: STT (`gpt-4o-mini-transcribe`) → Chunk-Text + bisheriges Transkript an Eval-Modell → SSE-Events zurück.
2. **Text:** Tippen im Chat-Feld, debounced (~1.5s Pause) → `POST /api/improver/text-eval-stream` → gleiche Eval → gleiche SSE-Events.
3. **Eval:** Text-Modell (`gpt-4o-mini`, konfigurierbar) mit **Structured Outputs (strict JSON Schema)**. Prompt wird aus der Checklisten-Definition + editierbarem Prompt-Template generiert.

Details zu Events und Schema: siehe `streaming_api.md`.

## Projektstruktur

```
app/src/
  worker.ts                  # Cloudflare-Worker-Entry
  localServer.ts             # Node-Dev-Server (Vite middlewareMode)
  main.tsx                   # React-Entry + Hash-Navigation (Trainer / Einstellungen)
  clientConfig.ts            # Sprachen, Default-Settings, API-Basis-Pfad
  storage.ts                 # localStorage für Settings/Checkliste
  styles.css
  server/
    http.ts                  # Routing /api/improver/*, Base-Path-Strip, Assets-Fallback
    bindings.ts              # Env (ASSETS, APP_BASE_PATH, OPENAI_API_KEY)
    responses.ts             # json/notFound/methodNotAllowed
  lib_speech_contract/       # Geteilter Vertrag: Checkliste, Prompt-Generator, JSON-Schema, SSE-Events (pure code)
  lib_server_speech_eval/    # Server: STT + Eval (strict JSON) + SSE-Stream-Builder
  lib_client_voice_capture/  # Client: Mikrofon → sinnvolle Chunks + WAV/Base64
  improver/                  # Frontend: ImproverPage (Chat + Checkliste), ConfigPage, streamClient
  *_test/                    # Tests (tsx --test)
```

Konventionen aus Projekt 1: Methoden geben `status` zurück (`method/ok/phase/startedAt/finishedAt/error`), Libs ohne DB-/Settings-Zugriff, Prompts als Input-Werte, README pro Lib-Ordner, `AGENTS.md` („no hacks").

## UI

- **Trainer-Seite:** Chat-Fenster (gesprochene Transkript-Segmente bzw. getippter Text + Coach-Tipps), daneben vertikale Checkliste: pro Feld Flag Rot (fehlt) / Gelb (teilweise) / Grün (erfüllt), das „als Nächstes empfohlen"-Feld hervorgehoben; live geupdatet bei jedem `checklist_update`. Mic-Start/Stop, Texteingabe mit Live-Auswertung, Reset, Kostenanzeige.
- **Einstellungen:** Checklisten-Editor (Punkte hinzufügen/entfernen/umbenennen, je ID + Name + Beschreibung), editierbares Prompt-Template (Platzhalter `{{CHECKLIST}}`, `{{LANGUAGE}}`), Sprache (Default `de`), Modellnamen. Persistenz in localStorage.

## Default-Checkliste (aus speach_improver.md)

1. Hörer abholen / Einstieg
2. Thema klar benennen (worum geht es genau)
3. Präzision (nicht zu vage, nicht zu detailliert — auf den Punkt)
4. Kernproblem benennen
5. Warum / Relevanz (warum sagst du das, warum wichtig)
6. Beispiel / Beweis / Begründung

## Verifikation

- `npm install && npm run dev` in `app/` → `http://127.0.0.1:5173`: Text eintippen → Checkliste färbt sich live, Tipps erscheinen; Mic-Modus mit `OPENAI_API_KEY` in `.env.local`.
- `npm test` (Unit + Missing-Config; Real-Tests laufen nur mit gesetztem Key).
- `npm run build` mit Root- und Subfolder-Base-Path.
- Cloudflare: siehe `cloudflare_setup.md` (kein D1 nötig, nur Secret `OPENAI_API_KEY`).
