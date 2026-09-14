// Stage 1 — shortlisting optimizer.
//
// Cost is the SOLE objective (spec §3/§4). Resource ceilings and categories
// policy forbids integrating are hard constraints — never folded into a weighted
// score. The output is a shortlist of "plausible finalists," not a
// recommendation; the robust choice among them is decided in Stage 2
// (lib/robustness.ts).
//
// Because the decision is one binary per integrable category, the whole space is
// 2^k selections for k integrable categories. At realistic scale (k ≲ 10) that is
// ≤1024 evaluations — instant to brute-force and fully transparent, so no MIP
// solver is needed.

import { calculatePaybackYears } from "./cost-model.ts";
import {
  baselineAnnualCost,
  evaluateSelection,
  type EngineResult,
} from "./cost-engine.ts";
import {
  RESOURCE_TYPES,
  emptyDraw,
  type ResourceDraw,
  type Scenario,
} from "./model.ts";

/**
 * What the shortlist minimizes. Cost is the classic objective, but a program
 * that is capacity-constrained on a particular resource may want to minimize
 * that resource's draw instead. Whichever is chosen, the resource ceilings and
 * funding envelope remain hard constraints — only the ranking metric changes.
 */
export const OBJECTIVES = [
  { id: "cost", label: "Cost", unit: "$ annualized" },
  { id: "staffHours", label: "Staff-hours", unit: "hrs/yr" },
  { id: "vehicleDays", label: "Vehicle-days", unit: "veh-days/yr" },
  { id: "fieldDays", label: "Field-days", unit: "field-days/yr" },
] as const;

export type Objective = (typeof OBJECTIVES)[number]["id"];

/**
 * The value a given objective minimizes. These are the program's own figures,
 * matching what the ceilings constrain — optimizing a total while capping a
 * program figure would recommend arrangements the constraints then reject.
 */
export function objectiveValue(result: EngineResult, objective: Objective): number {
  return objective === "cost"
    ? result.programAnnualizedCost
    : result.programResourceUsage[objective];
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
  /** The arrangement implied by the user's `plannedIntegration` flags. */
  userPlan: Bundle;
  /**
   * The lowest each figure reaches across every arrangement, feasible or not.
   * Someone setting a ceiling needs to know what is physically reachable, so this
   * deliberately ignores the other ceilings — otherwise a tight ceiling would hide
   * the very arrangements that justify relaxing it.
   */
  leanest: { programAnnualizedCost: number; programResourceUsage: ResourceDraw };
  /** The objective `finalists` were ranked on, so consumers cannot pair this output with a different one. */
  objective: Objective;
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
 * Enumerate every merge selection over the integrable categories, keep the
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
  const candidateIds = scenario.categories
    .filter((category) => category.canIntegrate)
    .map((category) => category.id);

  const allBundles = subsets(candidateIds).map((mergedIds) =>
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

  // Reduced over every arrangement rather than assuming all-merged is leanest:
  // merges now trade resources against each other, so the minimum on one figure
  // can sit in a different bundle from the minimum on another.
  const leanestUsage = emptyDraw();
  let leanestCost = Number.POSITIVE_INFINITY;
  for (const resource of RESOURCE_TYPES) {
    leanestUsage[resource.id] = Number.POSITIVE_INFINITY;
  }
  for (const bundle of allBundles) {
    leanestCost = Math.min(leanestCost, bundle.result.programAnnualizedCost);
    for (const resource of RESOURCE_TYPES) {
      leanestUsage[resource.id] = Math.min(
        leanestUsage[resource.id],
        bundle.result.programResourceUsage[resource.id],
      );
    }
  }
  const leanest = {
    programAnnualizedCost: leanestCost,
    programResourceUsage: leanestUsage,
  };

  const plannedIds = scenario.categories
    .filter((category) => category.canIntegrate && category.plannedIntegration)
    .map((category) => category.id);
  const userPlan =
    allBundles.find((bundle) => bundle.id === bundleId(plannedIds)) ??
    toBundle(scenario, plannedIds, baselineAnnual);

  return {
    baseline,
    finalists,
    feasibleCount: feasible.length,
    infeasibleCount,
    ranked,
    userPlan,
    leanest,
    objective,
  };
}

export type PlanChange = {
  id: string;
  name: string;
  /**
   * Marginal effect on the active objective of applying this single change to
   * the user's plan — negative is an improvement. Measured one change at a time
   * because that is the question a reader actually asks of each row.
   */
  objectiveDelta: number;
};

export type PlanComparison = {
  userPlan: Bundle;
  /** Top finalist on the active objective; null when nothing feasible merges. */
  best: Bundle | null;
  add: PlanChange[];
  drop: PlanChange[];
  /** best − userPlan on the active objective. Negative ⇒ the optimum is better. */
  objectiveDelta: number;
};

/**
 * Contrast the user's proposal with the best feasible arrangement, itemizing the
 * categories the optimizer would add or drop. This is the payoff of separating
 * policy from plan: without it the tool can only score what the user already
 * thought of.
 */
export function comparePlanToBest(
  scenario: Scenario,
  stage1: Stage1Output,
): PlanComparison {
  const objective = stage1.objective;
  const { userPlan } = stage1;
  const best = stage1.finalists[0] ?? null;
  const nameOf = (id: string) =>
    scenario.categories.find((category) => category.id === id)?.name ?? id;

  if (!best) {
    return { userPlan, best: null, add: [], drop: [], objectiveDelta: 0 };
  }

  const baselineAnnual = baselineAnnualCost(scenario);
  const planned = new Set(userPlan.mergedCategoryIds);
  const chosen = new Set(best.mergedCategoryIds);
  const planValue = objectiveValue(userPlan.result, objective);

  const marginal = (id: string, next: Set<string>): PlanChange => ({
    id,
    name: nameOf(id),
    objectiveDelta:
      objectiveValue(
        toBundle(scenario, [...next], baselineAnnual).result,
        objective,
      ) - planValue,
  });

  const add = best.mergedCategoryIds
    .filter((id) => !planned.has(id))
    .map((id) => marginal(id, new Set([...planned, id])));

  const drop = userPlan.mergedCategoryIds
    .filter((id) => !chosen.has(id))
    .map((id) => {
      const next = new Set(planned);
      next.delete(id);
      return marginal(id, next);
    });

  return {
    userPlan,
    best,
    add,
    drop,
    objectiveDelta: objectiveValue(best.result, objective) - planValue,
  };
}
