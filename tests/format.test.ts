import assert from "node:assert/strict";
import test from "node:test";
import { paybackLabel } from "../lib/format.ts";

test("payback is expressed in whole years, rounded up", () => {
  // Annual activities only realize savings at each year-end, so payback can
  // never land part-way through a year — always round up.
  assert.equal(paybackLabel(null), "No payback");
  assert.equal(paybackLabel(0), "Immediate");
  assert.equal(paybackLabel(0.3), "1 year");
  assert.equal(paybackLabel(1), "1 year");
  assert.equal(paybackLabel(1.1), "2 years");
  assert.equal(paybackLabel(1.52), "2 years");
  assert.equal(paybackLabel(4), "4 years");
});
