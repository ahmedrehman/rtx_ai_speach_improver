import type { D1DatabaseLike } from "./bindings";

export type EvalCostKind = "text_eval" | "voice_eval";

export type CostSummary = {
  totalEvals: number;
  totalEstimatedCost: number;
  byKind: Array<{ kind: string; evals: number; estimatedCost: number; updatedAt: string }>;
};

type CostRow = {
  kind: string;
  evals: number;
  estimated_cost: number;
  updated_at: string;
};

export async function addEvalCost(db: D1DatabaseLike | undefined, kind: EvalCostKind, estimatedCost: number) {
  if (!db) return;
  await ensureSchema(db);

  await db.prepare(
    `insert into eval_costs (kind, evals, estimated_cost, updated_at)
     values (?, 1, ?, datetime('now'))
     on conflict(kind) do update set
       evals = evals + 1,
       estimated_cost = estimated_cost + excluded.estimated_cost,
       updated_at = datetime('now')`
  ).bind(kind, estimatedCost).run();
}

export async function readCostSummary(db: D1DatabaseLike | undefined): Promise<CostSummary> {
  if (!db) return { totalEvals: 0, totalEstimatedCost: 0, byKind: [] };
  await ensureSchema(db);

  const rows = await db.prepare(
    "select kind, evals, estimated_cost, updated_at from eval_costs order by kind"
  ).all<CostRow>();

  const byKind = (rows.results || []).map((row) => ({
    kind: row.kind,
    evals: row.evals,
    estimatedCost: row.estimated_cost,
    updatedAt: row.updated_at
  }));

  return {
    totalEvals: byKind.reduce((sum, entry) => sum + entry.evals, 0),
    totalEstimatedCost: byKind.reduce((sum, entry) => sum + entry.estimatedCost, 0),
    byKind
  };
}

export async function resetCosts(db: D1DatabaseLike | undefined) {
  if (!db) return;
  await ensureSchema(db);
  await db.prepare("delete from eval_costs").run();
}

async function ensureSchema(db: D1DatabaseLike) {
  await db.prepare(
    `create table if not exists eval_costs (
      kind text primary key,
      evals integer not null default 0,
      estimated_cost real not null default 0,
      updated_at text not null default (datetime('now'))
    )`
  ).run();
}
