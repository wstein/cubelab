import {expect, test} from "vitest";

import {practiceScramble} from "../../src/client/scramble/practice";

const axis = (face: string): number => face === "U" || face === "D" ? 0 : face === "R" || face === "L" ? 1 : 2;

test("creates a bounded 20-turn fallback without adjacent or sandwich reversals", () => {
  let seed = 0;
  const random = () => ((seed = (seed + 37) % 101) / 101);
  const faces = practiceScramble(random).split(" ").map((token) => token[0]!);
  expect(faces).toHaveLength(20);
  faces.forEach((face, index) => {
    expect(face).toMatch(/^[URFDLB]$/);
    if (index > 0) expect(face).not.toBe(faces[index - 1]);
    if (index > 1 && face === faces[index - 2]) expect(axis(face)).not.toBe(axis(faces[index - 1]!));
  });
});
