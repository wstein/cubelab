import {expect, test} from "vitest";

import * as FaceletCodec from "../../src/State/FaceletCodec.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import {validate4x4} from "../../src/State/StateValidation4x4.res.mjs";
import {looksLikeJaapCycleState, parseJaapCycleState, renderJaapCycleState} from "../../src/client/jaap-cycle-state";

const example = "(UFl,DBl)(UbR,DbL)(dFR,dBL)(UBr,DFr)(UfL,DfR)(uFL,uBR)";

test("detects Jaap mixed-case cubie cycles without claiming move algorithms", () => {
  expect(looksLikeJaapCycleState(example)).toBe(true);
  expect(looksLikeJaapCycleState("(R U R' U')3")).toBe(false);
  expect(looksLikeJaapCycleState("(URF,UBR) (UF,UB)")).toBe(false);
});

test("parses Jaap's six wing swaps as a physically valid 4x4 state", () => {
  const first = parseJaapCycleState(example, 4);
  expect(first.TAG).toBe("Ok");
  if (first.TAG === "Error") return;
  expect(FaceletCodec.render(first._0)).not.toBe(FaceletCodec.render(StateTypes.solved(4)._0));
  expect(validate4x4(first._0)).toBeNull();
});

test("maps the two visible stickers of a Jaap wing in written order", () => {
  const parsed = parseJaapCycleState("(UFl,DBl)", 4);
  expect(parsed.TAG).toBe("Ok");
  if (parsed.TAG === "Error") return;
  // UFl's U/F colours land on DBl's D/B stickers; the reverse lands on U/F.
  expect(parsed._0.facelets[5][13]).toBe("U");
  expect(parsed._0.facelets[4][14]).toBe("F");
  expect(parsed._0.facelets[0][13]).toBe("D");
  expect(parsed._0.facelets[2][1]).toBe("B");
});

test("rejects malformed, repeated, mixed-kind, and wrong-size cycles", () => {
  expect(parseJaapCycleState("(UFl,UFr)(UFl,DBl)", 4).TAG).toBe("Error");
  expect(parseJaapCycleState("(UFl,Ufr)", 4).TAG).toBe("Error");
  expect(parseJaapCycleState("(UFl,DBl)", 5).TAG).toBe("Error");
  expect(parseJaapCycleState("(UFl,wat)", 4).TAG).toBe("Error");
});

test("renders the published Jaap wing pattern as directly pasteable cycles", () => {
  const parsed = parseJaapCycleState(example, 4);
  expect(parsed.TAG).toBe("Ok");
  if (parsed.TAG === "Error") return;
  const rendered = renderJaapCycleState(parsed._0);
  expect(rendered.TAG).toBe("Ok");
  if (rendered.TAG === "Error") return;
  expect(looksLikeJaapCycleState(rendered._0)).toBe(true);
  const reparsed = parseJaapCycleState(rendered._0, 4);
  expect(reparsed.TAG).toBe("Ok");
  if (reparsed.TAG === "Ok") {
    expect(FaceletCodec.render(reparsed._0)).toBe(FaceletCodec.render(parsed._0));
  }
});
