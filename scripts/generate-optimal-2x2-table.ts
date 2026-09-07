import {mkdir, writeFile} from "node:fs/promises";
import {transitionCoordinate} from "../src/Solver/Canonical2x2.res.mjs";
import {encodeOptimal2x2Tables, OPTIMAL_2X2_STATES} from "../src/Solver/Optimal2x2Table.res.mjs";

const distances = new Uint8Array(OPTIMAL_2X2_STATES).fill(255);
const queue = new Uint32Array(OPTIMAL_2X2_STATES);
let head = 0;
let tail = 1;
distances[0] = 0;
let maximum = 0;
while (head < tail) {
  const coordinate = queue[head++]!;
  const depth = distances[coordinate]!;
  for (let move = 0; move < 18; move += 1) {
    const next = transitionCoordinate(coordinate, move);
    if (distances[next] !== 255) continue;
    distances[next] = depth + 1;
    maximum = Math.max(maximum, depth + 1);
    queue[tail++] = next;
  }
}
if (tail !== OPTIMAL_2X2_STATES || maximum !== 11) throw new Error("The exact 2×2 distance database is incomplete.");
const packed = new Uint8Array(Math.ceil(OPTIMAL_2X2_STATES / 2));
distances.forEach((distance, coordinate) => {
  const index = Math.floor(coordinate / 2);
  packed[index] = coordinate % 2 === 0 ? (packed[index]! & 240) | distance : (packed[index]! & 15) | (distance << 4);
});
await mkdir("public/solver", {recursive: true});
await writeFile("public/solver/optimal-2x2.v2.bin", new Uint8Array(encodeOptimal2x2Tables({distance: packed})));
