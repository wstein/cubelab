import assert from "node:assert/strict";
import {test} from "vitest";

import {scaledTimeout, timeoutFactor} from "./support/timeout-factor.mjs";

const withFactor = (value) => (value === undefined ? {} : {CUBELAB_TEST_TIMEOUT_FACTOR: value});

test("keeps the CI-calibrated timeouts when no factor is set", () => {
  assert.equal(timeoutFactor(withFactor(undefined)), 1);
  assert.equal(scaledTimeout(30_000, withFactor(undefined)), 30_000);
  assert.equal(scaledTimeout(60_000, withFactor("1")), 60_000);
});

test("multiplies timeouts by a valid factor", () => {
  assert.equal(scaledTimeout(30_000, withFactor("3")), 90_000);
  assert.equal(scaledTimeout(45_000, withFactor("1.5")), 67_500);
});

test("falls back to factor 1 for invalid values", () => {
  for (const value of ["", "0", "-2", "abc", "3abc", "NaN", "Infinity", "-Infinity"]) {
    assert.equal(timeoutFactor(withFactor(value)), 1, `factor ${JSON.stringify(value)}`);
  }
});

test("clamps scaled timeouts to the range setTimeout accepts", () => {
  assert.equal(scaledTimeout(60_000, withFactor("1e9")), 2_147_483_647);
  assert.equal(scaledTimeout(30_000, withFactor("1e-9")), 1);
});
