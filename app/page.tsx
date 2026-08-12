"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildCostTimeline,
  calculateScenario,
  costForDimension,
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
  { id: 1, name: "Planning", cost: 180, upfrontCost: 70, mode: "coordinated" },
  { id: 2, name: "Logistics", cost: 240, upfrontCost: 180, mode: "integrated" },
  { id: 3, name: "Training", cost: 150, upfrontCost: 120, mode: "integrated" },
  { id: 4, name: "Transportation", cost: 210, upfrontCost: 90, mode: "coordinated" },
  { id: 5, name: "Implementation", cost: 320, upfrontCost: 0, mode: "independent" },
  { id: 6, name: "Post-implementation", cost: 140, upfrontCost: 50, mode: "coordinated" },
  { id: 7, name: "Reporting", cost: 120, upfrontCost: 80, mode: "integrated" },
  { id: 8, name: "Financial management", cost: 110, upfrontCost: 0, mode: "independent" },
  { id: 9, name: "Technical assistance", cost: 190, upfrontCost: 160, mode: "integrated" },
];

const initialDimensions: Dimension[] = dimensionLibrary.map((name, index) =>
  starterDimensions[index] ?? {
    id: index + 1,
    name,
    cost: 100,
    upfrontCost: 40,
    mode: "independent",
  },
);

type Preset = "cautious" | "balanced" | "ambitious";

const programColors = ["#9bdcf0", "#a9df91", "#c9b8ff", "#ffcb80"];

const modeCopy: Record<IntegrationMode, { label: string; short: string }> = {
  independent: { label: "Cannot integrate", short: "Separate" },
  coordinated: { label: "Coordinate", short: "Coordinated" },
  integrated: { label: "Integrate", short: "Integrated" },
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
  suffix,
  displayCost,
}: {
  dimension: Dimension;
  color: string;
  maxCost: number;
  compact?: boolean;
  suffix?: string;
  displayCost?: number;
}) {
  const blockCost = displayCost ?? dimension.cost;
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
      title={`${dimension.name}: ${money(blockCost)}${suffix ? ` ${suffix}` : ""}`}
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
        <span><i className="baseline-line" />Independent baseline</span>
        <span><i className="scenario-line" />Integrated scenario</span>
      </div>
      <canvas
        aria-label={`Cumulative cost chart over ${horizonYears} years. Independent baseline and integrated scenario break even ${paybackLabel(results.paybackYears)} after investment.`}
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
  const [coordinationEfficiency, setCoordinationEfficiency] = useState(0.28);
  const [integrationMultiplier, setIntegrationMultiplier] = useState(1.22);
  const [horizonYears, setHorizonYears] = useState(5);
  const [activePreset, setActivePreset] = useState<Preset | "custom">("balanced");

  const dimensions = allDimensions.slice(0, dimensionCount);

  const results = useMemo(
    () =>
      calculateScenario(
        dimensions,
        programmeCount,
        coordinationEfficiency,
        integrationMultiplier,
      ),
    [
      dimensions,
      programmeCount,
      coordinationEfficiency,
      integrationMultiplier,
    ],
  );
  const timeline = useMemo(
    () => buildCostTimeline(results, horizonYears),
    [horizonYears, results],
  );

  const maxCost = Math.max(...dimensions.map((dimension) => dimension.cost), 1);
  const independent = dimensions.filter((item) => item.mode === "independent");
  const coordinated = dimensions.filter((item) => item.mode === "coordinated");
  const integrated = dimensions.filter((item) => item.mode === "integrated");

  const resizeDimensions = (nextCount: number) => {
    setDimensionCount(nextCount);
    setActivePreset("custom");
  };

  const updateDimension = (id: number, patch: Partial<Dimension>) => {
    setAllDimensions((current) =>
      current.map((dimension) =>
        dimension.id === id ? { ...dimension, ...patch } : dimension,
      ),
    );
    setActivePreset("custom");
  };

  const applyPreset = (preset: Preset) => {
    const modes: Record<Preset, IntegrationMode[]> = {
      cautious: ["independent", "independent", "coordinated"],
      balanced: ["coordinated", "integrated", "independent", "integrated"],
      ambitious: ["integrated", "integrated", "coordinated"],
    };
    setAllDimensions((current) =>
      current.map((dimension, index) => ({
        ...dimension,
        mode: modes[preset][index % modes[preset].length],
      })),
    );
    if (preset === "cautious") {
      setCoordinationEfficiency(0.18);
      setIntegrationMultiplier(1.35);
    } else if (preset === "balanced") {
      setCoordinationEfficiency(0.28);
      setIntegrationMultiplier(1.22);
    } else {
      setCoordinationEfficiency(0.4);
      setIntegrationMultiplier(1.1);
    }
    setActivePreset(preset);
  };

  const reset = () => {
    setAllDimensions(initialDimensions);
    setDimensionCount(starterDimensions.length);
    setProgrammeCount(2);
    setCoordinationEfficiency(0.28);
    setIntegrationMultiplier(1.22);
    setHorizonYears(5);
    setActivePreset("balanced");
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

      <section className="hero">
        <div>
          <p className="eyebrow">From separate delivery to shared capability</p>
          <h1>See what integration changes—before committing.</h1>
        </div>
        <p className="hero-copy">
          Assign a cost to every delivery dimension, choose what can be shared,
          and tune the assumptions. The model redraws the system and the economics
          in real time.
        </p>
      </section>

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
              <span>Cost dimensions</span>
              <strong>{dimensions.length}</strong>
              <input
                aria-label="Number of cost dimensions"
                type="range"
                min="3"
                max="12"
                value={dimensionCount}
                onChange={(event) => resizeDimensions(Number(event.target.value))}
              />
              <small>How many cost components are in scope</small>
            </label>

            <label className="field">
              <span>Delivery streams</span>
              <strong>{programmeCount}</strong>
              <input
                aria-label="Number of delivery streams"
                type="range"
                min="2"
                max="4"
                value={programmeCount}
                onChange={(event) => setProgrammeCount(Number(event.target.value))}
              />
              <small>Programmes, products, or teams being combined</small>
            </label>
          </div>

          <div className="preset-row" aria-label="Scenario presets">
            <span>Starting point</span>
            {(["cautious", "balanced", "ambitious"] as Preset[]).map((preset) => (
              <button
                aria-pressed={activePreset === preset}
                className={activePreset === preset ? "active" : ""}
                key={preset}
                type="button"
                onClick={() => applyPreset(preset)}
              >
                {preset[0].toUpperCase() + preset.slice(1)}
              </button>
            ))}
          </div>

          <div className="dimension-header">
            <span>Dimension · annual · upfront</span>
            <span>Integration choice</span>
          </div>

          <div className="dimension-list">
            {dimensions.map((dimension, index) => (
              <div className="dimension-row" key={dimension.id}>
                <span className="dimension-number">{String(index + 1).padStart(2, "0")}</span>
                <div className="dimension-inputs">
                  <input
                    aria-label={`Name for dimension ${index + 1}`}
                    type="text"
                    value={dimension.name}
                    onChange={(event) =>
                      updateDimension(dimension.id, { name: event.target.value })
                    }
                  />
                  <label className="cost-input">
                    <span>$</span>
                    <input
                      aria-label={`Annual cost for ${dimension.name} in thousands`}
                      min="0"
                      step="10"
                      type="number"
                      value={dimension.cost}
                      onChange={(event) =>
                        updateDimension(dimension.id, {
                          cost: Math.max(0, Number(event.target.value)),
                        })
                      }
                    />
                    <span>k/yr</span>
                  </label>
                  <label className="cost-input upfront-input">
                    <span>$</span>
                    <input
                      aria-label={`Upfront investment for ${dimension.name} in thousands`}
                      min="0"
                      step="10"
                      type="number"
                      value={dimension.upfrontCost}
                      onChange={(event) =>
                        updateDimension(dimension.id, {
                          upfrontCost: Math.max(0, Number(event.target.value)),
                        })
                      }
                    />
                    <span>k up</span>
                  </label>
                </div>
                <div className="mode-control" role="group" aria-label={`Integration choice for ${dimension.name}`}>
                  {(Object.keys(modeCopy) as IntegrationMode[]).map((mode) => (
                    <button
                      aria-pressed={dimension.mode === mode}
                      className={dimension.mode === mode ? `selected ${mode}` : ""}
                      key={mode}
                      onClick={() => updateDimension(dimension.id, { mode })}
                      title={modeCopy[mode].label}
                      type="button"
                    >
                      {mode === "independent" ? "No" : mode === "coordinated" ? "Coord." : "Yes"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <details className="assumptions" open>
            <summary>
              <span>
                <span className="step">02 · Tune</span>
                Model assumptions
              </span>
              <small>2 levers</small>
            </summary>
            <div className="assumption-grid">
              <label>
                <span>Coordination efficiency <strong>{pct(coordinationEfficiency)}</strong></span>
                <input
                  type="range"
                  min="0"
                  max="0.6"
                  step="0.01"
                  value={coordinationEfficiency}
                  onChange={(event) => {
                    setCoordinationEfficiency(Number(event.target.value));
                    setActivePreset("custom");
                  }}
                />
                <small>Savings on duplicated work after the first stream</small>
              </label>
              <label>
                <span>Integrated cost <strong>{integrationMultiplier.toFixed(2)}×</strong></span>
                <input
                  type="range"
                  min="0.8"
                  max="1.8"
                  step="0.01"
                  value={integrationMultiplier}
                  onChange={(event) => {
                    setIntegrationMultiplier(Number(event.target.value));
                    setActivePreset("custom");
                  }}
                />
                <small>Shared capability cost vs. one stream’s original cost</small>
              </label>
            </div>
          </details>
        </aside>

        <section className="model" aria-label="Integration cost model">
          <div className="panel-heading model-heading">
            <div>
              <p className="step">03 · Compare</p>
              <h2>Cost impact</h2>
            </div>
            <div className="legend" aria-label="Visualization legend">
              <span><i className="legend-independent" />Separate</span>
              <span><i className="legend-coordinated" />Coordinated</span>
              <span><i className="legend-integrated" />Integrated</span>
            </div>
          </div>

          <div className="metrics">
            <Metric
              label="Independent baseline"
              value={money(results.baseline)}
              note={`${programmeCount} streams × current delivery`}
            />
            <Metric
              label="Steady-state cost"
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
                <p className="step">04 · Payoff</p>
                <h2 id="payoff-title">When the investment turns into savings</h2>
                <p>
                  Cumulative delivery cost includes the upfront investment at the
                  start, then adds each operating model’s annual run rate.
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
                <span>Upfront investment</span>
                <strong>{money(results.upfrontInvestment)}</strong>
                <small>Only coordinated and integrated dimensions</small>
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
                <small>Baseline cost minus scenario cost</small>
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
                      <th scope="col">Independent baseline</th>
                      <th scope="col">Integrated scenario</th>
                      <th scope="col">Cumulative net savings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeline.map((point) => {
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
              <span>Independent</span>
              <i />
              <span>Coordinated</span>
              <i />
              <span>Integrated</span>
            </div>

            <article className="stage stage-independent">
              <div className="stage-copy">
                <span className="stage-index">A</span>
                <div>
                  <h3>Independent delivery</h3>
                  <p>Every stream carries the full set of costs.</p>
                </div>
                <strong>{money(results.baseline)}</strong>
              </div>
              <div className="programme-grid" style={{ "--programmes": programmeCount } as React.CSSProperties}>
                {Array.from({ length: programmeCount }, (_, programmeIndex) => (
                  <div className="programme" key={programmeIndex}>
                    <span className="programme-label">Stream {programmeIndex + 1}</span>
                    <div className="block-grid">
                      {dimensions.map((dimension) => (
                        <CostBlock
                          compact
                          dimension={dimension}
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

            <article className="stage stage-coordinated">
              <div className="stage-copy">
                <span className="stage-index">B</span>
                <div>
                  <h3>Coordinated delivery</h3>
                  <p>Shared work appears once; protected work stays separate.</p>
                </div>
                <strong>{money(
                  dimensions.reduce(
                    (sum, dimension) =>
                      sum +
                      (dimension.mode === "independent"
                        ? dimension.cost * programmeCount
                        : dimension.cost * (1 + (programmeCount - 1) * (1 - coordinationEfficiency))),
                    0,
                  ),
                )}</strong>
              </div>
              <div className="coordination-canvas">
                <div className="separate-stack">
                  {independent.length ? (
                    independent.map((dimension) => (
                      <div className="duplicate-set" key={dimension.id}>
                        {Array.from({ length: programmeCount }, (_, programmeIndex) => (
                          <CostBlock
                            compact
                            dimension={dimension}
                            key={programmeIndex}
                            maxCost={maxCost}
                            color={programColors[programmeIndex]}
                          />
                        ))}
                      </div>
                    ))
                  ) : (
                    <p className="empty-state">No dimensions remain fully separate.</p>
                  )}
                </div>
                <div className="shared-stack">
                  {[...coordinated, ...integrated].length ? (
                    [...coordinated, ...integrated].map((dimension) => (
                      <CostBlock
                        dimension={dimension}
                        displayCost={
                          dimension.cost *
                          (1 +
                            (programmeCount - 1) *
                              (1 - coordinationEfficiency))
                        }
                        key={dimension.id}
                        maxCost={maxCost}
                        color="#efb8e8"
                        suffix="shared"
                      />
                    ))
                  ) : (
                    <p className="empty-state">Choose Coordinate or Integrate to reveal shared work.</p>
                  )}
                </div>
              </div>
            </article>

            <article className="stage stage-integrated">
              <div className="stage-copy">
                <span className="stage-index">C</span>
                <div>
                  <h3>Integrated operating model</h3>
                  <p>One system capability replaces duplicated programme support.</p>
                </div>
                <strong>{money(results.steadyState)}</strong>
              </div>
              <div className="integrated-canvas">
                <div className="system-bar">
                  <span>Shared operating system</span>
                  <strong>{integrated.length} integrated</strong>
                </div>
                <div className="final-blocks">
                  {integrated.map((dimension) => (
                    <CostBlock
                      dimension={dimension}
                      displayCost={costForDimension(
                        dimension,
                        programmeCount,
                        coordinationEfficiency,
                        integrationMultiplier,
                      )}
                      key={dimension.id}
                      maxCost={maxCost}
                      color="#ffb74d"
                    />
                  ))}
                  {coordinated.map((dimension) => (
                    <CostBlock
                      dimension={dimension}
                      displayCost={costForDimension(
                        dimension,
                        programmeCount,
                        coordinationEfficiency,
                        integrationMultiplier,
                      )}
                      key={dimension.id}
                      maxCost={maxCost}
                      color="#efb8e8"
                    />
                  ))}
                </div>
                {independent.length > 0 && (
                  <div className="retained-note">
                    <strong>{independent.length}</strong>
                    <span>dimension{independent.length === 1 ? "" : "s"} remain stream-specific</span>
                    <small>
                      {money(
                        independent.reduce(
                          (sum, dimension) =>
                            sum + dimension.cost * programmeCount,
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
                {integrated.length} integrated · {coordinated.length} coordinated · {independent.length} retained.
                {" "}{money(results.upfrontInvestment)} upfront investment; annual run-rate {results.savings >= 0 ? "improves" : "increases"} by {money(Math.abs(results.savings))}.
              </p>
            </div>
          </div>

          <details className="math-note">
            <summary>How the estimate is calculated</summary>
            <p>
              Baseline cost equals each dimension’s cost multiplied by the number of streams.
              Coordination reduces only duplicated work after the first stream. Integration
              replaces all stream costs with one shared cost using the integrated-cost multiplier.
              Upfront investment is entered for each dimension and counted only when that
              dimension is coordinated or integrated. Payback is the point where cumulative
              scenario cost falls below cumulative independent-delivery cost.
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
