"use client";

import { useMemo, useState } from "react";

type IntegrationMode = "independent" | "coordinated" | "integrated";

type Dimension = {
  id: number;
  name: string;
  cost: number;
  mode: IntegrationMode;
};

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
  { id: 1, name: "Planning", cost: 180, mode: "coordinated" },
  { id: 2, name: "Logistics", cost: 240, mode: "integrated" },
  { id: 3, name: "Training", cost: 150, mode: "integrated" },
  { id: 4, name: "Transportation", cost: 210, mode: "coordinated" },
  { id: 5, name: "Implementation", cost: 320, mode: "independent" },
  { id: 6, name: "Post-implementation", cost: 140, mode: "coordinated" },
  { id: 7, name: "Reporting", cost: 120, mode: "integrated" },
  { id: 8, name: "Financial management", cost: 110, mode: "independent" },
  { id: 9, name: "Technical assistance", cost: 190, mode: "integrated" },
];

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

function costForDimension(
  dimension: Dimension,
  programmes: number,
  coordinationEfficiency: number,
  integrationMultiplier: number,
) {
  if (dimension.mode === "independent") return dimension.cost * programmes;
  if (dimension.mode === "coordinated") {
    return (
      dimension.cost *
      (1 + (programmes - 1) * (1 - coordinationEfficiency))
    );
  }
  return dimension.cost * integrationMultiplier;
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
}: {
  dimension: Dimension;
  color: string;
  maxCost: number;
  compact?: boolean;
  suffix?: string;
}) {
  const relative = Math.max(0.38, Math.sqrt(dimension.cost / maxCost));
  return (
    <div
      className={`cost-block${compact ? " compact" : ""}`}
      style={
        {
          "--block-color": color,
          "--block-scale": relative,
        } as React.CSSProperties
      }
      title={`${dimension.name}: ${money(dimension.cost)}${suffix ? ` ${suffix}` : ""}`}
    >
      <span>{dimension.name}</span>
      <strong>{money(dimension.cost, true)}</strong>
    </div>
  );
}

export default function Home() {
  const [dimensions, setDimensions] = useState<Dimension[]>(starterDimensions);
  const [programmeCount, setProgrammeCount] = useState(2);
  const [coordinationEfficiency, setCoordinationEfficiency] = useState(0.28);
  const [integrationMultiplier, setIntegrationMultiplier] = useState(1.22);
  const [transitionRate, setTransitionRate] = useState(0.12);

  const results = useMemo(() => {
    const baseline = dimensions.reduce(
      (sum, dimension) => sum + dimension.cost * programmeCount,
      0,
    );
    const steadyState = dimensions.reduce(
      (sum, dimension) =>
        sum +
        costForDimension(
          dimension,
          programmeCount,
          coordinationEfficiency,
          integrationMultiplier,
        ),
      0,
    );
    const transition = dimensions.reduce((sum, dimension) => {
      if (dimension.mode === "integrated") {
        return sum + dimension.cost * transitionRate;
      }
      if (dimension.mode === "coordinated") {
        return sum + dimension.cost * transitionRate * 0.5;
      }
      return sum;
    }, 0);
    const savings = baseline - steadyState;
    const firstYearSavings = savings - transition;
    return {
      baseline,
      steadyState,
      transition,
      savings,
      firstYearSavings,
      savingsRate: baseline ? savings / baseline : 0,
    };
  }, [
    dimensions,
    programmeCount,
    coordinationEfficiency,
    integrationMultiplier,
    transitionRate,
  ]);

  const maxCost = Math.max(...dimensions.map((dimension) => dimension.cost), 1);
  const independent = dimensions.filter((item) => item.mode === "independent");
  const coordinated = dimensions.filter((item) => item.mode === "coordinated");
  const integrated = dimensions.filter((item) => item.mode === "integrated");

  const resizeDimensions = (nextCount: number) => {
    setDimensions((current) => {
      if (nextCount <= current.length) return current.slice(0, nextCount);
      const additions = Array.from({ length: nextCount - current.length }, (_, index) => {
        const id = current.length + index + 1;
        return {
          id,
          name: dimensionLibrary[id - 1] ?? `Dimension ${id}`,
          cost: 100,
          mode: "independent" as IntegrationMode,
        };
      });
      return [...current, ...additions];
    });
  };

  const updateDimension = (id: number, patch: Partial<Dimension>) => {
    setDimensions((current) =>
      current.map((dimension) =>
        dimension.id === id ? { ...dimension, ...patch } : dimension,
      ),
    );
  };

  const applyPreset = (preset: "cautious" | "balanced" | "ambitious") => {
    const modes: Record<typeof preset, IntegrationMode[]> = {
      cautious: ["independent", "independent", "coordinated"],
      balanced: ["coordinated", "integrated", "independent", "integrated"],
      ambitious: ["integrated", "integrated", "coordinated"],
    };
    setDimensions((current) =>
      current.map((dimension, index) => ({
        ...dimension,
        mode: modes[preset][index % modes[preset].length],
      })),
    );
    if (preset === "cautious") {
      setCoordinationEfficiency(0.18);
      setIntegrationMultiplier(1.35);
      setTransitionRate(0.16);
    } else if (preset === "balanced") {
      setCoordinationEfficiency(0.28);
      setIntegrationMultiplier(1.22);
      setTransitionRate(0.12);
    } else {
      setCoordinationEfficiency(0.4);
      setIntegrationMultiplier(1.1);
      setTransitionRate(0.08);
    }
  };

  const reset = () => {
    setDimensions(starterDimensions);
    setProgrammeCount(2);
    setCoordinationEfficiency(0.28);
    setIntegrationMultiplier(1.22);
    setTransitionRate(0.12);
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
                value={dimensions.length}
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
            <button type="button" onClick={() => applyPreset("cautious")}>Cautious</button>
            <button className="active" type="button" onClick={() => applyPreset("balanced")}>Balanced</button>
            <button type="button" onClick={() => applyPreset("ambitious")}>Ambitious</button>
          </div>

          <div className="dimension-header">
            <span>Dimension & cost</span>
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
                      aria-label={`Cost for ${dimension.name} in thousands`}
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
                    <span>k</span>
                  </label>
                </div>
                <div className="mode-control" role="group" aria-label={`Integration choice for ${dimension.name}`}>
                  {(Object.keys(modeCopy) as IntegrationMode[]).map((mode) => (
                    <button
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
              <small>3 levers</small>
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
                  onChange={(event) => setCoordinationEfficiency(Number(event.target.value))}
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
                  onChange={(event) => setIntegrationMultiplier(Number(event.target.value))}
                />
                <small>Shared capability cost vs. one stream’s original cost</small>
              </label>
              <label>
                <span>Transition cost <strong>{pct(transitionRate)}</strong></span>
                <input
                  type="range"
                  min="0"
                  max="0.35"
                  step="0.01"
                  value={transitionRate}
                  onChange={(event) => setTransitionRate(Number(event.target.value))}
                />
                <small>One-time change cost applied to shared dimensions</small>
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
              note={`After ${money(results.transition)} transition cost`}
              tone={results.firstYearSavings >= 0 ? "positive" : "warning"}
            />
          </div>

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
                      key={dimension.id}
                      maxCost={maxCost}
                      color="#ffb74d"
                    />
                  ))}
                  {coordinated.map((dimension) => (
                    <CostBlock
                      dimension={dimension}
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
                  </div>
                )}
              </div>
            </article>
          </div>

          <div className={`decision-note ${results.firstYearSavings < 0 ? "negative" : ""}`}>
            <span className="decision-icon">{results.firstYearSavings >= 0 ? "↗" : "↘"}</span>
            <div>
              <strong>
                {results.firstYearSavings >= 0
                  ? `This scenario pays back within year one.`
                  : `This scenario needs a longer payback horizon.`}
              </strong>
              <p>
                {integrated.length} integrated · {coordinated.length} coordinated · {independent.length} retained.
                {" "}Annual run-rate {results.savings >= 0 ? "improves" : "increases"} by {money(Math.abs(results.savings))}.
              </p>
            </div>
          </div>

          <details className="math-note">
            <summary>How the estimate is calculated</summary>
            <p>
              Baseline cost equals each dimension’s cost multiplied by the number of streams.
              Coordination reduces only duplicated work after the first stream. Integration
              replaces all stream costs with one shared cost using the integrated-cost multiplier.
              Transition cost is applied once to coordinated and integrated dimensions.
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
