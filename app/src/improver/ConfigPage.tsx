import { useState } from "react";
import { defaultSettings, LANGUAGES, type ImproverSettings } from "../clientConfig";
import { cloneSettings } from "../storage";
import type { ChecklistFieldDefinition } from "../lib_speech_contract";

export function ConfigPage({ settings, onSave }: {
  settings: ImproverSettings;
  onSave: (settings: ImproverSettings) => void;
}) {
  const [edit, setEdit] = useState<ImproverSettings>(() => cloneSettings(settings));
  const [message, setMessage] = useState("");

  function updateField(index: number, patch: Partial<ChecklistFieldDefinition>) {
    setEdit((current) => ({
      ...current,
      checklist: current.checklist.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field
      )
    }));
  }

  function removeField(index: number) {
    setEdit((current) => ({
      ...current,
      checklist: current.checklist.filter((_, fieldIndex) => fieldIndex !== index)
    }));
  }

  function addField() {
    setEdit((current) => ({
      ...current,
      checklist: [
        ...current.checklist,
        { id: nextFieldId(current.checklist), label: "Neuer Punkt", description: "" }
      ]
    }));
  }

  function validate(candidate: ImproverSettings): string {
    if (candidate.checklist.length === 0) return "Die Checkliste braucht mindestens einen Punkt.";
    const seen = new Set<string>();
    for (const field of candidate.checklist) {
      const id = field.id.trim();
      if (!id) return "Jeder Checklisten-Punkt braucht eine ID.";
      if (!/^[a-z0-9_]+$/.test(id)) return `ID "${id}" darf nur Kleinbuchstaben, Zahlen und _ enthalten.`;
      if (seen.has(id)) return `ID "${id}" ist doppelt.`;
      seen.add(id);
      if (!field.label.trim()) return "Jeder Checklisten-Punkt braucht einen Namen.";
    }
    if (!candidate.promptTemplate.includes("{{CHECKLIST}}")) {
      return "Das Prompt-Template muss den Platzhalter {{CHECKLIST}} enthalten.";
    }
    return "";
  }

  function save() {
    const problem = validate(edit);
    if (problem) {
      setMessage(problem);
      return;
    }
    onSave(cloneSettings(edit));
    setMessage("Gespeichert.");
  }

  function restoreDefaults() {
    setEdit(cloneSettings(defaultSettings));
    setMessage("Standardwerte geladen — noch nicht gespeichert.");
  }

  return (
    <div className="config-page">
      <h2>Einstellungen</h2>

      <section className="config-section">
        <h3>Checkliste</h3>
        <p className="config-hint">
          Aus dieser Liste wird der Prompt erstellt. Jeder Punkt wird im Trainer als
          Rot/Gelb/Grün-Flag angezeigt.
        </p>
        {edit.checklist.map((field, index) => (
          <div key={index} className="checklist-editor-row">
            <input
              className="field-id"
              value={field.id}
              placeholder="id"
              onChange={(event) => updateField(index, { id: event.target.value })}
            />
            <input
              className="field-label"
              value={field.label}
              placeholder="Name"
              onChange={(event) => updateField(index, { label: event.target.value })}
            />
            <textarea
              className="field-description"
              value={field.description}
              placeholder="Was muss erfüllt sein?"
              rows={2}
              onChange={(event) => updateField(index, { description: event.target.value })}
            />
            <button className="secondary" onClick={() => removeField(index)}>Entfernen</button>
          </div>
        ))}
        <button onClick={addField}>Punkt hinzufügen</button>
      </section>

      <section className="config-section">
        <h3>Prompt-Template</h3>
        <p className="config-hint">
          Platzhalter: <code>{"{{CHECKLIST}}"}</code> (generierte Punkteliste) und <code>{"{{LANGUAGE}}"}</code> (Sprache der Hinweise).
        </p>
        <textarea
          className="prompt-template"
          value={edit.promptTemplate}
          rows={14}
          onChange={(event) => setEdit((current) => ({ ...current, promptTemplate: event.target.value }))}
        />
      </section>

      <section className="config-section">
        <h3>Sprache und Modelle</h3>
        <label>
          Sprache
          <select
            value={edit.languageCode}
            onChange={(event) => setEdit((current) => ({ ...current, languageCode: event.target.value }))}
          >
            {LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>{language.name}</option>
            ))}
          </select>
        </label>
        <label>
          Eval-Modell
          <input
            value={edit.evalModel}
            onChange={(event) => setEdit((current) => ({ ...current, evalModel: event.target.value }))}
          />
        </label>
        <label>
          Transkriptions-Modell
          <input
            value={edit.transcriptionModel}
            onChange={(event) => setEdit((current) => ({ ...current, transcriptionModel: event.target.value }))}
          />
        </label>
      </section>

      <div className="config-actions">
        <button onClick={save}>Speichern</button>
        <button className="secondary" onClick={restoreDefaults}>Standard wiederherstellen</button>
        {message && <span className="config-message">{message}</span>}
      </div>
    </div>
  );
}

function nextFieldId(checklist: ChecklistFieldDefinition[]) {
  let index = checklist.length + 1;
  while (checklist.some((field) => field.id === `punkt_${index}`)) index += 1;
  return `punkt_${index}`;
}
