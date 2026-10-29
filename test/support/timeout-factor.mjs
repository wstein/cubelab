// Scales CI-calibrated test timeouts on slow or loaded machines.
// CUBELAB_TEST_TIMEOUT_FACTOR defaults to 1 (CI behavior); invalid values fall back to 1.
export function timeoutFactor(env = process.env) {
  const factor = Number(env.CUBELAB_TEST_TIMEOUT_FACTOR);
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
}

export function scaledTimeout(milliseconds, env = process.env) {
  return Math.round(milliseconds * timeoutFactor(env));
}
