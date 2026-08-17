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
          <h2>Robustness &amp; sensitivity</h2>
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
        <h2>Robustness &amp; sensitivity</h2>
        <p className="screen-lead">
          Each cell re-solves a finalist with its uncertain costs shifted along
          the entered ranges. Green cells net a saving over the {stage2.horizonYears}
          -year horizon; red cells lose money. A bundle that stays green across the
          whole grid is robust; one that is only green near the centre is fragile.
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
        </div>

        <aside className="sensitivity-side">
          <div className="side-summary">
            <h3>{selected.bundle.label}</h3>
            <SummaryRow label="Positive cells" value={pct(selected.summary.sharePositive)} tone={selected.summary.sharePositive === 1 ? "pos" : selected.summary.sharePositive >= 0.5 ? "warn" : "neg"} />
            <SummaryRow label="Centre (point)" value={signedMoney(selected.summary.centerNetSavings)} tone={selected.summary.centerNetSavings >= 0 ? "pos" : "neg"} />
            <SummaryRow label="Worst case" value={signedMoney(selected.summary.worstNetSavings)} tone={selected.summary.worstNetSavings >= 0 ? "pos" : "neg"} />
            <SummaryRow label="Best case" value={signedMoney(selected.summary.bestNetSavings)} tone="pos" />
            <SummaryRow label="Worst payback" value={paybackLabel(selected.summary.worstPaybackYears)} tone="neutral" />
            <SummaryRow label="Max regret" value={money(selected.maxRegret)} tone="neutral" />
          </div>

          <div className="cell-inspector">
            <span className="inspector-title">Selected cell</span>
            {activeCell ? (
              <>
                <p>
                  Integrated {fractionLabel(activeCell.integratedFraction)} · Transition{" "}
                  {fractionLabel(activeCell.transitionFraction)}
                </p>
                <div className="inspector-metrics">
                  <div>
                    <small>Net savings</small>
                    <strong className={activeCell.netSavings >= 0 ? "pos" : "neg"}>
                      {signedMoney(activeCell.netSavings)}
                    </strong>
                  </div>
                  <div>
                    <small>Payback</small>
                    <strong>{paybackLabel(activeCell.paybackYears)}</strong>
                  </div>
                  <div>
                    <small>Annual cost</small>
                    <strong>{money(activeCell.annualCost)}</strong>
                  </div>
                </div>
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
