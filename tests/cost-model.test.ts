import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCostTimeline,
  calculateDiscountedPaybackYears,
  calculateDiscountedResults,
  calculateNPV,
  calculatePaybackYears,
  calculateScenario,
  costForDimension,
  mergeUpfrontCost,
  rankMergeCandidates,
  verticalCostForDimension,
  type Dimension,
} from "../lib/cost-model.ts";

const dimensions: Dimension[] = [
  {
    id: 1,
    name: "Keep vertical",
    programmeCosts: [100, 80, 70, 60],
    startupCost: 50,
    transitionOverlapCost: 0,
    mergedCost: 140,
    mode: "separate",
  },
  {
    id: 2,
    name: "Merge",
    programmeCosts: [200, 160, 140, 120],
    startupCost: 120,
    transitionOverlapCost: 30,
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

test("merge upfront cost includes both startup and transition overlap cost", () => {
  assert.equal(mergeUpfrontCost(dimensions[0]), 50);
  assert.equal(mergeUpfrontCost(dimensions[1]), 150);
});

test("calculates upfront investment (startup + overlap), annual savings, and payback", () => {
  const results = calculateScenario(dimensions, 2);

  assert.equal(results.baseline, 540);
  assert.equal(results.steadyState, 430);
  assert.equal(results.upfrontInvestment, 150);
  assert.equal(results.savings, 110);
  assert.equal(results.firstYearSavings, -40);
  assert.equal(results.savingsRate, 110 / 540);
  assert.equal(results.paybackYears, 150 / 110);
});

test("builds monthly cumulative cost points and annual anchors", () => {
  const results = calculateScenario(dimensions, 2);
  const timeline = buildCostTimeline(results, 2);

  assert.equal(timeline.length, 25);
  assert.deepEqual(timeline[0], {
    year: 0,
    baseline: 0,
    scenario: 150,
    netSavings: -150,
  });
  assert.deepEqual(timeline[12], {
    year: 1,
    baseline: 540,
    scenario: 580,
    netSavings: -40,
  });
  assert.deepEqual(timeline[24], {
    year: 2,
    baseline: 1080,
    scenario: 1010,
    netSavings: 70,
  });
});

test("treats zero upfront cost and zero savings as immediate (nothing to recover)", () => {
  const results = calculateScenario([dimensions[0]], 2);

  assert.equal(results.upfrontInvestment, 0);
  assert.equal(results.savings, 0);
  assert.equal(results.paybackYears, 0);
});

test("payback is null when there is a real upfront cost but no annual benefit", () => {
  assert.equal(calculatePaybackYears(120, 0), null);
  assert.equal(calculatePaybackYears(120, -10), null);
});

test("payback is immediate when there is annual benefit and no upfront cost", () => {
  assert.equal(calculatePaybackYears(0, 50), 0);
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

test("NPV degenerates to the simple undiscounted view at a 0% discount rate", () => {
  const results = { savings: 100, upfrontInvestment: 150 };
  assert.equal(calculateNPV(results, 0, 5), 100 * 5 - 150);
});

test("discounting reduces NPV relative to the undiscounted figure", () => {
  const results = { savings: 100, upfrontInvestment: 150 };
  const undiscounted = calculateNPV(results, 0, 5);
  const discounted = calculateNPV(results, 0.08, 5);
  assert.ok(discounted < undiscounted);
});

test("discounted payback is never faster than simple payback", () => {
  const results = { savings: 110, upfrontInvestment: 150 };
  const simple = calculatePaybackYears(results.upfrontInvestment, results.savings);
  const discounted = calculateDiscountedPaybackYears(results, 0.08);
  assert.ok(simple !== null && discounted !== null);
  assert.ok(discounted >= simple);
});

test("discounted payback is null when the investment never recovers even undiscounted", () => {
  const results = { savings: -10, upfrontInvestment: 150 };
  assert.equal(calculateDiscountedPaybackYears(results, 0.08), null);
});

test("discounted payback can be null even when simple payback exists, if the discount rate is high enough", () => {
  // Upfront cost recovered only if savings * discountRate < upfrontInvestment * ... never — pick numbers where
  // the perpetuity value of savings at this rate is less than the upfront cost.
  const results = { savings: 5, upfrontInvestment: 150 };
  // Perpetuity value at 8% = 5 / 0.08 = 62.5, less than 150 -> never recovers.
  assert.equal(calculateDiscountedPaybackYears(results, 0.08), null);
});

test("calculateDiscountedResults bundles NPV and discounted payback together", () => {
  const results = calculateScenario(dimensions, 2);
  const discounted = calculateDiscountedResults(results, 0.06, 5);
  assert.equal(discounted.discountRate, 0.06);
  assert.equal(discounted.horizonYears, 5);
  assert.equal(discounted.npv, calculateNPV(results, 0.06, 5));
  assert.equal(
    discounted.discountedPaybackYears,
    calculateDiscountedPaybackYears(results, 0.06),
  );
});

test("ranks merge candidates by fastest hypothetical payback, independent of current mode", () => {
  // With programmeCount 2, each dimension's current combined cost is 100 + 100 = 200.
  const fastPayback: Dimension = {
    id: 3,
    name: "Fast payback",
    programmeCosts: [100, 100, 100, 100],
    startupCost: 15,
    transitionOverlapCost: 0,
    mergedCost: 50, // annual change 200-50=150, payback 15/150 = 0.1yr
    mode: "separate",
  };
  const slowPayback: Dimension = {
    id: 4,
    name: "Slow payback",
    programmeCosts: [100, 100, 100, 100],
    startupCost: 100,
    transitionOverlapCost: 0,
    mergedCost: 180, // annual change 200-180=20, payback 100/20 = 5yr
    mode: "merged",
  };
  const noPayback: Dimension = {
    id: 5,
    name: "No payback",
    programmeCosts: [100, 100, 100, 100],
    startupCost: 40,
    transitionOverlapCost: 0,
    mergedCost: 250, // annual change 200-250=-50 -> never pays back
    mode: "separate",
  };

  const ranked = rankMergeCandidates(
    [slowPayback, noPayback, fastPayback],
    2,
  );

  assert.deepEqual(ranked.map((candidate) => candidate.name), [
    "Fast payback",
    "Slow payback",
    "No payback",
  ]);
  assert.equal(ranked[0].paybackYears, 15 / 150);
  assert.equal(ranked[1].paybackYears, 100 / 20);
  assert.equal(ranked[2].paybackYears, null);
});
