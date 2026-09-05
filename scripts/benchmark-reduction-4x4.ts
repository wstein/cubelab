import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import {solveFullReduction4x4} from "../src/Solver/FullReduction4x4";

type Fixture = {
  version: number;
  status: "scaffold" | "ready";
  ciCorpusSize: number;
  releaseCorpusSize: number;
  records: Array<{id: string; seed: string; facelets: string; parity: "none" | "oll" | "pll"}>;
};

const fixturePath = new URL("../test/fixtures/reduction-4x4-benchmark.json", import.meta.url);
const fixture = JSON.parse(await Bun.file(fixturePath).text()) as Fixture;
const release = Bun.argv.includes("--release");
const expected = release ? fixture.releaseCorpusSize : fixture.ciCorpusSize;

if (fixture.version !== 1 || fixture.status !== "ready" || fixture.records.length !== expected) {
  throw new Error(
    `Benchmark corpus is not ready: expected ${expected.toString()} version-1 records with status \"ready\"; found ${fixture.records.length.toString()} (${fixture.status}).`,
  );
}

const results = fixture.records.map((record) => {
  const parsed = FaceletCodec.parse(4, record.facelets);
  if (parsed.TAG === "Error") throw new Error(`${record.id}: invalid fixture facelets.`);
  const started = performance.now();
  const solved = solveFullReduction4x4(parsed._0);
  const elapsedMs = performance.now() - started;
  if (solved.TAG === "Error") throw new Error(`${record.id}: ${solved._0.stage}: ${solved._0.message}`);
  return {id: record.id, parity: record.parity, elapsedMs, stm: solved._0.stm, obtm: solved._0.obtm};
});

const average = (field: "elapsedMs" | "stm" | "obtm") =>
  results.reduce((total, result) => total + result[field], 0) / results.length;
const percentile = (field: "elapsedMs", fraction: number) => {
  const values = results.map((result) => result[field]).sort((left, right) => left - right);
  return values[Math.ceil(values.length * fraction) - 1]!;
};

console.log(JSON.stringify({
  corpus: release ? "release" : "ci",
  count: results.length,
  meanStm: average("stm"),
  meanObtm: average("obtm"),
  maxObtm: Math.max(...results.map((result) => result.obtm)),
  warmP50Ms: percentile("elapsedMs", 0.5),
  warmP95Ms: percentile("elapsedMs", 0.95),
  results,
}, null, 2));
