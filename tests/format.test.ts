import assert from "node:assert/strict";
import test from "node:test";
import { money, paybackLabel, signedMoney } from "../lib/format.ts";

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

test("money renders actual values with no k suffix", () => {
  assert.equal(money(180000), "$180,000");
  assert.equal(money(0), "$0");
  assert.equal(money(999999), "$999,999");
});

test("compact collapses to $m only at a million", () => {
  assert.equal(money(999999, true), "$999,999");
  assert.equal(money(1000000, true), "$1m");
  assert.equal(money(2500000, true), "$2.5m");
});

test("signedMoney keeps a true minus sign", () => {
  assert.equal(signedMoney(180000), "+$180,000");
  assert.equal(signedMoney(-40000), "−$40,000");
});
