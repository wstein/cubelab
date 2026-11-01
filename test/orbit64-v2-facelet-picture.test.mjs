import assert from "node:assert/strict";
import {describe, test} from "vitest";

import * as Orbit64V2 from "../src/State/Orbit64V2.res.mjs";
import * as Facelets from "../src/State/Orbit64V2Facelets.res.mjs";
import {frameFaces, slotTables} from "./fixtures/orbit64-v2-facelet-vectors.mjs";
import {pictureRows} from "./fixtures/orbit64-v2-facelet-picture-vectors.mjs";

// Every expectation below is a row of the independent Julia program of flix-orbit64
// (pictureRows), a slot table, the worked example of FORMAT-V2.md, or a hand-written
// rejection whose reason follows FORMAT-V2.md "Picture facelets" and was checked against the
// Flix reference (Orbit64.V2.Facelets) for the same accept or reject decision.

const ok = (result) => {
  assert.equal(result.TAG, "Ok", result.TAG === "Error" ? result._0.message : "");
  return result._0;
};

/** The error `{TAG, message}` of a result that must be an error. */
const err = (result) => {
  assert.equal(result.TAG, "Error", "expected an error value");
  return result._0;
};

const pictureEntries = Orbit64V2.registry.filter((e) => e.model === "picture");
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** The Julia row of an entry and move text. */
const rowOf = (id, moves) => {
  const row = pictureRows.find((r) => r[0] === id && r[1] === moves);
  assert.ok(row, `no row ${id} "${moves}"`);
  return row;
};

/** The solved picture of an entry, from the independent rows (the row with no moves). */
const solvedOf = (id) => rowOf(id, "")[2];

const symbols = (text) => text.replaceAll(" ", "").split("");

const field = (n, list) =>
  Array.from({length: 6}, (_, f) => list.slice(f * n * n, (f + 1) * n * n).join("")).join(" ");

/** The string with the symbol at each `[facelet, symbol]` replaced. */
const put = (n, text, edits) => {
  const list = symbols(text);
  for (const [index, symbol] of edits) list[index] = symbol;
  return field(n, list);
};

/** The string with the symbols at two facelets exchanged. */
const exchange = (n, text, i, j) => {
  const list = symbols(text);
  [list[i], list[j]] = [list[j], list[i]];
  return field(n, list);
};

/** The string with two slots (lists of facelets of equal length) exchanged whole. */
const exchangeSlots = (n, text, a, b) => {
  const list = symbols(text);
  a.forEach((x, k) => {
    [list[x], list[b[k]]] = [list[b[k]], list[x]];
  });
  return field(n, list);
};

const symbolAt = (text, index) => symbols(text)[index];

const solved3 = solvedOf(4);
const solved4 = solvedOf(8);
const solved5 = solvedOf(12);
const solved6 = solvedOf(16);
const solved7 = solvedOf(20);

describe("Orbit64 V2 picture facelets: independent rows", () => {
  test("the fixture has exactly 174 rows in canonical and framed pairs for every picture entry", () => {
    assert.equal(pictureRows.length, 174);
    const pairs = new Map();
    for (const [id, moves, facelets] of pictureRows) {
      const key = `${id >> 1}|${moves}|${facelets}`;
      pairs.set(key, [...(pairs.get(key) ?? []), id]);
    }
    for (const ids of pairs.values()) assert.deepEqual(ids.sort((a, b) => a - b), [ids[0], ids[0] + 1]);
    for (const ids of pairs.values()) assert.equal(ids[0] % 2, 0);
    const wanted = pictureEntries.map((e) => e.id);
    assert.equal(wanted.length, 26);
    assert.deepEqual([...new Set(pictureRows.map(([id]) => id))].sort((a, b) => a - b), wanted);
    // Rows per cube size, so that dropping both rows of one sequence shows.
    const perSize = {};
    for (const [id] of pictureRows) perSize[Orbit64V2.registry[id].n] = (perSize[Orbit64V2.registry[id].n] ?? 0) + 1;
    assert.deepEqual(perSize, {3: 82, 4: 8, 5: 10, 6: 8, 7: 10, 8: 6, 9: 8, 10: 6, 11: 8, 12: 6, 13: 8, 14: 6, 15: 8});
  });

  test("a picture string is as long as a color string, in six fields", () => {
    for (const [id, , facelets] of pictureRows) {
      const n = Orbit64V2.registry[id].n;
      assert.equal(facelets.length, 6 * n * n + 5);
      assert.deepEqual(facelets.split(" ").map((f) => f.length), Array(6).fill(n * n));
      assert.ok([...facelets.replaceAll(" ", "")].every((c) => ALPHABET.includes(c)));
    }
  });

  test("every row's facelets encode to its token", () => {
    for (const [id, moves, facelets, token] of pictureRows) {
      assert.equal(ok(Facelets.encode(id, facelets)), token, `entry ${id}: ${moves}`);
    }
  });

  test("every row's token decodes to its entry and facelets", () => {
    for (const [id, moves, facelets, token, canonical] of pictureRows) {
      const [entry, text] = ok(Facelets.decode(token));
      assert.equal(entry.id, id, `entry ${id}: ${moves}`);
      assert.equal(entry.model, "picture");
      assert.equal(text, canonical === "" ? facelets : canonical, `entry ${id}: ${moves}`);
    }
  });

  test("every row reads to coordinates that write the same facelets back", () => {
    for (const [id, moves, facelets, token, canonical] of pictureRows) {
      const entry = Orbit64V2.registry[id];
      const cube = ok(Facelets.fromFacelets(entry.n, "picture", entry.pose, facelets));
      assert.equal(ok(Orbit64V2.encode(id, cube)), token, `entry ${id}: ${moves}`);
      const written = ok(Facelets.toFacelets(entry.n, "picture", entry.pose, cube));
      assert.equal(written, canonical === "" ? facelets : canonical, `entry ${id}: ${moves}`);
    }
  });

  test("a canonical string is its own canonical form: it reads and writes back unchanged", () => {
    for (const [id, moves, facelets, , canonical] of pictureRows.filter(([id]) => id % 2 === 0)) {
      const text = canonical === "" ? facelets : canonical;
      const entry = Orbit64V2.registry[id];
      const cube = ok(Facelets.fromFacelets(entry.n, "picture", "canonical", text));
      assert.equal(ok(Facelets.toFacelets(entry.n, "picture", "canonical", cube)), text, `entry ${id}: ${moves}`);
    }
  });

  test("a row read in the other pose of its size is still a cube of that pose", () => {
    // The canonical entry reads any orientation; the framed entry keeps it. Both read the same pieces.
    for (const [id, moves, facelets] of pictureRows) {
      const entry = Orbit64V2.registry[id];
      const other = Orbit64V2.registry[id ^ 1];
      assert.equal(other.n, entry.n);
      assert.equal(Facelets.encode(other.id, facelets).TAG, "Ok", `entry ${other.id}: ${moves}`);
    }
  });

  test("the solved picture of every entry is the zero token", () => {
    for (const e of pictureEntries) {
      const [, , facelets, token] = rowOf(e.id, "");
      assert.equal(token, Orbit64V2.toBase64(e.offset, e.length));
      assert.equal(ok(Facelets.encode(e.id, facelets)), token);
      assert.deepEqual(ok(Facelets.decode(token))[1], facelets);
      assert.deepEqual(ok(Facelets.toFacelets(e.n, "picture", e.pose, Orbit64V2.solved(e.n, "picture"))), facelets);
    }
  });

  test("the solved 3x3x3 is the worked example of FORMAT-V2.md", () => {
    const example = "GGJEAADCA BBLREXOJW EDCSIQRLN PKMMMISOV HFFVQTUNQ KHIWUUXPT";
    assert.equal(solved3, example);
    assert.equal(ok(Facelets.toFacelets(3, "picture", "canonical", Orbit64V2.solved(3, "picture"))), example);
    assert.equal(ok(Facelets.toFacelets(3, "picture", "framed", Orbit64V2.solved(3, "picture"))), example);
    // U center A (0), corners G J D A (6 9 3 0), midges G E A C (UB UL UR UF).
    const u = example.split(" ")[0];
    assert.equal(u[4], "A");
    assert.deepEqual([u[0], u[2], u[6], u[8]].map((c) => ALPHABET.indexOf(c)), [6, 9, 3, 0]);
    assert.deepEqual([u[1], u[3], u[5], u[7]], ["G", "E", "A", "C"]);
  });

  test("a solved picture's stickers follow the value table, class by class", () => {
    for (const e of pictureEntries) {
      const list = symbols(solvedOf(e.id)).map((c) => ALPHABET.indexOf(c));
      const t = slotTables[e.n];
      t.corners.forEach((slot, p) => slot.forEach((f, j) => assert.equal(list[f], 3 * p + j)));
      t.midges.forEach((slot, p) => slot.forEach((f, j) => assert.equal(list[f], 2 * p + j)));
      t.wings.forEach((table) => table.forEach((slot, p) => slot.forEach((f, j) => assert.equal(list[f], 2 * p + j))));
      t.centers.forEach((table) => table.forEach((f, p) => assert.equal(list[f], p)));
      t.fixed.forEach((f, p) => assert.equal(list[f], 4 * p));
    }
  });

  test("every frame writes the fixed centers' pieces as that frame, for any fixed center rotations", () => {
    const rotationSets = [
      [0, 0, 0, 0, 0, 0],
      [1, 1, 0, 0, 0, 0],
      [2, 3, 0, 1, 0, 0],
      [3, 1, 2, 0, 2, 0],
      [3, 3, 3, 3, 3, 3],
    ];
    for (const n of [3, 5, 7]) {
      for (const rotations of rotationSets) {
        for (let frame = 0; frame < 24; frame += 1) {
          const cube = {...Orbit64V2.solved(n, "picture"), rotations, frame};
          const text = ok(Facelets.toFacelets(n, "picture", "framed", cube));
          const list = symbols(text).map((c) => ALPHABET.indexOf(c));
          const faces = frameFaces[frame].split("").map((letter) => "URFDLB".indexOf(letter));
          assert.deepEqual(slotTables[n].fixed.map((f) => list[f] >> 2), faces, `n=${n} frame ${frame}`);
          assert.deepEqual(ok(Facelets.fromFacelets(n, "picture", "framed", text)), cube, `n=${n} frame ${frame}`);
          const canonical = ok(Facelets.fromFacelets(n, "picture", "canonical", text));
          assert.deepEqual(canonical, {...cube, frame: 0}, `n=${n} frame ${frame}`);
          assert.equal(ok(Facelets.toFacelets(n, "picture", "canonical", canonical)).length, text.length);
        }
      }
    }
  });

  test("a whole-cube rotation spins a fixed center only where it lands (x turns the cube)", () => {
    // After `x` the cube shows F R D B L U in its slots; the stickers did not change.
    const [, , turned, token] = rowOf(5, "x");
    assert.equal(token, "AAAAAAAAAAAAAE");
    assert.equal(ok(Facelets.encode(4, turned)), "AAAAAAAAAAAAA");
    const cube = ok(Facelets.fromFacelets(3, "picture", "framed", turned));
    assert.equal(cube.frame, 4);
    assert.deepEqual(cube.rotations, [0, 0, 0, 0, 0, 0]);
    assert.equal(ok(Facelets.fromFacelets(3, "picture", "canonical", turned)).frame, 0);
    assert.equal(ok(Facelets.toFacelets(3, "picture", "framed", cube)), turned);
    assert.equal(ok(Facelets.toFacelets(3, "picture", "canonical", {...cube, frame: 0})), solved3);
  });

  test("a fixed center rotation is the symbol itself", () => {
    // U and R centers each turned a quarter: symbols B (4 * 0 + 1) and F (4 * 1 + 1).
    const text = put(3, solved3, [
      [4, "B"],
      [13, "F"],
    ]);
    const cube = ok(Facelets.fromFacelets(3, "picture", "canonical", text));
    assert.deepEqual(cube.rotations, [1, 1, 0, 0, 0, 0]);
    assert.equal(ok(Facelets.toFacelets(3, "picture", "canonical", cube)), text);
    assert.equal(ok(Facelets.encode(4, text)), ok(Orbit64V2.encode(4, cube)));
  });
});

describe("Orbit64 V2 picture facelets: round trips through the registry", () => {
  test("a rank at the start, middle and end of every picture entry decodes and encodes back", () => {
    for (const e of pictureEntries) {
      for (const rank of [0n, 1n, e.count / 2n, e.count - 2n, e.count - 1n]) {
        const token = Orbit64V2.toBase64(e.offset + rank, e.length);
        const [entry, text] = ok(Facelets.decode(token));
        assert.equal(entry.id, e.id);
        assert.equal(text.length, 6 * e.n * e.n + 5);
        assert.equal(ok(Facelets.encode(e.id, text)), token, `entry ${e.id} rank ${rank}`);
        assert.equal(ok(Facelets.encode(e.id, text.replaceAll(" ", ""))), token);
      }
    }
  });
});

describe("Orbit64 V2 picture facelets reject invalid input with exact reasons", () => {
  const reject = (TAG, message, text, n = 3, pose = "framed") =>
    assert.deepEqual(err(Facelets.fromFacelets(n, "picture", pose, text)), {TAG, message});
  const both = (TAG, message, text, n = 3) => {
    reject(TAG, message, text, n, "framed");
    reject(TAG, message, text, n, "canonical");
  };

  test("a solved picture is accepted, with or without spaces", () => {
    ok(Facelets.fromFacelets(3, "picture", "framed", solved3));
    ok(Facelets.fromFacelets(3, "picture", "framed", solved3.replaceAll(" ", "")));
    ok(Facelets.fromFacelets(3, "picture", "framed", ` ${solved3}  `));
    ok(Facelets.fromFacelets(3, "picture", "canonical", solved3.replaceAll(" ", "  ")));
  });

  test("the wrong length", () => {
    both("InvalidFaceletLength", "Expected 54 facelets for the 3x3x3, got 3.", "GGJ");
    both("InvalidFaceletLength", "Expected 54 facelets for the 3x3x3, got 0.", "");
    both("InvalidFaceletLength", "Expected 54 facelets for the 3x3x3, got 0.", "   ");
    both("InvalidFaceletLength", "Expected 54 facelets for the 3x3x3, got 55.", `${solved3}A`);
    both("InvalidFaceletLength", "Expected 54 facelets for the 3x3x3, got 53.", solved3.slice(0, -1));
    both("InvalidFaceletLength", "Expected 96 facelets for the 4x4x4, got 54.", solved3, 4);
    both("InvalidFaceletLength", "Expected 54 facelets for the 3x3x3, got 96.", solved4, 3);
    both("InvalidFaceletLength", `Expected ${6 * 15 * 15} facelets for the 15x15x15, got 54.`, solved3, 15);
  });

  test("a character outside the alphabet, including a tab, newline or non-ASCII character", () => {
    const rest = solved3.slice(solved3.indexOf(" "));
    const bad = (symbol, shown = symbol) =>
      both("InvalidFacelet", `Facelet '${shown}' is not a base64url symbol.`, `GGJEAADC${symbol}${rest}`);
    for (const symbol of ["#", "=", "+", "/", "*", ".", "\t", "\n", "\r", "\0", "é", "ß", "€"]) bad(symbol);
    both("InvalidFacelet", "Facelet '\t' is not a base64url symbol.", `GGJEAADCA\tBBLREXOJW${rest.slice(10)}`);
    // A character past the basic multilingual plane or a lone surrogate is named by code point.
    bad("\u{1F600}", "U+1F600");
    bad("\ud800", "U+D800");
    bad("\udfff", "U+DFFF");
    // A bad symbol is reported before the length.
    both("InvalidFacelet", "Facelet '#' is not a base64url symbol.", "#");
    both("InvalidFacelet", "Facelet '#' is not a base64url symbol.", `${solved3}#`);
    // The first bad symbol is the one named.
    both("InvalidFacelet", "Facelet '#' is not a base64url symbol.", "A#=");
    // Every alphabet symbol is a symbol: only its class decides.
    for (const symbol of ALPHABET.replace("G", "")) {
      assert.notEqual(err(Facelets.fromFacelets(3, "picture", "framed", `${symbol}${solved3.slice(1)}`)).TAG, "InvalidFacelet");
    }
  });

  test("a string that is not a string", () => {
    const fixed = {TAG: "InvalidFacelet", message: "A facelet string is a string."};
    for (const value of [undefined, null, 5, {}, ["G"], new String(solved3), {toString: () => solved3}, Symbol("s"), 1n]) {
      assert.deepEqual(err(Facelets.fromFacelets(3, "picture", "framed", value)), fixed);
      assert.deepEqual(err(Facelets.encode(5, value)), fixed);
    }
  });

  test("a sticker at or above the class range is a sticker of the wrong piece type", () => {
    // Corners, midges, fixed centers and centers have 24 stickers, wings 48.
    const first = (list) => list[0][0];
    const range = (n, solved, facelet, symbol, what) =>
      both("InvalidFaceletPiece", `Facelet ${facelet} shows '${symbol}', which is no ${what} sticker.`, put(n, solved, [[facelet, symbol]]), n);
    for (const symbol of ["Y", "Z", "a", "z", "9", "-", "_"]) {
      range(3, solved3, slotTables[3].corners[0][0], symbol, "corner");
      range(3, solved3, slotTables[3].midges[0][0], symbol, "midge");
      range(3, solved3, slotTables[3].fixed[0], symbol, "fixed center");
      range(3, solved3, slotTables[3].fixed[5], symbol, "fixed center");
      range(5, solved5, slotTables[5].centers[0][0], symbol, "center");
      range(5, solved5, slotTables[5].centers[1][23], symbol, "center");
      range(4, solved4, slotTables[4].centers[0][5], symbol, "center");
    }
    // A wing sticker may be any of 0..47: 'v' is 47, 'w' is 48.
    for (const symbol of ["w", "x", "y", "z", "0", "9", "-", "_"]) {
      range(5, solved5, first(slotTables[5].wings[0]), symbol, "wing");
      range(5, solved5, slotTables[5].wings[0][23][1], symbol, "wing");
      range(6, solved6, slotTables[6].wings[1][3][0], symbol, "wing");
    }
    // The last symbol of the range is not a range error, only a repeat: 23 for 24, 47 for 48.
    both("InvalidFaceletPiece", "The corner sticker 'X' occurs more than once.", put(3, solved3, [[slotTables[3].corners[0][0], "X"]]));
    both("InvalidFaceletPiece", "The midge sticker 'X' occurs more than once.", put(3, solved3, [[slotTables[3].midges[0][0], "X"]]));
    both("InvalidFaceletPiece", "The center sticker 'X' occurs more than once.", put(5, solved5, [[slotTables[5].centers[0][0], "X"]]), 5);
    both("InvalidFaceletPiece", "The wing sticker 'v' occurs more than once.", put(5, solved5, [[slotTables[5].wings[0][0][0], "v"]]), 5);
    both("InvalidFaceletPiece", "The fixed center sticker 'X' occurs more than once.", put(3, solved3, [[slotTables[3].fixed[0], "X"]]));
  });

  test("a sticker shown twice is an error, naming the first one in facelet order", () => {
    const corner = slotTables[3].corners;
    both(
      "InvalidFaceletPiece",
      "The corner sticker 'A' occurs more than once.",
      put(3, solved3, [[corner[2][0], symbolAt(solved3, corner[0][0])]]),
    );
    // Facelet 0 gets the symbol of a later sticker: the earlier facelet is named by its new value.
    both(
      "InvalidFaceletPiece",
      "The corner sticker 'X' occurs more than once.",
      put(3, solved3, [[corner[2][0], "X"]]),
    );
    both(
      "InvalidFaceletPiece",
      "The midge sticker 'A' occurs more than once.",
      put(3, solved3, [[slotTables[3].midges[0][1], "A"]]),
    );
    both(
      "InvalidFaceletPiece",
      "The wing sticker 'B' occurs more than once.",
      put(4, solved4, [[slotTables[4].wings[0][2][0], "B"]]),
      4,
    );
    both(
      "InvalidFaceletPiece",
      "The center sticker 'A' occurs more than once.",
      put(4, solved4, [[slotTables[4].centers[0][5], "A"]]),
      4,
    );
  });

  test("fixed centers repeat by piece: two rotations of one piece are one repeat", () => {
    const [f0, f1, f2] = slotTables[3].fixed;
    // The pieces 0 and 0: the first one in facelet order is named, whatever its rotation.
    both("InvalidFaceletPiece", "The fixed center sticker 'B' occurs more than once.", put(3, solved3, [[f0, "B"], [f1, "C"]]));
    both("InvalidFaceletPiece", "The fixed center sticker 'C' occurs more than once.", put(3, solved3, [[f0, "C"], [f1, "B"]]));
    both("InvalidFaceletPiece", "The fixed center sticker 'A' occurs more than once.", put(3, solved3, [[f0, "A"], [f1, "D"]]));
    both("InvalidFaceletPiece", "The fixed center sticker 'D' occurs more than once.", put(3, solved3, [[f0, "D"], [f1, "A"]]));
  });

  test("a range error comes before a repeat, whatever the order of the facelets", () => {
    const corner = slotTables[3].corners;
    // A repeat at the first corner facelet, a range error at the last: the range error is reported.
    both(
      "InvalidFaceletPiece",
      `Facelet ${corner[7][2]} shows 'Y', which is no corner sticker.`,
      put(3, solved3, [[corner[0][0], symbolAt(solved3, corner[1][0])], [corner[7][2], "Y"]]),
    );
    both(
      "InvalidFaceletPiece",
      `Facelet ${corner[0][1]} shows 'Y', which is no corner sticker.`,
      put(3, solved3, [[corner[0][0], symbolAt(solved3, corner[1][0])], [corner[0][1], "Y"]]),
    );
    const fixed = slotTables[3].fixed;
    both(
      "InvalidFaceletPiece",
      `Facelet ${fixed[5]} shows '_', which is no fixed center sticker.`,
      put(3, solved3, [[fixed[0], "B"], [fixed[1], "C"], [fixed[5], "_"]]),
    );
    // Of two range errors in a class the first facelet is reported.
    both(
      "InvalidFaceletPiece",
      `Facelet ${corner[0][0]} shows 'Z', which is no corner sticker.`,
      put(3, solved3, [[corner[7][2], "Y"], [corner[0][0], "Z"]]),
    );
  });

  test("classes are checked in the order corner, midge, wings (outermost orbit first), centers, fixed centers", () => {
    for (const [n, solved] of [[5, solved5], [7, solved7], [6, solved6], [4, solved4], [3, solved3]]) {
      const t = slotTables[n];
      const classes = [
        ["corner", t.corners.flat()],
        ...(t.midges.length ? [["midge", t.midges.flat()]] : []),
        ...t.wings.map((w) => ["wing", w.flat()]),
        ...t.centers.map((c) => ["center", c]),
        ...(t.fixed.length ? [["fixed center", t.fixed]] : []),
      ];
      for (let i = classes.length - 1; i >= 0; i -= 1) {
        // A range error in classes i..last: the first of them, class i, is reported.
        const ranged = put(n, solved, classes.slice(i).map(([, list]) => [list[0], "_"]));
        const [what, list] = classes[i];
        both("InvalidFaceletPiece", `Facelet ${list[0]} shows '_', which is no ${what} sticker.`, ranged, n);
        // The same with repeats: the first facelet takes the symbol of the second.
        const repeated = put(n, solved, classes.slice(i).map(([, l]) => [l[0], symbolAt(solved, l[1])]));
        const value = symbolAt(solved, list[1]);
        both("InvalidFaceletPiece", `The ${what} sticker '${value}' occurs more than once.`, repeated, n);
      }
    }
  });

  test("a class error comes before any slot error", () => {
    const corner = slotTables[3].corners;
    const mirrored = exchange(3, solved3, corner[0][0], corner[0][1]);
    both("InvalidFaceletPiece", "The corner slot 0 shows BAC, which is no corner of this cube.", mirrored);
    // A midge out of range is reported before the mirrored corner.
    both(
      "InvalidFaceletPiece",
      `Facelet ${slotTables[3].midges[3][0]} shows 'Y', which is no midge sticker.`,
      put(3, mirrored, [[slotTables[3].midges[3][0], "Y"]]),
    );
    // So is a repeat in a later class.
    both(
      "InvalidFaceletPiece",
      "The midge sticker 'A' occurs more than once.",
      put(3, mirrored, [[slotTables[3].midges[0][1], "A"]]),
    );
  });

  test("a slot that spells no piece", () => {
    const t = slotTables[3];
    const piece = (what, slot, shown) => `The ${what} slot ${slot} shows ${shown}, which is no ${what} of this cube.`;
    // The U and R stickers of the URF corner exchanged: a mirrored corner, counts intact.
    both("InvalidFaceletPiece", piece("corner", 0, "BAC"), exchange(3, solved3, t.corners[0][0], t.corners[0][1]));
    both("InvalidFaceletPiece", piece("corner", 0, "ACB"), exchange(3, solved3, t.corners[0][1], t.corners[0][2]));
    both("InvalidFaceletPiece", piece("corner", 0, "CBA"), exchange(3, solved3, t.corners[0][0], t.corners[0][2]));
    // Stickers of two corners mixed in one slot.
    both("InvalidFaceletPiece", piece("corner", 0, "DBC"), exchange(3, solved3, t.corners[0][0], t.corners[1][0]));
    // The same in the last slot.
    both("InvalidFaceletPiece", piece("corner", 7, "WVX"), exchange(3, solved3, t.corners[7][0], t.corners[7][1]));
    // Two midges mixed, and one midge with its stickers exchanged.
    both("InvalidFaceletPiece", piece("midge", 0, "CB"), exchange(3, solved3, t.midges[0][0], t.midges[1][0]));
    both("InvalidFaceletPiece", piece("midge", 10, "WV"), exchange(3, solved3, t.midges[10][0], t.midges[11][0]));
    // A wing with its two stickers exchanged is not a wing: a wing has no twist.
    both("InvalidFaceletPiece", piece("wing", 0, "BA"), exchange(4, solved4, slotTables[4].wings[0][0][0], slotTables[4].wings[0][0][1]), 4);
    both("InvalidFaceletPiece", piece("wing", 23, "vu"), exchange(4, solved4, slotTables[4].wings[0][23][0], slotTables[4].wings[0][23][1]), 4);
    // Two wings mixed.
    both("InvalidFaceletPiece", piece("wing", 0, "CB"), exchange(4, solved4, slotTables[4].wings[0][0][0], slotTables[4].wings[0][1][0]), 4);
  });

  test("a slot error names the first slot in table order", () => {
    const t = slotTables[3];
    const piece = (what, slot, shown) => `The ${what} slot ${slot} shows ${shown}, which is no ${what} of this cube.`;
    // Two mirrored corners: slot 2 and slot 5; the lower one is reported.
    const twice = exchange(3, exchange(3, solved3, t.corners[5][0], t.corners[5][1]), t.corners[2][0], t.corners[2][1]);
    both("InvalidFaceletPiece", piece("corner", 2, "HGI"), twice);
    // A corner before a midge, a midge before a wing, an outer wing orbit before an inner one.
    const midge = exchange(3, solved3, t.midges[0][0], t.midges[1][0]);
    both("InvalidFaceletPiece", piece("midge", 0, "CB"), midge);
    both("InvalidFaceletPiece", piece("corner", 5, "QPR"), exchange(3, midge, t.corners[5][0], t.corners[5][1]));
    const t5 = slotTables[5];
    const wing = exchange(5, solved5, t5.wings[0][0][0], t5.wings[0][0][1]);
    both("InvalidFaceletPiece", piece("midge", 10, "WV"), exchange(5, wing, t5.midges[10][0], t5.midges[11][0]), 5);
    both("InvalidFaceletPiece", piece("wing", 0, "BA"), wing, 5);
    const t6 = slotTables[6];
    const inner = exchange(6, solved6, t6.wings[1][0][0], t6.wings[1][0][1]);
    both("InvalidFaceletPiece", piece("wing", 0, "BA"), inner, 6);
    both("InvalidFaceletPiece", piece("wing", 7, "PO"), exchange(6, inner, t6.wings[0][7][0], t6.wings[0][7][1]), 6);
  });

  test("the pose is checked after the pieces: a left-handed frame", () => {
    const t = slotTables[3];
    const handed = "The six fixed centers are not a right-handed whole-cube frame.";
    // Two fixed centers exchanged: not a right-handed frame, in any pose.
    both("InvalidFaceletFrame", handed, exchange(3, solved3, t.fixed[0], t.fixed[1]));
    both("InvalidFaceletFrame", handed, exchange(3, solved3, t.fixed[0], t.fixed[3]));
    both("InvalidFaceletFrame", handed, exchange(3, solved3, t.fixed[2], t.fixed[5]));
    // The pieces of the fixed centers v div 4 are what counts: their rotations do not.
    both("InvalidFaceletFrame", handed, put(3, exchange(3, solved3, t.fixed[0], t.fixed[1]), [[t.fixed[0], "F"]]));
    // A mirrored cube: the left and right faces trade places.
    both("InvalidFaceletFrame", handed, exchange(5, solved5, slotTables[5].fixed[1], slotTables[5].fixed[4]), 5);
    // A broken slot is reported first, and a frame error before the laws.
    const mirrored = exchange(3, exchange(3, solved3, t.fixed[0], t.fixed[1]), t.corners[0][0], t.corners[0][1]);
    both("InvalidFaceletPiece", "The corner slot 0 shows BAC, which is no corner of this cube.", mirrored);
    const twist = put(3, exchange(3, solved3, t.fixed[0], t.fixed[1]), t.corners[0].map((f, k) => [f, symbolAt(solved3, t.corners[0][(k + 1) % 3])]));
    both("InvalidFaceletFrame", handed, twist);
  });

  test("the laws are checked in the order corner twists, midge flips, M = C, R = C, centers", () => {
    const t = slotTables[3];
    const twist = (n, text, slot) => put(n, text, slot.map((f, k) => [f, symbolAt(text, slot[(k + 1) % slot.length])]));
    const cornerTwist = "Corner twists must sum to 0 mod 3.";
    const midgeFlip = "Midge flips must sum to 0 mod 2.";
    const midgeParity = "Midge parity must equal corner parity.";
    const rotationParity = "Fixed-center rotation parity must equal corner parity.";
    const centerParity = "A center orbit parity breaks the picture relation.";
    // One twisted corner, one flipped midge, one exchanged corner pair with its midges, one rotation.
    const twisted = twist(3, solved3, t.corners[0]);
    const flipped = exchange(3, solved3, t.midges[0][0], t.midges[0][1]);
    const swapped = exchangeSlots(3, solved3, t.midges[0], t.midges[1]);
    const rotated = put(3, solved3, [[t.fixed[0], "B"]]);
    both("InvalidState", cornerTwist, twisted);
    both("InvalidState", midgeFlip, flipped);
    both("InvalidState", midgeParity, swapped);
    both("InvalidState", rotationParity, rotated);
    // Each one before every later one.
    both("InvalidState", cornerTwist, twist(3, flipped, t.corners[0]));
    both("InvalidState", cornerTwist, twist(3, swapped, t.corners[0]));
    both("InvalidState", cornerTwist, put(3, twisted, [[t.fixed[0], "B"]]));
    both("InvalidState", midgeFlip, exchangeSlots(3, flipped, t.midges[2], t.midges[3]));
    both("InvalidState", midgeFlip, put(3, flipped, [[t.fixed[0], "B"]]));
    both("InvalidState", midgeParity, put(3, swapped, [[t.fixed[0], "B"]]));
    // The corner swap alone breaks M = C; with the midges swapped too it breaks R = C.
    const cornersSwapped = exchangeSlots(3, solved3, t.corners[0], t.corners[1]);
    both("InvalidState", midgeParity, cornersSwapped);
    both("InvalidState", rotationParity, exchangeSlots(3, cornersSwapped, t.midges[0], t.midges[1]));
    // Center orbit parity of the 5x5x5 is reported after R = C (an odd cube has fixed centers).
    const t5 = slotTables[5];
    const centers = exchange(5, solved5, t5.centers[0][0], t5.centers[0][1]);
    both("InvalidState", centerParity, centers, 5);
    both("InvalidState", rotationParity, put(5, centers, [[t5.fixed[0], "B"]]), 5);
    // On an even cube the center orbit is the only law left.
    both("InvalidState", centerParity, exchange(4, solved4, slotTables[4].centers[0][0], slotTables[4].centers[0][1]), 4);
    both("InvalidState", cornerTwist, twist(4, exchange(4, solved4, slotTables[4].centers[0][0], slotTables[4].centers[0][1]), slotTables[4].corners[0]), 4);
  });

  test("a spun fixed center is not an exchange of fixed centers, and a double spin is a cube", () => {
    const t = slotTables[3];
    const rotationParity = "Fixed-center rotation parity must equal corner parity.";
    // The spec: turning the U center a quarter turn writes B there and breaks R = C.
    both("InvalidState", rotationParity, put(3, solved3, [[t.fixed[0], "B"]]));
    both("InvalidState", rotationParity, put(3, solved3, [[t.fixed[0], "D"]]));
    // Piece 0 turned r times is the symbol r, piece 3 turned r times the symbol 12 + r.
    for (const [a, b] of [["B", "N"], ["C", "M"], ["D", "N"], ["B", "P"], ["A", "O"]]) {
      const cube = ok(Facelets.fromFacelets(3, "picture", "framed", put(3, solved3, [[t.fixed[0], a], [t.fixed[3], b]])));
      assert.deepEqual(cube.rotations, [ALPHABET.indexOf(a), 0, 0, ALPHABET.indexOf(b) - 12, 0, 0]);
    }
    // Three quarter turns in all: odd.
    both("InvalidState", rotationParity, put(3, solved3, [[t.fixed[0], "B"], [t.fixed[3], "O"]]));
    both("InvalidState", rotationParity, put(3, solved3, [[t.fixed[0], "B"], [t.fixed[3], "N"], [t.fixed[4], "R"]]));
  });

  test("a valid cube of every kind of permutation is accepted, with the coordinates it spells", () => {
    const t = slotTables[3];
    // Two corners exchanged, two midges exchanged, one fixed center turned a quarter: all parities odd.
    const text = put(3, exchangeSlots(3, exchangeSlots(3, solved3, t.corners[0], t.corners[1]), t.midges[0], t.midges[1]), [[t.fixed[0], "B"]]);
    const cube = ok(Facelets.fromFacelets(3, "picture", "framed", text));
    assert.deepEqual(cube, {
      ...Orbit64V2.solved(3, "picture"),
      cornerPieces: [1, 0, 2, 3, 4, 5, 6, 7],
      midgePieces: [1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      rotations: [1, 0, 0, 0, 0, 0],
    });
    assert.equal(ok(Facelets.encode(5, text)), ok(Orbit64V2.encode(5, cube)));
    assert.equal(ok(Facelets.toFacelets(3, "picture", "framed", cube)), text);
    // Two wings exchanged need an odd inner center orbit of the 5x5x5 (W1 enters Z[1,2]).
    const t5 = slotTables[5];
    const wings = exchange(5, exchangeSlots(5, solved5, t5.wings[0][0], t5.wings[0][1]), t5.centers[1][0], t5.centers[1][1]);
    const cube5 = ok(Facelets.fromFacelets(5, "picture", "canonical", wings));
    assert.deepEqual(cube5.wings[0].slice(0, 3), [1, 0, 2]);
    assert.deepEqual(cube5.centers[1].slice(0, 3), [1, 0, 2]);
    assert.equal(ok(Facelets.encode(12, wings)), ok(Orbit64V2.encode(12, cube5)));
    assert.equal(ok(Facelets.toFacelets(5, "picture", "canonical", cube5)), wings);
    // Two corners exchanged on a 4x4x4 need an odd center orbit.
    const t4 = slotTables[4];
    const corners = exchange(4, exchangeSlots(4, solved4, t4.corners[0], t4.corners[1]), t4.centers[0][0], t4.centers[0][1]);
    const cube4 = ok(Facelets.fromFacelets(4, "picture", "canonical", corners));
    assert.deepEqual(cube4.cornerPieces, [1, 0, 2, 3, 4, 5, 6, 7]);
    assert.equal(ok(Facelets.toFacelets(4, "picture", "canonical", cube4)), corners);
  });

  test("a canonical read of an even cube accepts any whole-cube orientation, a framed read keeps it", () => {
    // The row of the independent program: a framed 4x4x4 shows its pose in its corners.
    const evens = pictureRows.filter(([id]) => Orbit64V2.registry[id].n % 2 === 0);
    assert.ok(evens.length > 0);
    for (const [id, moves, facelets, , canonical] of evens) {
      const entry = Orbit64V2.registry[id];
      const cube = ok(Facelets.fromFacelets(entry.n, "picture", entry.pose, facelets));
      // An even cube has no frame coordinate: the pose is in its corners.
      assert.equal(cube.frame, 0, moves);
      assert.equal(ok(Facelets.toFacelets(entry.n, "picture", entry.pose, cube)), canonical === "" ? facelets : canonical);
      if (entry.pose === "framed") assert.equal(canonical, "");
    }
  });
});

describe("Orbit64 V2 picture facelets: types and registry entries", () => {
  test("the 2x2x2 has no picture entry", () => {
    const fixed = {
      TAG: "UnsupportedModel",
      message: "The 2x2x2 has no picture entry: its picture model is the color model.",
    };
    assert.deepEqual(err(Facelets.fromFacelets(2, "picture", "framed", "A")), fixed);
    assert.deepEqual(err(Facelets.fromFacelets(2, "picture", "canonical", "UUUU RRRR FFFF DDDD LLLL BBBB")), fixed);
    assert.deepEqual(err(Facelets.toFacelets(2, "picture", "framed", Orbit64V2.solved(2, "color"))), fixed);
    assert.deepEqual(err(Facelets.toFacelets(2, "picture", "canonical", Orbit64V2.solved(2, "picture"))), fixed);
    // The 2x2x2 color model is unchanged.
    assert.equal(ok(Facelets.toFacelets(2, "color", "canonical", Orbit64V2.solved(2, "color"))), "UUUU RRRR FFFF DDDD LLLL BBBB");
  });

  test("a size, model or pose that is no type is an error before anything is read", () => {
    const solved = Orbit64V2.solved(3, "picture");
    for (const n of [1, 16, 0, -3, 2.5, NaN, Infinity, "3", null, undefined, 3n, {}, Object.create(null)]) {
      const fixed = {TAG: "UnsupportedType", message: "No V2 type for that size."};
      assert.deepEqual(err(Facelets.fromFacelets(n, "picture", "framed", solved3)), fixed);
      assert.deepEqual(err(Facelets.toFacelets(n, "picture", "framed", solved)), fixed);
    }
    for (const model of ["Picture", "pictures", "", undefined, null, 3, {}, ["picture"], {toString: () => "picture"}]) {
      const fixed = {TAG: "UnsupportedModel", message: "The V2 models are color and picture."};
      assert.deepEqual(err(Facelets.fromFacelets(3, model, "framed", solved3)), fixed);
      assert.deepEqual(err(Facelets.toFacelets(3, model, "framed", solved)), fixed);
    }
    for (const pose of ["Framed", "bogus", "", undefined, null, 1, {}, ["framed"], {toString: () => "framed"}]) {
      const fixed = {TAG: "UnsupportedPose", message: "The V2 poses are canonical and framed."};
      assert.deepEqual(err(Facelets.fromFacelets(3, "picture", pose, solved3)), fixed);
      assert.deepEqual(err(Facelets.toFacelets(3, "picture", pose, solved)), fixed);
    }
  });

  test("encode and decode work for picture entries and reject unknown ones", () => {
    for (const e of pictureEntries) {
      assert.equal(ok(Facelets.encode(e.id, solvedOf(e.id))), Orbit64V2.toBase64(e.offset, e.length));
    }
    for (const id of [-1, 54, 1.5, NaN, undefined, "4", null, {}, Infinity]) {
      assert.deepEqual(err(Facelets.encode(id, solved3)), {
        TAG: "UnknownEntry",
        message: "The V2 registry has no such entry.",
      });
    }
    assert.equal(err(Facelets.decode("")).TAG, "UnknownToken");
    assert.equal(err(Facelets.decode("A*AA")).TAG, "InvalidTokenCharacter");
  });

  test("a color string is not a picture and a picture string is not a color string", () => {
    // The color letters are alphabet symbols, so a letter string is read as a picture and fails on its classes.
    assert.deepEqual(err(Facelets.encode(5, "UUUUUUUUU RRRRRRRRR FFFFFFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB")), {
      TAG: "InvalidFaceletPiece",
      message: "The corner sticker 'U' occurs more than once.",
    });
    assert.deepEqual(err(Facelets.encode(3, solved3)), {
      TAG: "InvalidFacelet",
      message: "Facelet 'G' is not one of U R F D L B.",
    });
    assert.deepEqual(err(Facelets.fromFacelets(3, "color", "framed", solved3)), {
      TAG: "InvalidFacelet",
      message: "Facelet 'G' is not one of U R F D L B.",
    });
  });

  test("toFacelets of a picture cube that is no cube is an error value", () => {
    const solved = Orbit64V2.solved(3, "picture");
    const state = (TAG, message, cube, n = 3, pose = "framed") =>
      assert.deepEqual(err(Facelets.toFacelets(n, "picture", pose, cube)), {TAG, message});
    state("InvalidState", "Fixed-center rotation parity must equal corner parity.", {...solved, rotations: [1, 0, 0, 0, 0, 0]});
    state("InvalidState", "Fixed-center rotations must be in 0..3.", {...solved, rotations: [4, 0, 0, 0, 0, 0]});
    state("InvalidState", "Fixed-center rotations must be in 0..3.", {...solved, rotations: [-1, 1, 0, 0, 0, 0]});
    state("InvalidState", "Corner twists must sum to 0 mod 3.", {...solved, cornerTwists: [1, 0, 0, 0, 0, 0, 0, 0]});
    state("InvalidState", "A center orbit is not a valid color multiset or permutation of 24.", {...Orbit64V2.solved(4, "picture"), centers: [Array(24).fill(0)]}, 4, "canonical");
    state("InvalidState", "The frame must be 0..23 on odd framed cubes and 0 otherwise.", {...solved, frame: 24});
    state("InvalidState", "The frame must be 0..23 on odd framed cubes and 0 otherwise.", {...solved, frame: 1}, 3, "canonical");
    const shape = "The cube coordinates do not have the shape of this puzzle type.";
    state("InvalidState", shape, {...solved, rotations: [0, 0, 0, 0, 0]});
    state("InvalidState", shape, {...solved, rotations: undefined});
    state("InvalidState", shape, {...solved, rotations: []});
    state("InvalidState", shape, {...Orbit64V2.solved(4, "picture"), rotations: [0, 0, 0, 0, 0, 0]}, 4, "canonical");
    state("InvalidState", shape, Orbit64V2.solved(3, "color"));
    for (const value of [undefined, null, 7, "x"]) {
      assert.deepEqual(err(Facelets.toFacelets(3, "picture", "framed", value)), {TAG: "InvalidState", message: "The state must be an object."});
    }
  });
});

describe("Orbit64 V2 picture facelets are hardened like the color bridge", () => {
  const reason = {TAG: "InvalidState", message: "The state could not be read."};
  const shape = {TAG: "InvalidState", message: "The cube coordinates do not have the shape of this puzzle type."};
  const solvedCube = (n) => Orbit64V2.solved(n, "picture");

  test("a hostile cube yields a fixed error value and its exception is never read or echoed", () => {
    const trap = () => new Proxy({}, {get() { throw new Error("trap"); }});
    const throwers = {
      "an error with caller text": () => new Error("caller text"),
      "a proxy that traps": trap,
      "an object with a throwing message getter": () => ({get message() { throw new Error("inner"); }}),
      "a primitive": () => "primitive text",
      "undefined": () => undefined,
    };
    for (const [name, make] of Object.entries(throwers)) {
      for (const key of ["frame", "cornerPieces", "rotations", "wings", "centers"]) {
        const cube = {...solvedCube(5)};
        Object.defineProperty(cube, key, {enumerable: true, get() { throw make(); }});
        for (const pose of ["canonical", "framed"]) {
          assert.deepEqual(err(Facelets.toFacelets(5, "picture", pose, cube)), reason, `${name} in ${key}`);
        }
      }
    }
    assert.deepEqual(err(Facelets.toFacelets(3, "picture", "framed", trap())), reason);
    assert.equal(Facelets.toFacelets(3, "picture", "framed", new Proxy({}, {has() { throw "text"; }})).TAG, "Error");
  });

  test("a cube whose elements change between reads is validated and painted from one snapshot", () => {
    const twisted = {TAG: "InvalidState", message: "Corner twists must sum to 0 mod 3."};
    // An index getter that is right once and wrong afterward: the snapshot reads it once.
    const cube = solvedCube(3);
    let reads = 0;
    Object.defineProperty(cube.cornerTwists, 0, {get: () => (++reads > 3 ? 1 : 0)});
    const shown = ok(Facelets.toFacelets(3, "picture", "canonical", cube));
    assert.equal(shown, solved3);
    assert.equal(reads, 1);
    // The same for the fixed center rotations, which are painted into the symbols.
    const spun = solvedCube(3);
    let spins = 0;
    Object.defineProperty(spun.rotations, 0, {get: () => (++spins > 1 ? 3 : 0)});
    assert.equal(ok(Facelets.toFacelets(3, "picture", "canonical", spun)), solved3);
    assert.equal(spins, 1);
    // An index getter that is wrong on its first read is an unreachable cube, with the exact reason.
    const wrongFirst = solvedCube(3);
    let calls = 0;
    Object.defineProperty(wrongFirst.cornerTwists, 0, {get: () => (++calls === 1 ? 1 : 0)});
    assert.deepEqual(err(Facelets.toFacelets(3, "picture", "canonical", wrongFirst)), twisted);
    const wrongSpin = solvedCube(3);
    let turns = 0;
    Object.defineProperty(wrongSpin.rotations, 2, {get: () => (++turns === 1 ? 1 : 0)});
    assert.deepEqual(err(Facelets.toFacelets(3, "picture", "canonical", wrongSpin)), {
      TAG: "InvalidState",
      message: "Fixed-center rotation parity must equal corner parity.",
    });
    // A mutating Proxy array: the value of every index depends on how often it was read.
    const mutating = (array, bad, after) => {
      let count = 0;
      return new Proxy(array, {
        get(target, key, receiver) {
          const value = Reflect.get(target, key, receiver);
          return typeof key === "string" && /^\d+$/.test(key) && ++count > after ? bad : value;
        },
      });
    };
    const fields = {cornerPieces: 7, cornerTwists: 1, midgePieces: 11, midgeFlips: 1, rotations: 3};
    for (const n of [3, 4, 5]) {
      for (const [name, bad] of Object.entries(fields)) {
        if (n === 4 && (name.startsWith("midge") || name === "rotations")) continue;
        for (const after of [0, 1, 2, 3, 5, 8, 20]) {
          const hostile = solvedCube(n);
          hostile[name] = mutating(hostile[name], bad, after);
          const result = Facelets.toFacelets(n, "picture", "canonical", hostile);
          if (result.TAG === "Ok") {
            // Whatever was read, a shown cube is one that reads back.
            ok(Facelets.fromFacelets(n, "picture", "canonical", result._0));
          } else {
            assert.equal(result._0.TAG, "InvalidState", `${name} n=${n} after=${after}`);
          }
        }
        const always = solvedCube(n);
        always[name] = mutating(always[name], bad, 0);
        // Twelve flipped midges sum to 0 mod 2, and six quarter turns of three are even: those are cubes.
        const expected = name === "midgeFlips" || name === "rotations" ? "Ok" : "Error";
        assert.equal(Facelets.toFacelets(n, "picture", "canonical", always).TAG, expected, `${name} n=${n}`);
      }
    }
    // Wings and centers, row by row: the sweep reaches past validation, which reads a row many times.
    const rowCases = [];
    for (const n of [4, 5, 6]) {
      const orbits = solvedCube(n);
      orbits.wings.forEach((_, i) => rowCases.push([n, "wings", i, 5]));
      orbits.centers.forEach((_, i) => rowCases.push([n, "centers", i, 5]));
    }
    for (const [n, name, row, bad] of rowCases) {
      for (let after = 0; after < 1500; after += 1) {
        const hostile = solvedCube(n);
        hostile[name] = hostile[name].map((v, i) => (i === row ? mutating(v, bad, after) : v));
        const result = Facelets.toFacelets(n, "picture", "canonical", hostile);
        if (result.TAG === "Ok") {
          ok(Facelets.fromFacelets(n, "picture", "canonical", result._0));
        } else {
          assert.equal(result._0.TAG, "InvalidState", `${name}[${row}] n=${n} after=${after}`);
        }
      }
    }
    // Hostile shapes still give the fixed shape error and never walk a huge array.
    const huge = solvedCube(3);
    huge.cornerPieces = new Array(1e6).fill(0);
    assert.deepEqual(err(Facelets.toFacelets(3, "picture", "canonical", huge)), shape);
    const hugeRotations = solvedCube(3);
    hugeRotations.rotations = new Array(1e9);
    assert.deepEqual(err(Facelets.toFacelets(3, "picture", "canonical", hugeRotations)), shape);
    const nested = solvedCube(3);
    nested.rotations = nested.rotations.map(() => [[[[0]]]]);
    assert.deepEqual(err(Facelets.toFacelets(3, "picture", "canonical", nested)), shape);
    const valued = solvedCube(3);
    let valueOfCalls = 0;
    valued.rotations[0] = {valueOf: () => (++valueOfCalls > 0 ? 1 : 0)};
    assert.deepEqual(err(Facelets.toFacelets(3, "picture", "canonical", valued)), shape);
    assert.equal(valueOfCalls, 0);
  });

  test("a hostile array length gives the shape error and is never called back", () => {
    const withLength = (length) => new Proxy([], {get: (target, key) => (key === "length" ? length : 0)});
    let calls = 0;
    const flipping = {
      valueOf() {
        // Bounded, so a regression fails instead of hanging.
        if (++calls > 100000) throw new Error("too many calls");
        return calls === 1 ? 0 : Infinity;
      },
    };
    for (const [name, length] of Object.entries({
      "an object with valueOf": flipping,
      "a string": "6",
      "a bigint": 6n,
      "minus one": -1,
      "a fraction": 2.5,
      "NaN": NaN,
      "Infinity": Infinity,
      "past the limit": 1025,
    })) {
      for (const field of ["rotations", "cornerTwists", "wings", "centers"]) {
        const cube = solvedCube(5);
        cube[field] = withLength(length);
        assert.deepEqual(err(Facelets.toFacelets(5, "picture", "canonical", cube)), shape, `${name} in ${field}`);
      }
      const inner = solvedCube(4);
      inner.wings = [withLength(length)];
      assert.deepEqual(err(Facelets.toFacelets(4, "picture", "canonical", inner)), shape, `${name} in a wing row`);
    }
    assert.equal(calls, 0);
  });

  test("a hostile facelet string is a bounded scan with a fixed result", () => {
    // Fifty million characters: counted without being copied, and the first bad symbol ends the scan.
    const long = "A".repeat(5e7);
    assert.deepEqual(err(Facelets.fromFacelets(3, "picture", "framed", long)), {
      TAG: "InvalidFaceletLength",
      message: "Expected 54 facelets for the 3x3x3, got 50000000.",
    });
    assert.deepEqual(err(Facelets.fromFacelets(15, "picture", "canonical", " ".repeat(5e7))), {
      TAG: "InvalidFaceletLength",
      message: "Expected 1350 facelets for the 15x15x15, got 0.",
    });
    assert.deepEqual(err(Facelets.fromFacelets(3, "picture", "framed", `#${long}`)), {
      TAG: "InvalidFacelet",
      message: "Facelet '#' is not a base64url symbol.",
    });
    // Valid symbols after millions of spaces are still read.
    assert.equal(Facelets.fromFacelets(3, "picture", "framed", solved3.replaceAll(" ", " ".repeat(1e6))).TAG, "Ok");
    // The result never contains the caller's text beyond the one named character.
    const result = err(Facelets.fromFacelets(3, "picture", "framed", `${"B".repeat(1000)}\u0000${"C".repeat(1000)}`));
    assert.equal(result.message, "Facelet '\u0000' is not a base64url symbol.");
    assert.deepEqual(Object.keys(result).sort(), ["TAG", "message"]);
  });

  test("a deeply frozen valid picture cube still gives its facelets", () => {
    const deepFreeze = (value) => {
      for (const inner of Object.values(value)) if (typeof inner === "object" && inner !== null) deepFreeze(inner);
      return Object.freeze(value);
    };
    for (const [n, pose] of [[3, "canonical"], [3, "framed"], [4, "canonical"], [5, "framed"], [6, "framed"]]) {
      const frozen = deepFreeze(solvedCube(n));
      const id = Orbit64V2.registry.find((e) => e.n === n && e.model === "picture" && e.pose === pose).id;
      assert.equal(ok(Facelets.toFacelets(n, "picture", pose, frozen)), solvedOf(id));
    }
  });
});
