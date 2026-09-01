import {describe, expect, test} from "vitest";
import * as MoveExecutor from "../../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../../src/Move/MoveParser.res.mjs";
import * as MoveTransform from "../../src/Move/MoveTransform.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import {importedPatterns} from "../../src/client/patterns.generated";
import {patternStateFromAlgorithm} from "../../src/client/pattern-state";
import {patternsForSize, recognizePattern} from "../../src/client/patterns";

describe("imported pattern catalog", () => {
  test("contains every source record from 2x2 through 5x5", () => {
    expect(patternsForSize(2)).toHaveLength(89);
    expect(patternsForSize(3)).toHaveLength(112);
    expect(patternsForSize(4)).toHaveLength(13);
    expect(patternsForSize(5)).toHaveLength(15);
  });

  test.each([2, 3, 4, 5])("recognizes and replay-solves every %ix%i construction", (size) => {
    for (const pattern of patternsForSize(size)) {
      const state = patternStateFromAlgorithm(size, pattern.construction);
      const recognized = recognizePattern(state);
      expect(recognized?.pattern.stateKey).toBe(pattern.stateKey);
      expect(recognized?.solution, pattern.name).not.toBeNull();
      const parsed = MoveExecutor.parseAndApply(size, `${pattern.construction} ${recognized!.solution}`);
      expect(parsed.TAG, pattern.name).toBe("Ok");
      expect(parsed.TAG === "Ok" ? parsed._0 : null).toEqual(StateTypes.solved(size)._0);
    }
  });

  test("keeps source attribution and optimality claims scoped", () => {
    expect(importedPatterns.find((pattern) => pattern.size === 2)?.solutionKind).toBe("proven optimal");
    expect(importedPatterns.find((pattern) => pattern.size === 3)?.solutionKind).toBe("known replayable");
    expect(importedPatterns.find((pattern) => pattern.size === 5)?.sourceUrl).toMatch(/^https:\/\//);
  });

  test("recognizes a reheld 2x2 and a conjugated 3x3, then adapts each solution", () => {
    const pocket = patternsForSize(2)[0];
    const pocketState = patternStateFromAlgorithm(2, pocket.construction);
    const x = MoveParser.parse(2, "x");
    expect(x.TAG).toBe("Ok");
    const reheld = MoveExecutor.applyAlg(pocketState, x._0);
    expect(reheld.TAG).toBe("Ok");
    const heldRecognition = recognizePattern(reheld._0);
    expect(heldRecognition?.pattern.name).toBe(pocket.name);
    expect(heldRecognition?.solution).not.toBeNull();
    expect(MoveExecutor.parseAndApply(2, `${pocket.construction} x ${heldRecognition!.solution}`)).toEqual(
      StateTypes.solved(2),
    );

    const standard = patternsForSize(3).find((pattern) => pattern.name === "Pons Asinorum")!;
    const parsed = MoveParser.parse(3, standard.construction);
    expect(parsed.TAG).toBe("Ok");
    const rotated = MoveTransform.rotate(parsed._0, "Y", 1);
    const conjugated = MoveExecutor.applyAlg(StateTypes.solved(3)._0, rotated);
    expect(conjugated.TAG).toBe("Ok");
    const conjugatedRecognition = recognizePattern(conjugated._0);
    expect(conjugatedRecognition?.pattern.name).toBe(standard.name);
    expect(conjugatedRecognition?.solution).not.toBeNull();
    const solvedAgain = MoveExecutor.applyAlg(
      conjugated._0,
      MoveParser.parse(3, conjugatedRecognition!.solution!)._0,
    );
    expect(solvedAgain).toEqual(StateTypes.solved(3));
  });
});
