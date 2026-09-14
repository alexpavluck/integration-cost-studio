import assert from "node:assert/strict";
import test from "node:test";
import { comparePlanToBest, runStage1 } from "../lib/optimizer.ts";
import { RESOURCE_TYPES, createExampleScenario } from "../lib/model.ts";
import { evaluateSelection } from "../lib/cost-engine.ts";

test("returns an all-separate baseline and feasible merge finalists ranked by annualized cost", () => {
  const scenario = createExampleScenario();
  const stage1 = runStage1(scenario);

  assert.equal(stage1.baseline.id, "baseline");
  assert.equal(stage1.baseline.mergedCategoryIds.length, 0);
  assert.ok(stage1.finalists.length >= 2 && stage1.finalists.length <= 3);

  // Finalists are sorted cheapest-first and every finalist is feasible and merges something.
  // Ranking is on the program-borne figure, so that is what monotonicity is
  // asserted on: the total differs by whatever is shifted to the country, and
  // flagging another category government-funded would break that offset.
  for (let i = 1; i < stage1.finalists.length; i += 1) {
    assert.ok(
      stage1.finalists[i - 1].result.programAnnualizedCost <=
        stage1.finalists[i].result.programAnnualizedCost,
    );
  }
  for (const finalist of stage1.finalists) {
    assert.equal(finalist.result.feasible, true);
    assert.ok(finalist.mergedCategoryIds.length > 0);
  }
});

test("the ranked figure is the one the ceilings test, not the total", () => {
  // Regression guard for a UI that read the totals: the top finalist's total
  // field-days exceed the ceiling while the program-borne draw — the figure
  // feasibility is actually decided on — sits under it. Any panel that shows a
  // number beside a ceiling must show the program-borne one.
  const scenario = createExampleScenario();
  const stage1 = runStage1(scenario, "cost");
  const top = stage1.finalists[0];
  const ceilings = scenario.constraints.resourceCeilings;

  for (const resource of RESOURCE_TYPES) {
    assert.ok(
      top.result.programResourceUsage[resource.id] <= ceilings[resource.id],
      `${resource.label}: program draw must be within its ceiling`,
    );
  }

  assert.ok(
    RESOURCE_TYPES.some(
      (resource) => top.result.resourceUsage[resource.id] > ceilings[resource.id],
    ),
    "the totals must breach at least one ceiling, or this fixture no longer separates the two",
  );
});

test("optimizing on a resource ranks by that resource and reorders the shortlist", () => {
  const scenario = createExampleScenario();
  const byCost = runStage1(scenario, "cost");
  const byStaff = runStage1(scenario, "staffHours");

  // Staff-hours finalists are sorted by staff-hours ascending.
  for (let i = 1; i < byStaff.finalists.length; i += 1) {
    assert.ok(
      byStaff.finalists[i - 1].result.programResourceUsage.staffHours <=
        byStaff.finalists[i].result.programResourceUsage.staffHours,
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
  // 5 integrable categories → 32 selections; the field-day ceiling rules out 9 of
  // them, including the status quo, so integration is forced rather than optional.
  assert.equal(stage1.feasibleCount + stage1.infeasibleCount, 32);
  assert.equal(stage1.feasibleCount, 23);
  assert.equal(stage1.infeasibleCount, 9);
});

test("the cheapest finalist is the bundle the cost objective is seeded to pick", () => {
  const scenario = createExampleScenario();
  const stage1 = runStage1(scenario);
  // Not every integrable category: Distribution barely pays at the point estimate
  // and Supervision costs more merged, so cost stops at three merges.
  assert.deepEqual(stage1.finalists[0].mergedCategoryIds, [
    "data",
    "training",
    "transport",
  ]);
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
  // quo breaches it; the merges the optimizer shortlists relieve it, so finalists
  // stay feasible.
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

test("the four objectives do not all pick the same bundle", () => {
  const scenario = createExampleScenario();
  const picks = (["cost", "staffHours", "vehicleDays", "fieldDays"] as const).map(
    (objective) => runStage1(scenario, objective).finalists[0]?.id ?? "none",
  );
  assert.equal(new Set(picks).size, 4, `expected four distinct optima, got ${picks.join(" | ")}`);
});

test("seeded costs are actual values, not thousands", () => {
  // A sanity bound, so a future edit cannot silently reintroduce $k scaling.
  const scenario = createExampleScenario();
  for (const category of scenario.categories) {
    for (const entry of Object.values(category.perProgram)) {
      assert.ok(
        entry.standaloneCost === 0 || entry.standaloneCost >= 10000,
        `${category.name} standalone cost ${entry.standaloneCost} looks like thousands`,
      );
    }
  }
  assert.ok(scenario.constraints.fundingCeiling >= 100000);
});

test("the demo has an unplanned category the optimizer wants, and an infeasible status quo", () => {
  const scenario = createExampleScenario();
  assert.ok(scenario.categories.some((c) => c.canIntegrate && !c.plannedIntegration));
  const stage1 = runStage1(scenario, "cost");
  assert.equal(stage1.baseline.result.feasible, false, "status quo should breach a ceiling");
  assert.ok(stage1.infeasibleCount > 0, "some arrangements must be excluded by constraints");
});

test("leanest reports the lowest figure any arrangement reaches", () => {
  const scenario = createExampleScenario();
  const stage1 = runStage1(scenario, "cost");

  // Nothing reachable — feasible shortlist or the status quo — beats it.
  const reachable = [...stage1.ranked, stage1.baseline];
  assert.equal(
    stage1.leanest.programResourceUsage.staffHours,
    Math.min(...reachable.map((b) => b.result.programResourceUsage.staffHours)),
  );
  assert.equal(
    stage1.leanest.programAnnualizedCost,
    Math.min(...reachable.map((b) => b.result.programAnnualizedCost)),
  );

  // Merging everything integrable is not the leanest arrangement on any figure,
  // which is precisely why the constraints panel cannot assume that it is.
  const allMerged = evaluateSelection(
    scenario,
    new Set(scenario.categories.filter((c) => c.canIntegrate).map((c) => c.id)),
  );
  for (const resource of RESOURCE_TYPES) {
    assert.ok(
      stage1.leanest.programResourceUsage[resource.id] <
        allMerged.programResourceUsage[resource.id],
      `${resource.label}: all-merged is not the leanest arrangement`,
    );
  }
  assert.ok(stage1.leanest.programAnnualizedCost < allMerged.programAnnualizedCost);
});
