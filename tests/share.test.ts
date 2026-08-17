import assert from "node:assert/strict";
import test from "node:test";
import { createExampleScenario } from "../lib/model.ts";
import {
  buildShareUrl,
  decodeState,
  encodeState,
  readStateFromHash,
  type SharedState,
} from "../lib/share.ts";

// Same URL-safe base64 the module uses, for crafting malformed-but-valid-base64
// payloads without reaching for `any`.
function b64url(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

test("encode → decode round-trips a full scenario and objective", () => {
  const state: SharedState = {
    v: 1,
    scenario: createExampleScenario(),
    objective: "staffHours",
  };
  assert.deepEqual(decodeState(encodeState(state)), state);
});

test("survives unicode in program and category names", () => {
  const scenario = createExampleScenario();
  scenario.programs[0].name = "Programa Ñandú — 日本語";
  const decoded = decodeState(encodeState({ v: 1, scenario, objective: "cost" }));
  assert.equal(decoded?.scenario.programs[0].name, "Programa Ñandú — 日本語");
});

test("rejects malformed or non-scenario payloads instead of crashing", () => {
  assert.equal(decodeState("not valid base64 @@@"), null);
  assert.equal(decodeState(b64url({ v: 1 })), null); // no scenario
  assert.equal(decodeState(b64url({ v: 1, scenario: { programs: [] } })), null); // missing constraints
  assert.equal(readStateFromHash("#other=1"), null);
  assert.equal(readStateFromHash(""), null);
});

test("buildShareUrl and readStateFromHash compose", () => {
  const scenario = createExampleScenario();
  const url = buildShareUrl("https://example.dev", "/", {
    v: 1,
    scenario,
    objective: "cost",
  });
  const decoded = readStateFromHash(url.slice(url.indexOf("#")));
  assert.equal(decoded?.scenario.categories.length, scenario.categories.length);
});
