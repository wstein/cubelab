import {describe, expect, test} from "vitest";
import * as MoveExecutor from "../../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../../src/Move/MoveParser.res.mjs";
import * as MoveTransform from "../../src/Move/MoveTransform.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import {importedPatterns} from "../../src/client/patterns.generated";
import {patternStateFromAlgorithm} from "../../src/State/PatternState.res.mjs";
import {patternsForSize, recognizePattern, extremalStateFor} from "../../src/client/patterns";

describe("imported pattern catalog", () => {
  test("contains every imported and curated record from 2x2 through 5x5", () => {
    expect(patternsForSize(2)).toHaveLength(89);
    expect(patternsForSize(3)).toHaveLength(113);
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

describe("mathematical antipodes and extremal states", () => {
  test("tags proven God's-number antipodes with their academic reference", () => {
    const superflip = extremalStateFor("Superflip");
    expect(superflip?.referenceUrl).toBe("https://en.wikipedia.org/wiki/Superflip");
    expect(superflip?.label).toMatch(/20 HTM/);

    const fourspot = extremalStateFor("Superflip + Fourspot");
    expect(fourspot?.referenceUrl).toBe("https://cube20.org/qtm/");
    expect(fourspot?.label).toMatch(/26 QTM/);

    expect(extremalStateFor("Pons Asinorum")).toBeNull();
  });

  test("the extremal filter narrows the 3x3 catalog to only tagged patterns", () => {
    const tagged = patternsForSize(3, "", true);
    expect(tagged.length).toBeGreaterThan(0);
    for (const pattern of tagged) {
      expect(extremalStateFor(pattern.name)).not.toBeNull();
    }
    expect(tagged.some((pattern) => pattern.name === "Superflip")).toBe(true);
    expect(tagged.some((pattern) => pattern.name === "Superflip + Fourspot")).toBe(true);
    expect(tagged.length).toBeLessThan(patternsForSize(3).length);
  });

  test("Superflip + Fourspot replay-verifies at exactly 26 quarter turns", () => {
    const pattern = patternsForSize(3).find((entry) => entry.name === "Superflip + Fourspot")!;
    const parsed = MoveParser.parse(3, pattern.construction);
    expect(parsed.TAG).toBe("Ok");
    const expanded = MoveExecutor.expand(parsed.TAG === "Ok" ? parsed._0 : []);
    expect(expanded.TAG).toBe("Ok");
    const qtm = expanded.TAG === "Ok"
      ? expanded._0.reduce((sum, step) => sum + (((step.turns % 4) + 4) % 4 === 2 ? 2 : 1), 0)
      : -1;
    expect(qtm).toBe(26);
  });
});
