# Themenliste und Satzanalyse

## Zweck der Themenliste

Die Themenliste beschreibt, was eine gute Erklaerung enthalten soll. Jeder Punkt wird laufend bewertet.

Die Liste ist editierbar. Die Default-Liste ist nur der Startpunkt.

## Default-Themen

1. **Hoerer abholen / Einstieg**
   - Gibt es einen kurzen Einstieg?
   - Ist klar, in welcher Situation wir sind?
   - Weiss der Zuhoerer, worum es gleich geht?

2. **Thema klar benennen**
   - Ist klar, welches konkrete Thema gemeint ist?
   - Wird das Objekt, Projekt, Problem oder Beispiel genau genannt?
   - Keine vage Andeutung.

3. **Praezise auf den Punkt**
   - Ist die Aussage verstaendlich und knapp?
   - Nicht zu vage.
   - Nicht unnoetig lang oder ueberdetailliert.

4. **Kernproblem benennen**
   - Wird das eigentliche Problem oder die Kernaussage klar genannt?
   - Erkennt der Zuhoerer, was zentral ist?

5. **Warum / Relevanz**
   - Wird gesagt, warum das wichtig ist?
   - Wird klar, warum der Zuhoerer das wissen soll?

6. **Beispiel / Beweis / Begruendung**
   - Gibt es ein Beispiel?
   - Gibt es einen Beleg oder eine Begruendung?
   - Wird die Aussage dadurch nachvollziehbarer?

## Bewertung pro Thema

Jedes Thema bekommt:

```json
{
  "id": "topic",
  "score": 1,
  "comment": "Das Thema ist klar benannt."
}
```

`score` ist Pflicht:

- `1` = gruen / ok / ausreichend
- `2` = gelb / verbesserbar
- `3` = rot / fehlt oder falsch

## Naechstes Thema

Die AI sendet ein Feld:

```json
{
  "nextRecommendedId": "why"
}
```

Das ist genau ein Thema aus der Checkliste. Es ist der Punkt, an dem der Nutzer als Naechstes arbeiten soll.

## Beispiel-Feld

Die AI sendet ein Feld:

```json
{
  "exampleText": "Sag zum Beispiel: Das ist wichtig, weil wir dadurch morgens keine Lieferverzoegerung haben."
}
```

Das Beispiel soll:

- kurz sein
- direkt nutzbar sein
- zur aktuellen Erklaerung passen
- in der gewaehlten Sprache sein

## Chat-Text

Die AI sendet zusaetzlich einen kurzen Chat-Text:

```json
{
  "chatText": "Der Einstieg ist gut. Als Naechstes sag kurz, warum das wichtig ist."
}
```

Dieser Text wird im Chat angezeigt. Er soll fuer Menschen lesbar sein, aber trotzdem Teil des JSON-Events bleiben.

