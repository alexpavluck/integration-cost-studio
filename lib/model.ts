// Core data model for the vertical-program integration evaluator (v2).
//
// The unit of comparison is a **category** (Training, Transportation, …) that
// every program runs. One category = one binary merge decision, so the
// optimizer's decision variables map 1:1 onto categories (see lib/optimizer.ts).
// A category can either stay standalone (each program keeps its own instance) or
// merge into a single shared instance across all programs.

/**
 * Resource types are a fixed, known set so the data-entry UI can show one column
 * per type. "Multiple resource types, not just one number" (spec §1) without
 * making every draw an open-ended map the UI can't lay out.
 */
export const RESOURCE_TYPES = [
  { id: "staffHours", label: "Staff-hours", unit: "hrs/yr" },
  { id: "vehicleDays", label: "Vehicle-days", unit: "veh-days/yr" },
  { id: "fieldDays", label: "Field-days", unit: "field-days/yr" },
] as const;

export type ResourceTypeId = (typeof RESOURCE_TYPES)[number]["id"];
export type ResourceDraw = Record<ResourceTypeId, number>;

/**
 * Uncertain cost stored as a range around a central estimate (spec §1). `point`
 * drives the Stage 1 optimizer; `low`/`high` bound the Stage 2 robustness sweep.
 * Invariant expected (not enforced): low ≤ point ≤ high.
 */
export type CostRange = { low: number; point: number; high: number };

export type ProgramId = string;

/** One program's own (standalone) instance of a category. */
export type ProgramEntry = {
  /** Annual cost ($k) of this program running the category on its own. */
  standaloneCost: number;
  /** Resources this standalone instance consumes per year. */
  resourceDraw: ResourceDraw;
};

export type Category = {
  id: string;
  name: string;
  /**
   * Hard flag (spec §3). `false` ⇒ the category can never merge regardless of
   * cost logic (e.g. drug-specific safety monitoring) and is excluded from the
   * optimizer's decision variables entirely.
   */
  shareable: boolean;
  /**
   * When this category is merged, is the shared instance funded by the country /
   * health system rather than the program? If so, its integrated cost moves off
   * the program's books (a program "saving") and onto a country liability — the
   * total cost is unchanged, it is simply shifted. Only meaningful when merged.
   */
  governmentFunded: boolean;
  /** Per-program standalone entries, keyed by program id. */
  perProgram: Record<ProgramId, ProgramEntry>;
  /** Annual cost ($k) of a single shared instance once merged. */
  integratedCost: CostRange;
  /** One-time cost ($k) to stand up the merge. */
  transitionCost: CostRange;
  /** Resources the single shared instance consumes per year. */
  integratedResourceDraw: ResourceDraw;
};

export type Program = {
  id: ProgramId;
  name: string;
};

export type Constraints = {
  /** Maximum available per resource type per year (hard ceiling, spec §3). */
  resourceCeilings: ResourceDraw;
  /**
   * Maximum total annualized cost the budget can fund ($k). A hard ceiling like
   * the resource ceilings — an arrangement whose annualized cost exceeds it is
   * infeasible. Defaults to the status-quo cost (so the current programs exactly
   * fit today's budget); lower it to model funding going down, which can force
   * integration to fit within the reduced envelope.
   */
  fundingCeiling: number;
  /** One-time transition cost is spread over these years in the annualized objective (spec §4). */
  amortizationYears: number;
  /** Planning horizon for net-savings and payback figures. */
  horizonYears: number;
};

export type Scenario = {
  programs: Program[];
  categories: Category[];
  constraints: Constraints;
};

/** A merge selection is the set of category ids chosen to merge. */
export type MergeSelection = ReadonlySet<string>;

// --- helpers ---------------------------------------------------------------

const zeroDraw = (): ResourceDraw => ({
  staffHours: 0,
  vehicleDays: 0,
  fieldDays: 0,
});

export function addDraw(a: ResourceDraw, b: ResourceDraw): ResourceDraw {
  return {
    staffHours: a.staffHours + b.staffHours,
    vehicleDays: a.vehicleDays + b.vehicleDays,
    fieldDays: a.fieldDays + b.fieldDays,
  };
}

export function emptyDraw(): ResourceDraw {
  return zeroDraw();
}

/**
 * Interpolate a cost range at a fraction in [-1, 1]: 0 → point, +1 → high,
 * −1 → low, with linear interpolation in between. This is how the Stage 2 grid
 * turns a robustness axis into an actual cost, so a wider entered range moves
 * more per grid step than a narrow one.
 */
export function interpRange(range: CostRange, fraction: number): number {
  const clamped = Math.max(-1, Math.min(1, fraction));
  return clamped >= 0
    ? range.point + clamped * (range.high - range.point)
    : range.point + clamped * (range.point - range.low);
}

// --- seeded example --------------------------------------------------------

/**
 * Two generically-named vertical programs that share field infrastructure
 * (modeled on an NTD mass-drug-administration + eye-health pairing). Numbers are
 * illustrative $k and chosen so the point estimate favours merging almost
 * everything, while Distribution's wide cost range makes an all-merge bundle
 * fragile — exactly the tension Stage 2 exists to expose.
 */
export function createExampleScenario(): Scenario {
  const programs: Program[] = [
    { id: "mda", name: "Program 1" },
    { id: "eye", name: "Program 2" },
  ];

  const category = (
    id: string,
    name: string,
    shareable: boolean,
    perProgram: Record<ProgramId, ProgramEntry>,
    integratedCost: CostRange,
    transitionCost: CostRange,
    integratedResourceDraw: ResourceDraw,
    governmentFunded = false,
  ): Category => ({
    id,
    name,
    shareable,
    governmentFunded,
    perProgram,
    integratedCost,
    transitionCost,
    integratedResourceDraw,
  });

  const entry = (
    standaloneCost: number,
    resourceDraw: ResourceDraw,
  ): ProgramEntry => ({ standaloneCost, resourceDraw });

  const categories: Category[] = [
    category(
      "training",
      "Training",
      true,
      {
        mda: entry(150, { staffHours: 400, vehicleDays: 20, fieldDays: 30 }),
        eye: entry(120, { staffHours: 360, vehicleDays: 18, fieldDays: 26 }),
      },
      { low: 200, point: 210, high: 225 },
      { low: 110, point: 120, high: 135 },
      { staffHours: 520, vehicleDays: 26, fieldDays: 40 },
    ),
    category(
      "transport",
      "Transportation",
      true,
      {
        mda: entry(210, { staffHours: 200, vehicleDays: 120, fieldDays: 60 }),
        eye: entry(180, { staffHours: 180, vehicleDays: 100, fieldDays: 50 }),
      },
      { low: 280, point: 300, high: 330 },
      { low: 80, point: 90, high: 105 },
      { staffHours: 260, vehicleDays: 150, fieldDays: 80 },
    ),
    category(
      "distribution",
      "Distribution",
      true,
      {
        mda: entry(240, { staffHours: 500, vehicleDays: 80, fieldDays: 90 }),
        eye: entry(200, { staffHours: 440, vehicleDays: 70, fieldDays: 80 }),
      },
      // Deliberately risky: merging only barely beats the two standalone
      // instances (440) at the point estimate, and at the high end costs well
      // more than them — so merging Distribution is a marginal, fragile bet.
      { low: 330, point: 375, high: 520 },
      { low: 150, point: 190, high: 260 },
      { staffHours: 650, vehicleDays: 100, fieldDays: 120 },
    ),
    category(
      "supervision",
      "Supervision",
      true,
      {
        mda: entry(160, { staffHours: 300, vehicleDays: 60, fieldDays: 70 }),
        eye: entry(140, { staffHours: 270, vehicleDays: 54, fieldDays: 62 }),
      },
      { low: 195, point: 210, high: 235 },
      { low: 90, point: 100, high: 115 },
      { staffHours: 380, vehicleDays: 75, fieldDays: 90 },
    ),
    category(
      "data",
      "Data & M&E",
      true,
      {
        mda: entry(110, { staffHours: 250, vehicleDays: 10, fieldDays: 20 }),
        eye: entry(95, { staffHours: 225, vehicleDays: 9, fieldDays: 18 }),
      },
      { low: 140, point: 150, high: 170 },
      { low: 70, point: 80, high: 95 },
      { staffHours: 320, vehicleDays: 12, fieldDays: 25 },
      true, // when merged, the health system funds Data & M&E (country liability)
    ),
    category(
      "safety",
      "Drug safety monitoring",
      false, // non-negotiable: drug-specific, can never merge (spec §1, §3)
      {
        mda: entry(90, { staffHours: 150, vehicleDays: 15, fieldDays: 25 }),
        eye: entry(70, { staffHours: 120, vehicleDays: 12, fieldDays: 20 }),
      },
      { low: 0, point: 0, high: 0 },
      { low: 0, point: 0, high: 0 },
      { staffHours: 0, vehicleDays: 0, fieldDays: 0 },
    ),
  ];

  // Total cost of the vertical programs today = the default funding envelope.
  const statusQuoCost = categories.reduce(
    (sum, category) =>
      sum +
      Object.values(category.perProgram).reduce(
        (s, entry) => s + entry.standaloneCost,
        0,
      ),
    0,
  );

  const constraints: Constraints = {
    // Comfortably above the all-standalone draw so the status quo is feasible;
    // merging only ever reduces usage. Tight ceilings are exercised in tests.
    resourceCeilings: { staffHours: 3800, vehicleDays: 680, fieldDays: 640 },
    fundingCeiling: statusQuoCost,
    amortizationYears: 5,
    horizonYears: 5,
  };

  return { programs, categories, constraints };
}
