// Cost engine: score a single merge selection against a scenario.
//
// This is the shared evaluator both stages call. Stage 1 (optimizer) calls it
// with the point-estimate resolver over every candidate selection; Stage 2
// (robustness) calls it with a scaled resolver per grid cell. Keeping a single
// evaluator means the two stages can never disagree about what a bundle costs.

import {
  RESOURCE_TYPES,
  addDraw,
  emptyDraw,
  type Category,
  type MergeSelection,
  type ResourceDraw,
  type ResourceTypeId,
  type Scenario,
} from "./model.ts";

/**
 * Resolves the (possibly uncertainty-scaled) annual integrated cost and one-time
 * transition cost for a category. The default uses point estimates; Stage 2
 * swaps in a resolver that interpolates along the entered ranges.
 */
export type CostResolver = {
  integrated: (category: Category) => number;
  transition: (category: Category) => number;
};

export const pointResolver: CostResolver = {
  integrated: (category) => category.integratedCost.point,
  transition: (category) => category.transitionCost.point,
};

export type EngineResult = {
  /** Ongoing annual cost of this arrangement (program + country). */
  annualCost: number;
  /** Portion of the annual cost borne by the programs / external funders. */
  programAnnualCost: number;
  /** Portion shifted onto the country / health system (government-funded merges). */
  countryAnnualCost: number;
  /** One-time cost to reach this arrangement from all-standalone. */
  transitionCost: number;
  /** Objective (spec §4): annual cost + amortized transition cost. */
  annualizedCost: number;
  /** Total resource usage across all active instances. */
  resourceUsage: ResourceDraw;
  /** True iff no resource ceiling is breached. */
  feasible: boolean;
  /** Human-readable reasons the selection is infeasible (empty when feasible). */
  violations: string[];
};

/** A category counts as merged only if it is both selected and shareable. */
export function isMerged(category: Category, selection: MergeSelection): boolean {
  return category.shareable && selection.has(category.id);
}

function standaloneAnnualCost(category: Category): number {
  return Object.values(category.perProgram).reduce(
    (sum, entry) => sum + entry.standaloneCost,
    0,
  );
}

function standaloneResourceDraw(category: Category): ResourceDraw {
  return Object.values(category.perProgram).reduce(
    (sum, entry) => addDraw(sum, entry.resourceDraw),
    emptyDraw(),
  );
}

/**
 * Evaluate one merge selection. Resource usage does not depend on the cost
 * resolver (it is a physical quantity), so the only thing the resolver changes
 * cell-to-cell in Stage 2 is the cost figures.
 */
export function evaluateSelection(
  scenario: Scenario,
  selection: MergeSelection,
  resolver: CostResolver = pointResolver,
): EngineResult {
  const { categories, constraints } = scenario;

  let programAnnualCost = 0;
  let countryAnnualCost = 0;
  let transitionCost = 0;
  let resourceUsage = emptyDraw();

  for (const category of categories) {
    if (isMerged(category, selection)) {
      const integrated = resolver.integrated(category);
      // Same total either way — government funding only changes who pays.
      if (category.governmentFunded) countryAnnualCost += integrated;
      else programAnnualCost += integrated;
      transitionCost += resolver.transition(category);
      resourceUsage = addDraw(resourceUsage, category.integratedResourceDraw);
    } else {
      programAnnualCost += standaloneAnnualCost(category);
      resourceUsage = addDraw(resourceUsage, standaloneResourceDraw(category));
    }
  }

  const annualCost = programAnnualCost + countryAnnualCost;
  const annualizedCost =
    annualCost +
    (constraints.amortizationYears > 0
      ? transitionCost / constraints.amortizationYears
      : transitionCost);

  const violations: string[] = [];

  for (const resource of RESOURCE_TYPES) {
    const id = resource.id as ResourceTypeId;
    const used = resourceUsage[id];
    const ceiling = constraints.resourceCeilings[id];
    if (used > ceiling) {
      violations.push(
        `${resource.label}: ${Math.round(used)} used exceeds ${Math.round(ceiling)} available`,
      );
    }
  }

  if (annualizedCost > constraints.fundingCeiling) {
    violations.push(
      `Total funding: $${Math.round(annualizedCost)}k needed exceeds $${Math.round(constraints.fundingCeiling)}k available`,
    );
  }

  return {
    annualCost,
    programAnnualCost,
    countryAnnualCost,
    transitionCost,
    annualizedCost,
    resourceUsage,
    feasible: violations.length === 0,
    violations,
  };
}

/** Annual cost of the all-standalone arrangement — the reference baseline. */
export function baselineAnnualCost(scenario: Scenario): number {
  return scenario.categories.reduce(
    (sum, category) => sum + standaloneAnnualCost(category),
    0,
  );
}
