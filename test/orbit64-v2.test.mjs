import assert from "node:assert/strict";
import {describe, test} from "vitest";

import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as Orbit64Codec from "../src/State/Orbit64Codec.res.mjs";
import * as Orbit64V2 from "../src/State/Orbit64V2.res.mjs";
import {publishedStateVectors} from "./fixtures/orbit64-rosetta-vectors.mjs";
import {referenceVectors, v1StateVectors} from "./fixtures/orbit64-v2-vectors.mjs";

// FORMAT-V2.md, "Initial registry": token length of each entry, and the entries
// that start after another entry of the same length.
const expectedLengths = [
  4, 5, 11, 12, 13, 14, 26, 27, 30, 31, 42, 42, 52, 53, 65, 66, 83, 83, 89, 90, 118, 118, 121, 122,
  161, 161, 154, 155, 209, 210, 194, 195, 265, 266, 236, 237, 326, 327, 285, 285, 395, 396, 335, 336,
  469, 470, 392, 393, 551, 552, 451, 452, 639, 639,
];
const sharedLengthPairs = {11: 10, 17: 16, 21: 20, 25: 24, 39: 38, 53: 52};

/** Parse `key=v,v,...;` state text into cube coordinates. */
const parseCube = (text) => {
  const fields = {};
  for (const part of text.split(";")) {
    if (part === "") continue;
    const [key, value] = part.split("=");
    fields[key] = value === "" ? [] : value.split(",").map(Number);
  }
  const numbered = (prefix) =>
    Object.keys(fields)
      .filter((key) => key.startsWith(prefix) && /^\d+$/.test(key.slice(prefix.length)))
      .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
      .map((key) => fields[key]);
  return {
    cornerPieces: fields.cp ?? [],
    cornerTwists: fields.ct ?? [],
    midgePieces: fields.mp ?? [],
    midgeFlips: fields.mf ?? [],
    wings: numbered("w"),
    centers: numbered("z"),
    rotations: fields.fr ?? [],
    frame: fields.fm?.[0] ?? 0,
  };
};

const ok = (result) => {
  assert.equal(result.TAG, "Ok", result.TAG === "Error" ? result._0.message : "");
  return result._0;
};

describe("Orbit64 V2 registry", () => {
  test("allocates the 54 entries of FORMAT-V2.md with exact lengths", () => {
    assert.equal(Orbit64V2.registry.length, 54);
    assert.deepEqual(Orbit64V2.registry.map((e) => e.length), expectedLengths);
    Orbit64V2.registry.forEach((e, index) => assert.equal(e.id, index));
  });

  test("offsets are zero except where an entry follows another of the same length", () => {
    const nonzero = Orbit64V2.registry.filter((e) => e.offset !== 0n);
    assert.deepEqual(nonzero.map((e) => e.id), Object.keys(sharedLengthPairs).map(Number));
    for (const [id, previous] of Object.entries(sharedLengthPairs)) {
      assert.equal(Orbit64V2.registry[id].offset, Orbit64V2.registry[previous].count);
    }
  });

  test("ranges at one length never overlap and fit below 64^length", () => {
    for (const e of Orbit64V2.registry) {
      assert.ok(e.offset + e.count <= 64n ** BigInt(e.length));
      for (const other of Orbit64V2.registry) {
        if (other.id < e.id && other.length === e.length) {
          assert.ok(other.offset + other.count <= e.offset);
        }
      }
    }
  });

  test("state counts match FORMAT-V2.md and V1's framed color counts (V1 here counts n = 2..5)", () => {
    const approx = (n) => Number(n) / 10 ** (String(n).length - 1);
    const lead = (id) => approx(Orbit64V2.registry[id].count).toFixed(3);
    assert.equal(lead(0), "3.674");
    assert.equal(String(Orbit64V2.registry[0].count).length, 7);
    assert.equal(lead(1), "8.818");
    assert.equal(lead(2), "4.325");
    assert.equal(String(Orbit64V2.registry[2].count).length, 20);
    assert.equal(lead(5), "2.126");
    assert.equal(String(Orbit64V2.registry[53].count).length, 1154);
    for (const [n, id] of [[2, 1], [3, 3], [4, 7], [5, 11]]) {
      assert.equal(Orbit64V2.registry[id].count, Orbit64Codec.stateCount(n), `n=${n}`);
    }
  });
});

describe("Orbit64 V2 reference vectors", () => {
  test("loads all 195 rows", () => {
    assert.equal(referenceVectors.length, 195);
    assert.deepEqual(new Set(referenceVectors.map(([id]) => id)).size, 54);
  });

  test("encodes every state to its token", () => {
    for (const [id, text, token] of referenceVectors) {
      assert.deepEqual(Orbit64V2.encode(id, parseCube(text)), {TAG: "Ok", _0: token}, `${id} ${token}`);
    }
  });

  test("decodes every token to its entry and state", () => {
    for (const [id, text, token] of referenceVectors) {
      const decoded = ok(Orbit64V2.decode(token));
      assert.equal(decoded.entry.id, id, token);
      assert.deepEqual(decoded.cube, parseCube(text), `${id} ${token}`);
    }
  });

  test("solved states encode to the zero rank of their entry", () => {
    for (const e of Orbit64V2.registry) {
      const token = ok(Orbit64V2.encode(e.id, Orbit64V2.solved(e.n, e.model)));
      assert.equal(token.length, e.length);
      if (e.offset === 0n) assert.equal(token, "A".repeat(e.length));
      const decoded = ok(Orbit64V2.decode(token));
      assert.equal(decoded.entry.id, e.id);
      assert.deepEqual(decoded.cube, Orbit64V2.solved(e.n, e.model));
      assert.equal(Orbit64V2.registry[e.id].offset, e.offset);
    }
    for (const id of Object.keys(sharedLengthPairs).map(Number)) {
      const e = Orbit64V2.registry[id];
      assert.equal(ok(Orbit64V2.encode(id, Orbit64V2.solved(e.n, e.model)))
        , Orbit64V2.toBase64(e.offset, e.length));
      assert.equal(ok(Orbit64V2.decode(Orbit64V2.toBase64(e.offset, e.length))).entry.id, id);
    }
  });
});

describe("Orbit64 V2 reads V1 state tokens", () => {
  test("a V1 token decodes as the color framed entry with the same corners", () => {
    assert.deepEqual([...new Set(v1StateVectors.map(([n]) => n))], [2, 3, 4, 6, 7]);
    for (const [n, id, token, pieces, twists] of v1StateVectors) {
      const decoded = ok(Orbit64V2.decode(token));
      assert.equal(decoded.entry.id, id, token);
      assert.equal(decoded.entry.n, n);
      assert.deepEqual(decoded.cube.cornerPieces, pieces, token);
      assert.deepEqual(decoded.cube.cornerTwists, twists, token);
      assert.deepEqual(Orbit64V2.encode(id, decoded.cube), {TAG: "Ok", _0: token});
    }
  });

  test("agrees with the V1 codec on corners for the sizes it decodes", () => {
    for (const [, token] of publishedStateVectors.filter(([size]) => size < 5)) {
      const v1 = ok(Orbit64Codec.decodeState(token));
      const corner = Orbit64Codec.inputCoordinates(v1.size, FaceletCodec.render(v1))[0];
      const decoded = ok(Orbit64V2.decode(token));
      assert.deepEqual(decoded.cube.cornerPieces, corner.p);
      assert.deepEqual(decoded.cube.cornerTwists, corner.o);
    }
  });

  test("rejects the 43-character V1 5x5 token", () => {
    const five = publishedStateVectors.find(([size]) => size === 5)[1];
    assert.equal(five.length, 43);
    assert.equal(Orbit64V2.decode(five).TAG, "Error");
    assert.equal(Orbit64V2.decode("A".repeat(43)).TAG, "Error");
  });
});

describe("Orbit64 V2 rejects malformed input without throwing", () => {
  test("unknown or malformed tokens", () => {
    const tokens = ["", "A", "AAA", "AAAAAA", "AAA!A", "AAAA ", "ÄÄÄÄ", "A".repeat(640), "A".repeat(100)];
    for (const token of tokens) assert.equal(Orbit64V2.decode(token).TAG, "Error", JSON.stringify(token));
    for (const bad of [undefined, null, 5, {}, ["AAAA"]]) assert.equal(Orbit64V2.decode(bad).TAG, "Error");
  });

  test("tokens past the end of an entry's range", () => {
    // Entry 0 holds 3,674,160 of the 64^4 four-character values; the rest is unallocated.
    assert.ok(Orbit64V2.registry[0].count < 64n ** 4n);
    assert.equal(Orbit64V2.decode("____").TAG, "Error");
    const last = Orbit64V2.registry[0].count - 1n;
    assert.equal(Orbit64V2.decode(Orbit64V2.toBase64(last, 4)).TAG, "Ok");
    assert.equal(Orbit64V2.decode(Orbit64V2.toBase64(last + 1n, 4)).TAG, "Error");
  });

  test("unknown entries", () => {
    const cube = Orbit64V2.solved(2, "color");
    for (const id of [-1, 54, 1.5, NaN, undefined, "0"]) assert.equal(Orbit64V2.encode(id, cube).TAG, "Error");
  });

  test("short, long, and missing arrays", () => {
    const solved = (n, model) => Orbit64V2.solved(n, model);
    const cases = [
      [0, {...solved(2, "color"), cornerPieces: [0, 1, 2]}],
      [0, {...solved(2, "color"), cornerTwists: []}],
      [0, {...solved(2, "color"), cornerTwists: [0, 0, 0, 0, 0, 0, 0, 0, 0]}],
      [2, {...solved(3, "color"), midgePieces: [0, 1]}],
      [8, {...solved(4, "picture"), wings: []}],
      [8, {...solved(4, "picture"), centers: [[0, 1, 2]]}],
      [4, {...solved(3, "picture"), rotations: [0, 0, 0]}],
      [6, {...solved(4, "color"), centers: [[0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5]]}],
    ];
    for (const [id, cube] of cases) assert.equal(Orbit64V2.encode(id, cube).TAG, "Error", JSON.stringify([id]));
    for (const cube of [undefined, null, 7, "x", {}, {cornerPieces: "abc"}]) {
      assert.equal(Orbit64V2.encode(0, cube).TAG, "Error");
    }
  });

  test("values out of range and non-integers", () => {
    const base = Orbit64V2.solved(2, "color");
    assert.equal(Orbit64V2.encode(0, {...base, cornerPieces: [0, 1, 2, 3, 4, 5, 6, 8]}).TAG, "Error");
    assert.equal(Orbit64V2.encode(0, {...base, cornerPieces: [0, 1, 2, 3, 4, 5, 6, 6]}).TAG, "Error");
    assert.equal(Orbit64V2.encode(0, {...base, cornerTwists: [3, 0, 0, 0, 0, 0, 0, 0]}).TAG, "Error");
    assert.equal(Orbit64V2.encode(0, {...base, cornerTwists: [0.5, 0, 0, 0, 0, 0, 0, 0.5]}).TAG, "Error");
    assert.equal(Orbit64V2.encode(0, {...base, cornerTwists: ["0", 0, 0, 0, 0, 0, 0, 0]}).TAG, "Error");
  });

  test("states that break an orientation law, parity relation or pose", () => {
    const swap = (v) => [v[1], v[0], ...v.slice(2)];
    const picture3 = Orbit64V2.solved(3, "picture");
    assert.equal(Orbit64V2.encode(4, {...picture3, cornerTwists: [1, 0, 0, 0, 0, 0, 0, 0]}).TAG, "Error");
    assert.equal(Orbit64V2.encode(4, {...picture3, midgeFlips: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]}).TAG, "Error");
    assert.equal(Orbit64V2.encode(4, {...picture3, cornerPieces: swap(picture3.cornerPieces)}).TAG, "Error");
    assert.equal(Orbit64V2.encode(4, {...picture3, rotations: [1, 0, 0, 0, 0, 0]}).TAG, "Error");
    assert.equal(Orbit64V2.encode(4, {...picture3, frame: 5}).TAG, "Error");
    assert.equal(Orbit64V2.encode(5, {...picture3, frame: 5}).TAG, "Ok");
    assert.equal(Orbit64V2.encode(5, {...picture3, frame: 24}).TAG, "Error");
    const picture4 = Orbit64V2.solved(4, "picture");
    assert.equal(Orbit64V2.encode(8, {...picture4, centers: [swap(picture4.centers[0])]}).TAG, "Error");
    const color2 = Orbit64V2.solved(2, "color");
    const moved = {...color2, cornerTwists: [0, 0, 0, 0, 0, 0, 1, 2]};
    assert.equal(Orbit64V2.encode(0, moved).TAG, "Error");
    assert.equal(Orbit64V2.encode(1, moved).TAG, "Ok");
    const color4 = Orbit64V2.solved(4, "color");
    const unbalanced = [5, ...color4.centers[0].slice(1)];
    assert.equal(Orbit64V2.encode(6, {...color4, centers: [unbalanced]}).TAG, "Error");
  });

  test("an odd picture state breaking only a wing-dependent '+' center relation", () => {
    // n = 5 has one wing orbit (W1) and centers Z[1,1], Z[1,2]; Z[1,2] = C + W1.
    const solved = Orbit64V2.solved(5, "picture");
    const swap = (v) => [v[1], v[0], ...v.slice(2)];
    assert.equal(Orbit64V2.encode(13, solved).TAG, "Ok");
    const bad = {...solved, centers: [solved.centers[0], swap(solved.centers[1])]};
    assert.equal(Orbit64V2.encode(13, bad).TAG, "Error");
    // Swapping the same pair in W1 as well satisfies the relation again.
    const fixed = {...bad, wings: [swap(solved.wings[0])]};
    assert.equal(Orbit64V2.encode(13, fixed).TAG, "Ok");
  });

  test("an even canonical state with the DBL piece moved", () => {
    const solved = Orbit64V2.solved(2, "color");
    const pieces = [0, 1, 2, 3, 4, 5, 7, 6];
    const moved = {...solved, cornerPieces: pieces, cornerTwists: [0, 0, 0, 0, 0, 0, 0, 0]};
    assert.equal(Orbit64V2.encode(0, moved).TAG, "Error");
    assert.equal(Orbit64V2.encode(1, moved).TAG, "Ok");
    const picture = Orbit64V2.solved(4, "picture");
    const odd = {...picture, cornerPieces: [0, 1, 2, 3, 4, 5, 7, 6]};
    assert.equal(Orbit64V2.encode(8, odd).TAG, "Error");
  });
});

describe("Orbit64 V2 hardening", () => {
  test("sparse arrays are rejected", () => {
    const solved = Orbit64V2.solved(3, "color");
    const twists = [1, 1, 1, 0, 0, 0, 0];
    twists.length = 8;
    assert.equal(Orbit64V2.encode(2, {...solved, cornerTwists: twists}).TAG, "Error");
    const flips = new Array(12).fill(0);
    delete flips[4];
    assert.equal(Orbit64V2.encode(2, {...solved, midgeFlips: flips}).TAG, "Error");
    const wings = new Array(24);
    const picture4 = Orbit64V2.solved(4, "picture");
    assert.equal(Orbit64V2.encode(8, {...picture4, wings: [wings]}).TAG, "Error");
    const rows = new Array(1);
    assert.equal(Orbit64V2.encode(8, {...picture4, centers: rows}).TAG, "Error");
    const rotations = [0, 0, 0, 0, 0];
    rotations.length = 6;
    assert.equal(Orbit64V2.encode(4, {...Orbit64V2.solved(3, "picture"), rotations}).TAG, "Error");
  });

  test("error messages describe the failure", () => {
    const hostile = new Proxy({}, {get() { throw new Error("boom"); }});
    const result = Orbit64V2.encode(0, hostile);
    assert.equal(result.TAG, "Error");
    assert.match(result._0.message, /boom/);
    assert.ok(!result._0.message.includes("[object Object]"));
  });

  test("hostile getters and proxies yield an error value", () => {
    const getter = {...Orbit64V2.solved(2, "color")};
    Object.defineProperty(getter, "midgePieces", {get() { throw new Error("getter"); }});
    assert.equal(Orbit64V2.encode(0, getter).TAG, "Error");
    const nested = {...Orbit64V2.solved(2, "color"), cornerPieces: new Proxy([], {get() { throw new Error("nested"); }})};
    assert.equal(Orbit64V2.encode(0, nested).TAG, "Error");
  });

  test("a decoded entry is a copy: mutating it does not affect later decodes", () => {
    const first = ok(Orbit64V2.decode("AAAA"));
    try {
      first.entry.length = 99;
      first.entry.offset = 5n;
      first.entry.id = 42;
    } catch {
      // A frozen entry may throw in strict mode; either way the registry must be intact.
    }
    const second = ok(Orbit64V2.decode("AAAA"));
    assert.equal(second.entry.id, 0);
    assert.equal(second.entry.length, 4);
    assert.equal(second.entry.offset, 0n);
    assert.equal(Orbit64V2.registry[0].length, 4);
    assert.ok(Object.isFrozen(Orbit64V2.registry[0]));
  });
});
