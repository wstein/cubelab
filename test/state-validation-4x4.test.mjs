import {expect, test} from "vitest";

import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";
import {validate4x4} from "../src/State/StateValidation4x4.ts";

const state = (algorithm) => {
  const applied = MoveExecutor.parseAndApply(4, algorithm);
  if (applied.TAG !== "Ok") throw new Error(String(applied._0));
  return applied._0;
};

test("accepts legal outer, inner, and wide-turn 4×4 states", () => {
  expect(validate4x4(StateTypes.solved(4)._0)).toBeNull();
  for (const algorithm of [
    "R U F2 L' B D2",
    "2R 2U' 2F2 2L 2B' 2D2",
    "Rw Uw' Fw2 Lw Dw B'",
    "R 2R U 2U' Fw L2 2B'",
  ]) {
    expect(validate4x4(state(algorithm))).toBeNull();
  }
});

test("rejects the reported impossible F/D wing-sticker swap despite valid quotas", () => {
  const compact = "UUUUUUUUUUUUUUUURRRRRRRRRRRRRRRRFFFFFFFFFFFFFDFFDDFDDDDDDDDDDDDDLLLLLLLLLLLLLLLLBBBBBBBBBBBBBBBB";
  const parsed = FaceletCodec.parse(4, compact);
  expect(parsed.TAG).toBe("Ok");
  if (parsed.TAG === "Ok") {
    expect(validate4x4(parsed._0)).toMatch(/wings/);
  }
});

test("rejects a broken centre inventory", () => {
  const compact = FaceletCodec.render(StateTypes.solved(4)._0);
  const stickers = [...compact];
  [stickers[5], stickers[17]] = [stickers[17], stickers[5]];
  const corrupt = stickers.join("");
  const parsed = FaceletCodec.parse(4, corrupt);
  expect(parsed.TAG).toBe("Ok");
  if (parsed.TAG === "Ok") {
    expect(validate4x4(parsed._0)).toMatch(/centres/);
  }
});
