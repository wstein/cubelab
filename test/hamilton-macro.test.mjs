import {describe, expect, test} from "vitest";

import {measure, parse} from "../src/Move/HamiltonMacro.ts";

describe("Hamilton macro programs", () => {
  test("measures recursive definitions without unfolding them", () => {
    const program = parse(`
      # quarter-turn example
      V = U'
      b = U R U R U R
      a = b U R U R
      c = V R a
      export c
    `);
    expect(measure(program)).toMatchObject({quarterTurns: 12n, depth: 3});
    expect(measure(program, "b").quarterTurns).toBe(6n);
  });

  test("supports multiline groups and detects macro cycles", () => {
    const program = parse(`def a = (U R)3\ndef b = a a\nexport b`);
    expect(measure(program).quarterTurns).toBe(12n);
    expect(() => measure(parse(`def a = b\ndef b = a\nexport a`))).toThrow(/a -> b -> a/);
  });
});
