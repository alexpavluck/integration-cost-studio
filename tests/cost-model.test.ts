import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCostTimeline,
  calculateScenario,
  type Dimension,
} from "../lib/cost-model.ts";

const dimensions: Dimension[] = [
  { id: 1, name: "Separate", cost: 100, upfrontCost: 50, mode: "independent" },
  { id: 2, name: "Coordinated", cost: 200, upfrontCost: 80, mode: "coordinated" },
  { id: 3, name: "Integrated", cost: 300, upfrontCost: 120, mode: "integrated" },
];

test("calculates annual costs, upfront investment, and payback", () => {
  const results = calculateScenario(dimensions, 2, 0.25, 1.2);

  assert.equal(results.baseline, 1200);
  assert.equal(results.steadyState, 910);
  assert.equal(results.upfrontInvestment, 200);
  assert.equal(results.savings, 290);
  assert.equal(results.firstYearSavings, 90);
  assert.equal(results.savingsRate, 290 / 1200);
  assert.equal(results.paybackYears, 200 / 290);
});

test("builds cumulative cost points from the initial investment", () => {
  const results = calculateScenario(dimensions, 2, 0.25, 1.2);
  const timeline = buildCostTimeline(results, 2);

  assert.deepEqual(timeline, [
    { year: 0, baseline: 0, scenario: 200, netSavings: -200 },
    { year: 1, baseline: 1200, scenario: 1110, netSavings: 90 },
    { year: 2, baseline: 2400, scenario: 2020, netSavings: 380 },
  ]);
});

test("does not count upfront costs for dimensions that remain independent", () => {
  const results = calculateScenario([dimensions[0]], 2, 0.25, 1.2);

  assert.equal(results.upfrontInvestment, 0);
  assert.equal(results.savings, 0);
  assert.equal(results.paybackYears, null);
});

test("reports no payback when the proposed run rate is more expensive", () => {
  const results = calculateScenario(
    [{ id: 1, name: "Expensive", cost: 100, upfrontCost: 50, mode: "integrated" }],
    2,
    0.25,
    3,
  );

  assert.equal(results.savings, -100);
  assert.equal(results.paybackYears, null);
});
