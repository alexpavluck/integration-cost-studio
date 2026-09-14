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
import { money } from "./format.ts";

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
  /** Total annual cost + amortized transition — the real-efficiency figure. */
  annualizedCost: number;
  /**
   * The program's own annualized cost. Government-funded merges are off the
   * program's books, so this — not `annualizedCost` — is what the funding
   * ceiling can legitimately test.
   */
  programAnnualizedCost: number;
  /** Resource usage across all active instances (program + country). */
  resourceUsage: ResourceDraw;
  /**
   * Resource usage the program itself must staff and equip. A government-funded
   * shared instance draws the country's capacity, not the program's, so resource
   * ceilings test this.
   */
  programResourceUsage: ResourceDraw;
  /** True iff no ceiling the program is subject to is breached. */
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
  let programResourceUsage = emptyDraw();

  for (const category of categories) {
    if (isMerged(category, selection)) {
      const integrated = resolver.integrated(category);
      resourceUsage = addDraw(resourceUsage, category.integratedResourceDraw);
      if (category.governmentFunded) {
        // Absorbed by the country: off the program's books and off its capacity.
        countryAnnualCost += integrated;
      } else {
        programAnnualCost += integrated;
        programResourceUsage = addDraw(
          programResourceUsage,
          category.integratedResourceDraw,
        );
      }
      // Standing up the merge is work the program does before handing it over,
      // so transition stays program-borne either way.
      transitionCost += resolver.transition(category);
    } else {
      const draw = standaloneResourceDraw(category);
      programAnnualCost += standaloneAnnualCost(category);
      resourceUsage = addDraw(resourceUsage, draw);
      programResourceUsage = addDraw(programResourceUsage, draw);
    }
  }

  const annualCost = programAnnualCost + countryAnnualCost;
  const amortize = (annual: number) =>
    annual +
    (constraints.amortizationYears > 0
      ? transitionCost / constraints.amortizationYears
      : transitionCost);
  const annualizedCost = amortize(annualCost);
  const programAnnualizedCost = amortize(programAnnualCost);

  const violations: string[] = [];

  for (const resource of RESOURCE_TYPES) {
    const id = resource.id as ResourceTypeId;
    const used = programResourceUsage[id];
    const ceiling = constraints.resourceCeilings[id];
    if (used > ceiling) {
      violations.push(
        `${resource.label}: ${Math.round(used)} used exceeds ${Math.round(ceiling)} available`,
      );
    }
  }

  if (programAnnualizedCost > constraints.fundingCeiling) {
    violations.push(
      `Total funding: ${money(programAnnualizedCost)} needed exceeds ${money(constraints.fundingCeiling)} available`,
    );
  }

  return {
    annualCost,
    programAnnualCost,
    countryAnnualCost,
    transitionCost,
    annualizedCost,
    programAnnualizedCost,
    resourceUsage,
    programResourceUsage,
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
