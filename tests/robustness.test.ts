import assert from "node:assert/strict";
import test from "node:test";
import { createExampleScenario, interpRange } from "../lib/model.ts";
import { runStage1 } from "../lib/optimizer.ts";
import { DEFAULT_GRID, runStage2 } from "../lib/robustness.ts";

test("interpRange maps -1/0/+1 to low/point/high with linear interpolation", () => {
  const range = { low: 100, point: 150, high: 250 };
  assert.equal(interpRange(range, -1), 100);
  assert.equal(interpRange(range, 0), 150);
  assert.equal(interpRange(range, 1), 250);
  assert.equal(interpRange(range, 0.5), 200); // point + 0.5*(high-point)
  assert.equal(interpRange(range, -0.5), 125); // point - 0.5*(point-low)
  assert.equal(interpRange(range, 5), 250); // clamped
});

test("each finalist gets a full grid of cells with a central point-estimate cell", () => {
  const scenario = createExampleScenario();
  const stage1 = runStage1(scenario);
  const stage2 = runStage2(scenario, stage1.finalists);

  const cellCount =
    DEFAULT_GRID.integratedFractions.length *
    DEFAULT_GRID.transitionFractions.length;
  for (const entry of stage2.perBundle) {
    assert.equal(entry.cells.length, cellCount);
    const center = entry.cells.find(
      (cell) => cell.integratedFraction === 0 && cell.transitionFraction === 0,
    );
    assert.ok(center);
    assert.equal(entry.summary.centerNetSavings, center!.netSavings);
    assert.ok(
      entry.summary.worstNetSavings <= entry.summary.bestNetSavings,
    );
  }
});

test("the point-estimate winner is the all-shareable-merged bundle", () => {
  const scenario = createExampleScenario();
  const stage1 = runStage1(scenario);
  const stage2 = runStage2(scenario, stage1.finalists);
  const pointBundle = stage2.perBundle.find(
    (entry) => entry.bundle.id === stage2.pointEstimateBundleId,
  );
  assert.ok(pointBundle);
  assert.equal(pointBundle!.bundle.mergedCategoryIds.length, 5);
});

test("Stage 2 surfaces a worst-case difference the point estimate hides", () => {
  // The all-merge bundle is cheapest at the centre, but including Distribution
  // (a wide-range category) gives it a worse downside than the bundle that keeps
  // Distribution standalone. That divergence is exactly what Stage 2 is for.
  const scenario = createExampleScenario();
  const stage1 = runStage1(scenario);
  const stage2 = runStage2(scenario, stage1.finalists);

  const allMerge = stage2.perBundle.find(
    (entry) => entry.bundle.mergedCategoryIds.length === 5,
  );
  const withoutDistribution = stage2.perBundle.find(
    (entry) =>
      entry.bundle.mergedCategoryIds.length === 4 &&
      !entry.bundle.mergedCategoryIds.includes("distribution"),
  );
  assert.ok(allMerge, "all-merge should be a finalist");
  assert.ok(withoutDistribution, "the drop-Distribution bundle should be a finalist");

  assert.ok(
    withoutDistribution!.summary.worstNetSavings >
      allMerge!.summary.worstNetSavings,
    "keeping Distribution standalone should have the better worst case",
  );
  // The point-estimate winner and the robust picks genuinely diverge: all-merge
  // is cheapest at the centre, but keeping Distribution standalone is the
  // maximin (best worst-case) and minimum-regret choice.
  assert.equal(stage2.pointEstimateBundleId, allMerge!.bundle.id);
  assert.equal(stage2.maximinBundleId, withoutDistribution!.bundle.id);
  assert.equal(stage2.recommendedBundleId, withoutDistribution!.bundle.id);
  assert.notEqual(stage2.pointEstimateBundleId, stage2.maximinBundleId);
});

test("regret is non-negative and the recommended pick has the minimum max-regret", () => {
  const scenario = createExampleScenario();
  const stage1 = runStage1(scenario);
  const stage2 = runStage2(scenario, stage1.finalists);

  for (const entry of stage2.perBundle) {
    assert.ok(entry.maxRegret >= 0);
    assert.ok(entry.summary.sharePositive >= 0 && entry.summary.sharePositive <= 1);
  }
  const recommended = stage2.perBundle.find(
    (entry) => entry.bundle.id === stage2.recommendedBundleId,
  );
  const minRegret = Math.min(...stage2.perBundle.map((e) => e.maxRegret));
  assert.ok(recommended);
  assert.equal(recommended!.maxRegret, minRegret);
});
