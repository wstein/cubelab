import assert from "node:assert/strict";
import {describe, test} from "vitest";

import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as Orbit64Codec from "../src/State/Orbit64Codec.res.mjs";
import * as Orbit64V2 from "../src/State/Orbit64V2.res.mjs";
import * as Facelets from "../src/State/Orbit64V2Facelets.res.mjs";
import {faceletRows, frameFaces, slotTables} from "./fixtures/orbit64-v2-facelet-vectors.mjs";
import {v1StateVectors} from "./fixtures/orbit64-v2-vectors.mjs";

const ok = (result) => {
  assert.equal(result.TAG, "Ok", result.TAG === "Error" ? result._0.message : "");
  return result._0;
};

/** The error `{TAG, message}` of a result that must be an error. */
const err = (result) => {
  assert.equal(result.TAG, "Error", "expected an error value");
  return result._0;
};

const sides = (n, letters) => letters.split("").map((letter) => letter.repeat(n * n)).join(" ");
const solvedText = (n) => sides(n, "URFDLB");
const solved3 = solvedText(3);

describe("Orbit64 V2 slot tables", () => {
  test("every size from 2 to 15 equals FORMAT-V2-SLOTS.md", () => {
    assert.deepEqual(Object.keys(slotTables).map(Number), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    for (const [key, expected] of Object.entries(slotTables)) {
      const n = Number(key);
      const t = ok(Facelets.tables(n));
      assert.deepEqual(t.corners, expected.corners, `${n}x${n}x${n} corners`);
      assert.deepEqual(t.midges, expected.midges, `${n}x${n}x${n} midges`);
      assert.deepEqual(t.wings, expected.wings, `${n}x${n}x${n} wings`);
      assert.deepEqual(t.centers, expected.centers, `${n}x${n}x${n} centers`);
      assert.deepEqual(t.fixed, expected.fixed, `${n}x${n}x${n} fixed centers`);
    }
  });

  test("orbit counts follow the cube size, and every slot is a distinct facelet", () => {
    for (let n = 2; n <= 15; n += 1) {
      const t = ok(Facelets.tables(n));
      assert.equal(t.corners.length, 8);
      assert.equal(t.midges.length, n % 2 === 1 ? 12 : 0);
      assert.equal(t.wings.length, Orbit64V2.wingOrbits(n));
      assert.equal(t.centers.length, Orbit64V2.centerOrbits(n).length);
      const all = [...t.corners.flat(), ...t.midges.flat(), ...t.wings.flat(2), ...t.centers.flat(), ...t.fixed];
      assert.equal(new Set(all).size, all.length, `${n}x${n}x${n} slots overlap`);
      assert.equal(all.length, 6 * n * n, `${n}x${n}x${n} slots do not cover every facelet`);
    }
  });

  test("the reference tables are the V1 slot tables of the 4x4x4 and 5x5x5", () => {
    assert.deepEqual(ok(Facelets.tables(4)).corners, Orbit64Codec.c4);
    assert.deepEqual(ok(Facelets.tables(4)).wings[0], Orbit64Codec.w4);
    assert.deepEqual(ok(Facelets.tables(5)).corners, Orbit64Codec.c5);
    assert.deepEqual(ok(Facelets.tables(5)).midges, Orbit64Codec.e5);
    assert.deepEqual(ok(Facelets.tables(5)).wings, [Orbit64Codec.w5]);
  });

  test("the 24 whole-cube frames are Orbit64.Frame's list", () => {
    assert.deepEqual(Facelets.frameFaces, frameFaces);
    assert.equal(new Set(frameFaces).size, 24);
  });
});

describe("Orbit64 V2 independent facelet rows", () => {
  test("the fixture has rows, and covers every color entry", () => {
    // 28 color entries, two rows (canonical and framed) for each state: a deleted source row shows here.
    assert.equal(faceletRows.length, 448);
    const pairs = new Map();
    for (const [id, moves, facelets] of faceletRows) {
      const key = `${id >> 1}|${moves}|${facelets}`;
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
    assert.ok([...pairs.values()].every((count) => count === 2));
    const colorEntries = Orbit64V2.registry.filter((e) => e.model === "color").map((e) => e.id);
    assert.deepEqual([...new Set(faceletRows.map(([id]) => id))].sort((a, b) => a - b), colorEntries);
  });

  test("every row's facelets encode to its token", () => {
    for (const [id, moves, facelets, token] of faceletRows) {
      assert.equal(ok(Facelets.encode(id, facelets)), token, `entry ${id}: ${moves}`);
    }
  });

  test("every row's token decodes to its entry and facelets", () => {
    for (const [id, moves, facelets, token, canonical] of faceletRows) {
      const [entry, text] = ok(Facelets.decode(token));
      assert.equal(entry.id, id, `entry ${id}: ${moves}`);
      assert.equal(text, canonical === "" ? facelets : canonical, `entry ${id}: ${moves}`);
    }
  });

  test("every row reads to coordinates that write the same facelets back", () => {
    for (const [id, moves, facelets, token, canonical] of faceletRows) {
      const entry = Orbit64V2.registry[id];
      const cube = ok(Facelets.fromFacelets(entry.n, entry.model, entry.pose, facelets));
      assert.equal(ok(Orbit64V2.encode(id, cube)), token, `entry ${id}: ${moves}`);
      const written = ok(Facelets.toFacelets(entry.n, entry.model, entry.pose, cube));
      assert.equal(written, canonical === "" ? facelets : canonical, `entry ${id}: ${moves}`);
    }
  });

  test("solved facelets are the zero token of every color entry", () => {
    for (const e of Orbit64V2.registry.filter((entry) => entry.model === "color")) {
      const token = ok(Orbit64V2.encode(e.id, Orbit64V2.solved(e.n, "color")));
      assert.equal(ok(Facelets.encode(e.id, solvedText(e.n))), token);
      assert.deepEqual(ok(Facelets.decode(token))[1], solvedText(e.n));
    }
  });
});

describe("Orbit64 V2 facelets agree with the V1 codec", () => {
  test("V1 tokens of the 2x2x2 to 4x4x4 write the same stickers as V2", () => {
    const rows = v1StateVectors.filter(([n]) => n <= 4);
    assert.ok(rows.length > 0);
    for (const [n, id, token] of rows) {
      const v1 = FaceletCodec.render(ok(Orbit64Codec.decodeState(token)));
      const [entry, text] = ok(Facelets.decode(token));
      assert.equal(entry.id, id);
      assert.equal(text.replaceAll(" ", ""), v1, `${n}x${n}x${n} ${token}`);
    }
  });

  test("a V1 token with a frame is the solved 3x3x3 after x", () => {
    // FORMAT.md: AAAAAAAAAAAE is the solved 3x3x3 after `x`, frame F R D B L U.
    const shown = "FFFFFFFFF RRRRRRRRR DDDDDDDDD BBBBBBBBB LLLLLLLLL UUUUUUUUU";
    const [entry, text] = ok(Facelets.decode("AAAAAAAAAAAE"));
    assert.equal(entry.id, 3);
    assert.equal(text, shown);
    assert.equal(ok(Facelets.fromFacelets(3, "color", "framed", shown)).frame, 4);
    assert.equal(ok(Facelets.fromFacelets(3, "color", "canonical", shown)).frame, 0);
  });
});

describe("Orbit64 V2 facelets reject invalid input with exact reasons", () => {
  const reject = (TAG, message, text, n = 3, pose = "framed") =>
    assert.deepEqual(err(Facelets.fromFacelets(n, "color", pose, text)), {TAG, message});

  test("a solved cube is accepted, with or without spaces", () => {
    ok(Facelets.fromFacelets(3, "color", "framed", solved3));
    ok(Facelets.fromFacelets(3, "color", "framed", solved3.replaceAll(" ", "")));
    ok(Facelets.fromFacelets(3, "color", "framed", ` ${solved3}  `));
  });

  test("the wrong length", () => {
    reject("InvalidFaceletLength", "Expected 54 facelets for the 3x3x3, got 3.", "UUU");
    reject("InvalidFaceletLength", "Expected 54 facelets for the 3x3x3, got 0.", "");
    reject("InvalidFaceletLength", "Expected 54 facelets for the 3x3x3, got 55.", `${solved3}U`);
    reject("InvalidFaceletLength", "Expected 24 facelets for the 2x2x2, got 54.", solved3, 2);
  });

  test("a bad letter, including a tab or newline, and a lowercase letter", () => {
    const rest = "RRRRRRRRR FFFFFFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB";
    reject("InvalidFacelet", "Facelet 'X' is not one of U R F D L B.", `XUUUUUUUU ${rest}`);
    reject("InvalidFacelet", "Facelet 'u' is not one of U R F D L B.", `uUUUUUUUU ${rest}`);
    reject("InvalidFacelet", "Facelet '\t' is not one of U R F D L B.", `UUUUUUUUU\t${rest}`);
    reject("InvalidFacelet", "Facelet '\n' is not one of U R F D L B.", `UUUUUUUUU\n${rest}`);
    reject("InvalidFacelet", "Facelet '\r' is not one of U R F D L B.", `UUUUUUUUU\r${rest}`);
    // A bad letter is reported before the length.
    reject("InvalidFacelet", "Facelet '1' is not one of U R F D L B.", "1");
  });

  test("a character past the basic multilingual plane or a lone surrogate is named by code point", () => {
    const rest = "RRRRRRRRR FFFFFFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB";
    reject("InvalidFacelet", "Facelet 'U+1F600' is not one of U R F D L B.", `UUUUUUUU\u{1F600} ${rest}`);
    reject("InvalidFacelet", "Facelet 'U+D800' is not one of U R F D L B.", `UUUUUUUU\ud800 ${rest}`);
    reject("InvalidFacelet", "Facelet 'é' is not one of U R F D L B.", `UUUUUUUUé ${rest}`);
  });

  test("a string that is not a string", () => {
    for (const value of [undefined, null, 5, {}, ["U"]]) {
      assert.deepEqual(err(Facelets.fromFacelets(3, "color", "framed", value)), {
        TAG: "InvalidFacelet",
        message: "A facelet string is a string.",
      });
    }
  });

  test("unequal color counts", () => {
    reject(
      "InvalidFaceletCounts",
      "Color U occurs 8 times, expected 9.",
      "UUUUUUUUR RRRRRRRRR FFFFFFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB",
    );
  });

  test("fixed centers of the wrong handedness", () => {
    // Two fixed centers exchanged: not a right-handed frame.
    reject(
      "InvalidFaceletFrame",
      "The six fixed centers are not a right-handed whole-cube frame.",
      "UUUUUUUUU RRRRFRRRR FFFFRFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB",
    );
    reject(
      "InvalidFaceletFrame",
      "The six fixed centers are not a right-handed whole-cube frame.",
      "UUUUUUUUU RRRRFRRRR FFFFRFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB",
      3,
      "canonical",
    );
  });

  test("a twisted corner", () => {
    // The URF corner turned in place.
    reject(
      "InvalidState",
      "Corner twists must sum to 0 mod 3.",
      "UUUUUUUUF URRRRRRRR FFRFFFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB",
    );
  });

  test("a flipped midge", () => {
    // The U and R stickers of the UR edge exchanged.
    reject(
      "InvalidState",
      "Midge flips must sum to 0 mod 2.",
      "UUUUURUUU RURRRRRRR FFFFFFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB",
    );
  });

  test("a piece that appears twice", () => {
    // Four URF and four DBL corners: every slot shows a corner and every color occurs four times.
    reject("InvalidState", "Corner pieces are not a permutation of 8.", "UUUU RFLB RFLB DDDD RFLB RFLB", 2);
  });

  test("a mirrored corner", () => {
    // The U and R stickers of the URF corner exchanged: a corner of the mirror image, counts intact.
    reject(
      "InvalidFaceletPiece",
      "The corner slot 0 shows RUF, which is no corner of this cube.",
      "UUUUUUUUR URRRRRRRR FFFFFFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB",
    );
  });

  test("a mirrored cube", () => {
    // The mirror image keeps the colors where they are: the left and right faces trade places, so the
    // fixed centers of an odd cube show L and R exchanged.
    const mirror = (text, n) => {
      const [u, r, f, d, l, b] = text.split(" ").map((face) => {
        let out = "";
        for (let row = 0; row < n; row += 1) for (let col = n - 1; col >= 0; col -= 1) out += face[row * n + col];
        return out;
      });
      return [u, l, f, d, r, b].join(" ");
    };
    const [, , scrambled] = faceletRows.find(([id, moves]) => id === 3 && moves === "1R");
    assert.notEqual(mirror(scrambled, 3), scrambled);
    const handed = "The six fixed centers are not a right-handed whole-cube frame.";
    reject("InvalidFaceletFrame", handed, mirror(scrambled, 3));
    reject("InvalidFaceletFrame", handed, mirror(solved3, 3), 3, "canonical");
  });

  test("an even canonical cube with no DBL corner home", () => {
    // Color counts are intact, but no whole-cube turn brings a solved DBL corner home.
    reject(
      "InvalidFaceletFrame",
      "No whole-cube rotation puts the DBL corner home.",
      "UUUF RRRB FFFD DDDL LLLU BBBR",
      2,
      "canonical",
    );
  });

  test("a canonical read accepts any whole-cube orientation of an even cube", () => {
    const cube = ok(Facelets.fromFacelets(2, "color", "canonical", "FFFF RRRR DDDD BBBB LLLL UUUU"));
    assert.deepEqual(cube, Orbit64V2.solved(2, "color"));
  });

  test("a type with no letters", () => {
    assert.deepEqual(err(Facelets.fromFacelets(3, "picture", "framed", solved3)), {
      TAG: "UnsupportedModel",
      message: "The picture model has no letters.",
    });
    for (const n of [1, 16, 2.5, NaN, undefined]) {
      assert.equal(err(Facelets.fromFacelets(n, "color", "framed", solved3)).TAG, "UnsupportedType");
    }
    const fixed = {TAG: "UnsupportedType", message: "No V2 type for that size."};
    for (const n of [16, 1, 0, -0, -3, NaN, Infinity, -Infinity, 2.5]) {
      assert.deepEqual(err(Facelets.fromFacelets(n, "color", "framed", solved3)), fixed);
      assert.deepEqual(err(Facelets.tables(n)), fixed);
    }
    for (const n of [Symbol("n"), 3n, "3", null, undefined, Object.create(null)]) {
      assert.deepEqual(err(Facelets.tables(n)), fixed);
    }
  });

  test("a size, model or pose that is no V2 type is an error value, never an exception", () => {
    const solved = Orbit64V2.solved(3, "color");
    const throwing = {
      toString() {
        throw new Error("boom");
      },
    };
    const sizes = [Object.create(null), throwing, 3n, "3", null, undefined, {}, [3], Symbol("n")];
    for (const n of sizes) {
      for (const result of [
        Facelets.fromFacelets(n, "color", "framed", solved3),
        Facelets.toFacelets(n, "color", "framed", solved),
      ]) {
        assert.deepEqual(err(result), {TAG: "UnsupportedType", message: "No V2 type for that size."});
      }
    }
    const models = ["colour", "", "Color", undefined, null, 3, {}, ["color"]];
    for (const model of models) {
      for (const result of [
        Facelets.fromFacelets(3, model, "framed", solved3),
        Facelets.toFacelets(3, model, "framed", solved),
      ]) {
        assert.deepEqual(err(result), {TAG: "UnsupportedModel", message: "The V2 models are color and picture."});
      }
    }
    const poses = ["bogus", "", "Framed", undefined, null, 1, {}, ["framed"]];
    for (const pose of poses) {
      for (const result of [
        Facelets.fromFacelets(3, "color", pose, solved3),
        Facelets.toFacelets(3, "color", pose, solved),
        Facelets.fromFacelets(2, "color", pose, solvedText(2)),
      ]) {
        assert.deepEqual(err(result), {TAG: "UnsupportedPose", message: "The V2 poses are canonical and framed."});
      }
    }
  });

  test("a hostile cube yields a fixed error value and its exception is never read or echoed", () => {
    const reason = {TAG: "InvalidState", message: "The state could not be read."};
    const trap = () => new Proxy({}, {get() { throw new Error("trap"); }});
    const throwers = {
      "an error with caller text": () => new Error("caller text"),
      "a proxy that traps": trap,
      "an object with a throwing message getter": () => ({get message() { throw new Error("inner"); }}),
      "a primitive": () => "primitive text",
      "undefined": () => undefined,
    };
    for (const [name, make] of Object.entries(throwers)) {
      for (const key of ["frame", "cornerPieces", "midgeFlips", "wings"]) {
        const cube = {...Orbit64V2.solved(3, "color")};
        Object.defineProperty(cube, key, {enumerable: true, get() { throw make(); }});
        for (const pose of ["canonical", "framed"]) {
          assert.deepEqual(err(Facelets.toFacelets(3, "color", pose, cube)), reason, `${name} in ${key}`);
        }
      }
    }
    const hostile = trap();
    assert.deepEqual(err(Facelets.toFacelets(3, "color", "framed", hostile)), reason);
    assert.equal(Facelets.toFacelets(3, "color", "framed", new Proxy({}, {has() { throw "text"; }})).TAG, "Error");
  });

  test("picture entries and unknown entries are errors for encode, decode and toFacelets", () => {
    for (const e of Orbit64V2.registry.filter((entry) => entry.model === "picture")) {
      assert.deepEqual(err(Facelets.encode(e.id, solvedText(e.n))), {
        TAG: "UnsupportedModel",
        message: "The picture model has no letters.",
      });
      const token = ok(Orbit64V2.encode(e.id, Orbit64V2.solved(e.n, "picture")));
      assert.equal(err(Facelets.decode(token)).TAG, "UnsupportedModel");
      assert.equal(err(Facelets.toFacelets(e.n, "picture", e.pose, Orbit64V2.solved(e.n, "picture"))).TAG, "UnsupportedModel");
    }
    for (const id of [-1, 54, 1.5, NaN, undefined, "0"]) {
      assert.equal(err(Facelets.encode(id, solved3)).TAG, "UnknownEntry");
    }
    assert.equal(err(Facelets.decode("")).TAG, "UnknownToken");
    assert.equal(err(Facelets.decode("A*AA")).TAG, "InvalidTokenCharacter");
  });

  test("toFacelets rejects a state that is no cube, as an error value", () => {
    const solved = Orbit64V2.solved(3, "color");
    const twisted = {...solved, cornerTwists: [1, 0, 0, 0, 0, 0, 0, 0]};
    assert.deepEqual(err(Facelets.toFacelets(3, "color", "framed", twisted)), {
      TAG: "InvalidState",
      message: "Corner twists must sum to 0 mod 3.",
    });
    assert.deepEqual(err(Facelets.toFacelets(3, "color", "canonical", {...solved, frame: 1})), {
      TAG: "InvalidState",
      message: "The frame must be 0..23 on odd framed cubes and 0 otherwise.",
    });
    for (const value of [undefined, null, 7, "x", []]) {
      assert.equal(err(Facelets.toFacelets(3, "color", "framed", value)).TAG, "InvalidState");
    }
    assert.equal(err(Facelets.toFacelets(3, "color", "framed", {...solved, cornerPieces: [0, 1]})).TAG, "InvalidState");
  });

  test("a canonical read accepts any whole-cube orientation of an odd cube", () => {
    const rotated = "FFFFFFFFF RRRRRRRRR DDDDDDDDD BBBBBBBBB LLLLLLLLL UUUUUUUUU";
    const cube = ok(Facelets.fromFacelets(3, "color", "canonical", rotated));
    assert.deepEqual(cube, Orbit64V2.solved(3, "color"));
    assert.equal(ok(Facelets.toFacelets(3, "color", "canonical", cube)), solved3);
  });
});
