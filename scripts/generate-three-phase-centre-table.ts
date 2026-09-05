import {buildSymmetryCentrePruning} from "../src/Solver/ThreePhase4x4.res.mjs";

if (process.argv.length > 2) {
  throw new Error(
    "This command generates the phase-one centre pruning table; it does not solve a 4×4 state. " +
      "A 96-facelet solve CLI will be added only after centre, wing, and phase-three search are complete.",
  );
}

const result = buildSymmetryCentrePruning(15);
if (result.TAG === "Error") throw new Error("Could not build the phase-one centre pruning table.");

const table = Uint8Array.from(result._0);
for (let index = 0; index < 15582; index += 1) {
  const packed = table[Math.floor(index / 2)]!;
  const depth = index % 2 === 0 ? packed & 0x0f : packed >> 4;
  if (depth === 15) throw new Error(`Phase-one centre state ${index.toString()} was not reached.`);
}

await Bun.write("public/solver/three-phase-centre.v1.bin", table);
console.log(`Wrote ${table.byteLength.toString()} packed bytes for 15,582 symmetry-reduced phase-one centre states.`);
