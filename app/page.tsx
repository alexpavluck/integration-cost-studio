"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildCostTimeline,
  calculateScenario,
  verticalCostForDimension,
  type Dimension,
  type IntegrationMode,
  type ScenarioResults,
  type TimelinePoint,
} from "../lib/cost-model";

const dimensionLibrary = [
  "Planning",
  "Logistics",
  "Training",
  "Transportation",
  "Implementation",
  "Post-implementation",
  "Reporting",
  "Financial management",
  "Technical assistance",
  "Health system capacity",
  "Data & analytics",
  "Quality assurance",
];

const starterDimensions: Dimension[] = [
  { id: 1, name: "Planning", programmeCosts: [180, 160, 150, 145], startupCost: 70, mergedCost: 260, mode: "merged" },
  { id: 2, name: "Logistics", programmeCosts: [240, 220, 210, 195], startupCost: 180, mergedCost: 330, mode: "merged" },
  { id: 3, name: "Training", programmeCosts: [150, 140, 135, 125], startupCost: 120, mergedCost: 210, mode: "merged" },
  { id: 4, name: "Transportation", programmeCosts: [210, 190, 180, 170], startupCost: 90, mergedCost: 340, mode: "merged" },
  { id: 5, name: "Implementation", programmeCosts: [320, 280, 260, 250], startupCost: 240, mergedCost: 500, mode: "separate" },
  { id: 6, name: "Post-implementation", programmeCosts: [140, 130, 120, 115], startupCost: 50, mergedCost: 225, mode: "separate" },
  { id: 7, name: "Reporting", programmeCosts: [120, 110, 105, 95], startupCost: 80, mergedCost: 175, mode: "merged" },
  { id: 8, name: "Financial management", programmeCosts: [110, 100, 95, 90], startupCost: 70, mergedCost: 180, mode: "separate" },
  { id: 9, name: "Technical assistance", programmeCosts: [190, 180, 170, 160], startupCost: 160, mergedCost: 290, mode: "merged" },
];

const initialDimensions: Dimension[] = dimensionLibrary.map((name, index) =>
  starterDimensions[index] ?? {
    id: index + 1,
    name,
    programmeCosts: [100, 90, 85, 80],
    startupCost: 40,
    mergedCost: 150,
    mode: "separate",
  },
);

const programColors = ["#9bdcf0", "#a9df91", "#c9b8ff", "#ffcb80"];

const modeCopy: Record<IntegrationMode, { label: string; short: string }> = {
  separate: { label: "Keep vertical programmes separate", short: "Keep separate" },
  merged: { label: "Merge into one shared service", short: "Merge service" },
};

function money(value: number, compact = false) {
  const rounded = Math.round(value);
  if (compact && Math.abs(rounded) >= 1000) {
    return `$${(rounded / 1000).toFixed(1).replace(".0", "")}m`;
  }
  return `$${rounded.toLocaleString()}k`;
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function paybackLabel(years: number | null) {
  if (years === null) return "No payback";
  if (years === 0) return "Immediate";
  const months = Math.ceil(years * 12);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const wholeYears = Math.floor(months / 12);
  const remainingMonths = months % 12;
  return remainingMonths
    ? `${wholeYears}y ${remainingMonths}m`
    : `${wholeYears} year${wholeYears === 1 ? "" : "s"}`;
}

function Metric({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "neutral" | "positive" | "warning";
}) {
  return (
    <div className={`metric metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function CostBlock({
  dimension,
  color,
  maxCost,
  compact = false,
  displayCost,
}: {
  dimension: Dimension;
  color: string;
  maxCost: number;
  compact?: boolean;
  displayCost: number;
}) {
  const blockCost = displayCost;
  const relative = Math.min(1, Math.max(0.38, Math.sqrt(blockCost / maxCost)));
  return (
    <div
      className={`cost-block${compact ? " compact" : ""}`}
      style={
        {
          "--block-color": color,
          "--block-scale": relative,
        } as React.CSSProperties
      }
      title={`${dimension.name}: ${money(blockCost)}`}
    >
      <span>{dimension.name}</span>
      <strong>{money(blockCost, true)}</strong>
    </div>
  );
}

function PayoffChart({
  timeline,
  results,
  horizonYears,
}: {
  timeline: TimelinePoint[];
  results: ScenarioResults;
  horizonYears: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const density = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * density);
      canvas.height = Math.round(height * density);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(density, 0, 0, density, 0, 0);
      context.clearRect(0, 0, width, height);

      const padding = { top: 25, right: 24, bottom: 38, left: 68 };
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;
      const maxCost = Math.max(
        ...timeline.flatMap((point) => [point.baseline, point.scenario]),
        1,
      );
      const yMax = maxCost * 1.08;
      const x = (year: number) =>
        padding.left + (year / horizonYears) * chartWidth;
      const y = (cost: number) =>
        padding.top + chartHeight - (cost / yMax) * chartHeight;

      context.font = "10px Arial, sans-serif";
      context.fillStyle = "#65706d";
      context.strokeStyle = "#d8d8cf";
      context.lineWidth = 1;
      for (let index = 0; index <= 4; index += 1) {
        const value = (yMax / 4) * index;
        const yPosition = y(value);
        context.beginPath();
        context.moveTo(padding.left, yPosition);
        context.lineTo(width - padding.right, yPosition);
        context.stroke();
        context.textAlign = "right";
        context.textBaseline = "middle";
        context.fillText(money(value, true), padding.left - 9, yPosition);
      }

      const tickStep = horizonYears > 6 ? 2 : 1;
      for (let year = 0; year <= horizonYears; year += tickStep) {
        context.textAlign = "center";
        context.textBaseline = "top";
        context.fillText(
          year === 0 ? "Start" : `Year ${year}`,
          x(year),
          height - padding.bottom + 12,
        );
      }

      const drawLine = (
        getValue: (point: TimelinePoint) => number,
        color: string,
      ) => {
        context.beginPath();
        timeline.forEach((point, index) => {
          const xPosition = x(point.year);
          const yPosition = y(getValue(point));
          if (index === 0) context.moveTo(xPosition, yPosition);
          else context.lineTo(xPosition, yPosition);
        });
        context.strokeStyle = color;
        context.lineWidth = 3;
        context.lineJoin = "round";
        context.lineCap = "round";
        context.stroke();
      };

      drawLine((point) => point.baseline, "#24657a");
      drawLine((point) => point.scenario, "#b97000");

      if (
        results.paybackYears !== null &&
        results.paybackYears <= horizonYears
      ) {
        const paybackX = x(results.paybackYears);
        const paybackY = y(results.baseline * results.paybackYears);
        context.setLineDash([4, 4]);
        context.strokeStyle = "#096c67";
        context.lineWidth = 1.5;
        context.beginPath();
        context.moveTo(paybackX, padding.top);
        context.lineTo(paybackX, padding.top + chartHeight);
        context.stroke();
        context.setLineDash([]);
        context.fillStyle = "#096c67";
        context.beginPath();
        context.arc(paybackX, paybackY, 5, 0, Math.PI * 2);
        context.fill();
        context.font = "700 10px Arial, sans-serif";
        context.textAlign =
          results.paybackYears > horizonYears * 0.72 ? "right" : "left";
        context.textBaseline = "bottom";
        context.fillText(
          `Payback · ${paybackLabel(results.paybackYears)}`,
          paybackX +
            (results.paybackYears > horizonYears * 0.72 ? -8 : 8),
          paybackY - 8,
        );
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [horizonYears, results, timeline]);

  return (
    <div className="payoff-chart">
      <div className="chart-legend" aria-hidden="true">
        <span><i className="baseline-line" />Current vertical programmes</span>
        <span><i className="scenario-line" />Proposed operating model</span>
      </div>
      <canvas
        aria-label={`Cumulative cost chart over ${horizonYears} years. Current vertical programmes and the proposed operating model break even ${paybackLabel(results.paybackYears)} after startup investment.`}
        ref={canvasRef}
        role="img"
      />
    </div>
  );
}

export default function Home() {
  const [allDimensions, setAllDimensions] = useState<Dimension[]>(initialDimensions);
  const [dimensionCount, setDimensionCount] = useState(starterDimensions.length);
  const [programmeCount, setProgrammeCount] = useState(2);
  const [horizonYears, setHorizonYears] = useState(5);

  const dimensions = allDimensions.slice(0, dimensionCount);

  const results = useMemo(
    () => calculateScenario(dimensions, programmeCount),
    [dimensions, programmeCount],
  );
  const timeline = useMemo(
    () => buildCostTimeline(results, horizonYears),
    [horizonYears, results],
  );

  const annualTimeline = timeline.filter((point) => Number.isInteger(point.year));
  const maxCost = Math.max(
    ...dimensions.flatMap((dimension) => [
      ...dimension.programmeCosts.slice(0, programmeCount),
      dimension.mergedCost,
    ]),
    1,
  );
  const separate = dimensions.filter((item) => item.mode === "separate");
  const merged = dimensions.filter((item) => item.mode === "merged");

  const resizeDimensions = (nextCount: number) => {
    setDimensionCount(nextCount);
  };

  const updateDimension = (id: number, patch: Partial<Dimension>) => {
    setAllDimensions((current) =>
      current.map((dimension) =>
        dimension.id === id ? { ...dimension, ...patch } : dimension,
      ),
    );
  };

  const updateProgrammeCost = (
    id: number,
    programmeIndex: number,
    value: number,
  ) => {
    setAllDimensions((current) =>
      current.map((dimension) => {
        if (dimension.id !== id) return dimension;
        const programmeCosts = [...dimension.programmeCosts];
        programmeCosts[programmeIndex] = Math.max(0, value);
        return { ...dimension, programmeCosts };
      }),
    );
  };

  const reset = () => {
    setAllDimensions(initialDimensions);
    setDimensionCount(starterDimensions.length);
    setProgrammeCount(2);
    setHorizonYears(5);
  };

  return (
    <main>
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="brand-copy">
          <span>Scenario workspace</span>
          <strong>Integration Cost Studio</strong>
        </div>
        <button className="quiet-button" onClick={reset} type="button">
          Reset example
        </button>
      </header>

      <section className="workspace">
        <aside className="controls" aria-label="Scenario controls">
          <div className="panel-heading">
            <div>
              <p className="step">01 · Define</p>
              <h2>Scenario setup</h2>
            </div>
            <span className="live-dot">Live model</span>
          </div>

          <div className="control-pair">
            <label className="field">
              <span>Service attributes</span>
              <strong>{dimensions.length}</strong>
              <input
                aria-label="Number of cost dimensions"
                type="range"
                min="3"
                max="12"
                value={dimensionCount}
                onChange={(event) => resizeDimensions(Number(event.target.value))}
              />
              <small>Functions that could stay vertical or be merged</small>
            </label>

            <label className="field">
              <span>Vertical programmes</span>
              <strong>{programmeCount}</strong>
              <input
                aria-label="Number of delivery streams"
                type="range"
                min="2"
                max="4"
                value={programmeCount}
                onChange={(event) => setProgrammeCount(Number(event.target.value))}
              />
              <small>Existing programmes with their own annual costs</small>
            </label>
          </div>

          <div className="cost-guide" aria-label="Cost model structure">
            <div><strong>1</strong><span>Current programme costs<small>Annual cost for each vertical</small></span></div>
            <i aria-hidden="true">+</i>
            <div><strong>2</strong><span>Merge startup cost<small>One-time cost only when merged</small></span></div>
            <i aria-hidden="true">→</i>
            <div><strong>3</strong><span>Merged service cost<small>Annual cost only when merged</small></span></div>
          </div>

          <div className="dimension-header">
            <span>Attribute and costs</span>
            <span>Operating choice</span>
          </div>

          <div className="dimension-list">
            {dimensions.map((dimension, index) => (
              <div className="dimension-row" key={dimension.id}>
                <span className="dimension-number">{String(index + 1).padStart(2, "0")}</span>
                <input
                  className="dimension-name"
                  aria-label={`Name for attribute ${index + 1}`}
                  type="text"
                  value={dimension.name}
                  onChange={(event) =>
                    updateDimension(dimension.id, { name: event.target.value })
                  }
                />
                <div className="mode-control" role="group" aria-label={`Operating choice for ${dimension.name}`}>
                  {(Object.keys(modeCopy) as IntegrationMode[]).map((mode) => (
                    <button
                      aria-pressed={dimension.mode === mode}
                      className={dimension.mode === mode ? `selected ${mode}` : ""}
                      key={mode}
                      onClick={() => updateDimension(dimension.id, { mode })}
                      title={modeCopy[mode].label}
                      type="button"
                    >
                      {modeCopy[mode].short}
                    </button>
                  ))}
                </div>
                <div className="attribute-costs">
                  <div className="cost-section vertical-costs">
                    <div className="cost-section-label">
                      <strong>Current vertical programmes</strong>
                      <small>Annual cost</small>
                    </div>
                    <div className="programme-cost-grid">
                      {Array.from({ length: programmeCount }, (_, programmeIndex) => (
                        <label className="cost-entry" key={programmeIndex}>
                          <span>Programme {programmeIndex + 1}</span>
                          <div><i>$</i><input
                            aria-label={`Annual cost for ${dimension.name}, programme ${programmeIndex + 1}, in thousands`}
                            min="0"
                            step="10"
                            type="number"
                            value={dimension.programmeCosts[programmeIndex]}
                            onChange={(event) =>
                              updateProgrammeCost(
                                dimension.id,
                                programmeIndex,
                                Number(event.target.value),
                              )
                            }
                          /><i>k/yr</i></div>
                        </label>
                      ))}
                    </div>
                    <small className="combined-cost">
                      Combined current cost: <strong>{money(verticalCostForDimension(dimension, programmeCount))}/yr</strong>
                    </small>
                  </div>
                  {dimension.mode === "merged" ? (
                    <>
                      <label className="cost-entry startup-entry">
                        <span>One-time merge cost</span>
                        <div><i>$</i><input
                          aria-label={`One-time merge cost for ${dimension.name} in thousands`}
                          min="0"
                          step="10"
                          type="number"
                          value={dimension.startupCost}
                          onChange={(event) =>
                            updateDimension(dimension.id, {
                              startupCost: Math.max(0, Number(event.target.value)),
                            })
                          }
                        /><i>k once</i></div>
                      </label>
                      <label className="cost-entry merged-entry">
                        <span>Merged service cost</span>
                        <div><i>$</i><input
                          aria-label={`Annual merged service cost for ${dimension.name} in thousands`}
                          min="0"
                          step="10"
                          type="number"
                          value={dimension.mergedCost}
                          onChange={(event) =>
                            updateDimension(dimension.id, {
                              mergedCost: Math.max(0, Number(event.target.value)),
                            })
                          }
                        /><i>k/yr</i></div>
                      </label>
                    </>
                  ) : (
                    <div
                      aria-label={`${dimension.name} has no merge startup cost or merged service cost while kept separate`}
                      className="inactive-costs"
                    >
                      <strong>Merge costs do not apply</strong>
                      <span>This attribute remains in the vertical programmes.</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="model" aria-label="Integration cost model">
          <div className="panel-heading model-heading">
            <div>
              <p className="step">02 · Compare</p>
              <h2>Cost impact</h2>
            </div>
            <div className="legend" aria-label="Visualization legend">
              <span><i className="legend-independent" />Vertical programmes</span>
              <span><i className="legend-integrated" />Merged service</span>
            </div>
          </div>

          <div className="metrics">
            <Metric
              label="Current annual cost"
              value={money(results.baseline)}
              note={`Total across ${programmeCount} vertical programmes`}
            />
            <Metric
              label="Proposed annual cost"
              value={money(results.steadyState)}
              note={`${money(Math.abs(results.savings))} ${results.savings >= 0 ? "below" : "above"} baseline`}
              tone={results.savings >= 0 ? "positive" : "warning"}
            />
            <Metric
              label="Annual savings"
              value={`${results.savings >= 0 ? "" : "−"}${money(Math.abs(results.savings))}`}
              note={`${pct(Math.abs(results.savingsRate))} ${results.savings >= 0 ? "efficiency" : "cost increase"}`}
              tone={results.savings >= 0 ? "positive" : "warning"}
            />
            <Metric
              label="First-year impact"
              value={`${results.firstYearSavings >= 0 ? "" : "−"}${money(Math.abs(results.firstYearSavings))}`}
              note={`After ${money(results.upfrontInvestment)} upfront investment`}
              tone={results.firstYearSavings >= 0 ? "positive" : "warning"}
            />
          </div>

          <section className="payoff" aria-labelledby="payoff-title">
            <div className="payoff-heading">
              <div>
                <p className="step">03 · Payoff</p>
                <h2 id="payoff-title">When the investment turns into savings</h2>
                <p>
                  The proposed model starts with merge costs, then accumulates the
                  selected annual cost for every service attribute.
                </p>
              </div>
              <label className="horizon-control">
                <span>Time horizon <strong>{horizonYears} years</strong></span>
                <input
                  aria-label="Payoff chart time horizon in years"
                  max="10"
                  min="2"
                  type="range"
                  value={horizonYears}
                  onChange={(event) => setHorizonYears(Number(event.target.value))}
                />
              </label>
            </div>

            <div className="payoff-summary">
              <div>
                <span>Total merge startup cost</span>
                <strong>{money(results.upfrontInvestment)}</strong>
                <small>One-time costs for attributes selected to merge</small>
              </div>
              <div className={results.paybackYears === null ? "warning" : "positive"}>
                <span>Estimated payback</span>
                <strong>{paybackLabel(results.paybackYears)}</strong>
                <small>
                  {results.paybackYears === null
                    ? "Annual operating cost does not improve"
                    : results.paybackYears > horizonYears
                      ? `Beyond the current ${horizonYears}-year view`
                      : "Point where cumulative costs are equal"}
                </small>
              </div>
              <div className={timeline.at(-1)!.netSavings >= 0 ? "positive" : "warning"}>
                <span>Net savings by year {horizonYears}</span>
                <strong>
                  {timeline.at(-1)!.netSavings >= 0 ? "" : "−"}
                  {money(Math.abs(timeline.at(-1)!.netSavings))}
                </strong>
                <small>Current vertical cost minus proposed cost</small>
              </div>
            </div>

            <PayoffChart
              horizonYears={horizonYears}
              results={results}
              timeline={timeline}
            />

            <details className="payoff-table" open>
              <summary>Year-by-year payoff table</summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Point in time</th>
                      <th scope="col">Current vertical programmes</th>
                      <th scope="col">Proposed operating model</th>
                      <th scope="col">Cumulative net savings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {annualTimeline.map((point) => {
                      const isPayoffYear =
                        results.paybackYears !== null &&
                        results.paybackYears <= horizonYears &&
                        point.year === Math.ceil(results.paybackYears);
                      return (
                        <tr className={isPayoffYear ? "payoff-row" : ""} key={point.year}>
                          <th scope="row">
                            {point.year === 0 ? "Start" : `End of year ${point.year}`}
                            {isPayoffYear && <span>Payback reached</span>}
                          </th>
                          <td>{money(point.baseline)}</td>
                          <td>{money(point.scenario)}</td>
                          <td className={point.netSavings >= 0 ? "positive-value" : "negative-value"}>
                            {point.netSavings >= 0 ? "" : "−"}
                            {money(Math.abs(point.netSavings))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <div className="journey">
            <div className="journey-rail" aria-hidden="true">
              <span>Current</span>
              <i />
              <span>Proposed</span>
            </div>

            <article className="stage stage-independent">
              <div className="stage-copy">
                <span className="stage-index">A</span>
                <div>
                  <h3>Current vertical programmes</h3>
                  <p>Each programme carries its own annual cost for every attribute.</p>
                </div>
                <strong>{money(results.baseline)}</strong>
              </div>
              <div className="programme-grid" style={{ "--programmes": programmeCount } as React.CSSProperties}>
                {Array.from({ length: programmeCount }, (_, programmeIndex) => (
                  <div className="programme" key={programmeIndex}>
                    <span className="programme-label">Programme {programmeIndex + 1}</span>
                    <div className="block-grid">
                      {dimensions.map((dimension) => (
                        <CostBlock
                          compact
                          dimension={dimension}
                          displayCost={dimension.programmeCosts[programmeIndex]}
                          key={dimension.id}
                          maxCost={maxCost}
                          color={programColors[programmeIndex]}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="stage stage-integrated">
              <div className="stage-copy">
                <span className="stage-index">B</span>
                <div>
                  <h3>Proposed operating model</h3>
                  <p>Merged attributes use the new service cost; the rest remain vertical.</p>
                </div>
                <strong>{money(results.steadyState)}</strong>
              </div>
              <div className="integrated-canvas">
                <div className="system-bar">
                  <span>Merged service</span>
                  <strong>{merged.length} attribute{merged.length === 1 ? "" : "s"}</strong>
                </div>
                <div className="final-blocks">
                  {merged.map((dimension) => (
                    <CostBlock
                      dimension={dimension}
                      displayCost={dimension.mergedCost}
                      key={dimension.id}
                      maxCost={maxCost}
                      color="#ffb74d"
                    />
                  ))}
                </div>
                {separate.length > 0 && (
                  <div className="retained-note">
                    <strong>{separate.length}</strong>
                    <span>attribute{separate.length === 1 ? "" : "s"} remain programme-specific</span>
                    <small>
                      {money(
                        separate.reduce(
                          (sum, dimension) =>
                            sum + verticalCostForDimension(dimension, programmeCount),
                          0,
                        ),
                      )} retained cost
                    </small>
                  </div>
                )}
              </div>
            </article>
          </div>

          <div className={`decision-note ${results.paybackYears === null ? "negative" : ""}`}>
            <span className="decision-icon">{results.paybackYears === null ? "↘" : "↗"}</span>
            <div>
              <strong>
                {results.paybackYears === null
                  ? "This scenario does not recover its upfront investment."
                  : results.paybackYears === 0
                    ? "This scenario begins generating net savings immediately."
                    : results.paybackYears <= 1
                      ? "This scenario pays back within year one."
                      : `This scenario pays back in approximately ${paybackLabel(results.paybackYears)}.`}
              </strong>
              <p>
                {merged.length} merged · {separate.length} kept vertical.
                {" "}{money(results.upfrontInvestment)} startup investment; annual run-rate {results.savings >= 0 ? "improves" : "increases"} by {money(Math.abs(results.savings))}.
              </p>
            </div>
          </div>

          <details className="math-note">
            <summary>How the estimate is calculated</summary>
            <p>
              Current annual cost is the sum of each vertical programme’s entered cost.
              For an attribute selected to merge, that combined cost is replaced by the entered
              merged-service annual cost and its one-time startup cost is added at the beginning.
              Attributes kept vertical retain their programme costs. Payback is the point where
              cumulative proposed cost falls below cumulative current cost.
            </p>
          </details>
        </section>
      </section>

      <footer>
        <span>Integration Cost Studio</span>
        <p>Directional scenario model · Values are illustrative and should be validated with delivery owners.</p>
      </footer>
    </main>
  );
}
