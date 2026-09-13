import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import {solveFullReduction4x4} from "../src/Solver/FullReduction4x4.res.mjs";

const [facelets] = process.argv.slice(2);

if (facelets === undefined || process.argv.length !== 3) {
  throw new Error("Usage: npm run solver:solve-4x4 <96 URFDLB facelets>");
}

const parsed = FaceletCodec.parse(4, facelets);
if (parsed.TAG === "Error") {
  throw new Error("Expected one legal 96-facelet 4×4 state in canonical URFDLB order.");
}

const result = solveFullReduction4x4(parsed._0);
if (result.TAG === "Error") {
  throw new Error(`4×4 solve failed during ${result._0.stage}: ${result._0.message}`);
}

console.log(`Experimental result: ${result._0.stm.toString()} STM · ${result._0.obtm.toString()} OBTM · ${result._0.algorithm}`);
