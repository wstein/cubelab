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
      const t = Facelets.tables(n);
      assert.deepEqual(t.corners, expected.corners, `${n}x${n}x${n} corners`);
      assert.deepEqual(t.midges, expected.midges, `${n}x${n}x${n} midges`);
      assert.deepEqual(t.wings, expected.wings, `${n}x${n}x${n} wings`);
      assert.deepEqual(t.centers, expected.centers, `${n}x${n}x${n} centers`);
    }
  });

  test("orbit counts follow the cube size, and every slot is a distinct facelet", () => {
    for (let n = 2; n <= 15; n += 1) {
      const t = Facelets.tables(n);
      assert.equal(t.corners.length, 8);
      assert.equal(t.midges.length, n % 2 === 1 ? 12 : 0);
      assert.equal(t.wings.length, Orbit64V2.wingOrbits(n));
      assert.equal(t.centers.length, Orbit64V2.centerOrbits(n).length);
      assert.deepEqual(t.fixed, n % 2 === 1 ? [0, 1, 2, 3, 4, 5].map((f) => f * n * n + (n * n - 1) / 2) : []);
      const all = [...t.corners.flat(), ...t.midges.flat(), ...t.wings.flat(2), ...t.centers.flat(), ...t.fixed];
      assert.equal(new Set(all).size, all.length, `${n}x${n}x${n} slots overlap`);
      assert.equal(all.length, 6 * n * n, `${n}x${n}x${n} slots do not cover every facelet`);
    }
  });

  test("the reference tables are the V1 slot tables of the 4x4x4 and 5x5x5", () => {
    assert.deepEqual(Facelets.tables(4).corners, Orbit64Codec.c4);
    assert.deepEqual(Facelets.tables(4).wings[0], Orbit64Codec.w4);
    assert.deepEqual(Facelets.tables(5).corners, Orbit64Codec.c5);
    assert.deepEqual(Facelets.tables(5).midges, Orbit64Codec.e5);
    assert.deepEqual(Facelets.tables(5).wings, [Orbit64Codec.w5]);
  });

  test("the 24 whole-cube frames are Orbit64.Frame's list", () => {
    assert.deepEqual(Facelets.frameFaces, frameFaces);
    assert.equal(new Set(frameFaces).size, 24);
  });
});

describe("Orbit64 V2 independent facelet rows", () => {
  test("the fixture has rows, and covers every color entry", () => {
    assert.ok(faceletRows.length > 0);
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

  test("a mirrored cube", () => {
    // The U and R stickers of the URF corner exchanged: a corner of the mirror image, counts intact.
    reject(
      "InvalidFaceletPiece",
      "The corner slot 0 shows RUF, which is no corner of this cube.",
      "UUUUUUUUR URRRRRRRR FFFFFFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB",
    );
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
    assert.equal(err(Facelets.fromFacelets(16, "color", "framed", solved3)).message, "No V2 type for the 16x16x16.");
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
