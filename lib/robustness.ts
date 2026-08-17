// Stage 2 — robustness / regret analysis over the shortlist.
//
// For each finalist we sweep a 2D grid: one axis moves every merged category's
// integrated cost along its entered range (low → point → high), the other moves
// transition cost the same way. Each cell recomputes net savings and payback, so
// the trade-off is inspectable instead of hidden in a single point estimate
// (spec §5). The recommended bundle minimizes regret — it stays good across the
// whole range rather than being optimal only at the centre.

import { calculatePaybackYears } from "./cost-model.ts";
import { baselineAnnualCost, evaluateSelection } from "./cost-engine.ts";
import { interpRange, type Category, type Scenario } from "./model.ts";
import type { Bundle } from "./optimizer.ts";

/** Fractions in [-1, 1]: -1 = every range at its low, +1 = at its high. */
export type GridConfig = {
  integratedFractions: number[];
  transitionFractions: number[];
};

export const DEFAULT_GRID: GridConfig = {
  integratedFractions: [-1, -0.5, 0, 0.5, 1],
  transitionFractions: [-1, -0.5, 0, 0.5, 1],
};

export type GridCell = {
  integratedFraction: number;
  transitionFraction: number;
  annualCost: number;
  transitionCost: number;
  netSavings: number;
  paybackYears: number | null;
};

export type RobustnessSummary = {
  /** Fraction of grid cells with positive net savings over the horizon. */
  sharePositive: number;
  /** Worst (minimum) net savings across the grid — the downside case. */
  worstNetSavings: number;
  /** Best (maximum) net savings across the grid. */
  bestNetSavings: number;
  /** Net savings at the central (point-estimate) cell. */
  centerNetSavings: number;
  /** Longest payback across the grid (null if some cell never pays back). */
  worstPaybackYears: number | null;
};

export type BundleRobustness = {
  bundle: Bundle;
  cells: GridCell[];
  summary: RobustnessSummary;
  /** Max regret vs the best finalist at each cell (lower is more robust). */
  maxRegret: number;
};

export type Stage2Output = {
  grid: GridConfig;
  horizonYears: number;
  perBundle: BundleRobustness[];
  /** Finalist id with the lowest max regret — the robust pick (spec §5 rule). */
  recommendedBundleId: string | null;
  /** Finalist id with the best worst-case net savings (maximin / loss-averse pick). */
  maximinBundleId: string | null;
  /** Finalist id with the best point estimate, for contrast with the robust picks. */
  pointEstimateBundleId: string | null;
};

/** Build a cost resolver that scales each merged category along its own range. */
function scaledResolver(integratedFraction: number, transitionFraction: number) {
  return {
    integrated: (category: Category) =>
      interpRange(category.integratedCost, integratedFraction),
    transition: (category: Category) =>
      interpRange(category.transitionCost, transitionFraction),
  };
}

function computeCells(
  scenario: Scenario,
  bundle: Bundle,
  baselineAnnual: number,
  grid: GridConfig,
): GridCell[] {
  const horizon = scenario.constraints.horizonYears;
  const selection = new Set(bundle.mergedCategoryIds);
  const cells: GridCell[] = [];

  for (const integratedFraction of grid.integratedFractions) {
    for (const transitionFraction of grid.transitionFractions) {
      const result = evaluateSelection(
        scenario,
        selection,
        scaledResolver(integratedFraction, transitionFraction),
      );
      const annualSavings = baselineAnnual - result.annualCost;
      const netSavings = annualSavings * horizon - result.transitionCost;
      cells.push({
        integratedFraction,
        transitionFraction,
        annualCost: result.annualCost,
        transitionCost: result.transitionCost,
        netSavings,
        paybackYears: calculatePaybackYears(result.transitionCost, annualSavings),
      });
    }
  }

  return cells;
}

function summarize(cells: GridCell[]): RobustnessSummary {
  const nets = cells.map((cell) => cell.netSavings);
  const positive = nets.filter((value) => value > 0).length;
  const center = cells.find(
    (cell) => cell.integratedFraction === 0 && cell.transitionFraction === 0,
  );
  // Worst payback: null propagates (a cell that never pays back is the worst case).
  const worstPaybackYears = cells.some((cell) => cell.paybackYears === null)
    ? null
    : Math.max(...cells.map((cell) => cell.paybackYears as number));

  return {
    sharePositive: cells.length ? positive / cells.length : 0,
    worstNetSavings: Math.min(...nets),
    bestNetSavings: Math.max(...nets),
    centerNetSavings: center ? center.netSavings : nets[Math.floor(nets.length / 2)],
    worstPaybackYears,
  };
}

/** Stable key for a grid coordinate so cells line up across finalists. */
function cellKey(cell: GridCell): string {
  return `${cell.integratedFraction},${cell.transitionFraction}`;
}

/**
 * Run Stage 2 over the Stage 1 finalists. All finalists share one grid, so their
 * cells align coordinate-for-coordinate and regret is well defined: at each cell,
 * regret is how far a bundle's net savings falls short of the best finalist there.
 */
export function runStage2(
  scenario: Scenario,
  finalists: Bundle[],
  grid: GridConfig = DEFAULT_GRID,
): Stage2Output {
  const baselineAnnual = baselineAnnualCost(scenario);
  const horizonYears = scenario.constraints.horizonYears;

  const withCells = finalists.map((bundle) => ({
    bundle,
    cells: computeCells(scenario, bundle, baselineAnnual, grid),
  }));

  // Best net savings achieved by any finalist at each cell coordinate.
  const bestByCell = new Map<string, number>();
  for (const { cells } of withCells) {
    for (const cell of cells) {
      const key = cellKey(cell);
      const current = bestByCell.get(key);
      if (current === undefined || cell.netSavings > current) {
        bestByCell.set(key, cell.netSavings);
      }
    }
  }

  const perBundle: BundleRobustness[] = withCells.map(({ bundle, cells }) => {
    const maxRegret = cells.reduce((worst, cell) => {
      const best = bestByCell.get(cellKey(cell)) ?? cell.netSavings;
      return Math.max(worst, best - cell.netSavings);
    }, 0);
    return { bundle, cells, summary: summarize(cells), maxRegret };
  });

  const recommendedBundleId =
    perBundle.length === 0
      ? null
      : perBundle.reduce((best, current) =>
          current.maxRegret < best.maxRegret ? current : best,
        ).bundle.id;

  // Maximin: the bundle whose worst-case cell is least bad. This can differ from
  // the min-regret pick — a genuine tension the decision view surfaces rather
  // than hides.
  const maximinBundleId =
    perBundle.length === 0
      ? null
      : perBundle.reduce((best, current) =>
          current.summary.worstNetSavings > best.summary.worstNetSavings
            ? current
            : best,
        ).bundle.id;

  // Point-estimate winner = lowest annualized cost among finalists (already the
  // Stage 1 order, but derived here so the two can be compared side by side).
  const pointEstimateBundleId =
    finalists.length === 0
      ? null
      : finalists.reduce((best, current) =>
          current.result.annualizedCost < best.result.annualizedCost
            ? current
            : best,
        ).id;

  return {
    grid,
    horizonYears,
    perBundle,
    recommendedBundleId,
    maximinBundleId,
    pointEstimateBundleId,
  };
}
