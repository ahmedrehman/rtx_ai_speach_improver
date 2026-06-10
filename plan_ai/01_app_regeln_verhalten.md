# Regeln und Verhalten der App

## Ziel

Die App hilft beim Erklaeren. Der Nutzer spricht oder schreibt, und die App bewertet laufend, ob die Erklaerung fuer einen Zuhoerer schon ausreichend ist.

Es gibt zwei Modi:

1. **Analyse-Modus**
   - Die AI bewertet die Erklaerung gegen eine Themen-/Checkliste.
   - Die Checkliste wird waehrend des Sprechens oder Schreibens aktualisiert.
   - Die Antwort kommt als computer-auswertbarer JSON-Stream.

2. **Freechat-Modus**
   - Der Nutzer kann kurz normale Fragen stellen wie bei einer normalen AI.
   - Die AI bekommt die bisherige History.
   - Die AI antwortet normal und bewertet nicht.
   - Die Checkliste wird in diesem Modus nicht veraendert.

## Ampel-Regeln

Jedes Thema bekommt einen numerischen Wert:

- `1` = gruen: ok, ausreichend
- `2` = gelb: vorhanden, aber verbesserbar
- `3` = rot: fehlt, unklar oder falsch

Die Farben sind nur UI. Die entscheidende maschinenlesbare Wahrheit ist der Zahlenwert.

## Analyse-Verhalten

Die AI soll bei jeder Auswertung senden:

- pro Thema einen Wert `1`, `2` oder `3`
- pro Thema einen kurzen Kommentar
- welches Thema als Naechstes dran ist
- einen Beispiel-Satz, den der Nutzer als Orientierung verwenden kann
- einen kurzen Chat-Text fuer den Nutzer

Die AI soll kurz, direkt und praktisch antworten. Kein langer Unterricht, keine langen Erklaerungen.

## Freechat-Verhalten

Freechat ist normaler Chat.

Die AI soll:

- die bisherige History kennen
- normal auf die Frage antworten
- nicht die Checkliste bewerten
- keine Ampelwerte senden
- nicht korrigieren, ausser der Nutzer fragt danach
- nicht jedes Gesagte als Uebung behandeln

Freechat soll schnell wieder verlassen werden koennen, damit der Nutzer zur Analyse zurueckkehrt.

## Sprache

Default ist Deutsch. Die App kann aber andere Sprachen verwenden, wenn sie in den Einstellungen ausgewaehlt werden.

Die Hinweise sollen in der gewaehlten Sprache kommen.

