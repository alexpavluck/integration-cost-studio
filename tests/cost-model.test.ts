import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCostTimeline,
  calculateScenario,
  costForDimension,
  verticalCostForDimension,
  type Dimension,
} from "../lib/cost-model.ts";

const dimensions: Dimension[] = [
  {
    id: 1,
    name: "Keep vertical",
    programmeCosts: [100, 80, 70, 60],
    startupCost: 50,
    mergedCost: 140,
    mode: "separate",
  },
  {
    id: 2,
    name: "Merge",
    programmeCosts: [200, 160, 140, 120],
    startupCost: 120,
    mergedCost: 250,
    mode: "merged",
  },
];

test("sums the entered costs for the active vertical programmes", () => {
  assert.equal(verticalCostForDimension(dimensions[0], 2), 180);
  assert.equal(verticalCostForDimension(dimensions[0], 4), 310);
});

test("uses either combined programme cost or the entered merged-service cost", () => {
  assert.equal(costForDimension(dimensions[0], 2), 180);
  assert.equal(costForDimension(dimensions[1], 2), 250);
});

test("calculates startup investment, annual savings, and payback", () => {
  const results = calculateScenario(dimensions, 2);

  assert.equal(results.baseline, 540);
  assert.equal(results.steadyState, 430);
  assert.equal(results.upfrontInvestment, 120);
  assert.equal(results.savings, 110);
  assert.equal(results.firstYearSavings, -10);
  assert.equal(results.savingsRate, 110 / 540);
  assert.equal(results.paybackYears, 120 / 110);
});

test("builds monthly cumulative cost points and annual anchors", () => {
  const results = calculateScenario(dimensions, 2);
  const timeline = buildCostTimeline(results, 2);

  assert.equal(timeline.length, 25);
  assert.deepEqual(timeline[0], {
    year: 0,
    baseline: 0,
    scenario: 120,
    netSavings: -120,
  });
  assert.deepEqual(timeline[12], {
    year: 1,
    baseline: 540,
    scenario: 550,
    netSavings: -10,
  });
  assert.deepEqual(timeline[24], {
    year: 2,
    baseline: 1080,
    scenario: 980,
    netSavings: 100,
  });
});

test("does not count startup costs for attributes kept vertical", () => {
  const results = calculateScenario([dimensions[0]], 2);

  assert.equal(results.upfrontInvestment, 0);
  assert.equal(results.savings, 0);
  assert.equal(results.paybackYears, null);
});

test("allows a merged service to cost more than the combined programmes", () => {
  const results = calculateScenario(
    [{ ...dimensions[1], mergedCost: 400 }],
    2,
  );

  assert.equal(results.baseline, 360);
  assert.equal(results.steadyState, 400);
  assert.equal(results.savings, -40);
  assert.equal(results.paybackYears, null);
});
