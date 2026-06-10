import test from "node:test";
import assert from "node:assert/strict";
import { addEvalCost, readCostSummary, resetCosts } from "../server/costStore";
import { openLocalImproverDb } from "../server/localDb";

test("cost store aggregates per kind in its own db", async () => {
  const db = openLocalImproverDb(":memory:");

  let summary = await readCostSummary(db);
  assert.equal(summary.totalEvals, 0);
  assert.equal(summary.totalEstimatedCost, 0);

  await addEvalCost(db, "text_eval", 0.0001);
  await addEvalCost(db, "text_eval", 0.0002);
  await addEvalCost(db, "voice_eval", 0.0005);

  summary = await readCostSummary(db);
  assert.equal(summary.totalEvals, 3);
  assert.ok(Math.abs(summary.totalEstimatedCost - 0.0008) < 1e-9);
  const textEntry = summary.byKind.find((entry) => entry.kind === "text_eval");
  assert.equal(textEntry?.evals, 2);
  assert.ok(Math.abs((textEntry?.estimatedCost || 0) - 0.0003) < 1e-9);

  await resetCosts(db);
  summary = await readCostSummary(db);
  assert.equal(summary.totalEvals, 0);
  assert.equal(summary.byKind.length, 0);
});

test("cost store is a no-op without a db", async () => {
  await addEvalCost(undefined, "text_eval", 0.1);
  const summary = await readCostSummary(undefined);
  assert.deepEqual(summary, { totalEvals: 0, totalEstimatedCost: 0, byKind: [] });
  await resetCosts(undefined);
});
