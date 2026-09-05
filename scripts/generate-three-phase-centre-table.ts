import {buildCentrePruning} from "../src/Solver/ThreePhase4x4.res.mjs";

const result = buildCentrePruning(15);
if (result.TAG === "Error") throw new Error("Could not build the phase-one centre pruning table.");

const table = Uint8Array.from(result._0);
for (let index = 0; index < 735471; index += 1) {
  const packed = table[Math.floor(index / 2)]!;
  const depth = index % 2 === 0 ? packed & 0x0f : packed >> 4;
  if (depth === 15) throw new Error(`Phase-one centre state ${index.toString()} was not reached.`);
}

await Bun.write("public/solver/three-phase-centre.v1.bin", table);
console.log(`Wrote ${table.byteLength.toString()} packed bytes for 735471 phase-one centre states.`);
