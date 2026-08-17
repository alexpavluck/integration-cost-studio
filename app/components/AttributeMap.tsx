"use client";

// Visual of what a bundle actually changes: each component attribute drawn as a
// box sized by its cost. In the "Independent" state every program runs its own
// instance (one box per program, colored by program). In the "Integrated" state
// the merged attributes collapse into a single shared PINK box; everything else
// stays per-program. Mirrors the standard vertical-vs-integrated attribute map.

import { money } from "../../lib/format.ts";
import type { Category, Scenario } from "../../lib/model.ts";
import type { Bundle } from "../../lib/optimizer.ts";

const PROGRAM_COLORS = ["#9bdcf0", "#a9df91", "#c9b8ff", "#ffcb80"];
const MERGED_COLOR = "#efb8e8";
const COUNTRY_COLOR = "#f6cfa8";

function boxSize(cost: number, maxCost: number): number {
  // Area ∝ cost (so width ∝ √cost), floored so the number stays legible.
  const scale = Math.min(1, Math.max(0.4, Math.sqrt(cost / Math.max(1, maxCost))));
  return Math.round(42 + scale * 60); // 42–102 px squares
}

function Box({
  n,
  cost,
  color,
  maxCost,
  merged = false,
}: {
  n: number;
  cost: number;
  color: string;
  maxCost: number;
  merged?: boolean;
}) {
  const size = boxSize(cost, maxCost);
  return (
    <div
      className={`attr-box${merged ? " merged" : ""}`}
      style={{ width: size, height: size, background: color }}
      title={`Attribute ${n}: ${money(cost)}${merged ? " (shared)" : ""}`}
    >
      <span className="attr-box-n">{n}</span>
      <small>{money(cost, true)}</small>
    </div>
  );
}

export function AttributeMap({
  scenario,
  bundle,
}: {
  scenario: Scenario;
  bundle: Bundle;
}) {
  const { programs, categories } = scenario;
  const merged = new Set(bundle.mergedCategoryIds);
  const numberOf = new Map(categories.map((c, i) => [c.id, i + 1]));

  // Shared scale across both panels so a pink box reads relative to the program
  // boxes it replaces.
  const maxCost = Math.max(
    1,
    ...categories.flatMap((c) => [
      ...programs.map((p) => c.perProgram[p.id]?.standaloneCost ?? 0),
      c.shareable ? c.integratedCost.point : 0,
    ]),
  );

  const standaloneTotal = categories.reduce(
    (sum, c) =>
      sum + programs.reduce((s, p) => s + (c.perProgram[p.id]?.standaloneCost ?? 0), 0),
    0,
  );

  const programMerged = categories.filter(
    (c) => merged.has(c.id) && !c.governmentFunded,
  );
  const countryMerged = categories.filter(
    (c) => merged.has(c.id) && c.governmentFunded,
  );
  const separateCategories = categories.filter((c) => !merged.has(c.id));

  const programColor = (index: number) => PROGRAM_COLORS[index % PROGRAM_COLORS.length];

  const programBoxes = (list: Category[], programIndex: number, programId: string) =>
    list
      .filter((c) => c.perProgram[programId])
      .map((c) => (
        <Box
          key={c.id}
          n={numberOf.get(c.id)!}
          cost={c.perProgram[programId].standaloneCost}
          color={programColor(programIndex)}
          maxCost={maxCost}
        />
      ));

  return (
    <div className="attr-map">
      <section className="attr-panel">
        <div className="attr-panel-head">
          <h4>Independent — status quo</h4>
          <span>{money(standaloneTotal)}/yr</span>
        </div>
        {programs.map((p, i) => (
          <div className="attr-program" key={p.id}>
            <span className="attr-program-label">
              <i style={{ background: programColor(i) }} />
              {p.name}
            </span>
            <div className="attr-boxes">{programBoxes(categories, i, p.id)}</div>
          </div>
        ))}
      </section>

      <div className="attr-arrow" aria-hidden="true">
        ↓ integrate
      </div>

      <section className="attr-panel">
        <div className="attr-panel-head">
          <h4>Integrated — {bundle.label}</h4>
          <span>
            {money(bundle.result.annualCost)}/yr
            <small className="attr-split">
              {" "}· program {money(bundle.result.programAnnualCost)} · country{" "}
              {money(bundle.result.countryAnnualCost)}
            </small>
          </span>
        </div>

        {programMerged.length ? (
          <div className="attr-program">
            <span className="attr-program-label merged">
              <i style={{ background: MERGED_COLOR }} />
              Shared instance · program funded
            </span>
            <div className="attr-boxes">
              {programMerged.map((c) => (
                <Box
                  key={c.id}
                  n={numberOf.get(c.id)!}
                  cost={c.integratedCost.point}
                  color={MERGED_COLOR}
                  maxCost={maxCost}
                  merged
                />
              ))}
            </div>
          </div>
        ) : null}

        {countryMerged.length ? (
          <div className="attr-program">
            <span className="attr-program-label country">
              <i style={{ background: COUNTRY_COLOR }} />
              Shared instance · country funded
            </span>
            <div className="attr-boxes">
              {countryMerged.map((c) => (
                <Box
                  key={c.id}
                  n={numberOf.get(c.id)!}
                  cost={c.integratedCost.point}
                  color={COUNTRY_COLOR}
                  maxCost={maxCost}
                  merged
                />
              ))}
            </div>
          </div>
        ) : null}

        {separateCategories.length
          ? programs.map((p, i) => {
              const boxes = programBoxes(separateCategories, i, p.id);
              if (boxes.length === 0) return null;
              return (
                <div className="attr-program" key={p.id}>
                  <span className="attr-program-label">
                    <i style={{ background: programColor(i) }} />
                    {p.name} · unchanged
                  </span>
                  <div className="attr-boxes">{boxes}</div>
                </div>
              );
            })
          : null}
      </section>

      <ol className="attr-legend">
        {categories.map((c) => (
          <li key={c.id}>
            <span className="attr-legend-n">{numberOf.get(c.id)}</span>
            {c.name}
            {!c.shareable ? <em> · never merges</em> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
