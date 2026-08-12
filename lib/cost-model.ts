export type IntegrationMode = "independent" | "coordinated" | "integrated";

export type Dimension = {
  id: number;
  name: string;
  cost: number;
  upfrontCost: number;
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

export function costForDimension(
  dimension: Dimension,
  programmes: number,
  coordinationEfficiency: number,
  integrationMultiplier: number,
) {
  if (dimension.mode === "independent") return dimension.cost * programmes;
  if (dimension.mode === "coordinated") {
    return (
      dimension.cost *
      (1 + (programmes - 1) * (1 - coordinationEfficiency))
    );
  }
  return dimension.cost * integrationMultiplier;
}

export function calculateScenario(
  dimensions: Dimension[],
  programmes: number,
  coordinationEfficiency: number,
  integrationMultiplier: number,
): ScenarioResults {
  const baseline = dimensions.reduce(
    (sum, dimension) => sum + dimension.cost * programmes,
    0,
  );
  const steadyState = dimensions.reduce(
    (sum, dimension) =>
      sum +
      costForDimension(
        dimension,
        programmes,
        coordinationEfficiency,
        integrationMultiplier,
      ),
    0,
  );
  const upfrontInvestment = dimensions.reduce(
    (sum, dimension) =>
      sum + (dimension.mode === "independent" ? 0 : dimension.upfrontCost),
    0,
  );
  const savings = baseline - steadyState;
  const firstYearSavings = savings - upfrontInvestment;
  const paybackYears =
    savings > 0 ? upfrontInvestment / savings : null;

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
  return Array.from({ length: horizonYears + 1 }, (_, year) => {
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
