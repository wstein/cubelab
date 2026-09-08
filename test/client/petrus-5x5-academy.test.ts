import {describe, expect, test} from "bun:test";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import * as MoveExecutor from "../../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../../src/Move/MoveParser.res.mjs";
import {
  inspectPetrus5x5State,
  petrus5x5CubieFocus,
  petrus5x5PhaseDefinitions,
  planPetrus5x5Guide,
} from "../../src/client/petrus-5x5-academy";

const parseAlg = (notation: string) => {
  const parsed = MoveParser.parseWithOptions(5, "Wide", "Modern", notation);
  if (parsed.TAG !== "Ok") throw new Error(`Parse failed for ${notation}`);
  return parsed._0;
};

describe("5×5 Petrus Academy Client Bridge", () => {
  test("defines 5 pedagogical curriculum phases", () => {
    expect(petrus5x5PhaseDefinitions.length).toBe(5);
    expect(petrus5x5PhaseDefinitions[0].title).toContain("2×2×2");
    expect(petrus5x5PhaseDefinitions[1].title).toContain("2×2×3");
    expect(petrus5x5PhaseDefinitions[2].title).toContain("EO");
    expect(petrus5x5PhaseDefinitions[3].title).toContain("Wing Pairing");
    expect(petrus5x5PhaseDefinitions[4].title).toContain("Last Layer");
  });

  test("inspects solved 5×5 state into solved phase status", () => {
    const solved = StateTypes.solved(5);
    expect(solved.TAG).toBe("Ok");
    if (solved.TAG !== "Ok") return;

    const status = inspectPetrus5x5State(solved._0);
    expect(status).not.toBeNull();
    if (!status) return;

    expect(status.ok).toBe(true);
    expect(status.phaseNumber).toBe(6);
    expect(status.phaseTitle).toBe("Cube Solved");
    expect(status.block222Progress.isComplete).toBe(true);
    expect(status.block223Progress.isComplete).toBe(true);
    expect(status.eoStatus.badCount).toBe(0);
    expect(status.wingsPaired).toBe(24);
  });

  test("generates 3D cubie focus elements for active 19-piece block", () => {
    const solved = StateTypes.solved(5);
    expect(solved.TAG).toBe("Ok");
    if (solved.TAG !== "Ok") return;

    // Scramble U/R faces
    const scrambled = MoveExecutor.applyAlg(solved._0, parseAlg("U R U' R'"));
    expect(scrambled.TAG).toBe("Ok");
    if (scrambled.TAG !== "Ok") return;

    const status = inspectPetrus5x5State(scrambled._0);
    expect(status).not.toBeNull();
    if (!status) return;

    const focusList = petrus5x5CubieFocus(status);
    expect(focusList.length).toBe(status.targetCubies.length);
    if (focusList.length > 0) {
      expect(focusList[0].source).toBeDefined();
      expect(focusList[0].target).toBeDefined();
      expect(focusList[0].label).toBe(status.phaseTitle);
    }
  });

  test("plans replay-verified guide step", () => {
    const solved = StateTypes.solved(5);
    expect(solved.TAG).toBe("Ok");
    if (solved.TAG !== "Ok") return;

    const scrambled = MoveExecutor.applyAlg(solved._0, parseAlg("U R U' R'"));
    expect(scrambled.TAG).toBe("Ok");
    if (scrambled.TAG !== "Ok") return;

    const guide = planPetrus5x5Guide(scrambled._0);
    expect(guide).not.toBeNull();
    if (!guide) return;

    expect(guide.title).toBeDefined();
    expect(guide.instruction).toBeDefined();
  });
});
