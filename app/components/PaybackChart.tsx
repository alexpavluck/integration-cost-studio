"use client";

import { useMemo, useRef, useState } from "react";
import { money, signedMoney } from "../../lib/format.ts";
import { buildPaybackSeries } from "../../lib/cost-model.ts";
import type { Bundle } from "../../lib/optimizer.ts";

const VIEW_W = 720;
const VIEW_H = 320;
const PAD = { top: 24, right: 116, bottom: 40, left: 72 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;

/** Round the axis top up to 1/2/5 × a power of ten so the gridlines read cleanly. */
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function yearLabel(years: number): string {
  const whole = Math.ceil(years);
  return `year ${whole}`;
}

export function PaybackChart({
  bundle,
  baselineAnnualCost,
  horizonYears,
}: {
  bundle: Bundle;
  baselineAnnualCost: number;
  horizonYears: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverYear, setHoverYear] = useState<number | null>(null);

  const series = useMemo(
    () =>
      buildPaybackSeries(
        baselineAnnualCost,
        bundle.result.annualCost,
        bundle.result.transitionCost,
        horizonYears,
      ),
    [baselineAnnualCost, bundle, horizonYears],
  );

  const yMax = niceCeil(series.maxValue);
  const x = (year: number) => PAD.left + (year / series.maxYear) * PLOT_W;
  const y = (value: number) => PAD.top + PLOT_H - (value / yMax) * PLOT_H;

  const path = (pick: (p: (typeof series.points)[number]) => number) =>
    series.points.map((p, i) => `${i ? "L" : "M"}${x(p.year)} ${y(pick(p))}`).join(" ");

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);

  // Both lines end close together whenever savings are modest, so the two direct
  // labels would sit on top of each other. Nudge them apart when they collide.
  const last = series.points.at(-1)!;
  const MIN_LABEL_GAP = 15;
  const rawStatusY = y(last.statusQuo);
  const rawIntegratedY = y(last.integrated);
  const overlap = MIN_LABEL_GAP - Math.abs(rawStatusY - rawIntegratedY);
  const push = overlap > 0 ? overlap / 2 : 0;
  const statusLabelY =
    rawStatusY + (rawStatusY <= rawIntegratedY ? -push : push);
  const integratedLabelY =
    rawIntegratedY + (rawStatusY <= rawIntegratedY ? push : -push);
  const annualSavings = baselineAnnualCost - bundle.result.annualCost;
  const hovered =
    hoverYear === null ? null : series.points.find((p) => p.year === hoverYear) ?? null;

  const summary =
    series.crossoverYear === null
      ? annualSavings > 0
        ? `This option saves ${money(annualSavings)} a year, but the transition cost is large enough that it does not pay for itself within ${series.maxYear} years.`
        : `This option costs ${money(-annualSavings)} a year more to run than staying separate, so it never pays for itself.`
      : `Costs more up front, then pulls ahead in ${yearLabel(series.crossoverYear)} and saves ${money(annualSavings)} every year after.`;

  const caption = `Cumulative cost over ${series.maxYear} years. Staying separate reaches ${money(last.statusQuo)}; this option starts at ${money(bundle.result.transitionCost)} of transition cost and reaches ${money(last.integrated)}. ${summary}`;

  const handleMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    const ratio = (svgX - PAD.left) / PLOT_W;
    if (ratio < 0 || ratio > 1) return setHoverYear(null);
    setHoverYear(Math.round(ratio * series.maxYear));
  };

  return (
    <section className="payback" aria-labelledby="payback-title">
      <div className="payback-head">
        <h3 id="payback-title">When does it pay for itself?</h3>
        <p>
          Everything this option costs, added up year by year, against the cost of
          leaving the programs separate. Where the lines cross is the moment the
          transition has paid for itself.
        </p>
      </div>

      <div className="payback-legend">
        <span>
          <i className="swatch status-quo" aria-hidden="true" /> Staying separate
        </span>
        <span>
          <i className="swatch integrated" aria-hidden="true" /> {bundle.label}
        </span>
      </div>

      <svg
        ref={svgRef}
        className="payback-svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={caption}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverYear(null)}
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              className="payback-grid"
              x1={PAD.left}
              x2={PAD.left + PLOT_W}
              y1={y(value)}
              y2={y(value)}
            />
            <text className="payback-axis-text" x={PAD.left - 10} y={y(value) + 4} textAnchor="end">
              {money(value, true)}
            </text>
          </g>
        ))}

        {series.points.map((p) => (
          <text
            key={p.year}
            className="payback-axis-text"
            x={x(p.year)}
            y={PAD.top + PLOT_H + 22}
            textAnchor="middle"
          >
            {p.year}
          </text>
        ))}
        <text
          className="payback-axis-title"
          x={PAD.left + PLOT_W / 2}
          y={VIEW_H - 4}
          textAnchor="middle"
        >
          YEARS
        </text>

        {series.crossoverYear !== null ? (
          <g>
            <line
              className="payback-crossover"
              x1={x(series.crossoverYear)}
              x2={x(series.crossoverYear)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
            />
            <circle
              className="payback-crossover-dot"
              cx={x(series.crossoverYear)}
              cy={y(baselineAnnualCost * series.crossoverYear)}
              r={5}
            />
            <text
              className="payback-crossover-label"
              x={x(series.crossoverYear) + 8}
              y={PAD.top + 14}
            >
              pays for itself · {yearLabel(series.crossoverYear)}
            </text>
          </g>
        ) : null}

        <path className="payback-line status-quo" d={path((p) => p.statusQuo)} />
        <path className="payback-line integrated" d={path((p) => p.integrated)} />

        {/* Direct labels: identity without relying on colour alone. */}
        <text
          className="payback-series-label status-quo"
          x={PAD.left + PLOT_W + 10}
          y={statusLabelY + 4}
        >
          Separate
        </text>
        <text
          className="payback-series-label integrated"
          x={PAD.left + PLOT_W + 10}
          y={integratedLabelY + 4}
        >
          Integrated
        </text>

        {hovered ? (
          <g aria-hidden="true">
            <line
              className="payback-crosshair"
              x1={x(hovered.year)}
              x2={x(hovered.year)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
            />
            <circle className="payback-dot status-quo" cx={x(hovered.year)} cy={y(hovered.statusQuo)} r={5} />
            <circle className="payback-dot integrated" cx={x(hovered.year)} cy={y(hovered.integrated)} r={5} />
          </g>
        ) : null}
      </svg>

      {hovered ? (
        <p className="payback-readout" role="status">
          <strong>Year {hovered.year}</strong> · staying separate {money(hovered.statusQuo)} ·
          this option {money(hovered.integrated)} ·{" "}
          <strong>{signedMoney(hovered.statusQuo - hovered.integrated)}</strong>{" "}
          {hovered.statusQuo >= hovered.integrated ? "ahead" : "behind"}
        </p>
      ) : (
        <p className="payback-readout muted">Hover the chart to read any year.</p>
      )}

      <p className="payback-summary">{summary}</p>

      <details className="payback-table">
        <summary>Show the numbers</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col">Staying separate</th>
              <th scope="col">This option</th>
              <th scope="col">Difference</th>
            </tr>
          </thead>
          <tbody>
            {series.points.map((p) => (
              <tr key={p.year}>
                <th scope="row">{p.year}</th>
                <td>{money(p.statusQuo)}</td>
                <td>{money(p.integrated)}</td>
                <td className={p.statusQuo >= p.integrated ? "pos" : "neg"}>
                  {signedMoney(p.statusQuo - p.integrated)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
