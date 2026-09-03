import {describe, expect, test} from "vitest";

import {createStreamPlayer, importAlg, measure, parse, prefix, streamEvents, unfold, window} from "../src/Move/HamiltonMacro.ts";

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

  test("streams selected macro prefixes and inverses without unfolding the root", () => {
    const program = parse(`def b = U R\ndef a = (b)2 b'\nexport a`);
    expect(prefix(program, 10)).toEqual(["U", "R", "U", "R", "R'", "U'"]);
    expect(prefix(program, 2, "b")).toEqual(["U", "R"]);
  });

  test("measures and streams source-element slices independently of move offsets", () => {
    const program = parse(`def t = U a R a\ndef a = (F D)2\ndef excerpt = t(1,3)\nexport excerpt`);
    expect(measure(program)).toMatchObject({quarterTurns: 5n, sourceElements: 2n});
    expect(prefix(program, 12)).toEqual(["F", "D", "F", "D", "R"]);
    expect(window(program, 2n, 3)).toEqual(["F", "D", "R"]);
  });

  test("imports legacy .alg source with an implicit final-definition root", () => {
    const imported = importAlg("\uFEFFb = U R\r\na = (b)3\r\n");
    expect(imported.implicitExport).toBe(true);
    expect(imported.program.exportName).toBe("a");
    expect(measure(imported.program).quarterTurns).toBe(6n);
  });

  test("keeps one resumable cursor for streaming playback", () => {
    const player = createStreamPlayer(parse("def root = (U R)2\nexport root"));
    expect(player.next().value).toEqual({kind: "move", token: "U"});
    expect(player.movesPlayed).toBe(1n);
    expect(player.next().value).toEqual({kind: "move", token: "R"});
    expect(player.movesPlayed).toBe(2n);
    expect(player.done).toBe(false);
  });

  test("supports bracket expressions, timed pauses, and bare expression roots", () => {
    const named = parse("s100 = ([R',U]6 [F:D']@0.6s)100\ns100");
    expect(named.exportName).toBe("s100");
    expect(measure(named)).toMatchObject({quarterTurns: 2700n});
    expect(prefix(named, 4)).toEqual(["R'", "U", "R", "U'"]);

    const bare = parse("([R',U]6 [F:D']@0.6s)100");
    expect(measure(bare).quarterTurns).toBe(2700n);
    expect([...streamEvents(parse("[F:D']@0.6s"))]).toEqual([
      {kind: "move", token: "F"},
      {kind: "move", token: "D'"},
      {kind: "move", token: "F'"},
      {kind: "pause", durationMs: 600},
    ]);
  });

  test("keeps top-level root expressions separate from preceding definitions", () => {
    const program = parse(`
      a = U R D' L' F' B'
      a [F, D']4 a U2 a

      b = R U R' F2 R U R' F2
      (b a')12 b
    `);
    expect(program.exportName).toBe("__expression__");
    expect(measure(program, "a").quarterTurns).toBe(6n);
    expect(measure(program, "b").quarterTurns).toBe(10n);
    expect(prefix(program, 8)).toEqual(["U", "R", "D'", "L'", "F'", "B'", "F", "D'"]);
    expect(measure(program).quarterTurns).toBe(238n);
    expect(() => parse("a = U, R\na")).toThrow(/expected a token/);
  });

  test("materializes only bounded macro programs for the ordinary move tape", () => {
    const program = parse("a = U R\na @0.6s a");
    expect(unfold(program, 4)).toEqual([
      {kind: "move", token: "U"},
      {kind: "move", token: "R"},
      {kind: "pause", durationMs: 600},
      {kind: "move", token: "U"},
      {kind: "move", token: "R"},
    ]);
    expect(() => unfold(program, 3)).toThrow(/3-move limit/);
  });
});
