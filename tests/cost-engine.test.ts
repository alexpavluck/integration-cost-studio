import assert from "node:assert/strict";
import test from "node:test";
import {
  baselineAnnualCost,
  evaluateSelection,
  isMerged,
} from "../lib/cost-engine.ts";
import type {
  Category,
  ProgramEntry,
  ResourceDraw,
  Scenario,
} from "../lib/model.ts";

const draw = (
  staffHours: number,
  vehicleDays: number,
  fieldDays: number,
): ResourceDraw => ({ staffHours, vehicleDays, fieldDays });

const entry = (
  standaloneCost: number,
  resourceDraw: ResourceDraw,
): ProgramEntry => ({ standaloneCost, resourceDraw });

function makeScenario(overrides?: {
  staffCeiling?: number;
  fundingCeiling?: number;
  governmentFundedA?: boolean;
}): Scenario {
  const categoryA: Category = {
    id: "a",
    name: "Category A",
    shareable: true,
    governmentFunded: overrides?.governmentFundedA ?? false,
    perProgram: {
      p1: entry(100, draw(10, 1, 1)),
      p2: entry(80, draw(8, 1, 1)),
    },
    integratedCost: { low: 130, point: 150, high: 180 },
    transitionCost: { low: 50, point: 60, high: 75 },
    integratedResourceDraw: draw(14, 1, 1),
  };
  const categoryB: Category = {
    id: "b",
    name: "Category B",
    shareable: false, // non-negotiable
    governmentFunded: false,
    perProgram: {
      p1: entry(40, draw(5, 0, 1)),
      p2: entry(30, draw(4, 0, 1)),
    },
    integratedCost: { low: 0, point: 0, high: 0 },
    transitionCost: { low: 0, point: 0, high: 0 },
    integratedResourceDraw: draw(0, 0, 0),
  };
  return {
    programs: [
      { id: "p1", name: "Program 1" },
      { id: "p2", name: "Program 2" },
    ],
    categories: [categoryA, categoryB],
    constraints: {
      resourceCeilings: draw(overrides?.staffCeiling ?? 1000, 1000, 1000),
      fundingCeiling: overrides?.fundingCeiling ?? 100000,
      amortizationYears: 5,
      horizonYears: 5,
    },
  };
}

test("baseline (all standalone) sums every category's per-program cost", () => {
  const scenario = makeScenario();
  assert.equal(baselineAnnualCost(scenario), 100 + 80 + 40 + 30);
  const result = evaluateSelection(scenario, new Set());
  assert.equal(result.annualCost, 250);
  assert.equal(result.transitionCost, 0);
  assert.equal(result.annualizedCost, 250);
});

test("merging a category swaps its standalone costs for the shared instance and amortizes transition", () => {
  const scenario = makeScenario();
  const result = evaluateSelection(scenario, new Set(["a"]));
  // A merged (150) + B standalone (40 + 30)
  assert.equal(result.annualCost, 220);
  assert.equal(result.transitionCost, 60);
  // annualized = 220 + 60/5
  assert.equal(result.annualizedCost, 232);
});

test("government-funded merges shift cost from program to country, leaving the total unchanged", () => {
  const plain = evaluateSelection(makeScenario(), new Set(["a"]));
  const gov = evaluateSelection(
    makeScenario({ governmentFundedA: true }),
    new Set(["a"]),
  );

  // Total is identical — government funding only changes who pays.
  assert.equal(plain.annualCost, 220);
  assert.equal(gov.annualCost, 220);

  // Program-funded merge: program bears it all, country nothing.
  assert.equal(plain.programAnnualCost, 220);
  assert.equal(plain.countryAnnualCost, 0);

  // Government-funded merge: A's shared instance (150) becomes a country
  // liability; only B's standalone cost (70) stays on the program.
  assert.equal(gov.programAnnualCost, 70);
  assert.equal(gov.countryAnnualCost, 150);
});

test("a non-shareable category is never treated as merged even if selected", () => {
  const scenario = makeScenario();
  assert.equal(isMerged(scenario.categories[1], new Set(["b"])), false);
  const result = evaluateSelection(scenario, new Set(["b"]));
  assert.equal(result.annualCost, 250); // unchanged from baseline
  assert.equal(result.transitionCost, 0);
});

test("funding ceiling is a hard constraint; a budget below the status quo forces integration", () => {
  // Status-quo annualized cost = 250. Cut the budget to 235.
  const scenario = makeScenario({ fundingCeiling: 235 });
  const baseline = evaluateSelection(scenario, new Set());
  assert.equal(baseline.feasible, false); // 250 annualized > 235 available
  assert.match(baseline.violations.join(" "), /Total funding/);

  // Merging A brings annualized cost to 220 + 60/5 = 232, back under budget.
  const merged = evaluateSelection(scenario, new Set(["a"]));
  assert.equal(merged.annualizedCost, 232);
  assert.equal(merged.feasible, true);
});

test("resource ceiling is a hard constraint; merging reduces usage and can restore feasibility", () => {
  // All-standalone staff-hours for A = 10 + 8 = 18, B = 5 + 4 = 9 → 27.
  const scenario = makeScenario({ staffCeiling: 20 });
  const baseline = evaluateSelection(scenario, new Set());
  assert.equal(baseline.feasible, false); // 27 > 20
  assert.match(baseline.violations.join(" "), /Staff-hours/);

  // Merging A drops its two standalone instances (18) to one shared (14):
  // 14 + 9 = 23 — still over 20, so still infeasible here.
  const merged = evaluateSelection(scenario, new Set(["a"]));
  assert.equal(merged.resourceUsage.staffHours, 23);
  assert.equal(merged.feasible, false);
});
