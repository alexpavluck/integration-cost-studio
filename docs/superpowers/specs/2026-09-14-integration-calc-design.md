# Integration Cost Studio — v2 refinements

**Date:** 2026-09-14
**Repo:** https://github.com/alexpavluck/integration-cost-studio (Next.js on Vercel)
**Baseline commit:** 39992ab — 40/40 tests passing
**Status:** Approved design, pending implementation plan

> An earlier draft of this spec was written against `First_attempt/`, a local prototype two
> generations behind the repo. It was discarded. This document describes the real codebase.

## 1. What already exists

The v2 rebuild already satisfies most of the requested behaviour. Recording it so the
implementation does not rebuild working code:

| Requirement | Where it lives |
|---|---|
| Four constraint areas, hard | `Constraints.fundingCeiling` + `resourceCeilings` (staff-hours, vehicle-days, field-days) |
| Two or more programs | `addProgram` / `removeProgram` in `scenario-edits.ts`, minimum of two enforced in the UI |
| Per-program vertical values | `Category.perProgram[programId]` → `standaloneCost` + `resourceDraw` |
| Integrated cost | `Category.integratedCost`, a `CostRange` (low / point / high) |
| Start-up cost | `Category.transitionCost`, also a `CostRange` |
| Shifted to national program | `Category.governmentFunded` |
| Optimise by cost / staff-hours / vehicle-days / field-days | `OBJECTIVES` in `optimizer.ts`, wired through `page.tsx` to a toggle in `Stage1Results.tsx` |
| Exhaustive search | `subsets()` over shareable categories, `2^k`, no solver needed |
| Two-stage structure | Stage 1 shortlist (`optimizer.ts`) → Stage 2 robustness grid (`robustness.ts`) |

The architecture is sound and is not being changed. Objective stays out of the constraint
set; ceilings stay hard; one shared evaluator (`cost-engine.ts`) serves both stages so they
cannot disagree. Transition cost is amortised over `amortizationYears` into `annualizedCost`
rather than gated as a year-one spike — that is a deliberate, coherent choice and it stands.

## 2. Scope

Five changes. Nothing else.

- **W1** — Remove `$k`; enter and display actual values.
- **W2** — Separate integration *policy* from integration *plan*, so the model can recommend
  categories the user did not mark.
- **W3** — Fix government-funded categories so they leave the program's budget and capacity.
- **W4** — Rebuild the demo scenario so the four objectives produce genuinely different answers.
- **W5** — Stage 2: show the arithmetic, drop the jargon, rename "max regret".

## 3. W1 — Remove $k

Costs are entered, stored and displayed as actual values. `180` becomes `180000`.

- `format.ts::money` drops the `k` suffix; `$180,000`. The `compact` branch collapses to `$m`
  at a threshold of 1,000,000 rather than 1,000.
- Every seeded value in `createExampleScenario` scales by 1,000 — `standaloneCost`, every
  `CostRange`, and `fundingCeiling`. Resource draws are counts and do **not** scale.
- `cost-engine.ts` interpolates `$${...}k` directly into its funding violation message; that
  string is fixed and routed through `money()` so formatting lives in one place.
- Any `$k` hints in `DataEntry.tsx` and `ConstraintSetup.tsx` labels are updated.

Doc comments in `model.ts` that say "Annual cost ($k)" are corrected; leaving them would
mislead the next reader more than no comment at all.

## 4. W2 — Policy versus plan

### The problem

`Category.shareable` does two incompatible jobs. Its UI label reads *"Integrated / Remain
separate"*, which presents it as the user's plan. Its function in `cost-engine.ts::isMerged`
and `optimizer.ts::runStage1` is a **hard exclusion**: unticked categories never enter the
optimiser's decision variables. So the tool cannot tell a user that a category they left
unticked would be worth integrating — the single most valuable thing an optimiser can say.

### The change

Split the flag in two:

```ts
/** Policy. False ⇒ can never merge, whatever the numbers say (e.g. drug-specific
 *  safety monitoring). Excluded from the optimizer's decision variables. */
canIntegrate: boolean;

/** The user's current proposal. Does NOT constrain the optimizer — it is the plan
 *  the optimizer's recommendation is compared against. */
plannedIntegration: boolean;
```

`isMerged` gates on `canIntegrate`. `runStage1` enumerates subsets of the `canIntegrate`
categories — unchanged in shape, only in which set it draws from.

### New output

`Stage1Output` gains a `userPlan: Bundle` — the selection implied by `plannedIntegration`,
evaluated identically to any other bundle, including its feasibility.

The UI gains a comparison between the user's plan and the top finalist for the selected
objective: both evaluated side by side, with an explicit diff of categories the model would
**add** or **drop** and what each is worth on the active objective, plus a one-click adopt
that writes the finalist's selection into the `plannedIntegration` flags.

A category the model would add carries a marker in the data-entry list, so the disagreement
is visible without leaving the input screen.

### Migration

`share.ts` payloads are versioned. A v1 payload carrying `shareable` maps to
`canIntegrate = shareable` and `plannedIntegration = shareable`, preserving today's meaning
exactly. New payloads are v2. Decoding a v1 link must not throw.

## 5. W3 — Government funding must leave the program's books

### The problem

`governmentFunded` is meant to model work absorbed by the national program: a saving to the
program, consuming none of the program's budget or capacity. The engine does not do this.

- `cost-engine.ts` adds the integrated cost to `countryAnnualCost`, which is summed into
  `annualCost`, which feeds `annualizedCost` — the figure the funding ceiling tests. A
  category shifted to the national program therefore still consumes the program's funding
  envelope.
- Its `integratedResourceDraw` is added to `resourceUsage` unconditionally, so it still
  consumes the program's staff-hours, vehicle-days and field-days.

### The change

Constraints test what the **program** bears:

- The funding ceiling tests a new `programAnnualizedCost` (program annual cost + amortised
  transition), not the program-plus-country total.
- Resource ceilings test program-borne resource usage. A government-funded merged category
  contributes nothing to it.
- `EngineResult` keeps `annualCost` (the true total, program + country) so that
  `annualSavingsVsBaseline` continues to measure real efficiency rather than cost-shifting.
  This distinction already exists in `optimizer.ts` via `programSavingsVsBaseline` and
  `countryLiability`, and its doc comment already warns that program savings "can overstate
  the real efficiency when government funding is used." That warning stays true and stays
  visible in the UI.

Transition cost for a government-funded category remains program-borne by default: standing
up the merge is work the program does before handing it over.

**This changes results for any scenario using `governmentFunded`.** In the seeded example
that is Data & M&E. It is a behaviour change, made deliberately, and it is the reason it is
called out separately here rather than folded into another item.

## 6. W4 — Demo data that demonstrates the feature

The objective selector works today but has nothing to show: in the seeded scenario merging
reduces every resource roughly in proportion, so optimising for cost, staff-hours,
vehicle-days and field-days all converge on the same bundle. The feature looks broken.

The demo scenario is rebuilt so the four objectives **genuinely conflict**. Concretely, it
needs categories whose merged form trades one resource against another — a merge that saves
money and staff-hours while increasing vehicle-days (consolidated delivery: fewer people,
longer routes); a merge that cuts field-days while raising staff-hours (centralised
processing replacing site visits). Ceilings are set so some but not all bundles are feasible.

The existing deliberate fragility of Distribution — a wide `integratedCost` range that makes
any bundle carrying it a marginal bet, and every resource objective wants to carry it — is
**preserved**. It is what gives Stage 2 something
real to expose, and it was clearly authored on purpose.

**Acceptance test:** the four per-objective top finalists are not all the same bundle. A demo
that fails this test is a broken demo, so it is enforced rather than eyeballed.

## 7. W5 — Stage 2

Substance is unchanged: the grid re-solves each finalist across the entered cost ranges, and
the recommended bundle is the one minimising worst-case shortfall against the best available
bundle in each cell. That rule is sound and stays.

### Naming

"Max regret" is removed as a term, not as a mechanism. Deleting the mechanism would silently
change which bundle is recommended — `robustness.ts` picks the minimum-max-regret finalist.
It is renamed to **"Worst shortfall vs. the best option"**, with a one-line plain explanation:
*how much worse this bundle could be than whichever bundle turns out best, in the scenario
where that gap is widest.*

Jargon is removed throughout the stage, technical terms retained in small secondary text:

| Was | Becomes |
|---|---|
| Max regret | Worst shortfall vs. the best option |
| Positive cells | Scenarios where this saves money |
| Centre (point) | At your best estimates |
| Robustness / sensitivity | What if the costs are wrong? |

### Showing the working

The stage currently asserts its numbers without deriving them. Each is made inspectable:

- **Cell inspector** — the selected cell shows the arithmetic that produced its net saving:
  the integrated and transition costs at that grid position, what they were at the point
  estimate, the annual saving against baseline, the saving over the horizon, and the
  transition cost deducted. Every intermediate figure, no notation.
- **Axis explanation** — states that a grid position interpolates along the low/point/high
  range the user entered (`interpRange`), so a wider entered range moves further per step.
  Two categories at "High +50%" are not shifted by the same amount, and the UI must say so.
- **Shortfall derivation** — for the selected bundle, name the cell where its shortfall is
  worst, which bundle beat it there, and by how much.

No new visualisation types. The heatmap, the finalist tabs and the summary rail stay.

## 8. Out of scope

- The Pareto trade-off frontier across all four objectives. Deferred; the plan-versus-optimum
  comparison in W2 delivers the decision-support value at a fraction of the cost.
- Any change to the two-stage structure, the amortisation model, the exhaustive-search
  approach, or the Next.js/Vercel stack.
- Persistence beyond the existing URL-hash share link.

## 9. Testing

Extending the existing `node --test` suite. Every item below is a new or amended test.

- **format** — `money` emits full values with no `k`; `$m` collapse triggers at 1,000,000;
  signed formatting keeps the true minus sign.
- **model** — the seeded scenario's costs are in actual units (a sanity bound, so a future
  edit cannot silently reintroduce `$k`).
- **cost-engine** — `canIntegrate: false` is never merged; a government-funded merged
  category contributes nothing to program annualised cost or to program resource usage, while
  still appearing in total `annualCost`; the funding ceiling tests the program figure.
- **optimizer** — enumeration draws from `canIntegrate`, not `plannedIntegration`; a finalist
  may contain a category with `plannedIntegration: false`; `userPlan` is evaluated and its
  feasibility reported; ties still break on annualised cost.
- **share** — a v1 payload decodes with `canIntegrate === plannedIntegration === shareable`;
  a v2 payload round-trips both flags; malformed input is still rejected rather than crashing.
- **robustness** — the recommendation rule is unchanged (the existing minimum-max-regret test
  is kept and renamed, not deleted); the worst-shortfall cell and the bundle that beat it
  there are correctly identified.
- **demo** — the four per-objective top finalists are not all identical (§6).

The full suite must stay green; the baseline is 40 passing tests at 39992ab.
