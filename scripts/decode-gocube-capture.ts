// Decodes a raw BLE capture (JSONL, one {t, dir, dev, char, hex} record per line)
// of a GoCube's notify characteristic into the GYRO/MOVE event stream CubeLab's
// gyro pipeline actually consumes, for use as a replay fixture in
// test/client/smart-cube/gocube-replay.test.ts.
//
// Usage: bun scripts/decode-gocube-capture.ts <capture.jsonl> [output.json]

import {readFileSync, writeFileSync} from "node:fs";
import {
  AXIS_PERM,
  gocubeChecksumValid,
  OPPOSITE_AXIS,
} from "../src/client/smart-cube/fast-gocube";

const NOTIFY_CHARACTERISTIC = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

// smartcube-web-bluetooth's own GoCube parser (what actually runs at connect time)
// remaps raw UART (rx,ry,rz,rw) to (nx,-nz,-ny,nw); CubeLab's bridge
// (src/client/smart-cube/bluetooth.ts) swaps it straight back before
// deviceOrientationDelta's own "gocube-wire" basis transform runs. The two swaps
// cancel, so replaying the truly raw values tagged "gocube-wire" is equivalent to
// what handleSmartCubeEvent actually receives.
const parseRawOrientationPayload = (payloadUtf8: string): {x: number; y: number; z: number; w: number} | null => {
  const parts = payloadUtf8.split("#");
  if (parts.length !== 4) return null;
  const [rx, ry, rz, rw] = parts.map((part) => Number.parseInt(part.trim(), 10));
  if (![rx, ry, rz, rw].every((value): value is number => Number.isFinite(value))) return null;
  const len = Math.hypot(rx!, ry!, rz!, rw!);
  if (len === 0) return null;
  return {x: rx! / len, y: ry! / len, z: rz! / len, w: rw! / len};
};

type FixtureEvent =
  | {t: number; type: "GYRO"; quaternion: {x: number; y: number; z: number; w: number}; coordinateFrame: "gocube-wire"}
  | {t: number; type: "MOVE"; move: string};

const [, , inputPath, outputPath] = process.argv;
if (!inputPath) {
  console.error("Usage: bun scripts/decode-gocube-capture.ts <capture.jsonl> [output.json]");
  process.exit(1);
}

const lines = readFileSync(inputPath, "utf8").split("\n").filter(Boolean);
const events: FixtureEvent[] = [];
let lastMoveMeta: {axis: number; dirBit: number} | null = null;
let t0: number | null = null;

for (const line of lines) {
  const record = JSON.parse(line) as {t: number; char: string; hex: string};
  if (record.char !== NOTIFY_CHARACTERISTIC) continue;
  const bytes = Buffer.from(record.hex, "hex");
  if (bytes.length < 4) continue;
  if (bytes[0] !== 0x2a || bytes[bytes.length - 2] !== 0x0d || bytes[bytes.length - 1] !== 0x0a) continue;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 7 && !gocubeChecksumValid(view)) continue;
  if (t0 === null) t0 = record.t;
  const t = (record.t - t0) / 1000;
  const msgType = bytes[2];

  if (msgType === 3) {
    if (bytes.length < 8) continue;
    const payload = bytes.subarray(3, bytes.length - 3).toString("utf8");
    const quaternion = parseRawOrientationPayload(payload);
    if (quaternion) events.push({t, type: "GYRO", quaternion, coordinateFrame: "gocube-wire"});
    continue;
  }

  if (msgType === 1) {
    const msgLen = bytes.length - 6;
    if (bytes.length < 8) {
      if (lastMoveMeta) {
        const oppAxis = OPPOSITE_AXIS[lastMoveMeta.axis]!;
        const newDirBit = 1 - lastMoveMeta.dirBit;
        const power = [0, 2][newDirBit]!;
        const move = ("URFDLB".charAt(oppAxis) + " 2'".charAt(power)).trim();
        lastMoveMeta = {axis: oppAxis, dirBit: newDirBit};
        events.push({t, type: "MOVE", move});
      }
      continue;
    }
    for (let i = 0; i < msgLen; i += 2) {
      const axis = AXIS_PERM[bytes[3 + i]! >> 1]!;
      const dirBit = bytes[3 + i]! & 1;
      const power = [0, 2][dirBit]!;
      const move = ("URFDLB".charAt(axis) + " 2'".charAt(power)).trim();
      lastMoveMeta = {axis, dirBit};
      events.push({t, type: "MOVE", move});
    }
  }
}

const destination = outputPath ?? inputPath.replace(/\.jsonl?$/, ".json");
writeFileSync(destination, JSON.stringify(events));
console.log(`Decoded ${events.length} events (${events.filter((e) => e.type === "GYRO").length} GYRO, ${events.filter((e) => e.type === "MOVE").length} MOVE) -> ${destination}`);
