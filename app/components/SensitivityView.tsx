"use client";

import { useState } from "react";
import { money, paybackLabel, pct, signedMoney } from "../../lib/format.ts";
import type { GridCell, Stage2Output } from "../../lib/robustness.ts";

const TEAL = "9, 108, 103";
const WARN = "155, 72, 42";

function fractionLabel(fraction: number): string {
  if (fraction === 0) return "Point";
  if (fraction < 0) return `Low ${Math.round(fraction * 100)}%`;
  return `High +${Math.round(fraction * 100)}%`;
}

export function SensitivityView({
  stage2,
  selectedFinalistId,
  onSelectFinalist,
}: {
  stage2: Stage2Output;
  selectedFinalistId: string | null;
  onSelectFinalist: (id: string) => void;
}) {
  const [activeCell, setActiveCell] = useState<GridCell | null>(null);

  if (stage2.perBundle.length === 0) {
    return (
      <div className="screen">
        <div className="screen-head">
          <p className="step step-continued">Stage 2</p>
          <h2>What if the costs are wrong?</h2>
          <p className="screen-lead">No finalists to analyze. Adjust inputs in earlier steps.</p>
        </div>
      </div>
    );
  }

  const selected =
    stage2.perBundle.find((entry) => entry.bundle.id === selectedFinalistId) ??
    stage2.perBundle[0];

  const { integratedFractions, transitionFractions } = stage2.grid;
  // Integrated axis high → low top-to-bottom so "worse cost" reads upward.
  const rows = [...integratedFractions].sort((a, b) => b - a);
  const cols = [...transitionFractions].sort((a, b) => a - b);

  const cellAt = (fi: number, ft: number) =>
    selected.cells.find(
      (cell) => cell.integratedFraction === fi && cell.transitionFraction === ft,
    );

  const maxAbs = Math.max(
    1,
    ...selected.cells.map((cell) => Math.abs(cell.netSavings)),
  );

  return (
    <div className="screen">
      <div className="screen-head">
        <p className="step step-continued">Stage 2</p>
        <h2>What if the costs are wrong?</h2>
        <p className="screen-lead">
          Every cost below is an estimate, so each cell re-solves this option with
          its costs shifted along the low-to-high range you entered. Green cells
          still save money over {stage2.horizonYears} years; red cells lose it. An
          option that stays green everywhere is a safe bet; one that is green only
          near the middle depends on your estimates being right.
        </p>
      </div>

      <div className="finalist-tabs" role="tablist" aria-label="Choose a finalist to inspect">
        {stage2.perBundle.map((entry) => (
          <button
            key={entry.bundle.id}
            role="tab"
            aria-selected={entry.bundle.id === selected.bundle.id}
            className={`finalist-tab${entry.bundle.id === selected.bundle.id ? " active" : ""}`}
            onClick={() => {
              onSelectFinalist(entry.bundle.id);
              setActiveCell(null);
            }}
          >
            {entry.bundle.label}
          </button>
        ))}
      </div>

      <div className="sensitivity-body">
        <div className="heatmap-wrap">
          <div className="axis-label axis-y">Integrated cost →</div>
          <div className="heatmap">
            <div className="heatmap-corner" />
            {cols.map((ft) => (
              <div className="heatmap-col-label" key={`c${ft}`}>
                {fractionLabel(ft)}
              </div>
            ))}
            {rows.map((fi) => (
              <FractionRow
                key={`r${fi}`}
                fi={fi}
                cols={cols}
                cellAt={cellAt}
                maxAbs={maxAbs}
                activeCell={activeCell}
                onPick={setActiveCell}
              />
            ))}
          </div>
          <div className="axis-label axis-x">Transition cost →</div>
          <p className="axis-note">
            A position on either axis moves every merged category along{" "}
            <em>its own</em> entered low-to-high range — so &ldquo;High +50%&rdquo; shifts a
            category with a wide range much further than one with a narrow range.
            The centre cell is every cost at your best estimate.
          </p>
        </div>

        <aside className="sensitivity-side">
          <div className="side-summary">
            <h3>{selected.bundle.label}</h3>
            <SummaryRow label="Scenarios that still save money" value={pct(selected.summary.sharePositive)} tone={selected.summary.sharePositive === 1 ? "pos" : selected.summary.sharePositive >= 0.5 ? "warn" : "neg"} />
            <SummaryRow label="At your best estimates" value={signedMoney(selected.summary.centerNetSavings)} tone={selected.summary.centerNetSavings >= 0 ? "pos" : "neg"} />
            <SummaryRow label="Worst scenario" value={signedMoney(selected.summary.worstNetSavings)} tone={selected.summary.worstNetSavings >= 0 ? "pos" : "neg"} />
            <SummaryRow label="Best scenario" value={signedMoney(selected.summary.bestNetSavings)} tone="pos" />
            <SummaryRow label="Slowest payback" value={paybackLabel(selected.summary.worstPaybackYears)} tone="neutral" />
            <SummaryRow
              label="Worst shortfall vs. the best option"
              value={money(selected.worstShortfall.amount)}
              tone="neutral"
            />
          </div>

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

          <div className="cell-inspector">
            <span className="inspector-title">Selected cell</span>
            {activeCell ? (
              <>
                <p className="inspector-scenario">
                  Integrated {fractionLabel(activeCell.integratedFraction)} · Transition{" "}
                  {fractionLabel(activeCell.transitionFraction)}
                </p>
                <dl className="inspector-working">
                  <div>
                    <dt>Total annual cost, this scenario</dt>
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
                    <dd>{signedMoney(-activeCell.transitionCost)}</dd>
                  </div>
                  <div className="inspector-total">
                    <dt>Net over {stage2.horizonYears} years</dt>
                    <dd className={activeCell.netSavings >= 0 ? "pos" : "neg"}>
                      {signedMoney(activeCell.netSavings)}
                    </dd>
                  </div>
                </dl>
                <p className="inspector-payback">
                  Payback in this scenario: <strong>{paybackLabel(activeCell.paybackYears)}</strong>
                </p>
              </>
            ) : (
              <p className="inspector-empty">Click a cell to inspect its net savings and payback.</p>
            )}
          </div>

          <div className="heatmap-legend">
            <span><i style={{ background: `rgb(${TEAL})` }} /> Net saving</span>
            <span><i style={{ background: `rgb(${WARN})` }} /> Net loss</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function FractionRow({
  fi,
  cols,
  cellAt,
  maxAbs,
  activeCell,
  onPick,
}: {
  fi: number;
  cols: number[];
  cellAt: (fi: number, ft: number) => GridCell | undefined;
  maxAbs: number;
  activeCell: GridCell | null;
  onPick: (cell: GridCell) => void;
}) {
  return (
    <>
      <div className="heatmap-row-label">{fractionLabel(fi)}</div>
      {cols.map((ft) => {
        const cell = cellAt(fi, ft);
        if (!cell) return <div key={`${fi}-${ft}`} className="heatmap-cell empty" />;
        const ratio = Math.max(-1, Math.min(1, cell.netSavings / maxAbs));
        const rgb = cell.netSavings >= 0 ? TEAL : WARN;
        const alpha = 0.16 + 0.7 * Math.abs(ratio);
        const isActive =
          activeCell?.integratedFraction === fi && activeCell?.transitionFraction === ft;
        return (
          <button
            key={`${fi}-${ft}`}
            className={`heatmap-cell${isActive ? " active" : ""}`}
            style={{ backgroundColor: `rgba(${rgb}, ${alpha})` }}
            onClick={() => onPick(cell)}
            aria-label={`Integrated ${fractionLabel(fi)}, transition ${fractionLabel(ft)}: net ${signedMoney(cell.netSavings)}`}
          >
            {money(cell.netSavings, true)}
          </button>
        );
      })}
    </>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone: "pos" | "neg" | "warn" | "neutral" }) {
  return (
    <div className="summary-row">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}
