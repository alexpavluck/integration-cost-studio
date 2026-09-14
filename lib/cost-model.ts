export type IntegrationMode = "separate" | "merged";

export type Dimension = {
  id: number;
  name: string;
  programmeCosts: number[];
  startupCost: number;
  transitionOverlapCost: number;
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

export type DiscountedResults = {
  discountRate: number;
  horizonYears: number;
  npv: number;
  discountedPaybackYears: number | null;
};

export type MergeCandidate = {
  id: number;
  name: string;
  currentCost: number;
  mergedCost: number;
  startupCost: number;
  transitionOverlapCost: number;
  totalUpfrontCost: number;
  annualChange: number;
  paybackYears: number | null;
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

/**
 * Every one-time cost a merge actually incurs: the direct startup/build cost
 * plus the transition overlap cost (running the old and new arrangement in
 * parallel while people, data, and process cut over). Modeling only the
 * startup cost understates the true upfront investment for most real
 * integrations.
 */
export function mergeUpfrontCost(dimension: Dimension) {
  return dimension.startupCost + dimension.transitionOverlapCost;
}

/**
 * Simple (undiscounted) payback in years: how long it takes for constant
 * annual savings to recover the upfront investment.
 *
 * - If there is no upfront investment and no annual downside, there is
 *   nothing to recover, so payback is immediate (0).
 * - If annual savings are zero or negative there is no point at which the
 *   investment is recovered, so payback is undefined (null) rather than an
 *   infinite or negative number.
 */
export function calculatePaybackYears(
  upfrontInvestment: number,
  savings: number,
): number | null {
  if (upfrontInvestment <= 0 && savings >= 0) return 0;
  if (savings > 0) return upfrontInvestment / savings;
  return null;
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
      sum + (dimension.mode === "merged" ? mergeUpfrontCost(dimension) : 0),
    0,
  );
  const savings = baseline - steadyState;
  const firstYearSavings = savings - upfrontInvestment;
  const paybackYears = calculatePaybackYears(upfrontInvestment, savings);

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

/**
 * Net present value of the scenario over a fixed horizon: the upfront
 * investment (paid at time zero, so it is never discounted) offset against
 * a discounted annuity of the constant annual savings. A discount rate of 0
 * degenerates to the simple undiscounted view used elsewhere in the model.
 *
 * This does NOT replace the simple payback figure — it exists because a
 * simple payback period systematically favors near-term savings over
 * larger, longer-dated ones, and ignores that money saved five years from
 * now is worth less than money saved next year.
 */
export function calculateNPV(
  results: Pick<ScenarioResults, "savings" | "upfrontInvestment">,
  discountRate: number,
  horizonYears: number,
): number {
  const { savings, upfrontInvestment } = results;
  if (discountRate === 0) {
    return savings * horizonYears - upfrontInvestment;
  }
  const annuityFactor =
    (1 - Math.pow(1 + discountRate, -horizonYears)) / discountRate;
  return savings * annuityFactor - upfrontInvestment;
}

/**
 * Discounted payback in years: the point at which the present value of
 * cumulative savings equals the upfront investment. Always greater than or
 * equal to the simple payback figure for the same inputs (discounting can
 * only make payback slower, never faster). Returns null if the investment
 * is never recovered even over an infinite horizon at this discount rate.
 */
export function calculateDiscountedPaybackYears(
  results: Pick<ScenarioResults, "savings" | "upfrontInvestment">,
  discountRate: number,
): number | null {
  const { savings, upfrontInvestment } = results;
  if (upfrontInvestment <= 0 && savings >= 0) return 0;
  if (savings <= 0) return null;
  if (discountRate === 0) return upfrontInvestment / savings;

  const ratio = (upfrontInvestment * discountRate) / savings;
  if (ratio >= 1) return null;
  return -Math.log(1 - ratio) / Math.log(1 + discountRate);
}

export function calculateDiscountedResults(
  results: Pick<ScenarioResults, "savings" | "upfrontInvestment">,
  discountRate: number,
  horizonYears: number,
): DiscountedResults {
  return {
    discountRate,
    horizonYears,
    npv: calculateNPV(results, discountRate, horizonYears),
    discountedPaybackYears: calculateDiscountedPaybackYears(
      results,
      discountRate,
    ),
  };
}

/**
 * Ranks every attribute by how quickly it would pay back IF it were merged,
 * using its own entered merged-service cost and upfront cost — independent
 * of whether it is currently flagged "separate" or "merged" in the
 * scenario. This is a decision-support ranking, not an optimizer: it
 * surfaces which attributes look like the fastest, safest candidates to
 * integrate first, but it does not account for interactions between
 * attributes (e.g. shared implementation cost across several merges) or
 * capacity/budget constraints on how many can be tackled at once.
 */
export function rankMergeCandidates(
  dimensions: Dimension[],
  programmeCount: number,
): MergeCandidate[] {
  return dimensions
    .map((dimension) => {
      const currentCost = verticalCostForDimension(dimension, programmeCount);
      const totalUpfrontCost = mergeUpfrontCost(dimension);
      const annualChange = currentCost - dimension.mergedCost;
      const paybackYears = calculatePaybackYears(
        totalUpfrontCost,
        annualChange,
      );
      return {
        id: dimension.id,
        name: dimension.name,
        currentCost,
        mergedCost: dimension.mergedCost,
        startupCost: dimension.startupCost,
        transitionOverlapCost: dimension.transitionOverlapCost,
        totalUpfrontCost,
        annualChange,
        paybackYears,
      };
    })
    .sort((a, b) => {
      const aScore = a.paybackYears ?? Number.POSITIVE_INFINITY;
      const bScore = b.paybackYears ?? Number.POSITIVE_INFINITY;
      if (aScore !== bScore) return aScore - bScore;
      return b.annualChange - a.annualChange;
    });
}

export type PaybackPoint = { year: number; statusQuo: number; integrated: number };

export type PaybackSeries = {
  points: PaybackPoint[];
  /** Year the two lines cross, or null when they never do. */
  crossoverYear: number | null;
  /** Last year plotted — always far enough out to show the crossover. */
  maxYear: number;
  /** Highest cumulative value on either line, for scaling the y axis. */
  maxValue: number;
};

/** Hard ceiling on the x axis: a payback 20 years out is a "no" either way. */
const MAX_PLOTTED_YEARS = 15;

/**
 * Cumulative cost of staying separate versus integrating, year by year.
 *
 * Status quo starts at zero and climbs at the baseline rate. Integration starts
 * already down the transition cost and climbs more slowly, so the lines cross at
 * the moment the merge has paid for itself. That crossing is
 * `transitionCost / annualSavings` — the same expression `calculatePaybackYears`
 * evaluates, so the chart and the payback figure beside it cannot disagree.
 *
 * Costs are totals (program + country). The program-only figure would count work
 * shifted to the national program as a saving and cross flatteringly early.
 */
export function buildPaybackSeries(
  baselineAnnualCost: number,
  integratedAnnualCost: number,
  transitionCost: number,
  horizonYears: number,
): PaybackSeries {
  const annualSavings = baselineAnnualCost - integratedAnnualCost;
  const crossoverYear = calculatePaybackYears(transitionCost, annualSavings);

  // Extend past the horizon when payback lands beyond it, so the crossing is on
  // screen rather than implied off the right edge.
  const needed =
    crossoverYear === null ? horizonYears : Math.ceil(crossoverYear) + 1;
  const maxYear = Math.max(
    1,
    Math.min(MAX_PLOTTED_YEARS, Math.max(horizonYears, needed)),
  );

  const points: PaybackPoint[] = [];
  for (let year = 0; year <= maxYear; year += 1) {
    points.push({
      year,
      statusQuo: baselineAnnualCost * year,
      integrated: transitionCost + integratedAnnualCost * year,
    });
  }

  const maxValue = points.reduce(
    (worst, point) => Math.max(worst, point.statusQuo, point.integrated),
    0,
  );

  return {
    points,
    crossoverYear:
      crossoverYear !== null && crossoverYear <= maxYear ? crossoverYear : null,
    maxYear,
    maxValue,
  };
}
