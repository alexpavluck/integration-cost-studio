"use client";

import { RESOURCE_TYPES, type ResourceDraw, type Scenario } from "../../lib/model.ts";
import { money, pct } from "../../lib/format.ts";
import { updateCeiling, updateConstraints } from "../../lib/scenario-edits.ts";
import { NumberInput } from "./ui.tsx";

export function ConstraintSetup({
  scenario,
  setScenario,
  baselineUsage,
  leanestUsage,
  statusQuoCost,
  leanestCost,
}: {
  scenario: Scenario;
  setScenario: (next: Scenario) => void;
  /** Resource draw of the all-standalone status quo. */
  baselineUsage: ResourceDraw;
  /** Resource draw of the leanest (all-shareable-merged) arrangement. */
  leanestUsage: ResourceDraw;
  /** Annualized cost of the status quo (its default funding envelope). */
  statusQuoCost: number;
  /** Annualized cost of the leanest arrangement. */
  leanestCost: number;
}) {
  const { constraints } = scenario;
  const funding = constraints.fundingCeiling;
  const fundingUtil = funding > 0 ? statusQuoCost / funding : 0;
  const fundingOver = statusQuoCost > funding;

  return (
    <section className="card" aria-labelledby="ceilings-title">
        <div className="card-head">
          <h3 id="ceilings-title">Capacity &amp; funding limits</h3>
          <span className="card-hint">Hard limits — bundles that breach them are excluded</span>
        </div>

        <div className="ceiling-grid">
          <div className="ceiling-row funding-row">
            <div className="ceiling-label">
              <strong>Total funding</strong>
              <span>$k/yr available</span>
            </div>
            <NumberInput
              ariaLabel="Total funding ceiling in thousands per year"
              prefix="$"
              step={50}
              value={funding}
              onChange={(value) => setScenario(updateConstraints(scenario, { fundingCeiling: value }))}
            />
            <div
              className="usage-bar"
              role="img"
              aria-label={`Status quo uses ${pct(fundingUtil)} of available funding`}
            >
              <div className={`usage-fill${fundingOver ? " over" : ""}`} style={{ width: `${Math.min(100, fundingUtil * 100)}%` }} />
            </div>
            <div className={`usage-note${fundingOver ? " over" : ""}`}>
              Status quo {money(statusQuoCost)} ({pct(fundingUtil)}) · leanest {money(leanestCost)}
              {fundingOver ? " · over budget" : ""}
            </div>
          </div>

          {RESOURCE_TYPES.map((resource) => {
            const ceiling = constraints.resourceCeilings[resource.id];
            const used = baselineUsage[resource.id];
            const leanest = leanestUsage[resource.id];
            const utilization = ceiling > 0 ? used / ceiling : 0;
            const over = used > ceiling;
            return (
              <div className="ceiling-row" key={resource.id}>
                <div className="ceiling-label">
                  <strong>{resource.label}</strong>
                  <span>{resource.unit}</span>
                </div>
                <NumberInput
                  ariaLabel={`Ceiling for ${resource.label}`}
                  step={50}
                  value={ceiling}
                  onChange={(value) => setScenario(updateCeiling(scenario, resource.id, value))}
                />
                <div className="usage-bar" role="img" aria-label={`Status quo uses ${pct(utilization)} of ${resource.label} capacity`}>
                  <div className={`usage-fill${over ? " over" : ""}`} style={{ width: `${Math.min(100, utilization * 100)}%` }} />
                </div>
                <div className={`usage-note${over ? " over" : ""}`}>
                  Status quo {Math.round(used)} ({pct(utilization)}) · leanest {Math.round(leanest)}
                  {over ? " · over ceiling" : ""}
                </div>
              </div>
            );
          })}
        </div>
        <p className="ceiling-foot">
          Funding defaults to the current total program cost. Lower it to model a
          budget cut — the status quo then breaks the ceiling and only
          integration options that fit the reduced envelope survive.
        </p>
    </section>
  );
}
