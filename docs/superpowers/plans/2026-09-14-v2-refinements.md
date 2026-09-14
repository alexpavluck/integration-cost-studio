# Integration Cost Studio v2 Refinements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `$k` scaling, let the optimizer recommend categories the user did not mark, stop government-funded work consuming the program's budget, rebuild the demo so the four objectives diverge, and make Stage 2 explain itself in plain language.

**Architecture:** No structural change. `cost-engine.ts` remains the single evaluator both stages call; `optimizer.ts` keeps its exhaustive `2^k` enumeration; ceilings stay hard constraints outside the objective function. The one modelling change is splitting `Category.shareable` into a policy flag (`canIntegrate`) and a proposal flag (`plannedIntegration`), which is what unblocks recommending unmarked categories.

**Tech Stack:** Next.js 15 (App Router, client components), TypeScript, React 19, `node --test` with native TypeScript stripping, deployed on Vercel.

**Spec:** `docs/superpowers/specs/2026-09-14-integration-calc-design.md`

## Global Constraints

- Baseline is commit `39992ab` with **40 passing tests**. `npm test` must be green at the end of every task.
- Run the full suite with `npm test`. Run one file with `node --test tests/<name>.test.ts`.
- Costs are **actual dollars** everywhere after Task 1. Never reintroduce a `k` suffix or a `/1000` scale.
- Resource draws (staff-hours, vehicle-days, field-days) are counts and are **never** scaled by 1,000.
- All currency rendering goes through `format.ts::money` / `signedMoney`. No component and no engine file formats currency inline.
- `RESOURCE_TYPES` ids are exactly `staffHours`, `vehicleDays`, `fieldDays`.
- Comments explain **why**, not what. Match the existing house style — the codebase's comments cite spec sections and explain trade-offs; keep that.
- Commit after every task with the message given in its final step.

---

### Task 1: Remove `$k` — actual values everywhere

**Files:**
- Modify: `lib/format.ts:4-16`
- Modify: `lib/cost-engine.ts:120-124` (funding violation message)
- Modify: `lib/model.ts` — `createExampleScenario` seeded values, and the `($k)` doc comments at lines 36, 55, 60
- Modify: `app/components/ConstraintSetup.tsx:43`
- Modify: `app/components/DataEntry.tsx:127,193,201`
- Test: `tests/format.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `money(value: number, compact?: boolean): string` returning e.g. `"$180,000"`; `signedMoney(value: number, compact?: boolean): string` returning e.g. `"+$180,000"` / `"−$40,000"` (U+2212 minus). Every later task formats currency through these.

- [ ] **Step 1: Write the failing tests**

Append to `tests/format.test.ts`:

```ts
test("money renders actual values with no k suffix", () => {
  assert.equal(money(180000), "$180,000");
  assert.equal(money(0), "$0");
  assert.equal(money(999999), "$999,999");
});

test("compact collapses to $m only at a million", () => {
  assert.equal(money(999999, true), "$999,999");
  assert.equal(money(1000000, true), "$1m");
  assert.equal(money(2500000, true), "$2.5m");
});

test("signedMoney keeps a true minus sign", () => {
  assert.equal(signedMoney(180000), "+$180,000");
  assert.equal(signedMoney(-40000), "−$40,000");
});
```

Make sure the import at the top of the file includes both helpers:

```ts
import { money, signedMoney } from "../lib/format.ts";
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/format.test.ts`
Expected: FAIL — `money(180000)` currently returns `"$180,000k"`.

- [ ] **Step 3: Rewrite the formatter**

Replace the header comment and `money` in `lib/format.ts`:

```ts
// Presentation helpers shared across the screens. Costs are entered, stored and
// displayed as actual values; very large figures collapse to $m for readability.

export function money(value: number, compact = false): string {
  const rounded = Math.round(value);
  if (compact && Math.abs(rounded) >= 1_000_000) {
    return `$${(rounded / 1_000_000).toFixed(1).replace(".0", "")}m`;
  }
  return `$${rounded.toLocaleString()}`;
}
```

Leave `signedMoney`, `pct`, `paybackLabel`, `toNonNegativeNumber` and `toNumber` unchanged — `signedMoney` already delegates to `money`.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `node --test tests/format.test.ts`
Expected: PASS

- [ ] **Step 5: Route the engine's violation message through `money`**

In `lib/cost-engine.ts`, add to the imports:

```ts
import { money } from "./format.ts";
```

Replace the funding violation block. Task 2 renames this figure to
`programAnnualizedCost`; at this point it is still `annualizedCost`, so change only
the formatting:

```ts
  if (annualizedCost > constraints.fundingCeiling) {
    violations.push(
      `Total funding: ${money(annualizedCost)} needed exceeds ${money(constraints.fundingCeiling)} available`,
    );
  }
```

- [ ] **Step 6: Scale every seeded cost by 1,000**

In `lib/model.ts::createExampleScenario`, multiply by 1,000: every `entry(...)` first argument (`standaloneCost`), and every number inside every `integratedCost` and `transitionCost` range. **Do not touch any `staffHours`, `vehicleDays` or `fieldDays` value, and do not touch `resourceCeilings`.**

For example, Training becomes:

```ts
    category(
      "training",
      "Training",
      true,
      {
        mda: entry(150000, { staffHours: 400, vehicleDays: 20, fieldDays: 30 }),
        eye: entry(120000, { staffHours: 360, vehicleDays: 18, fieldDays: 26 }),
      },
      { low: 200000, point: 210000, high: 225000 },
      { low: 110000, point: 120000, high: 135000 },
      { staffHours: 520, vehicleDays: 26, fieldDays: 40 },
    ),
```

`fundingCeiling` needs no edit — it is derived from `statusQuoCost`, which scales automatically.

- [ ] **Step 7: Fix the now-wrong doc comments**

In `lib/model.ts`, change these three comments (they currently say `$k`):

- line ~36: `/** Annual cost of this program running the category on its own. */`
- line ~55: `/** Annual cost of a single shared instance once merged. */`
- line ~60: `/** One-time cost to stand up the merge. */`

- [ ] **Step 8: Update the UI labels**

- `app/components/ConstraintSetup.tsx:43` — `<span>$k/yr available</span>` becomes `<span>per year available</span>`
- `app/components/DataEntry.tsx:127` — `Standalone $k/yr` becomes `Standalone $/yr`
- `app/components/DataEntry.tsx:193` — `label="Integrated cost $k/yr"` becomes `label="Integrated cost $/yr"`
- `app/components/DataEntry.tsx:201` — `label="Transition cost $k (one-time)"` becomes `label="Transition cost (one-time)"`

Also raise the `NumberInput` step for standalone cost at `DataEntry.tsx:~146` from `step={10}` to `step={1000}`, so the spinner moves by a sensible amount now that values are 1,000× larger.

- [ ] **Step 9: Confirm no `$k` survives**

Run: `grep -rn '\$k\|)}k\|}k`\|k/yr' lib app --include=*.ts --include=*.tsx`
Expected: no matches.

- [ ] **Step 10: Run the full suite**

Run: `npm test`
Expected: 40 passing. No test asserts on `$k`, so none should break.

- [ ] **Step 11: Commit**

```bash
git add lib/format.ts lib/cost-engine.ts lib/model.ts app/components/ConstraintSetup.tsx app/components/DataEntry.tsx tests/format.test.ts
git commit -m "Enter and display actual costs instead of thousands"
```

---

### Task 2: Government-funded work leaves the program's budget and capacity

**Files:**
- Modify: `lib/cost-engine.ts` — `EngineResult`, `evaluateSelection`
- Test: `tests/cost-engine.test.ts`

**Interfaces:**
- Consumes: `money()` from Task 1.
- Produces: `EngineResult` gains two fields used by Tasks 3, 5 and 6:
  - `programAnnualizedCost: number` — program annual cost plus amortised transition. This is what the funding ceiling tests.
  - `programResourceUsage: ResourceDraw` — resource draw excluding government-funded merged categories. This is what resource ceilings test.
  - `annualCost`, `annualizedCost` and `resourceUsage` keep their current meaning (program **plus** country) so real efficiency stays measurable.

**Why both:** constraints must test what the program bears, or shifting work to the national program would not relieve anything. Totals must survive, or `annualSavingsVsBaseline` would count cost-shifting as efficiency — the exact trap `optimizer.ts` already warns about in its `programSavingsVsBaseline` doc comment.

- [ ] **Step 1: Write the failing tests**

Append to `tests/cost-engine.test.ts`. The existing fixture in that file builds categories with a local helper; add a government-funded category to the scenario used here by constructing it inline in the test so the shared fixture is untouched:

```ts
test("a government-funded merged category leaves the program's budget and capacity", () => {
  const scenario = createExampleScenario();
  const gov = scenario.categories.find((c) => c.governmentFunded)!;

  const merged = evaluateSelection(scenario, new Set([gov.id]));
  const standalone = evaluateSelection(scenario, new Set());

  // Its shared instance costs the program nothing and draws none of its resources.
  assert.equal(merged.countryAnnualCost, gov.integratedCost.point);
  assert.ok(merged.programAnnualCost < standalone.programAnnualCost);
  assert.ok(
    merged.programResourceUsage.staffHours < standalone.programResourceUsage.staffHours,
  );

  // The total still counts it — cost-shifting is not efficiency.
  assert.ok(merged.resourceUsage.staffHours > merged.programResourceUsage.staffHours);
  assert.equal(
    merged.annualCost,
    merged.programAnnualCost + merged.countryAnnualCost,
  );
});

test("the funding ceiling tests the program's annualized cost, not the total", () => {
  const scenario = createExampleScenario();
  const gov = scenario.categories.find((c) => c.governmentFunded)!;
  const merged = evaluateSelection(scenario, new Set([gov.id]));

  assert.ok(merged.programAnnualizedCost < merged.annualizedCost);
  assert.ok(
    !merged.violations.some((v) => v.startsWith("Total funding")) ||
      merged.programAnnualizedCost > scenario.constraints.fundingCeiling,
  );
});
```

Ensure the file imports `createExampleScenario`:

```ts
import { createExampleScenario } from "../lib/model.ts";
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/cost-engine.test.ts`
Expected: FAIL — `programResourceUsage` and `programAnnualizedCost` are undefined.

- [ ] **Step 3: Extend `EngineResult`**

In `lib/cost-engine.ts`, add two fields to the type:

```ts
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
```

- [ ] **Step 4: Track the program's share in `evaluateSelection`**

Replace the accumulation loop and everything after it, up to the `return`:

```ts
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
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `node --test tests/cost-engine.test.ts`
Expected: PASS

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: All pass. If a `robustness` or `optimizer` test fails on a changed number, the cause is the seeded Data & M&E category now leaving the program's books — update the expected value, and only the expected value.

- [ ] **Step 7: Commit**

```bash
git add lib/cost-engine.ts tests/cost-engine.test.ts
git commit -m "Exclude government-funded merges from the program's budget and capacity"
```

---

### Task 3: Split policy from plan in the model and optimizer

**Files:**
- Modify: `lib/model.ts` — `Category` type, `createExampleScenario` category helper
- Modify: `lib/cost-engine.ts:56-58` — `isMerged`
- Modify: `lib/optimizer.ts` — `runStage1`, `Stage1Output`, `objectiveValue`
- Modify: `lib/scenario-edits.ts:69-78` (`updateCategory` patch type), `:155-176` (`addCategory`)
- Test: `tests/optimizer.test.ts`, `tests/cost-engine.test.ts`

**Interfaces:**
- Consumes: `EngineResult.programAnnualizedCost` and `.programResourceUsage` from Task 2.
- Produces:
  - `Category.canIntegrate: boolean` and `Category.plannedIntegration: boolean` replace `Category.shareable`.
  - `Stage1Output.userPlan: Bundle` — the selection implied by `plannedIntegration`, evaluated like any other bundle.
  - `objectiveValue(result, objective)` now reads the **program-borne** figures.
  - `setPlannedIntegration(scenario, ids: string[]): Scenario` in `scenario-edits.ts`, used by Task 5.

**Why objectives use program figures:** the user caps and optimises the same quantity. Minimising a total while capping a program figure would let the optimiser recommend something the constraints then reject. `annualSavingsVsBaseline` stays on totals, and the existing `country-note` in `Stage1Results.tsx` keeps flagging when a "saving" is really a transfer.

- [ ] **Step 1: Write the failing tests**

Append to `tests/optimizer.test.ts`:

```ts
test("a category the user did not plan to integrate can still win", () => {
  const scenario = createExampleScenario();
  const unplanned = scenario.categories.find(
    (c) => c.canIntegrate && !c.plannedIntegration,
  );
  assert.ok(unplanned, "fixture must have a category that can integrate but is unplanned");

  const stage1 = runStage1(scenario, "cost");
  const consideredEverywhere = stage1.ranked.some((bundle) =>
    bundle.mergedCategoryIds.includes(unplanned!.id),
  );
  assert.ok(consideredEverywhere, "optimizer must consider unplanned categories");
});

test("a category that cannot integrate never appears in any bundle", () => {
  const scenario = createExampleScenario();
  const blocked = scenario.categories.find((c) => !c.canIntegrate)!;
  for (const bundle of runStage1(scenario, "cost").ranked) {
    assert.ok(!bundle.mergedCategoryIds.includes(blocked.id));
  }
});

test("userPlan reflects plannedIntegration and is evaluated like any bundle", () => {
  const scenario = createExampleScenario();
  const expected = scenario.categories
    .filter((c) => c.canIntegrate && c.plannedIntegration)
    .map((c) => c.id)
    .sort();

  const { userPlan } = runStage1(scenario, "cost");
  assert.deepEqual(userPlan.mergedCategoryIds, expected);
  assert.equal(typeof userPlan.result.feasible, "boolean");
  assert.equal(typeof userPlan.result.programAnnualizedCost, "number");
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/optimizer.test.ts`
Expected: FAIL — `canIntegrate`, `plannedIntegration` and `userPlan` do not exist.

- [ ] **Step 3: Replace `shareable` in the `Category` type**

In `lib/model.ts`, replace the `shareable` field and its comment:

```ts
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
```

- [ ] **Step 4: Update the seeded-scenario helper signature**

In `createExampleScenario`, change the local `category` helper so both flags are explicit:

```ts
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
```

Then add a `plannedIntegration` argument after the existing `shareable` argument at every call site. For now pass `true` wherever `shareable` was `true`, and `false` for Drug safety monitoring — Task 6 replaces this data wholesale, so exact values here only need to compile and keep tests green.

- [ ] **Step 5: Gate merging on `canIntegrate`**

In `lib/cost-engine.ts`:

```ts
/** A category counts as merged only if policy allows it and it is selected. */
export function isMerged(category: Category, selection: MergeSelection): boolean {
  return category.canIntegrate && selection.has(category.id);
}
```

- [ ] **Step 6: Point the optimizer at `canIntegrate` and add `userPlan`**

In `lib/optimizer.ts`, change `objectiveValue` to read program-borne figures:

```ts
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
```

Add to `Stage1Output`:

```ts
  /** The arrangement implied by the user's `plannedIntegration` flags. */
  userPlan: Bundle;
```

In `runStage1`, replace the `shareableIds` derivation and add the user plan before the `return`:

```ts
  const candidateIds = scenario.categories
    .filter((category) => category.canIntegrate)
    .map((category) => category.id);

  const allBundles = subsets(candidateIds).map((mergedIds) =>
    toBundle(scenario, mergedIds, baselineAnnual),
  );
```

```ts
  const plannedIds = scenario.categories
    .filter((category) => category.canIntegrate && category.plannedIntegration)
    .map((category) => category.id);
  const userPlan =
    allBundles.find((bundle) => bundle.id === bundleId(plannedIds)) ??
    toBundle(scenario, plannedIds, baselineAnnual);
```

Add `userPlan` to the returned object.

- [ ] **Step 7: Update the edit helpers**

In `lib/scenario-edits.ts`, widen the `updateCategory` patch type:

```ts
  patch: Partial<
    Pick<Category, "name" | "canIntegrate" | "plannedIntegration" | "governmentFunded">
  >,
```

In `addCategory`, replace `shareable: true,` with:

```ts
    canIntegrate: true,
    plannedIntegration: false,
```

Append a new helper at the end of the file:

```ts
/**
 * Overwrite every category's plan flag from a selection — how "adopt the
 * optimizer's answer" is applied. Categories outside the selection are planned
 * out, so adopting is a replacement rather than a merge of two plans.
 */
export function setPlannedIntegration(
  scenario: Scenario,
  mergedCategoryIds: string[],
): Scenario {
  const selected = new Set(mergedCategoryIds);
  return {
    ...scenario,
    categories: scenario.categories.map((category) => ({
      ...category,
      plannedIntegration: category.canIntegrate && selected.has(category.id),
    })),
  };
}
```

- [ ] **Step 8: Update existing test fixtures**

In `tests/cost-engine.test.ts`, replace `shareable: true` with `canIntegrate: true, plannedIntegration: true` and `shareable: false` with `canIntegrate: false, plannedIntegration: false`. Rename the test `"a non-shareable category is never treated as merged even if selected"` to `"a category that cannot integrate is never treated as merged even if selected"`.

In `tests/optimizer.test.ts` and `tests/robustness.test.ts`, update any `shareable` reference in a test name or filter to `canIntegrate`.

- [ ] **Step 9: Verify no `shareable` reference remains in `lib` or `tests`**

Run: `grep -rn 'shareable' lib tests`
Expected: no matches. (`app/` still references it — Task 5 fixes the UI.)

- [ ] **Step 10: Run the optimizer tests, then the full suite**

Run: `node --test tests/optimizer.test.ts` — Expected: PASS
Run: `npm test` — Expected: all pass. `npm test` runs `node --test` over `lib/` and
`tests/` only, so it does not compile `app/`.

Do **not** run `npm run build` in this task: `app/` still references `shareable` and will
not compile until Task 5. That breakage is expected and scoped to this task and Task 4.

- [ ] **Step 11: Commit**

```bash
git add lib/model.ts lib/cost-engine.ts lib/optimizer.ts lib/scenario-edits.ts tests/
git commit -m "Separate integration policy from the user's integration plan"
```

---

### Task 4: Plan comparison and share-link migration

**Files:**
- Modify: `lib/optimizer.ts` — add `comparePlanToBest`
- Modify: `lib/share.ts` — version 2 with v1 migration
- Test: `tests/optimizer.test.ts`, `tests/share.test.ts`

**Interfaces:**
- Consumes: `Stage1Output.userPlan` and `objectiveValue` from Task 3.
- Produces:
  - `comparePlanToBest(scenario, stage1, objective): PlanComparison` where
    `PlanComparison = { userPlan: Bundle; best: Bundle | null; add: PlanChange[]; drop: PlanChange[]; objectiveDelta: number }`
    and `PlanChange = { id: string; name: string; objectiveDelta: number }`.
    `objectiveDelta` is `best − userPlan` on the active objective, so **negative means the optimizer's answer is better**.
  - `SharedState` becomes `{ v: 2; scenario: Scenario; objective: Objective }`; `decodeState` still accepts v1.

- [ ] **Step 1: Write the failing tests**

Add `comparePlanToBest` to the existing optimizer import at the top of
`tests/optimizer.test.ts`:

```ts
import { comparePlanToBest, runStage1 } from "../lib/optimizer.ts";
```

Then append:

```ts
test("the comparison names what the optimizer would add and drop", () => {
  const scenario = createExampleScenario();
  const stage1 = runStage1(scenario, "staffHours");
  const comparison = comparePlanToBest(scenario, stage1, "staffHours");

  const planned = new Set(comparison.userPlan.mergedCategoryIds);
  const best = new Set(comparison.best!.mergedCategoryIds);

  for (const change of comparison.add) assert.ok(best.has(change.id) && !planned.has(change.id));
  for (const change of comparison.drop) assert.ok(planned.has(change.id) && !best.has(change.id));
  assert.ok(comparison.add.every((c) => c.name.length > 0));
});

test("a better optimum yields a negative objective delta", () => {
  const scenario = createExampleScenario();
  const stage1 = runStage1(scenario, "staffHours");
  const comparison = comparePlanToBest(scenario, stage1, "staffHours");
  assert.ok(comparison.objectiveDelta <= 0, "the optimum cannot be worse than the user's plan");
});
```

Append to `tests/share.test.ts`:

```ts
test("a v1 link decodes with policy and plan both taken from shareable", () => {
  const scenario = createExampleScenario();
  const legacy = {
    v: 1,
    objective: "cost",
    scenario: {
      ...scenario,
      categories: scenario.categories.map(({ canIntegrate, plannedIntegration, ...rest }) => ({
        ...rest,
        shareable: canIntegrate,
      })),
    },
  };
  const encoded = encodeState(legacy as never);
  const decoded = decodeState(encoded);

  assert.ok(decoded, "a v1 payload must still decode");
  assert.equal(decoded!.v, 2);
  for (const category of decoded!.scenario.categories) {
    assert.equal(typeof category.canIntegrate, "boolean");
    assert.equal(category.plannedIntegration, category.canIntegrate);
  }
});

test("a v2 link round-trips both flags independently", () => {
  const scenario = createExampleScenario();
  scenario.categories[0].plannedIntegration = !scenario.categories[0].plannedIntegration;
  const decoded = decodeState(encodeState({ v: 2, scenario, objective: "cost" }));
  assert.deepEqual(
    decoded!.scenario.categories.map((c) => [c.canIntegrate, c.plannedIntegration]),
    scenario.categories.map((c) => [c.canIntegrate, c.plannedIntegration]),
  );
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/optimizer.test.ts tests/share.test.ts`
Expected: FAIL — `comparePlanToBest` is not exported; v1 payloads decode without migration.

- [ ] **Step 3: Implement `comparePlanToBest`**

Append to `lib/optimizer.ts`:

```ts
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
  objective: Objective,
): PlanComparison {
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
```

- [ ] **Step 4: Version the share payload**

Replace the `SharedState` type and `isSharedState` guard in `lib/share.ts`, and add migration:

```ts
export type SharedState = { v: 2; scenario: Scenario; objective: Objective };

type LegacyCategory = { shareable?: boolean; canIntegrate?: boolean; plannedIntegration?: boolean };

/**
 * v1 stored a single `shareable` flag that meant both "may merge" and "plan to
 * merge". Mapping it to both preserves exactly what an old link used to show.
 */
function migrateCategory(category: LegacyCategory & Record<string, unknown>) {
  if (typeof category.canIntegrate === "boolean") return category;
  const legacy = category.shareable !== false;
  const { shareable: _dropped, ...rest } = category;
  return { ...rest, canIntegrate: legacy, plannedIntegration: legacy };
}
```

In `decodeState`, run the parsed value through migration before returning:

```ts
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!isSharedState(parsed)) return null;
    return {
      v: 2,
      objective: parsed.objective,
      scenario: {
        ...parsed.scenario,
        categories: parsed.scenario.categories.map(migrateCategory),
      },
    } as SharedState;
```

Relax the guard so it accepts either version — change its return type to `value is { v: number; scenario: { categories: Record<string, unknown>[] } & Record<string, unknown>; objective: Objective }` and leave its structural checks otherwise unchanged.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `node --test tests/optimizer.test.ts tests/share.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/optimizer.ts lib/share.ts tests/optimizer.test.ts tests/share.test.ts
git commit -m "Compare the user's plan against the optimum and migrate v1 links"
```

---

### Task 5: Wire the split and the comparison into the UI

**Files:**
- Modify: `app/components/DataEntry.tsx:100-110` (toggle), `:167` (merged-estimates gate)
- Modify: `app/components/Stage1Results.tsx` — add the comparison panel
- Modify: `app/page.tsx:66` (share version), add adopt handler
- Modify: `app/globals.css` — styles for the new panel

**Interfaces:**
- Consumes: `comparePlanToBest`, `PlanComparison`, `setPlannedIntegration`, `Stage1Output.userPlan`.
- Produces: no new module exports; `Stage1Results` gains props `comparison: PlanComparison` and `onAdopt: (mergedCategoryIds: string[]) => void`.

- [ ] **Step 1: Replace the single toggle with two in `DataEntry.tsx`**

Replace the `shareable-toggle` label block:

```tsx
                <div className="category-flags">
                  <label className={`shareable-toggle${category.canIntegrate ? " on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={category.canIntegrate}
                      onChange={(event) =>
                        setScenario(
                          updateCategory(scenario, category.id, {
                            canIntegrate: event.target.checked,
                            plannedIntegration: event.target.checked && category.plannedIntegration,
                          }),
                        )
                      }
                    />
                    <span>{category.canIntegrate ? "Can be integrated" : "Never integrate"}</span>
                  </label>
                  <label
                    className={`plan-toggle${category.plannedIntegration ? " on" : ""}${category.canIntegrate ? "" : " disabled"}`}
                  >
                    <input
                      type="checkbox"
                      disabled={!category.canIntegrate}
                      checked={category.plannedIntegration}
                      onChange={(event) =>
                        setScenario(
                          updateCategory(scenario, category.id, {
                            plannedIntegration: event.target.checked,
                          }),
                        )
                      }
                    />
                    <span>In my plan</span>
                  </label>
                </div>
```

Unchecking "Can be integrated" also clears the plan flag — a category that may never merge cannot be in a plan.

- [ ] **Step 2: Gate the merged-estimates block on `canIntegrate`**

At `DataEntry.tsx:167`, change `{category.shareable ? (` to `{category.canIntegrate ? (`. The optimizer needs integrated and transition figures for every category it may consider, not only the planned ones.

- [ ] **Step 3: Add the comparison panel to `Stage1Results.tsx`**

Extend the component's props with `comparison: PlanComparison` and `onAdopt: (ids: string[]) => void`, import both from `../../lib/optimizer.ts`, and render this directly above `<div className="finalist-grid">`:

```tsx
      {comparison.best ? (
        <section className="plan-compare">
          <div className="plan-compare-head">
            <h3>Your plan vs. the best option</h3>
            <p>
              Measured on <strong>{objectiveLabel.toLowerCase()}</strong>. Your plan is
              whatever you ticked as &ldquo;in my plan&rdquo;; the optimizer searched every
              arrangement policy allows.
            </p>
          </div>
          <div className="plan-compare-cols">
            <PlanColumn title="Your plan" bundle={comparison.userPlan} objective={objective} nameOf={nameOf} />
            <PlanColumn title={`Best on ${objectiveLabel.toLowerCase()}`} bundle={comparison.best} objective={objective} nameOf={nameOf} highlight />
          </div>
          {comparison.add.length || comparison.drop.length ? (
            <>
              <ul className="plan-diff">
                {comparison.add.map((change) => (
                  <li key={change.id} className="add">
                    <span className="diff-mark">+</span> Add <strong>{change.name}</strong>
                    <em>{formatObjectiveDelta(change.objectiveDelta, objective)}</em>
                  </li>
                ))}
                {comparison.drop.map((change) => (
                  <li key={change.id} className="drop">
                    <span className="diff-mark">−</span> Drop <strong>{change.name}</strong>
                    <em>{formatObjectiveDelta(change.objectiveDelta, objective)}</em>
                  </li>
                ))}
              </ul>
              <button
                className="primary-button"
                type="button"
                onClick={() => onAdopt(comparison.best!.mergedCategoryIds)}
              >
                Adopt this plan
              </button>
            </>
          ) : (
            <p className="plan-agree">Your plan already is the best option on this measure.</p>
          )}
        </section>
      ) : null}
```

Add these two helpers at the bottom of the file:

```tsx
function formatObjectiveDelta(delta: number, objective: Objective): string {
  if (objective === "cost") return signedMoney(delta);
  const unit = OBJECTIVES.find((o) => o.id === objective)?.unit ?? "";
  return `${delta >= 0 ? "+" : "−"}${Math.abs(Math.round(delta)).toLocaleString()} ${unit}`;
}

function PlanColumn({
  title,
  bundle,
  objective,
  nameOf,
  highlight = false,
}: {
  title: string;
  bundle: Bundle;
  objective: Objective;
  nameOf: (id: string) => string;
  highlight?: boolean;
}) {
  return (
    <div className={`plan-col${highlight ? " highlight" : ""}`}>
      <span className="plan-col-title">{title}</span>
      <strong className="plan-col-value">
        {objective === "cost"
          ? money(bundle.result.programAnnualizedCost)
          : `${Math.round(bundle.result.programResourceUsage[objective]).toLocaleString()}`}
      </strong>
      <div className="finalist-chips">
        {bundle.mergedCategoryIds.length ? (
          bundle.mergedCategoryIds.map((id) => (
            <span className="merge-chip" key={id}>{nameOf(id)}</span>
          ))
        ) : (
          <span className="merge-chip muted">Nothing merged</span>
        )}
      </div>
      {!bundle.result.feasible ? (
        <span className="warn-pill">Breaches a constraint</span>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Wire it up in `page.tsx`**

Add imports:

```tsx
import { comparePlanToBest, runStage1, type Objective } from "../lib/optimizer.ts";
import { setPlannedIntegration } from "../lib/scenario-edits.ts";
```

Add after the `stage1` memo:

```tsx
  const comparison = useMemo(
    () => comparePlanToBest(scenario, stage1),
    [scenario, stage1],
  );
```

`comparePlanToBest` takes no `objective` argument: `Stage1Output` records the objective it
ranked on, so the comparison cannot be paired with a different one than the finalists were
chosen under.

Pass `comparison={comparison}` and `onAdopt={(ids) => setScenario(setPlannedIntegration(scenario, ids))}` to `<Stage1Results />`.

Replace the `leanestResult` memo's filter — `c.shareable` becomes `c.canIntegrate`.

Change the share payload version at line ~66 from `{ v: 1, scenario, objective }` to `{ v: 2, scenario, objective }`.

- [ ] **Step 5: Add styles**

Append to `app/globals.css`, following the existing card idiom (`--panel` background, `--line` border, `--teal` accent):

```css
.category-flags { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
.plan-toggle.disabled { opacity: 0.45; cursor: not-allowed; }
.plan-compare { border: 1px solid var(--line); background: var(--panel); border-radius: 14px; padding: 1.25rem; margin-bottom: 1.5rem; }
.plan-compare-head h3 { margin: 0 0 0.25rem; }
.plan-compare-head p { margin: 0 0 1rem; color: var(--muted); }
.plan-compare-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
.plan-col { border: 1px solid var(--line); border-radius: 10px; padding: 0.9rem; }
.plan-col.highlight { border-color: var(--teal); box-shadow: inset 0 0 0 1px var(--teal); }
.plan-col-title { display: block; font-size: 0.8rem; color: var(--muted); }
.plan-col-value { display: block; font-size: 1.5rem; margin: 0.2rem 0 0.6rem; }
.plan-diff { list-style: none; padding: 0; margin: 1rem 0; display: grid; gap: 0.4rem; }
.plan-diff li { display: flex; align-items: baseline; gap: 0.5rem; }
.plan-diff em { margin-left: auto; font-style: normal; color: var(--muted); }
.plan-diff .diff-mark { font-weight: 700; width: 1ch; }
.plan-diff .add .diff-mark { color: var(--teal); }
.plan-diff .drop .diff-mark { color: var(--warning); }
.merge-chip.muted { opacity: 0.6; }
.plan-agree { color: var(--muted); margin: 1rem 0 0; }
```

- [ ] **Step 6: Verify the build and the suite**

Run: `grep -rn 'shareable' app lib tests` — Expected: no matches.
Run: `npm run build` — Expected: compiles with no TypeScript errors.
Run: `npm test` — Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add app lib
git commit -m "Show the user's plan against the optimum, with one-click adopt"
```

---

### Task 6: Demo data where the four objectives genuinely disagree

**Files:**
- Modify: `lib/model.ts::createExampleScenario`
- Test: `tests/optimizer.test.ts`
- Test: `tests/robustness.test.ts` — expected values only, if the reseed moves them (Step 5)

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: a seeded scenario whose per-objective optima are four different bundles.

**Design intent.** The current demo has every merge reducing every resource roughly in proportion, so all four objectives converge and the selector looks broken. These figures make the merges trade against each other: consolidated transport cuts vehicle-days but adds coordination staff-hours and longer field deployments; joint supervision cuts field-days but adds staff-hours and vehicle trips; central training cuts staff-hours but adds travel. Distribution keeps its deliberately wide cost range so Stage 2 still has a fragile favourite to expose — and it is attractive on every objective, which makes Stage 2's warning land hard.

- [ ] **Step 1: Write the failing test**

Append to `tests/optimizer.test.ts`:

```ts
test("the four objectives do not all pick the same bundle", () => {
  const scenario = createExampleScenario();
  const picks = (["cost", "staffHours", "vehicleDays", "fieldDays"] as const).map(
    (objective) => runStage1(scenario, objective).finalists[0]?.id ?? "none",
  );
  assert.equal(new Set(picks).size, 4, `expected four distinct optima, got ${picks.join(" | ")}`);
});

test("seeded costs are actual values, not thousands", () => {
  // A sanity bound, so a future edit cannot silently reintroduce $k scaling.
  const scenario = createExampleScenario();
  for (const category of scenario.categories) {
    for (const entry of Object.values(category.perProgram)) {
      assert.ok(
        entry.standaloneCost === 0 || entry.standaloneCost >= 10000,
        `${category.name} standalone cost ${entry.standaloneCost} looks like thousands`,
      );
    }
  }
  assert.ok(scenario.constraints.fundingCeiling >= 100000);
});

test("the demo has an unplanned category the optimizer wants, and an infeasible status quo", () => {
  const scenario = createExampleScenario();
  assert.ok(scenario.categories.some((c) => c.canIntegrate && !c.plannedIntegration));
  const stage1 = runStage1(scenario, "cost");
  assert.equal(stage1.baseline.result.feasible, false, "status quo should breach a ceiling");
  assert.ok(stage1.infeasibleCount > 0, "some arrangements must be excluded by constraints");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test --test-name-pattern="four objectives" tests/optimizer.test.ts`
Expected: FAIL — fewer than four distinct optima.

- [ ] **Step 3: Replace the seeded categories**

In `lib/model.ts::createExampleScenario`, replace the `categories` array. Argument order is `(id, name, canIntegrate, plannedIntegration, perProgram, integratedCost, transitionCost, integratedResourceDraw, governmentFunded?)`.

```ts
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
```

Replace the `constraints` block. The field-day ceiling deliberately sits just under the status-quo draw of 551, so the status quo is infeasible and integration is forced — which also exercises the `warn-pill` the UI already renders:

```ts
  const constraints: Constraints = {
    // Field-days bites: the status quo draws 551 against a ceiling of 540, so
    // doing nothing is not an option and some arrangements are ruled out.
    resourceCeilings: { staffHours: 3500, vehicleDays: 600, fieldDays: 540 },
    fundingCeiling: statusQuoCost,
    amortizationYears: 5,
    horizonYears: 5,
  };
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test tests/optimizer.test.ts`
Expected: PASS, with four distinct optima —

| Objective | Expected pick |
|---|---|
| Cost | Training + Transportation + Data & M&E |
| Staff-hours | Training + Distribution + Data & M&E |
| Vehicle-days | Transportation + Distribution + Data & M&E |
| Field-days | Distribution + Supervision + Data & M&E |

If the assertion fails, the levers are the `integratedResourceDraw` figures. Each category's merged draw must be **below** its combined standalone draw on the resources it is meant to save and **above** on the ones it trades away. Adjust one resource on one category at a time and re-run; do not touch costs, which are tuned so the cost optimum differs from all three resource optima.

- [ ] **Step 5: Run the full suite and repair fixtures**

Run: `npm test`
Expected: some `robustness` and `optimizer` assertions on specific numbers will fail because the seeded data changed. Update **only** the expected values. Do not weaken an assertion to make it pass — in particular, `tests/robustness.test.ts`'s check that the recommendation has the minimum worst-case shortfall must keep testing that property.

- [ ] **Step 6: Commit**

```bash
git add lib/model.ts tests/optimizer.test.ts tests/robustness.test.ts
git commit -m "Rebuild the demo so each objective picks a different bundle"
```

---

### Task 7: Rename max regret and record how it was derived

**Files:**
- Modify: `lib/robustness.ts` — `BundleRobustness`, `runStage2`
- Test: `tests/robustness.test.ts`

**Interfaces:**
- Consumes: `Bundle` and `GridCell` as they stand.
- Produces: `BundleRobustness.maxRegret` is replaced by

```ts
worstShortfall: {
  amount: number;            // how far short of the best available option, at its worst cell
  integratedFraction: number;
  transitionFraction: number;
  bestBundleId: string;      // the bundle that beat it there
  bestNetSavings: number;
  ownNetSavings: number;
}
```

The recommendation rule is unchanged: minimise `worstShortfall.amount`. Only the name and the recorded provenance are new.

- [ ] **Step 1: Rewrite the failing test**

In `tests/robustness.test.ts`, replace the test named `"regret is non-negative and the recommended pick has the minimum max-regret"`:

```ts
test("shortfall is non-negative and the recommended pick has the smallest worst shortfall", () => {
  const scenario = createExampleScenario();
  const stage2 = runStage2(scenario, runStage1(scenario, "cost").finalists);

  for (const entry of stage2.perBundle) {
    assert.ok(entry.worstShortfall.amount >= 0);
    assert.ok(
      entry.worstShortfall.bestNetSavings >= entry.worstShortfall.ownNetSavings,
      "the bundle that beat it cannot have done worse",
    );
    assert.equal(
      Math.round(entry.worstShortfall.amount),
      Math.round(entry.worstShortfall.bestNetSavings - entry.worstShortfall.ownNetSavings),
    );
  }

  const smallest = Math.min(...stage2.perBundle.map((e) => e.worstShortfall.amount));
  const recommended = stage2.perBundle.find(
    (e) => e.bundle.id === stage2.recommendedBundleId,
  );
  assert.equal(recommended!.worstShortfall.amount, smallest);
});

test("the worst shortfall names a real grid cell on the bundle's own grid", () => {
  const scenario = createExampleScenario();
  const stage2 = runStage2(scenario, runStage1(scenario, "cost").finalists);
  for (const entry of stage2.perBundle) {
    const cell = entry.cells.find(
      (c) =>
        c.integratedFraction === entry.worstShortfall.integratedFraction &&
        c.transitionFraction === entry.worstShortfall.transitionFraction,
    );
    assert.ok(cell, "the cited cell must exist");
    assert.equal(cell!.netSavings, entry.worstShortfall.ownNetSavings);
  }
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test tests/robustness.test.ts`
Expected: FAIL — `worstShortfall` is undefined.

- [ ] **Step 3: Replace the type**

In `lib/robustness.ts`, update the header comment's final sentence and the type:

```ts
/**
 * How far a bundle can fall short of whichever bundle turns out best, measured at
 * the grid cell where that gap is widest. Carries the provenance — which cell, and
 * which bundle beat it there — because a recommendation the reader cannot trace is
 * a recommendation they cannot argue with.
 */
export type WorstShortfall = {
  amount: number;
  integratedFraction: number;
  transitionFraction: number;
  bestBundleId: string;
  bestNetSavings: number;
  ownNetSavings: number;
};

export type BundleRobustness = {
  bundle: Bundle;
  cells: GridCell[];
  summary: RobustnessSummary;
  /** Lower is more robust — this is the rule that picks the recommendation. */
  worstShortfall: WorstShortfall;
};
```

Update `Stage2Output.recommendedBundleId`'s comment to `/** Finalist with the smallest worst-case shortfall — the robust pick. */`.

- [ ] **Step 4: Track which bundle wins each cell**

In `runStage2`, replace the `bestByCell` map and the `perBundle` computation:

```ts
  // Best net savings at each cell coordinate, and which finalist achieved it.
  const bestByCell = new Map<string, { netSavings: number; bundleId: string }>();
  for (const { bundle, cells } of withCells) {
    for (const cell of cells) {
      const key = cellKey(cell);
      const current = bestByCell.get(key);
      if (current === undefined || cell.netSavings > current.netSavings) {
        bestByCell.set(key, { netSavings: cell.netSavings, bundleId: bundle.id });
      }
    }
  }

  const perBundle: BundleRobustness[] = withCells.map(({ bundle, cells }) => {
    let worstShortfall: WorstShortfall = {
      amount: -Infinity,
      integratedFraction: 0,
      transitionFraction: 0,
      bestBundleId: bundle.id,
      bestNetSavings: 0,
      ownNetSavings: 0,
    };
    for (const cell of cells) {
      const best = bestByCell.get(cellKey(cell)) ?? {
        netSavings: cell.netSavings,
        bundleId: bundle.id,
      };
      const amount = best.netSavings - cell.netSavings;
      if (amount > worstShortfall.amount) {
        worstShortfall = {
          amount,
          integratedFraction: cell.integratedFraction,
          transitionFraction: cell.transitionFraction,
          bestBundleId: best.bundleId,
          bestNetSavings: best.netSavings,
          ownNetSavings: cell.netSavings,
        };
      }
    }
    return { bundle, cells, summary: summarize(cells), worstShortfall };
  });

  const recommendedBundleId =
    perBundle.length === 0
      ? null
      : perBundle.reduce((best, current) =>
          current.worstShortfall.amount < best.worstShortfall.amount ? current : best,
        ).bundle.id;
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `node --test tests/robustness.test.ts`
Expected: PASS

- [ ] **Step 6: Confirm the term is gone from the engine**

Run: `grep -rni 'regret' lib tests`
Expected: no matches. (`app/components/SensitivityView.tsx` still has it — Task 8.)

- [ ] **Step 7: Commit**

```bash
git add lib/robustness.ts tests/robustness.test.ts
git commit -m "Replace max regret with a traceable worst-shortfall measure"
```

---

### Task 8: Stage 2 in plain language, showing its arithmetic

**Files:**
- Modify: `app/components/SensitivityView.tsx`
- Modify: `lib/robustness.ts` — add `baselineAnnualCost` to `Stage2Output` (Step 4)
- Modify: `app/components/DecisionView.tsx` (only if it references `maxRegret`)
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `BundleRobustness.worstShortfall` from Task 7.
- Produces: no new exports.

- [ ] **Step 1: Confirm the build is currently broken and why**

Run: `npm run build`
Expected: FAIL — `SensitivityView.tsx:121` reads `selected.maxRegret`, which no longer exists. This is the error Task 8 fixes.

- [ ] **Step 2: Replace the summary row and the stage's copy**

In `app/components/SensitivityView.tsx`, replace the `maxRegret` summary row:

```tsx
            <SummaryRow
              label="Worst shortfall vs. the best option"
              value={money(selected.worstShortfall.amount)}
              tone="neutral"
            />
```

Replace the `screen-lead` paragraph:

```tsx
        <p className="screen-lead">
          Every cost below is an estimate, so each cell re-solves this option with
          its costs shifted along the low-to-high range you entered. Green cells
          still save money over {stage2.horizonYears} years; red cells lose it. An
          option that stays green everywhere is a safe bet; one that is green only
          near the middle depends on your estimates being right.
        </p>
```

Replace the heading `<h2>Robustness &amp; sensitivity</h2>` with `<h2>What if the costs are wrong?</h2>`, and rename the summary row labels: `Positive cells` → `Scenarios that still save money`, `Centre (point)` → `At your best estimates`, `Worst case` → `Worst scenario`, `Best case` → `Best scenario`, `Worst payback` → `Slowest payback`.

- [ ] **Step 3: Explain what a grid position means**

The axes are currently unexplained, and "High +50%" moves two categories by different amounts because `interpRange` walks each category's own entered range. Add below the heatmap, inside `.heatmap-wrap`:

```tsx
          <p className="axis-note">
            A position on either axis moves every merged category along{" "}
            <em>its own</em> entered low-to-high range — so &ldquo;High +50%&rdquo; shifts a
            category with a wide range much further than one with a narrow range.
            The centre cell is every cost at your best estimate.
          </p>
```

- [ ] **Step 4: Show the arithmetic in the cell inspector**

Replace the body of the `activeCell` branch of `.cell-inspector` so it derives the number rather than asserting it:

```tsx
                <dl className="inspector-working">
                  <div>
                    <dt>Shared-service cost, this scenario</dt>
                    <dd>{money(activeCell.annualCost)}/yr</dd>
                  </div>
                  <div>
                    <dt>Annual saving vs. all separate</dt>
                    <dd>{signedMoney(stage2.baselineAnnualCost - activeCell.annualCost)}/yr</dd>
                  </div>
                  <div>
                    <dt>Over {stage2.horizonYears} years</dt>
                    <dd>
                      {signedMoney(
                        (stage2.baselineAnnualCost - activeCell.annualCost) * stage2.horizonYears,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Less one-off transition cost</dt>
                    <dd>−{money(activeCell.transitionCost)}</dd>
                  </div>
                  <div className="inspector-total">
                    <dt>Net over {stage2.horizonYears} years</dt>
                    <dd className={activeCell.netSavings >= 0 ? "pos" : "neg"}>
                      {signedMoney(activeCell.netSavings)}
                    </dd>
                  </div>
                </dl>
```

This needs the baseline. In `lib/robustness.ts`, add `baselineAnnualCost` to `Stage2Output` (the value is already computed as `baselineAnnual` inside `runStage2`) and return it:

```ts
  /** All-separate annual cost — the reference every cell's saving is measured against. */
  baselineAnnualCost: number;
```

and add it to the object `runStage2` returns, alongside `horizonYears`:

```ts
  return {
    grid,
    horizonYears,
    baselineAnnualCost: baselineAnnual,
    perBundle,
    recommendedBundleId,
    maximinBundleId,
    pointEstimateBundleId,
  };
```

- [ ] **Step 5: Show where the shortfall came from**

Add below the summary rail, inside `.sensitivity-side`:

```tsx
          <div className="shortfall-note">
            <span className="inspector-title">Where the shortfall comes from</span>
            <p>
              At {fractionLabel(selected.worstShortfall.integratedFraction)} integrated cost
              and {fractionLabel(selected.worstShortfall.transitionFraction)} transition cost,
              this option nets {signedMoney(selected.worstShortfall.ownNetSavings)} while{" "}
              <strong>
                {stage2.perBundle.find((e) => e.bundle.id === selected.worstShortfall.bestBundleId)
                  ?.bundle.label ?? "another option"}
              </strong>{" "}
              nets {signedMoney(selected.worstShortfall.bestNetSavings)} — a gap of{" "}
              {money(selected.worstShortfall.amount)}. That is the widest this option
              ever falls behind, which is why it is the number we rank on.
            </p>
          </div>
```

- [ ] **Step 6: Add styles**

Append to `app/globals.css`:

```css
.axis-note { color: var(--muted); font-size: 0.85rem; margin: 0.75rem 0 0; max-width: 46ch; }
.inspector-working { margin: 0.5rem 0 0; display: grid; gap: 0.35rem; }
.inspector-working > div { display: flex; justify-content: space-between; gap: 1rem; }
.inspector-working dt { color: var(--muted); font-size: 0.85rem; }
.inspector-working dd { margin: 0; font-variant-numeric: tabular-nums; }
.inspector-working .inspector-total { border-top: 1px solid var(--line); padding-top: 0.35rem; font-weight: 600; }
.shortfall-note { border-top: 1px solid var(--line); margin-top: 1rem; padding-top: 0.85rem; }
.shortfall-note p { margin: 0.35rem 0 0; color: var(--muted); font-size: 0.88rem; }
```

- [ ] **Step 7: Check `DecisionView.tsx`**

Run: `grep -n 'maxRegret\|regret' app/components/DecisionView.tsx`
If there are matches, rename them to `worstShortfall` / "worst shortfall" following the wording above. If there are none, make no change.

- [ ] **Step 8: Verify**

Run: `grep -rni 'regret' app lib tests` — Expected: no matches.
Run: `npm run build` — Expected: compiles cleanly.
Run: `npm test` — Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add app lib
git commit -m "Rewrite Stage 2 in plain language and show how its numbers are derived"
```

---

## Verification before handing back

- [ ] `npm test` — all green
- [ ] `npm run build` — clean
- [ ] `npm run lint` — clean
- [ ] `grep -rni 'regret\|shareable\|\$k' app lib tests` — no matches
- [ ] `npm run dev`, then check by hand: switching the objective toggle changes the finalists; the plan-comparison panel offers adds and drops; "Adopt this plan" updates the tick boxes on the Set up step; the status quo shows its constraint warning; a Stage 2 cell click shows the full arithmetic.
