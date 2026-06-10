import type { ChecklistFieldDefinition, ChecklistFieldResult } from "../lib_speech_contract";

const STATUS_LABELS: Record<string, string> = {
  missing: "fehlt",
  partial: "teilweise",
  fulfilled: "erfüllt"
};

export function ChecklistPanel({ checklist, results, nextRecommendedId }: {
  checklist: ChecklistFieldDefinition[];
  results: Record<string, ChecklistFieldResult>;
  nextRecommendedId: string;
}) {
  return (
    <aside className="checklist-panel">
      <h2>Checkliste</h2>
      <ul>
        {checklist.map((field) => {
          const result = results[field.id];
          const status = result?.status || "missing";
          const isNext = field.id === nextRecommendedId;
          return (
            <li key={field.id} className={`checklist-item status-${status}${isNext ? " next-recommended" : ""}`} title={field.description}>
              <span className="flag" aria-label={STATUS_LABELS[status]} />
              <span className="checklist-text">
                <span className="checklist-label">{field.label}</span>
                {isNext && <span className="next-badge">als Nächstes</span>}
                {result?.comment && <span className="checklist-comment">{result.comment}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
