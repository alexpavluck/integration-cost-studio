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
  /** Annual cost of this program running the category on its own. */
  standaloneCost: number;
  /** Resources this standalone instance consumes per year. */
  resourceDraw: ResourceDraw;
};

export type Category = {
  id: string;
  name: string;
  /**
   * Policy, not preference. `false` ⇒ the category can never merge regardless of
   * what the numbers say (e.g. drug-specific safety monitoring), so it is excluded
   * from the optimizer's decision variables entirely.
   */
  canIntegrate: boolean;
  /**
   * The user's current proposal. This does NOT constrain the optimizer — it is the
   * plan the optimizer's recommendation is compared against, so the tool can say
   * "you didn't mark this, but it's the best move for what you're optimizing."
   */
  plannedIntegration: boolean;
  /**
   * When this category is merged, is the shared instance funded by the country /
   * health system rather than the program? If so, its integrated cost moves off
   * the program's books (a program "saving") and onto a country liability — the
   * total cost is unchanged, it is simply shifted. Only meaningful when merged.
   */
  governmentFunded: boolean;
  /** Per-program standalone entries, keyed by program id. */
  perProgram: Record<ProgramId, ProgramEntry>;
  /** Annual cost of a single shared instance once merged. */
  integratedCost: CostRange;
  /** One-time cost to stand up the merge. */
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
   * Maximum total annualized cost the budget can fund. A hard ceiling like
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
 * illustrative dollar figures chosen so the merges trade against one another:
 * central training buys staff-hours with travel, a shared fleet buys
 * vehicle-days with coordination and longer deployments, joint supervision buys
 * field-days with staff-hours and trips. That is what makes the four objectives
 * land on four different bundles instead of agreeing. Distribution keeps a
 * deliberately wide cost range — attractive on every objective, fragile under
 * the downside — so Stage 2 still has a favourite worth warning about.
 */
export function createExampleScenario(): Scenario {
  const programs: Program[] = [
    { id: "mda", name: "Program 1" },
    { id: "eye", name: "Program 2" },
  ];

  const category = (
    id: string,
    name: string,
    canIntegrate: boolean,
    plannedIntegration: boolean,
    perProgram: Record<ProgramId, ProgramEntry>,
    integratedCost: CostRange,
    transitionCost: CostRange,
    integratedResourceDraw: ResourceDraw,
    governmentFunded = false,
  ): Category => ({
    id,
    name,
    canIntegrate,
    plannedIntegration,
    perProgram,
    integratedCost,
    transitionCost,
    integratedResourceDraw,
    governmentFunded,
  });

  const entry = (
    standaloneCost: number,
    resourceDraw: ResourceDraw,
  ): ProgramEntry => ({ standaloneCost, resourceDraw });

  const categories: Category[] = [
    // Central training: far fewer staff-hours, but people travel to it.
    category(
      "training", "Training", true, true,
      {
        mda: entry(150000, { staffHours: 400, vehicleDays: 20, fieldDays: 30 }),
        eye: entry(120000, { staffHours: 360, vehicleDays: 18, fieldDays: 26 }),
      },
      { low: 200000, point: 210000, high: 225000 },
      { low: 110000, point: 120000, high: 135000 },
      { staffHours: 520, vehicleDays: 40, fieldDays: 60 },
    ),
    // Shared fleet: many fewer vehicle-days, but more coordination and longer
    // deployments once routes are consolidated.
    category(
      "transport", "Transportation", true, false,
      {
        mda: entry(210000, { staffHours: 200, vehicleDays: 120, fieldDays: 60 }),
        eye: entry(180000, { staffHours: 180, vehicleDays: 100, fieldDays: 50 }),
      },
      { low: 310000, point: 330000, high: 360000 },
      { low: 80000, point: 90000, high: 105000 },
      { staffHours: 470, vehicleDays: 140, fieldDays: 125 },
    ),
    // Deliberately fragile: barely beats standalone at the point estimate and
    // costs far more at the high end, yet looks good on every objective. This is
    // the trap Stage 2 exists to spring.
    category(
      "distribution", "Distribution", true, false,
      {
        mda: entry(240000, { staffHours: 500, vehicleDays: 80, fieldDays: 90 }),
        eye: entry(200000, { staffHours: 440, vehicleDays: 70, fieldDays: 80 }),
      },
      { low: 370000, point: 420000, high: 560000 },
      { low: 150000, point: 190000, high: 260000 },
      { staffHours: 900, vehicleDays: 140, fieldDays: 120 },
    ),
    // Joint supervision visits: many fewer field-days, more staff-hours and trips.
    category(
      "supervision", "Supervision", true, true,
      {
        mda: entry(160000, { staffHours: 300, vehicleDays: 60, fieldDays: 70 }),
        eye: entry(140000, { staffHours: 270, vehicleDays: 54, fieldDays: 62 }),
      },
      { low: 270000, point: 290000, high: 320000 },
      { low: 90000, point: 100000, high: 115000 },
      { staffHours: 700, vehicleDays: 122, fieldDays: 80 },
    ),
    // Government funded when merged: leaves the program's books and capacity.
    category(
      "data", "Data & M&E", true, false,
      {
        mda: entry(110000, { staffHours: 250, vehicleDays: 10, fieldDays: 20 }),
        eye: entry(95000, { staffHours: 225, vehicleDays: 9, fieldDays: 18 }),
      },
      { low: 140000, point: 150000, high: 170000 },
      { low: 70000, point: 80000, high: 95000 },
      { staffHours: 300, vehicleDays: 12, fieldDays: 25 },
      true,
    ),
    // Drug-specific: policy forbids merging, whatever the numbers say.
    category(
      "safety", "Drug safety monitoring", false, false,
      {
        mda: entry(90000, { staffHours: 150, vehicleDays: 15, fieldDays: 25 }),
        eye: entry(70000, { staffHours: 120, vehicleDays: 12, fieldDays: 20 }),
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
    // Field-days bites: the status quo draws 551 against a ceiling of 540, so
    // doing nothing is not an option and some arrangements are ruled out.
    resourceCeilings: { staffHours: 3500, vehicleDays: 600, fieldDays: 540 },
    fundingCeiling: statusQuoCost,
    amortizationYears: 5,
    horizonYears: 5,
  };

  return { programs, categories, constraints };
}
