"use client";

import type { ReactNode } from "react";
import { RESOURCE_TYPES, type Scenario } from "../../lib/model.ts";
import { money } from "../../lib/format.ts";
import {
  addCategory,
  addProgram,
  removeCategory,
  removeProgram,
  updateCategory,
  updateEntry,
  updateEntryResource,
  updateIntegratedResource,
  updateProgram,
  updateRange,
} from "../../lib/scenario-edits.ts";
import { NumberInput, TextInput } from "./ui.tsx";

export function DataEntry({
  scenario,
  setScenario,
  middleSlot,
}: {
  scenario: Scenario;
  setScenario: (next: Scenario) => void;
  /** Rendered between the programs card and the component categories. */
  middleSlot?: ReactNode;
}) {
  const { programs, categories } = scenario;

  return (
    <div className="screen">
      <div className="screen-head">
        <p className="step">01 · Set up</p>
        <h2>Scenario setup</h2>
        <p className="screen-lead">
          Enter each vertical program and its shared capacity and funding limits,
          then, for every component category, what each program spends and draws
          today. Flag components that can never merge as{" "}
          <strong>non-negotiable</strong> so the optimizer never proposes them.
        </p>
      </div>

      <section className="card programs-card" aria-labelledby="programs-title">
        <div className="card-head">
          <h3 id="programs-title">Vertical programs</h3>
          <button className="ghost-button" type="button" onClick={() => setScenario(addProgram(scenario))}>
            + Add program
          </button>
        </div>
        <div className="programs-grid">
          {programs.map((program) => (
            <div className="program-chip" key={program.id}>
              <TextInput
                ariaLabel={`Name for ${program.name}`}
                className="program-name"
                value={program.name}
                onChange={(value) => setScenario(updateProgram(scenario, program.id, { name: value }))}
              />
              {programs.length > 2 ? (
                <button
                  className="remove-button"
                  type="button"
                  aria-label={`Remove ${program.name}`}
                  onClick={() => setScenario(removeProgram(scenario, program.id))}
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {middleSlot}

      <div className="card-head categories-head">
        <h3>Component categories</h3>
        <button className="ghost-button" type="button" onClick={() => setScenario(addCategory(scenario))}>
          + Add category
        </button>
      </div>

      <div className="category-list">
        {categories.map((category) => {
          const combinedStandalone = Object.values(category.perProgram).reduce(
            (sum, entry) => sum + entry.standaloneCost,
            0,
          );
          return (
            <section className="card category-card" key={category.id}>
              <div className="category-head">
                <TextInput
                  ariaLabel={`Name for category ${category.name}`}
                  className="category-name"
                  value={category.name}
                  onChange={(value) => setScenario(updateCategory(scenario, category.id, { name: value }))}
                />
                <label className={`shareable-toggle${category.shareable ? " on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={category.shareable}
                    onChange={(event) =>
                      setScenario(updateCategory(scenario, category.id, { shareable: event.target.checked }))
                    }
                  />
                  <span>{category.shareable ? "Integrated" : "Remain separate"}</span>
                </label>
                {categories.length > 1 ? (
                  <button
                    className="remove-button"
                    type="button"
                    aria-label={`Remove ${category.name}`}
                    onClick={() => setScenario(removeCategory(scenario, category.id))}
                  >
                    ✕
                  </button>
                ) : null}
              </div>

              <div className="table-scroll">
                <table className="entry-table">
                  <thead>
                    <tr>
                      <th scope="col">Program</th>
                      <th scope="col">Standalone $k/yr</th>
                      {RESOURCE_TYPES.map((resource) => (
                        <th scope="col" key={resource.id}>
                          {resource.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {programs.map((program) => {
                      const entry = category.perProgram[program.id];
                      if (!entry) return null;
                      return (
                        <tr key={program.id}>
                          <th scope="row">{program.name}</th>
                          <td>
                            <NumberInput
                              ariaLabel={`Standalone cost for ${category.name}, ${program.name}`}
                              prefix="$"
                              step={10}
                              value={entry.standaloneCost}
                              onChange={(value) => setScenario(updateEntry(scenario, category.id, program.id, { standaloneCost: value }))}
                            />
                          </td>
                          {RESOURCE_TYPES.map((resource) => (
                            <td key={resource.id}>
                              <NumberInput
                                ariaLabel={`${resource.label} for ${category.name}, ${program.name}`}
                                value={entry.resourceDraw[resource.id]}
                                onChange={(value) => setScenario(updateEntryResource(scenario, category.id, program.id, resource.id, value))}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {category.shareable ? (
                <div className="merged-estimates">
                  <p className="merged-lead">
                    If merged into one shared instance (combined standalone today:{" "}
                    <strong>{money(combinedStandalone)}/yr</strong>). Enter these
                    as ranges — the point estimate drives shortlisting, the
                    low/high bound the robustness sweep.
                  </p>
                  <label className={`gov-toggle${category.governmentFunded ? " on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={category.governmentFunded}
                      onChange={(event) =>
                        setScenario(updateCategory(scenario, category.id, { governmentFunded: event.target.checked }))
                      }
                    />
                    <span>
                      <strong>Government funded when merged</strong>
                      <small>
                        The country / health system pays the shared instance — it leaves the
                        program&rsquo;s books as a saving but becomes a country liability.
                      </small>
                    </span>
                  </label>
                  <div className="range-row">
                    <RangeField
                      label="Integrated cost $k/yr"
                      category={category.id}
                      rangeKey="integratedCost"
                      values={category.integratedCost}
                      scenario={scenario}
                      setScenario={setScenario}
                    />
                    <RangeField
                      label="Transition cost $k (one-time)"
                      category={category.id}
                      rangeKey="transitionCost"
                      values={category.transitionCost}
                      scenario={scenario}
                      setScenario={setScenario}
                    />
                  </div>
                  <div className="merged-resources">
                    <span className="merged-resources-label">Shared-instance resource draw</span>
                    {RESOURCE_TYPES.map((resource) => (
                      <label className="mini-field" key={resource.id}>
                        <span>{resource.label}</span>
                        <NumberInput
                          ariaLabel={`Merged ${resource.label} for ${category.name}`}
                          value={category.integratedResourceDraw[resource.id]}
                          onChange={(value) => setScenario(updateIntegratedResource(scenario, category.id, resource.id, value))}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="nonneg-note">
                  Non-negotiable: this component can never merge regardless of
                  cost logic. Each program keeps its own instance.
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function RangeField({
  label,
  category,
  rangeKey,
  values,
  scenario,
  setScenario,
}: {
  label: string;
  category: string;
  rangeKey: "integratedCost" | "transitionCost";
  values: { low: number; point: number; high: number };
  scenario: Scenario;
  setScenario: (next: Scenario) => void;
}) {
  return (
    <div className={`range-field${rangeKey === "transitionCost" ? " boxed" : ""}`}>
      <span className="range-field-label">{label}</span>
      <div className="range-inputs">
        {(["low", "point", "high"] as const).map((field) => (
          <label className="mini-field" key={field}>
            <span>{field === "point" ? "Point" : field === "low" ? "Low" : "High"}</span>
            <NumberInput
              ariaLabel={`${label} ${field}`}
              prefix="$"
              step={5}
              value={values[field]}
              onChange={(value) => setScenario(updateRange(scenario, category, rangeKey, field, value))}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
