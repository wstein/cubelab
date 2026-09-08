import { describe, expect, it } from "bun:test";
import * as CubieCube from "../../src/Solver/Cube555/CubieCube555.res.mjs";
import * as Util from "../../src/Solver/Cube555/Util555.res.mjs";
import * as Phase1Center from "../../src/Solver/Cube555/Phase1Center555.res.mjs";
import * as Phase2Center from "../../src/Solver/Cube555/Phase2Center555.res.mjs";

describe("CubieCube555 foundational logic", () => {
  it("initializes a solved 5x5 cubie cube", () => {
    const cube = CubieCube.makeSolved();
    expect(cube.tCenter).toHaveLength(24);
    expect(cube.xCenter).toHaveLength(24);
    expect(cube.mEdge).toHaveLength(12);
    expect(cube.wEdge).toHaveLength(24);

    // Verify center faces 0..5
    for (let i = 0; i < 24; i++) {
      expect(cube.tCenter[i]).toBe(Math.floor(i / 4));
      expect(cube.xCenter[i]).toBe(Math.floor(i / 4));
    }
  });

  it("applies moves and inverse returns to solved state", () => {
    const cube = CubieCube.makeSolved();
    // Move 0 is U, move 2 is U'
    CubieCube.doMove(cube, Util.ux1);
    expect(cube.wEdge[0]).not.toBe(0);

    CubieCube.doMove(cube, Util.ux3);
    const solved = CubieCube.makeSolved();
    expect(cube.tCenter).toEqual(solved.tCenter);
    expect(cube.xCenter).toEqual(solved.xCenter);
    expect(cube.mEdge).toEqual(solved.mEdge);
    expect(cube.wEdge).toEqual(solved.wEdge);
  });

  it("sexy move (R U R' U') repeated 6 times restores cube", () => {
    const cube = CubieCube.makeSolved();
    const solved = CubieCube.makeSolved();
    for (let rep = 0; rep < 6; rep++) {
      CubieCube.doMove(cube, Util.rx1); // R
      CubieCube.doMove(cube, Util.ux1); // U
      CubieCube.doMove(cube, Util.rx3); // R'
      CubieCube.doMove(cube, Util.ux3); // U'
    }
    expect(cube.tCenter).toEqual(solved.tCenter);
    expect(cube.xCenter).toEqual(solved.xCenter);
    expect(cube.mEdge).toEqual(solved.mEdge);
    expect(cube.wEdge).toEqual(solved.wEdge);
  });

  it("inner slice sexy move (2R 2U 2R' 2U') repeated 6 times restores centers and wings", () => {
    const cube = CubieCube.makeSolved();
    const solved = CubieCube.makeSolved();
    for (let rep = 0; rep < 6; rep++) {
      CubieCube.doMove(cube, Util.sliceRx1); // 2R
      CubieCube.doMove(cube, Util.sliceUx1); // 2U
      CubieCube.doMove(cube, Util.sliceRx3); // 2R'
      CubieCube.doMove(cube, Util.sliceUx3); // 2U'
    }
    expect(cube.tCenter).toEqual(solved.tCenter);
    expect(cube.xCenter).toEqual(solved.xCenter);
    expect(cube.wEdge).toEqual(solved.wEdge);
  });

  it("calculates combinatorial rank C(n, k) and combinations correctly", () => {
    expect(Util.cnk[24][8]).toBe(735471);
    expect(Util.cnk[16][8]).toBe(12870);

    const comb = new Array(24).fill(-1);
    // Set 8 items
    Util.setComb(comb, 0, 8, 24);
    const count = comb.filter((x: number) => x === 0).length;
    expect(count).toBe(8);

    const recovered = Util.getComb(comb, 8, 24);
    expect(recovered).toBe(0);
  });
});

describe("Phase1Center555 coordinate reduction", () => {
  it("initializes to solved coordinates 0 for both T and X centers", () => {
    const center = Phase1Center.make();
    expect(Phase1Center.getTCenter(center)).toBe(0);
    expect(Phase1Center.getXCenter(center)).toBe(0);
  });

  it("roundtrips arbitrary coordinates correctly", () => {
    const center = Phase1Center.make();
    Phase1Center.setTCenter(center, 42);
    expect(Phase1Center.getTCenter(center)).toBe(42);

    Phase1Center.setXCenter(center, 1337);
    expect(Phase1Center.getXCenter(center)).toBe(1337);
  });

  it("restores coordinate after full 4 quarter turns", () => {
    const center = Phase1Center.make();
    // 4 quarter turns of R slice
    for (let i = 0; i < 4; i++) {
      Phase1Center.doMove(center, Util.sliceRx1);
    }
    expect(Phase1Center.getTCenter(center)).toBe(0);
    expect(Phase1Center.getXCenter(center)).toBe(0);
  });
});

describe("Phase2Center555 coordinate reduction", () => {
  it("initializes Phase 2 centers to coordinate 0 and even parity", () => {
    const center = Phase2Center.make();
    expect(Phase2Center.getTCenter(center)).toBe(0);
    expect(Phase2Center.getXCenter(center)).toBe(0);
    expect(center.eParity).toBe(0);
  });

  it("roundtrips arbitrary Phase 2 coordinates within 0..12869", () => {
    const center = Phase2Center.make();
    Phase2Center.setTCenter(center, 4242);
    expect(Phase2Center.getTCenter(center)).toBe(4242);

    Phase2Center.setXCenter(center, 9999);
    expect(Phase2Center.getXCenter(center)).toBe(9999);
  });

  it("applies valid Phase 2 moves and toggles parity accurately", () => {
    const center = Phase2Center.make();
    // Move 13 in Phase 2 is sliceRx1 which toggles parity (eParityDiff[13] === 1)
    Phase2Center.doMove(center, 13);
    expect(center.eParity).toBe(1);

    // Another sliceRx1 toggles it again
    Phase2Center.doMove(center, 13);
    expect(center.eParity).toBe(0);
  });
});

