import {test, expect} from "@playwright/test";
import {readdirSync} from "node:fs";
import * as Executor from "../src/Move/MoveExecutor.res.mjs";
import * as Centers from "../src/Solver/PictureCenters.res.mjs";
import * as State from "../src/State/StateTypes.res.mjs";

test("the production worker solves the physical center goal and rejects impossible pictures", async ({page}) => {
  const filename = readdirSync(new URL("../dist/_astro/", import.meta.url)).find(name => /^solver\.worker[-.].*\.js$/.test(name));
  expect(filename).toBeTruthy();
  await page.goto("/");
  const cube = Executor.parseAndApply(3, "U R L U2 R' L'")._0;
  const result = await page.evaluate(async ({url, cube}) => {
    const worker = new Worker(url, {type: "module"});
    try {
      const ask = (id, state) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error("Picture worker did not answer")), 10000);
        worker.onmessage = ({data}) => {if (data.id === id) {clearTimeout(timer); resolve(data);}};
        worker.onerror = event => {clearTimeout(timer); reject(Error(event.message));};
        worker.postMessage({id, type: "solvePicture", state});
      });
      const valid = await ask(1, {cube, orientations: [3,0,0,0,0,0], symmetry: [4,4,4,4,4,4], maximumDepth: 6, maximumNodes: 1000000});
      // This ordinary color state has odd permutation parity; six zero
      // center orientations would make its physical picture unreachable.
      const invalid = await ask(2, {cube, orientations: [0,0,0,0,0,0], symmetry: [4,4,4,4,4,4], maximumDepth: 6, maximumNodes: 1000000});
      return {valid, invalid};
    } finally {worker.terminate();}
  }, {url: `/_astro/${filename}`, cube});
  expect(result.valid.ok).toBe(true);
  expect(result.valid.solution.moveCount).toBeLessThanOrEqual(6);
  expect(Executor.applyAlg(cube, result.valid.solution.alg)._0).toEqual(State.solved(3)._0);
  expect(Centers.apply([3,0,0,0,0,0], result.valid.solution.alg)._0).toEqual([0,0,0,0,0,0]);
  expect(result.invalid.ok).toBe(false);
  expect(result.invalid.error).toContain("parity");
});
