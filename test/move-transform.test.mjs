import assert from "node:assert/strict";
import {test} from "vitest";

import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../src/Move/MoveParser.res.mjs";
import * as MoveTransform from "../src/Move/MoveTransform.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";

const parse = (size, input) => {
  const result = MoveParser.parse(size, input);
  assert.equal(result.TAG, "Ok", result._0?.message);
  return result._0;
};

const serialize = (alg) => MoveTransform.serialize(alg);

const parseDialect = (size, dialect, input) => {
  const result = MoveParser.parseWithOptions(size, "Wide", dialect, input);
  assert.equal(result.TAG, "Ok", result._0?.message);
  return result._0;
};

const compact = (size, input) => {
  const result = MoveExecutor.parseAndApply(size, input);
  assert.equal(result.TAG, "Ok", result._0);
  return FaceletCodec.render(result._0);
};

test("serializes every supported structured editor node canonically", () => {
  const input = "(Rw U)3 [R, U]' 2R [F: U2] . @1.3s /* inspect */";
  const rendered = serialize(parse(4, input));
  assert.equal(rendered, "(Rw U)3 [R, U]' 2R [F: U2] . @1.3s /* inspect */");
  assert.equal(compact(4, rendered), compact(4, input));
});

test("serializes native Jaap and SSE notation while preserving structure", () => {
  const source = parse(3, "M E S x y z R L' U D F B' (R U)2");
  assert.equal(
    MoveTransform.serializeJaap(source),
    "Rm' Um' Fm Rc Uc Fc Rs Ua Fs (R U)2",
  );
  assert.equal(
    MoveTransform.serializeSse(source, 3),
    "MR' MU' MF CR CU CF R L' U D F B' (R U)2",
  );
  assert.equal(
    MoveTransform.serializePortable(3, source),
    "2L 2D 2F x y z R L' U D F B' (R U)2",
  );
});

test("uses native size-aware SSE prefixes for wide and inner ranges", () => {
  assert.equal(
    MoveTransform.serializeSse(parse(4, "Rw 2R 2-3Fw"), 4),
    "TR MR WF",
  );
  assert.equal(
    MoveTransform.serializeSse(parse(5, "3Rw 2R 2-4Fw"), 5),
    "T3R N2R WF",
  );
});

test("dialect serializers round-trip semantically across 2×2 through 5×5", () => {
  const sources = new Map([
    [2, "R U x y z (R U)2"],
    [3, "M E S x y z R L' U D F B' (R U)2"],
    [4, "Rw 2R 2-3Fw x y z (R U)2"],
    [5, "3Rw 2R 2-4Fw M E S x y z (R U)2"],
  ]);

  for (const [size, notation] of sources) {
    const source = parse(size, notation);
    const expected = compact(size, notation);
    const outputs = [
      ["Modern", MoveTransform.serialize(source)],
      ["Jaap", MoveTransform.serializeJaap(source)],
      ["Sse", MoveTransform.serializeSse(source, size)],
      ["Modern", MoveTransform.serializePortable(size, source)],
    ];
    for (const [dialect, output] of outputs) {
      const reparsed = parseDialect(size, dialect, output);
      const applied = MoveExecutor.applyAlg(
        StateTypes.solved(size)._0,
        reparsed,
      );
      assert.equal(applied.TAG, "Ok", `${size}×${size} ${dialect}: ${output}`);
      assert.equal(
        FaceletCodec.render(applied._0),
        expected,
        `${size}×${size} ${dialect}: ${output}`,
      );
    }
  }
});

test("inverts structured algorithms without flattening them", () => {
  const source = "R U [F, R] (U D)2 . @0.8s /* finish */";
  const inverse = serialize(MoveTransform.invert(parse(3, source)));
  assert.equal(inverse, "/* finish */ @0.8s . (U D)2' [F, R]' U' R'");
  assert.equal(compact(3, `${source} ${inverse}`), compact(3, ""));
  assert.equal(serialize(MoveTransform.invert(parse(3, "F2 R5"))), "R' F2");
});

test("simplifies same-axis runs and preserves editor boundaries", () => {
  const result = MoveTransform.simplify(parse(3, "R L R' U U U' . F4 /* keep */ B B2 B"));
  assert.equal(result.TAG, "Ok");
  const rendered = serialize(result._0);
  assert.equal(rendered, "L U . /* keep */");
  assert.equal(
    compact(3, rendered),
    compact(3, "R L R' U U U' . F4 /* keep */ B B2 B"),
  );
});

test("mirrors all three coordinate planes as involutions", () => {
  const source = parse(3, "R U F M E S x y z [R: U]");
  assert.equal(serialize(MoveTransform.mirror(source, "LR")), "L' U' F' M E' S' x y' z' [L': U']");
  for (const plane of ["LR", "FB", "UD"]) {
    const twice = MoveTransform.mirror(MoveTransform.mirror(source, plane), plane);
    assert.equal(serialize(twice), serialize(source));
  }
});

test("rotates notation by conjugating the selected coordinate frame", () => {
  const source = parse(3, "R U R' M E S x y z");
  const rotated = serialize(MoveTransform.rotate(source, "Y", 1));
  assert.equal(rotated, "F U F' S' E M z y x'");
  assert.equal(compact(3, rotated), compact(3, "y' R U R' M E S x y z y"));
  assert.equal(serialize(MoveTransform.rotate(source, "Y", 4)), serialize(source));
});

test("unfolds M, E, and S into exact size-aware inner layers without flattening structure", () => {
  const source = "((M' U)4 x y)2 (M' U)4";
  const unfolded = MoveTransform.unfoldSlices(parse(5, source), 5);
  assert.equal(serialize(unfolded), "((3L' U)4 x y)2 (3L' U)4");
  assert.equal(compact(5, serialize(unfolded)), compact(5, source));

  for (const size of [3, 5]) {
    const transformed = serialize(MoveTransform.unfoldSlices(parse(size, "M E S"), size));
    const depth = Math.floor(size / 2) + 1;
    assert.equal(transformed, `${depth}L ${depth}D ${depth}F`);
    assert.equal(compact(size, transformed), compact(size, "M E S"));
  }
});

test("optimizes paired opposite 3x3 face turns into slices and trailing regrips", () => {
  const source = parse(3, "L' R B' F D' U L' R");
  const optimized = MoveTransform.optimizeRegrips(3, source);

  assert.equal(serialize(optimized), "M E' M' E x y");
  assert.equal(compact(3, serialize(optimized)), compact(3, "L' R B' F D' U L' R"));
});

test("collapses opposite half turns into size-aware M/S/E interior blocks", () => {
  const source = "L2 R2 B2 F2 D2 U2";
  const expected = new Map([
    [3, "M2 S2 E2"],
    [4, "2-3Lw2 2-3Fw2 2-3Dw2"],
    [5, "2-4Lw2 2-4Fw2 2-4Dw2"],
  ]);

  for (const size of [3, 4, 5]) {
    const optimized = MoveTransform.optimizeRegrips(size, parse(size, source));
    const rendered = serialize(optimized);
    assert.equal(rendered, expected.get(size));
    assert.equal(compact(size, rendered), compact(size, source), `${size}×${size} half-turn collapse`);
  }
});

test("accepts portable and dialect-specific Workbench spelling for the half-turn collapse", () => {
  // Modern is the shared WCA/SiGN-compatible outer-turn token subset. SSE
  // additionally permits adjacent tokens without whitespace.
  const expected = new Map([
    [3, "M2 S2 E2"],
    [4, "2-3Lw2 2-3Fw2 2-3Dw2"],
    [5, "2-4Lw2 2-4Fw2 2-4Dw2"],
  ]);
  for (const [dialect, sourceForSize] of [
    ["Modern", () => "L2 R2 B2 F2 D2 U2"],
    [
      "Ruwix",
      (size) => size >= 4
        ? "L' L' R' R' B' B' F' F' D' D' U' U'"
        : "L2 R2 B2 F2 D2 U2",
    ],
    ["Fmc", () => "L2 R2 B2 F2 D2 U2"],
    ["Twizzle", () => "L2 R2 B2 F2 D2 U2"],
    ["Sse", () => "L2R2B2F2D2U2"],
    ["Acube", () => "L2 R2 B2 F2 D2 U2"],
  ]) {
    for (const size of [3, 4, 5]) {
      const source = sourceForSize(size);
      const parsed = MoveParser.parseWithOptions(size, "Wide", dialect, source);
      assert.equal(parsed.TAG, "Ok", `${size}×${size} ${dialect}: ${parsed._0?.message ?? "parse failed"}`);
      assert.equal(
        serialize(MoveTransform.optimizeRegrips(size, parsed._0)),
        expected.get(size),
        `${size}×${size} ${dialect}`,
      );
    }
  }
});

test("optimizes every face plus its matching slice into a wide turn", () => {
  for (const [source, expected] of [
    ["R M'", "Rw"], ["L M", "Lw"], ["U E'", "Uw"],
    ["D E", "Dw"], ["F S", "Fw"], ["B S'", "Bw"],
  ]) {
    const optimized = MoveTransform.optimizeRegrips(3, parse(3, source));
    assert.equal(serialize(optimized), expected);
    assert.equal(compact(3, serialize(optimized)), compact(3, source));
  }
});

test("does not synthesize a slice from unmatched opposite face turns", () => {
  assert.equal(serialize(MoveTransform.optimizeRegrips(3, parse(3, "L R U"))), "L R U");
});

test("does not move a regrip across a comment boundary", () => {
  const source = "L' R /* hold frame */ B' F";
  const optimized = MoveTransform.optimizeRegrips(3, parse(3, source));
  assert.equal(serialize(optimized), "M x /* hold frame */ S' z");
  assert.equal(compact(3, serialize(optimized)), compact(3, source));
});

test("expands unfolded slices and regrips back into outer face turns", () => {
  const source = "2L 2D' 2L' 2D x y";
  const expanded = MoveTransform.expandRegripsToFaces(3, parse(3, source));
  assert.equal(serialize(expanded), "L' R B' F D' U L' R");
  assert.equal(compact(3, serialize(expanded)), compact(3, source));
});

test("optimizes and expands regrips with exact size-aware layer ranges", () => {
  const source = "L' R B' F D' U L' R";
  for (const size of [2, 3, 4, 5]) {
    const optimized = MoveTransform.optimizeRegrips(size, parse(size, source));
    const rendered = serialize(optimized);
    assert.equal(compact(size, rendered), compact(size, source), `${size}×${size} optimize`);
    if (size === 4) assert.match(rendered, /2-3Lw/);
    if (size === 5) assert.match(rendered, /2-4Lw/);
    const expanded = MoveTransform.expandRegripsToFaces(size, optimized);
    assert.equal(compact(size, serialize(expanded)), compact(size, source), `${size}×${size} expand`);
  }
});

test("factors commutators, conjugates, and repeats for every supported size", () => {
  for (const size of [2, 3, 4, 5]) {
    for (const [source, expected] of [
      ["R U R' U'", "[R, U]"],
      ["R U R'", "[R: U]"],
      ["R U R U", "(R U)2"],
      ["R F U L F' R' L' U'", "[R F, U L]"],
    ]) {
      const factored = MoveTransform.factorStructure(parse(size, source));
      assert.equal(serialize(factored), expected, `${size}×${size}: ${source}`);
      assert.equal(compact(size, serialize(factored)), compact(size, source));
    }
  }
});

test("factors unfolded and named slice commutators before their regrips", () => {
  for (const [source, expected] of [
    ["2L 2D' 2L' 2D x y", "[2L, 2D'] x y"],
    ["M E' M' E x y", "[M, E'] x y"],
  ]) {
    const factored = MoveTransform.factorStructure(parse(3, source));
    assert.equal(serialize(factored), expected);
    assert.equal(compact(3, serialize(factored)), compact(3, source));
  }
});

test("does not factor across a comment boundary", () => {
  const source = "R U /* keep */ R' U'";
  assert.equal(serialize(MoveTransform.factorStructure(parse(3, source))), source);
});

test("generates bounded size-aware practice scrambles without adjacent equal axes", () => {
  const expectedLengths = new Map([[2, 11], [3, 25], [4, 45], [5, 60]]);
  for (const [size, expectedLength] of expectedLengths) {
    const result = MoveTransform.practiceScrambleWithRandom(size, () => 0);
    assert.equal(result.TAG, "Ok", result._0);
    const units = parse(size, result._0);
    assert.equal(units.length, expectedLength);
    const axes = units.map((unit) => MoveTransform.moveAxis(unit.desc._0));
    for (let index = 1; index < axes.length; index += 1) {
      assert.notEqual(axes[index], axes[index - 1]);
    }
  }
  assert.equal(MoveTransform.practiceScramble(6).TAG, "Error");
});

test("5×5 practice scrambles never rotate the core centre frame", () => {
  const families = MoveTransform.practiceFamilies(5).map(([name]) => name);
  for (const family of families) {
    assert.doesNotMatch(family, /^3/, `Practice family ${family} must not use 3-layer turns`);
  }

  // Verify multiple pseudo-random scrambles maintain the canonical core centre frame
  for (let seed = 1; seed <= 10; seed += 1) {
    let state = seed;
    const rng = () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
    const scramble = MoveTransform.practiceScrambleWithRandom(5, rng);
    assert.equal(scramble.TAG, "Ok");
    assert.doesNotMatch(scramble._0, /\b3[URFDLB]w/, "Scramble must not include 3-layer wide moves");

    const applied = MoveExecutor.parseAndApply(5, scramble._0);
    assert.equal(applied.TAG, "Ok");
    const coreCentres = applied._0.facelets.map((face) => face[12]);
    assert.deepEqual(coreCentres, ["U", "L", "F", "R", "B", "D"], "Core centres must remain unrotated");
  }
});
