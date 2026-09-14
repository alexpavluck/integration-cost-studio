import assert from "node:assert/strict";
import test from "node:test";
import { comparePlanToBest, runStage1 } from "../lib/optimizer.ts";
import { createExampleScenario } from "../lib/model.ts";

test("returns an all-separate baseline and feasible merge finalists ranked by annualized cost", () => {
  const scenario = createExampleScenario();
  const stage1 = runStage1(scenario);

  assert.equal(stage1.baseline.id, "baseline");
  assert.equal(stage1.baseline.mergedCategoryIds.length, 0);
  assert.ok(stage1.finalists.length >= 2 && stage1.finalists.length <= 3);

  // Finalists are sorted cheapest-first and every finalist is feasible and merges something.
  for (let i = 1; i < stage1.finalists.length; i += 1) {
    assert.ok(
      stage1.finalists[i - 1].result.annualizedCost <=
        stage1.finalists[i].result.annualizedCost,
    );
  }
  for (const finalist of stage1.finalists) {
    assert.equal(finalist.result.feasible, true);
    assert.ok(finalist.mergedCategoryIds.length > 0);
  }
});

test("optimizing on a resource ranks by that resource and reorders the shortlist", () => {
  const scenario = createExampleScenario();
  const byCost = runStage1(scenario, "cost");
  const byStaff = runStage1(scenario, "staffHours");

  // Staff-hours finalists are sorted by staff-hours ascending.
  for (let i = 1; i < byStaff.finalists.length; i += 1) {
    assert.ok(
      byStaff.finalists[i - 1].result.resourceUsage.staffHours <=
        byStaff.finalists[i].result.resourceUsage.staffHours,
    );
  }

  // A different objective produces a different shortlist (keeping the
  // high-resource Distribution merged matters for staff-hours but not for cost).
  const costIds = byCost.finalists.map((b) => b.id).join(",");
  const staffIds = byStaff.finalists.map((b) => b.id).join(",");
  assert.notEqual(costIds, staffIds);
});

test("the default objective is cost (backwards compatible)", () => {
  const scenario = createExampleScenario();
  assert.deepEqual(
    runStage1(scenario).finalists.map((b) => b.id),
    runStage1(scenario, "cost").finalists.map((b) => b.id),
  );
});

test("the category that cannot integrate never appears in any finalist bundle", () => {
  const scenario = createExampleScenario();
  const stage1 = runStage1(scenario);
  for (const bundle of stage1.ranked) {
    assert.ok(!bundle.mergedCategoryIds.includes("safety"));
  }
});

test("enumerates 2^k feasible bundles over integrable categories only", () => {
  const scenario = createExampleScenario();
  const stage1 = runStage1(scenario);
  // 5 integrable categories → 32 selections, all feasible under the roomy example ceilings.
  assert.equal(stage1.feasibleCount + stage1.infeasibleCount, 32);
  assert.equal(stage1.infeasibleCount, 0);
});

test("the cheapest finalist merges everything integrable at the point estimate", () => {
  const scenario = createExampleScenario();
  const stage1 = runStage1(scenario);
  assert.equal(stage1.finalists[0].mergedCategoryIds.length, 5);
});

test("payback and net savings are computed against the baseline", () => {
  const scenario = createExampleScenario();
  const stage1 = runStage1(scenario);
  const best = stage1.finalists[0];
  const expectedNet =
    best.annualSavingsVsBaseline * scenario.constraints.horizonYears -
    best.result.transitionCost;
  assert.equal(best.netSavingsOverHorizon, expectedNet);
  assert.ok(best.paybackYears !== null && best.paybackYears > 0);
});

test("a status quo that breaches a ceiling is flagged, while merges that relieve it stay feasible", () => {
  const scenario = createExampleScenario();
  // Set the staff-hours ceiling just below the all-standalone draw so the status
  // quo breaches it; merging strictly reduces usage, so finalists stay feasible.
  const baseUsage = runStage1(scenario).baseline.result.resourceUsage.staffHours;
  scenario.constraints.resourceCeilings.staffHours = baseUsage - 50;

  const stage1 = runStage1(scenario);
  assert.equal(stage1.baseline.result.feasible, false);
  assert.ok(stage1.finalists.length > 0);
  for (const finalist of stage1.finalists) {
    assert.equal(finalist.result.feasible, true);
  }
});

test("a category the user did not plan to integrate can still win", () => {
  const scenario = createExampleScenario();
  const unplanned = scenario.categories.find(
    (c) => c.canIntegrate && !c.plannedIntegration,
  );
  assert.ok(unplanned, "fixture must have a category that can integrate but is unplanned");

  const stage1 = runStage1(scenario, "cost");
  const consideredEverywhere = stage1.ranked.some((bundle) =>
    bundle.mergedCategoryIds.includes(unplanned!.id),
  );
  assert.ok(consideredEverywhere, "optimizer must consider unplanned categories");
});

test("a category that cannot integrate never appears in any bundle", () => {
  const scenario = createExampleScenario();
  const blocked = scenario.categories.find((c) => !c.canIntegrate)!;
  for (const bundle of runStage1(scenario, "cost").ranked) {
    assert.ok(!bundle.mergedCategoryIds.includes(blocked.id));
  }
});

test("userPlan reflects plannedIntegration and is evaluated like any bundle", () => {
  const scenario = createExampleScenario();
  const expected = scenario.categories
    .filter((c) => c.canIntegrate && c.plannedIntegration)
    .map((c) => c.id)
    .sort();

  const { userPlan } = runStage1(scenario, "cost");
  assert.deepEqual(userPlan.mergedCategoryIds, expected);
  assert.equal(typeof userPlan.result.feasible, "boolean");
  assert.equal(typeof userPlan.result.programAnnualizedCost, "number");
});

test("the comparison names what the optimizer would add and drop", () => {
  const scenario = createExampleScenario();
  const stage1 = runStage1(scenario, "staffHours");
  const comparison = comparePlanToBest(scenario, stage1);

  const planned = new Set(comparison.userPlan.mergedCategoryIds);
  const best = new Set(comparison.best!.mergedCategoryIds);

  for (const change of comparison.add) assert.ok(best.has(change.id) && !planned.has(change.id));
  for (const change of comparison.drop) assert.ok(planned.has(change.id) && !best.has(change.id));
  assert.ok(comparison.add.every((c) => c.name.length > 0));
});

test("a better optimum yields a negative objective delta", () => {
  const scenario = createExampleScenario();
  const stage1 = runStage1(scenario, "staffHours");
  const comparison = comparePlanToBest(scenario, stage1);
  assert.ok(comparison.objectiveDelta <= 0, "the optimum cannot be worse than the user's plan");
});

test("stage1 output records the objective it was ranked on", () => {
  const scenario = createExampleScenario();
  assert.equal(runStage1(scenario, "vehicleDays").objective, "vehicleDays");
});
