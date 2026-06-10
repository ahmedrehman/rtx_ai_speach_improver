# Technik: Streaming

## Grundsatz

Der Stream soll schnell sein. Die App soll nicht warten, bis eine lange Antwort komplett fertig ist.

Normales `application/json` ist dafuer ungeeignet, weil ein einzelnes JSON-Dokument erst am Ende vollstaendig gueltig ist.

Deshalb nutzt die App Server-Sent Events (SSE):

```text
Content-Type: text/event-stream
```

Jedes SSE-Event enthaelt ein eigenes JSON-Objekt:

```text
data: {"type":"checklist_update","fields":[...],"nextRecommendedId":"why","exampleText":"...","chatText":"..."}

```

Damit ist der Stream live, aber jedes einzelne Event bleibt computer-auswertbares JSON.

## Analyse-Stream

Analyse fuer Text und Sprache soll dieselbe JSON-Struktur verwenden.

### Event: start

```json
{
  "type": "start",
  "status": {
    "method": "SPEECH_EVAL_STREAM_TEXT",
    "ok": true,
    "phase": "streaming",
    "startedAt": "2026-06-10T12:00:00.000Z"
  }
}
```

### Event: transcript

Nur bei Sprache:

```json
{
  "type": "transcript",
  "text": "Der erkannte Sprachtext"
}
```

### Event: checklist_update

```json
{
  "type": "checklist_update",
  "fields": [
    {
      "id": "intro",
      "score": 1,
      "comment": "Der Einstieg ist ausreichend."
    },
    {
      "id": "why",
      "score": 3,
      "comment": "Warum das wichtig ist, fehlt noch."
    }
  ],
  "nextRecommendedId": "why",
  "exampleText": "Sag zum Beispiel: Das ist wichtig, weil wir dadurch Zeit sparen.",
  "chatText": "Der Einstieg passt. Als Naechstes sag kurz, warum es wichtig ist."
}
```

### Event: cost

```json
{
  "type": "cost",
  "estimatedCost": 0.0004,
  "note": "text eval"
}
```

### Event: done

```json
{
  "type": "done",
  "status": {
    "method": "SPEECH_EVAL_STREAM_TEXT",
    "ok": true,
    "phase": "done",
    "startedAt": "2026-06-10T12:00:00.000Z",
    "finishedAt": "2026-06-10T12:00:01.000Z"
  },
  "fullText": "Kompletter Text bis jetzt"
}
```

## Freechat-Stream

Freechat nutzt ebenfalls SSE mit JSON-Events, aber keine Checkliste.

Die AI bekommt:

- aktuelle Nutzereingabe
- bisherige Chat-History
- Systemanweisung: normal antworten, nicht bewerten

### Event: chat_message

```json
{
  "type": "chat_message",
  "chatText": "Ja, du kannst das so sagen. Natuerlicher waere: ..."
}
```

Die UI schreibt `chatText` in den Chat. Die Checkliste bleibt unveraendert.

## Geschwindigkeit

Fuer Sprache soll die App kurze Audio-Chunks senden.

Ziel:

- Maximaldauer pro Chunk ca. 2 bis 3 Sekunden
- bei kurzer Stille schneller abschicken
- jedes Chunk transkribieren
- danach sofort ein `checklist_update` senden

Das ist kein echtes Token-by-Token Audio-Verstehen, aber fuer den Nutzer wirkt es live genug, weil regelmaessig neue JSON-Events eintreffen.

