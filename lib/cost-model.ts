export type IntegrationMode = "separate" | "merged";

export type Dimension = {
  id: number;
  name: string;
  programmeCosts: number[];
  startupCost: number;
  mergedCost: number;
  mode: IntegrationMode;
};

export type ScenarioResults = {
  baseline: number;
  steadyState: number;
  upfrontInvestment: number;
  savings: number;
  firstYearSavings: number;
  savingsRate: number;
  paybackYears: number | null;
};

export type TimelinePoint = {
  year: number;
  baseline: number;
  scenario: number;
  netSavings: number;
};

export function verticalCostForDimension(
  dimension: Dimension,
  programmeCount: number,
) {
  return dimension.programmeCosts
    .slice(0, programmeCount)
    .reduce((sum, cost) => sum + cost, 0);
}

export function costForDimension(
  dimension: Dimension,
  programmeCount: number,
) {
  return dimension.mode === "merged"
    ? dimension.mergedCost
    : verticalCostForDimension(dimension, programmeCount);
}

export function calculateScenario(
  dimensions: Dimension[],
  programmeCount: number,
): ScenarioResults {
  const baseline = dimensions.reduce(
    (sum, dimension) =>
      sum + verticalCostForDimension(dimension, programmeCount),
    0,
  );
  const steadyState = dimensions.reduce(
    (sum, dimension) => sum + costForDimension(dimension, programmeCount),
    0,
  );
  const upfrontInvestment = dimensions.reduce(
    (sum, dimension) =>
      sum + (dimension.mode === "merged" ? dimension.startupCost : 0),
    0,
  );
  const savings = baseline - steadyState;
  const firstYearSavings = savings - upfrontInvestment;
  const paybackYears = savings > 0 ? upfrontInvestment / savings : null;

  return {
    baseline,
    steadyState,
    upfrontInvestment,
    savings,
    firstYearSavings,
    savingsRate: baseline ? savings / baseline : 0,
    paybackYears,
  };
}

export function buildCostTimeline(
  results: Pick<
    ScenarioResults,
    "baseline" | "steadyState" | "upfrontInvestment"
  >,
  horizonYears: number,
): TimelinePoint[] {
  const months = horizonYears * 12;
  return Array.from({ length: months + 1 }, (_, month) => {
    const year = month / 12;
    const baseline = results.baseline * year;
    const scenario = results.upfrontInvestment + results.steadyState * year;
    return {
      year,
      baseline,
      scenario,
      netSavings: baseline - scenario,
    };
  });
}
