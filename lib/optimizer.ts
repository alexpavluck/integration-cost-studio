// Stage 1 — shortlisting optimizer.
//
// Cost is the SOLE objective (spec §3/§4). Resource ceilings and non-negotiable
// (non-shareable) categories are hard constraints — never folded into a weighted
// score. The output is a shortlist of "plausible finalists," not a
// recommendation; the robust choice among them is decided in Stage 2
// (lib/robustness.ts).
//
// Because the decision is one binary per shareable category, the whole space is
// 2^k selections for k shareable categories. At realistic scale (k ≲ 10) that is
// ≤1024 evaluations — instant to brute-force and fully transparent, so no MIP
// solver is needed.

import { calculatePaybackYears } from "./cost-model.ts";
import {
  baselineAnnualCost,
  evaluateSelection,
  type EngineResult,
} from "./cost-engine.ts";
import type { Scenario } from "./model.ts";

/**
 * What the shortlist minimizes. Cost is the classic objective, but a program
 * that is capacity-constrained on a particular resource may want to minimize
 * that resource's draw instead. Whichever is chosen, the resource ceilings and
 * funding envelope remain hard constraints — only the ranking metric changes.
 */
export const OBJECTIVES = [
  { id: "cost", label: "Cost", unit: "$k annualized" },
  { id: "staffHours", label: "Staff-hours", unit: "hrs/yr" },
  { id: "vehicleDays", label: "Vehicle-days", unit: "veh-days/yr" },
  { id: "fieldDays", label: "Field-days", unit: "field-days/yr" },
] as const;

export type Objective = (typeof OBJECTIVES)[number]["id"];

/** The value a given objective minimizes for an evaluated arrangement. */
export function objectiveValue(result: EngineResult, objective: Objective): number {
  return objective === "cost"
    ? result.annualizedCost
    : result.resourceUsage[objective];
}

export type Bundle = {
  /** Stable key: sorted merged ids joined, or "baseline" for all-standalone. */
  id: string;
  /** Human label, e.g. "Merge Training + Transport". */
  label: string;
  mergedCategoryIds: string[];
  /** Point-estimate evaluation. */
  result: EngineResult;
  /** Ongoing TOTAL (program + country) annual saving vs baseline (may be negative). */
  annualSavingsVsBaseline: number;
  /**
   * Annual saving the PROGRAM books vs baseline — includes any cost shifted to
   * the country. Equals annualSavingsVsBaseline + countryLiability, so it can
   * overstate the real efficiency when government funding is used.
   */
  programSavingsVsBaseline: number;
  /** New annual cost taken on by the country / health system (government-funded merges). */
  countryLiability: number;
  /** Undiscounted net saving over the horizon, net of transition cost (total). */
  netSavingsOverHorizon: number;
  /** Simple payback in years (null if it never recovers its transition cost). */
  paybackYears: number | null;
};

export type Stage1Output = {
  /** All-standalone reference (its feasibility is informative in its own right). */
  baseline: Bundle;
  /** Top feasible merge bundles by annualized cost (spec §5: 2–3 finalists). */
  finalists: Bundle[];
  feasibleCount: number;
  infeasibleCount: number;
  /** Every feasible bundle ranked by annualized cost (baseline included). */
  ranked: Bundle[];
};

function subsets<T>(items: T[]): T[][] {
  return items.reduce<T[][]>(
    (acc, item) => acc.concat(acc.map((combo) => [...combo, item])),
    [[]],
  );
}

function bundleId(mergedIds: string[]): string {
  return mergedIds.length ? [...mergedIds].sort().join("+") : "baseline";
}

function bundleLabel(scenario: Scenario, mergedIds: string[]): string {
  if (!mergedIds.length) return "All separate (baseline)";
  const names = mergedIds.map(
    (id) => scenario.categories.find((c) => c.id === id)?.name ?? id,
  );
  return `Merge ${names.join(" + ")}`;
}

function toBundle(
  scenario: Scenario,
  mergedIds: string[],
  baselineAnnual: number,
): Bundle {
  const selection = new Set(mergedIds);
  const result = evaluateSelection(scenario, selection);
  // The baseline is all-standalone, so its cost is entirely program-borne:
  // baseline program cost === baselineAnnual (country liability is 0).
  const annualSavingsVsBaseline = baselineAnnual - result.annualCost;
  const programSavingsVsBaseline = baselineAnnual - result.programAnnualCost;
  const countryLiability = result.countryAnnualCost;
  const horizon = scenario.constraints.horizonYears;
  const netSavingsOverHorizon =
    annualSavingsVsBaseline * horizon - result.transitionCost;
  const paybackYears = calculatePaybackYears(
    result.transitionCost,
    annualSavingsVsBaseline,
  );
  return {
    id: bundleId(mergedIds),
    label: bundleLabel(scenario, mergedIds),
    mergedCategoryIds: [...mergedIds].sort(),
    result,
    annualSavingsVsBaseline,
    programSavingsVsBaseline,
    countryLiability,
    netSavingsOverHorizon,
    paybackYears,
  };
}

/**
 * Enumerate every merge selection over the shareable categories, keep the
 * feasible ones, and return the all-standalone baseline plus the top
 * `finalistCount` feasible merge bundles by the chosen objective. Ties break on
 * annualized cost so the ordering is stable and cost-sensible.
 */
export function runStage1(
  scenario: Scenario,
  objective: Objective = "cost",
  finalistCount = 3,
): Stage1Output {
  const baselineAnnual = baselineAnnualCost(scenario);
  const shareableIds = scenario.categories
    .filter((category) => category.shareable)
    .map((category) => category.id);

  const allBundles = subsets(shareableIds).map((mergedIds) =>
    toBundle(scenario, mergedIds, baselineAnnual),
  );

  const baseline = allBundles.find((bundle) => bundle.id === "baseline")!;
  const feasible = allBundles.filter((bundle) => bundle.result.feasible);
  const infeasibleCount = allBundles.length - feasible.length;

  const ranked = [...feasible].sort((a, b) => {
    const primary =
      objectiveValue(a.result, objective) - objectiveValue(b.result, objective);
    return primary !== 0
      ? primary
      : a.result.annualizedCost - b.result.annualizedCost;
  });

  // Finalists are feasible bundles that actually merge something (the baseline
  // is reported separately as the reference point).
  const finalists = ranked
    .filter((bundle) => bundle.mergedCategoryIds.length > 0)
    .slice(0, finalistCount);

  return {
    baseline,
    finalists,
    feasibleCount: feasible.length,
    infeasibleCount,
    ranked,
  };
}
