"use client";

import { useState } from "react";
import { money, paybackLabel, pct, signedMoney } from "../../lib/format.ts";
import type { Scenario } from "../../lib/model.ts";
import type { BundleRobustness, Stage2Output } from "../../lib/robustness.ts";
import { AttributeMap } from "./AttributeMap.tsx";

type Verdict = { label: string; tone: "pos" | "warn" | "neg" };

function verdictFor(entry: BundleRobustness): Verdict {
  const { sharePositive, worstNetSavings } = entry.summary;
  if (sharePositive === 1 && worstNetSavings >= 0) return { label: "Robust", tone: "pos" };
  if (sharePositive >= 0.7) return { label: "Mostly holds", tone: "warn" };
  return { label: "Fragile", tone: "neg" };
}

export function DecisionView({
  stage2,
  scenario,
}: {
  stage2: Stage2Output;
  scenario: Scenario;
}) {
  const pointId = stage2.pointEstimateBundleId;
  const robustId = stage2.recommendedBundleId;
  const divergent = pointId !== robustId || pointId !== stage2.maximinBundleId;
  const recommended =
    stage2.perBundle.find((e) => e.bundle.id === robustId) ?? stage2.perBundle[0];

  // The attribute map previews whichever option is selected; it starts on the
  // recommended one.
  const [selectedId, setSelectedId] = useState<string | null>(
    recommended?.bundle.id ?? null,
  );
  const selected =
    stage2.perBundle.find((e) => e.bundle.id === selectedId) ?? recommended;

  return (
    <div className="screen">
      <div className="screen-head">
        <p className="step">03 · Decide</p>
        <h2>Stage 2 — the call</h2>
        <p className="screen-lead">
          {divergent
            ? "The bundle that's cheapest on paper is not the one that holds up best under uncertainty — the split below is the decision."
            : "Here the cheapest bundle also holds up best under uncertainty, so the point estimate and the robust choice agree."}
        </p>
      </div>

      <div className="leadership">
      {recommended ? (
        <div className="recommendation">
          <span className="rec-eyebrow">Recommended — most robust</span>
          <h3>{recommended.bundle.label}</h3>
          <p>
            Positive in <strong>{pct(recommended.summary.sharePositive)}</strong> of
            tested cost scenarios. Even in the worst case it nets{" "}
            <strong>{signedMoney(recommended.summary.worstNetSavings)}</strong> over{" "}
            {stage2.horizonYears} years, and at the central estimate{" "}
            <strong>{signedMoney(recommended.summary.centerNetSavings)}</strong>.
            {robustId !== pointId
              ? " A cheaper-on-paper option exists but carries more downside risk."
              : " It is also the cheapest option at the central estimate."}
          </p>
          {recommended.bundle.countryLiability > 0 ? (
            <p className="rec-country">
              Watch-out: the program books{" "}
              {signedMoney(recommended.bundle.programSavingsVsBaseline)}/yr, but{" "}
              <strong>{money(recommended.bundle.countryLiability)}/yr</strong> of that is
              shifted onto the country / health system — the true annual efficiency is only{" "}
              <strong>{signedMoney(recommended.bundle.annualSavingsVsBaseline)}/yr</strong>.
            </p>
          ) : null}
        </div>
      ) : null}

      {selected ? (
        <div className="attr-card">
          <div className="card-head">
            <h3>
              What {selected.bundle.id === robustId ? "the recommendation" : "this option"} changes
            </h3>
            <span className="card-hint">Box size ≈ cost · pink = merged (program) · peach = country-funded</span>
          </div>
          <AttributeMap scenario={scenario} bundle={selected.bundle} />
        </div>
      ) : null}

      <p className="verdict-hint">Select an option to preview it above.</p>
      <div className="verdict-grid">
        {stage2.perBundle.map((entry) => {
          const verdict = verdictFor(entry);
          const isSelected = entry.bundle.id === selected?.bundle.id;
          return (
            <button
              type="button"
              className={`verdict-card ${verdict.tone}${isSelected ? " selected" : ""}`}
              key={entry.bundle.id}
              aria-pressed={isSelected}
              onClick={() => setSelectedId(entry.bundle.id)}
            >
              <div className="verdict-top">
                <strong>{entry.bundle.label}</strong>
                <span className={`verdict-badge ${verdict.tone}`}>{verdict.label}</span>
              </div>
              <div className="verdict-line">
                <span>Holds up in</span>
                <strong>{pct(entry.summary.sharePositive)} of scenarios</strong>
              </div>
              <div className="verdict-line">
                <span>Payback</span>
                <strong>{paybackLabel(entry.summary.worstPaybackYears)} worst case</strong>
              </div>
              {entry.bundle.countryLiability > 0 ? (
                <div className="verdict-line country">
                  <span>Shifts to country</span>
                  <strong>{money(entry.bundle.countryLiability)}/yr</strong>
                </div>
              ) : null}
              <div className="verdict-range">
                Net over {stage2.horizonYears}y: {signedMoney(entry.summary.worstNetSavings)} to{" "}
                {signedMoney(entry.summary.bestNetSavings)}
                {entry.bundle.id === pointId ? " · cheapest on paper" : ""}
              </div>
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}
