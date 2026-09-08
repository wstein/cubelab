import { describe, expect, it } from "bun:test";
import * as CubieCube from "../../src/Solver/Cube555/CubieCube555.res.mjs";
import * as Util from "../../src/Solver/Cube555/Util555.res.mjs";

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
