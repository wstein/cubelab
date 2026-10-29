// Scales CI-calibrated test timeouts on slow or loaded machines.
// CUBELAB_TEST_TIMEOUT_FACTOR defaults to 1 (CI behavior); invalid values fall back to 1.
// Results are clamped to 1 ms .. 2^31-1 ms: larger values overflow setTimeout (Node then
// fires after 1 ms) and 0 would disable the Vitest timeout altogether.
const MAX_TIMER_MS = 2_147_483_647;

export function timeoutFactor(env = process.env) {
  const factor = Number(env.CUBELAB_TEST_TIMEOUT_FACTOR);
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
}

export function scaledTimeout(milliseconds, env = process.env) {
  return Math.min(MAX_TIMER_MS, Math.max(1, Math.round(milliseconds * timeoutFactor(env))));
}
