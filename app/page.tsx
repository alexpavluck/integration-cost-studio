"use client";

import { useEffect, useMemo, useState } from "react";
import { createExampleScenario, type Scenario } from "../lib/model.ts";
import { evaluateSelection } from "../lib/cost-engine.ts";
import { runStage1, type Objective } from "../lib/optimizer.ts";
import { runStage2 } from "../lib/robustness.ts";
import { buildShareUrl, readStateFromHash } from "../lib/share.ts";
import { DataEntry } from "./components/DataEntry.tsx";
import { ConstraintSetup } from "./components/ConstraintSetup.tsx";
import { Stage1Results } from "./components/Stage1Results.tsx";
import { SensitivityView } from "./components/SensitivityView.tsx";
import { DecisionView } from "./components/DecisionView.tsx";

const STEPS = [
  { key: "setup", label: "Set up" },
  { key: "analyze", label: "Analyze" },
  { key: "decide", label: "Decide" },
] as const;

export default function Home() {
  const [scenario, setScenario] = useState<Scenario>(createExampleScenario);
  const [step, setStep] = useState(0);
  const [objective, setObjective] = useState<Objective>("cost");
  const [selectedFinalistId, setSelectedFinalistId] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  // Load inputs from a share link on first mount. This must be an effect, not a
  // lazy initializer: the server has no URL hash, so initializing from it would
  // diverge from the SSR HTML and cause a hydration mismatch. Reading it after
  // mount replaces the (SSR-matching) example render exactly once.
  useEffect(() => {
    const shared = readStateFromHash(window.location.hash);
    if (shared) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time hydration from the URL
      setScenario(shared.scenario);
      if (shared.objective) setObjective(shared.objective);
    }
  }, []);

  const stage1 = useMemo(() => runStage1(scenario, objective), [scenario, objective]);
  const stage2 = useMemo(
    () => runStage2(scenario, stage1.finalists),
    [scenario, stage1.finalists],
  );

  const baselineUsage = stage1.baseline.result.resourceUsage;
  const leanestResult = useMemo(() => {
    const shareable = new Set(
      scenario.categories.filter((c) => c.shareable).map((c) => c.id),
    );
    return evaluateSelection(scenario, shareable);
  }, [scenario]);

  const reset = () => {
    setScenario(createExampleScenario());
    setStep(0);
    setSelectedFinalistId(null);
    setObjective("cost");
    window.history.replaceState(null, "", window.location.pathname);
  };

  const copyShareLink = async () => {
    const url = buildShareUrl(
      window.location.origin,
      window.location.pathname,
      { v: 1, scenario, objective },
    );
    // Reflect the link in the address bar either way, so it's recoverable even
    // if the clipboard is blocked (e.g. an embedded browser without permission).
    window.history.replaceState(null, "", url);
    let message = "Link copied!";
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      message = "Link is in the address bar";
    }
    setShareMsg(message);
    window.setTimeout(() => setShareMsg(null), 2500);
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
          <span>Two-stage evaluator</span>
          <strong>Vertical Program Integration Studio</strong>
        </div>
        <div className="topbar-actions">
          {shareMsg ? <span className="share-msg">{shareMsg}</span> : null}
          <button className="quiet-button" onClick={copyShareLink} type="button">
            Copy link
          </button>
          <button className="quiet-button" onClick={reset} type="button">
            Reset example
          </button>
        </div>
      </header>

      <nav className="stepper" aria-label="Workflow steps">
        {STEPS.map((s, index) => (
          <button
            key={s.key}
            className={`stepper-item${index === step ? " current" : ""}${index < step ? " done" : ""}`}
            aria-current={index === step ? "step" : undefined}
            onClick={() => setStep(index)}
          >
            <span className="stepper-num">{index + 1}</span>
            <span className="stepper-label">{s.label}</span>
          </button>
        ))}
      </nav>

      <section className="stage-area">
        {step === 0 ? (
          <DataEntry
            scenario={scenario}
            setScenario={setScenario}
            middleSlot={
              <ConstraintSetup
                scenario={scenario}
                setScenario={setScenario}
                baselineUsage={baselineUsage}
                leanestUsage={leanestResult.resourceUsage}
                statusQuoCost={stage1.baseline.result.annualizedCost}
                leanestCost={leanestResult.annualizedCost}
              />
            }
          />
        ) : null}
        {step === 1 ? (
          <>
            <Stage1Results
              scenario={scenario}
              stage1={stage1}
              objective={objective}
              onObjectiveChange={setObjective}
            />
            <SensitivityView
              stage2={stage2}
              selectedFinalistId={selectedFinalistId}
              onSelectFinalist={setSelectedFinalistId}
            />
          </>
        ) : null}
        {step === 2 ? <DecisionView stage2={stage2} scenario={scenario} /> : null}
      </section>

      <div className="step-nav">
        <button
          className="quiet-button"
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          ← Back
        </button>
        <span className="step-counter">
          Step {step + 1} of {STEPS.length}
        </span>
        {step < STEPS.length - 1 ? (
          <button
            className="primary-button"
            type="button"
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
          >
            Next →
          </button>
        ) : (
          <span />
        )}
      </div>

      <footer>
        <span>Vertical Program Integration Studio</span>
        <p>
          Cost is the objective; resource capacity is the constraint. Stage 1
          shortlists on point estimates; Stage 2 tests robustness. Values are
          illustrative and should be validated with delivery owners.
        </p>
      </footer>
    </main>
  );
}
