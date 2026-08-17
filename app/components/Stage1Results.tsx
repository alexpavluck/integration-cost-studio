"use client";

import { money, paybackLabel, signedMoney } from "../../lib/format.ts";
import { OBJECTIVES, type Bundle, type Objective, type Stage1Output } from "../../lib/optimizer.ts";
import { RESOURCE_TYPES, type Scenario } from "../../lib/model.ts";

export function Stage1Results({
  scenario,
  stage1,
  objective,
  onObjectiveChange,
}: {
  scenario: Scenario;
  stage1: Stage1Output;
  objective: Objective;
  onObjectiveChange: (objective: Objective) => void;
}) {
  const nameOf = (id: string) =>
    scenario.categories.find((c) => c.id === id)?.name ?? id;
  const objectiveLabel =
    OBJECTIVES.find((o) => o.id === objective)?.label ?? "Cost";

  return (
    <div className="screen">
      <div className="screen-head">
        <p className="step">02 · Analyze</p>
        <h2>Stage 1 — candidate bundles</h2>
        <p className="screen-lead">
          Pick what to optimize. Whatever you choose, resource ceilings and the
          funding envelope stay hard constraints. Of{" "}
          <strong>{stage1.feasibleCount}</strong> feasible arrangements
          {stage1.infeasibleCount > 0 ? ` (${stage1.infeasibleCount} excluded by constraints)` : ""},
          these are the best on <strong>{objectiveLabel.toLowerCase()}</strong> that merge
          something. Treat them as <strong>finalists, not the answer</strong> —
          Stage 2 stress-tests their cost robustness.
        </p>
      </div>

      <div className="objective-bar">
        <span className="objective-bar-label">Optimize on</span>
        <div className="objective-toggle" role="tablist" aria-label="Optimization objective">
          {OBJECTIVES.map((o) => (
            <button
              key={o.id}
              role="tab"
              aria-selected={objective === o.id}
              className={objective === o.id ? "active" : ""}
              onClick={() => onObjectiveChange(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="baseline-strip">
        <div>
          <span className="strip-label">Status quo · all separate</span>
          <strong>{money(stage1.baseline.result.annualCost)}/yr</strong>
        </div>
        {!stage1.baseline.result.feasible ? (
          <span className="warn-pill">Status quo breaches a constraint</span>
        ) : (
          <span className="ok-pill">Reference baseline</span>
        )}
      </div>

      <div className="finalist-grid">
        {stage1.finalists.map((bundle, index) => (
          <FinalistCard
            key={bundle.id}
            bundle={bundle}
            rank={index + 1}
            isBest={index === 0}
            objective={objective}
            objectiveLabel={objectiveLabel}
            nameOf={nameOf}
          />
        ))}
      </div>
    </div>
  );
}

function FinalistCard({
  bundle,
  rank,
  isBest,
  objective,
  objectiveLabel,
  nameOf,
}: {
  bundle: Bundle;
  rank: number;
  isBest: boolean;
  objective: Objective;
  objectiveLabel: string;
  nameOf: (id: string) => string;
}) {
  const usage = bundle.result.resourceUsage;
  return (
    <article className={`finalist-card${isBest ? " cheapest" : ""}`}>
      <div className="finalist-top">
        <span className="finalist-rank">#{rank}</span>
        {isBest ? <span className="cheapest-tag">Best on {objectiveLabel.toLowerCase()}</span> : null}
      </div>
      <div className="finalist-chips">
        {bundle.mergedCategoryIds.map((id) => (
          <span className="merge-chip" key={id}>
            {nameOf(id)}
          </span>
        ))}
      </div>
      <div className="finalist-metrics">
        <div className={objective === "cost" ? "objective-metric" : undefined}>
          <small>Annualized cost</small>
          <strong>{money(bundle.result.annualizedCost)}</strong>
        </div>
        <div>
          <small>Annual savings</small>
          <strong className={bundle.annualSavingsVsBaseline >= 0 ? "pos" : "neg"}>
            {signedMoney(bundle.annualSavingsVsBaseline)}
          </strong>
        </div>
        <div>
          <small>Payback</small>
          <strong>{paybackLabel(bundle.paybackYears)}</strong>
        </div>
        <div>
          <small>Net over horizon</small>
          <strong className={bundle.netSavingsOverHorizon >= 0 ? "pos" : "neg"}>
            {signedMoney(bundle.netSavingsOverHorizon)}
          </strong>
        </div>
      </div>

      <div className="resource-use">
        {RESOURCE_TYPES.map((resource) => (
          <div
            className={`res-cell${objective === resource.id ? " objective-metric" : ""}`}
            key={resource.id}
          >
            <small>{resource.label}</small>
            <strong>{Math.round(usage[resource.id]).toLocaleString()}</strong>
          </div>
        ))}
      </div>

      <div className="funding-split">
        <span>
          Program <strong>{money(bundle.result.programAnnualCost)}/yr</strong>
        </span>
        <span className={bundle.countryLiability > 0 ? "country" : undefined}>
          Country <strong>{money(bundle.result.countryAnnualCost)}/yr</strong>
        </span>
      </div>
      {bundle.countryLiability > 0 ? (
        <p className="country-note">
          Program books {signedMoney(bundle.programSavingsVsBaseline)}, but{" "}
          {money(bundle.countryLiability)}/yr of that is shifted to the country —
          real saving is {signedMoney(bundle.annualSavingsVsBaseline)}.
        </p>
      ) : null}

      <div className="finalist-foot">
        Transition {money(bundle.result.transitionCost)} · merges{" "}
        {bundle.mergedCategoryIds.length} component
        {bundle.mergedCategoryIds.length === 1 ? "" : "s"}
      </div>
    </article>
  );
}
