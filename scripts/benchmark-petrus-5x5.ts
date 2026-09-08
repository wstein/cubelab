import {createHash} from "node:crypto";
import * as StateTypes from "../src/State/StateTypes.res.mjs";
import * as MoveParser from "../src/Move/MoveParser.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as Detector from "../src/Solver/Petrus5x5/BlockDetector5x5.res.mjs";
import * as Planner from "../src/Solver/Petrus5x5/PetrusSolver555.res.mjs";

// Fixed legal states; no unbounded search or process-wide state cache.
const notations = ["", "F", "R U F 2R 2U", "2L 2D B R U2", "R U R' U'", "2R U2 2F' D B2"];
const states = notations.map(notation => {
  const solved = StateTypes.solved(5);
  const parsed = MoveParser.parseWithOptions(5, "Wide", "Modern", notation);
  if (solved.TAG !== "Ok" || parsed.TAG !== "Ok") throw new Error("Invalid benchmark fixture");
  const replay = MoveExecutor.applyAlg(solved._0, parsed._0);
  if (replay.TAG !== "Ok") throw new Error("Invalid benchmark replay");
  return replay._0;
});
const inspect = () => states.map(state => Detector.inspectPetrus5x5(state));
const plan = () => states.map(state => Planner.planPetrusStep5x5(state));
const fingerprint = createHash("sha256").update(JSON.stringify([inspect(), plan()])).digest("hex");
const runs = 200;
const measurements = [inspect, plan].map(operation => {
  for (let i = 0; i < 20; i++) operation();
  Bun.gc(true);
  const heapBefore = process.memoryUsage().heapUsed;
  const cpuBefore = process.cpuUsage();
  const start = performance.now();
  for (let i = 0; i < runs; i++) operation();
  const elapsedMs = performance.now() - start;
  const cpu = process.cpuUsage(cpuBefore);
  Bun.gc(true);
  return {
    operation: operation.name,
    states: runs * states.length,
    elapsedMs: Math.round(elapsedMs),
    cpuMs: Math.round((cpu.user + cpu.system) / 1000),
    retainedHeapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
  };
});
console.log(JSON.stringify({fingerprint, measurements}, null, 2));
