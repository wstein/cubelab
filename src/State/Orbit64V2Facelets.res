/**
 * The Orbit64 V2 facelet bridge for the color model (flix-orbit64 FORMAT-V2.md,
 * `Orbit64.V2.Facelets`): a cube state to its stickers and back, for `n = 2..15`.
 *
 * A facelet string writes the `6 n^2` stickers as the letters `U R F D L B`,
 * one per facelet, in six face fields of that order separated by one space.
 * Facelet `face * n^2 + row * n + col` follows FORMAT.md. Reading ignores
 * spaces only: a tab or newline is a bad letter like any other.
 *
 * The slot tables follow FORMAT-V2-SLOTS.md. Three tables of Orbit64Codec carry
 * the V1 convention: the corners and midges of the 5x5x5 and the wings of the
 * 4x4x4. Every other size takes its slots by replacing each axis of a reference
 * facelet, `0` by `0`, `1` by the wing depth `d`, `2` (5x5x5 only) by `n / 2`,
 * and the last two by `n - 1 - d` and `n - 1`. Center orbits come from geometry:
 * the four quarter turn images of a cell, on six faces, ordered by facelet index.
 * A piece is numbered by its home slot and the solved cube shows face colors, so a
 * piece's colors are the faces of its home slot's facelets.
 *
 * The picture model writes one base64url symbol per facelet instead of a letter: the
 * index of the sticker within its class (corner `3 p + j`, midge and wing `2 p + j`, a
 * center orbit sticker its home slot, a fixed center `4 p + r` with its rotation `r`),
 * in the same six fields. A symbol only means something on the class of its facelet, so
 * reading checks every class before it reads any piece. The 2x2x2 has no picture entry.
 * The entry points `tables`, `toFacelets`, `fromFacelets`, `encode` and `decode` return
 * a result and never throw, whatever they are given; the helpers above them are
 * internal building blocks that expect a valid size.
 */
module V2 = Orbit64V2

type tables = {
  corners: array<array<int>>,
  midges: array<array<int>>,
  wings: array<array<array<int>>>,
  centers: array<array<int>>,
  fixed: array<int>,
}

/** A position (on the doubled grid) or a direction. */
type vec = (int, int, int)

/** A rotation as the images of the unit vectors `x`, `y` and `z`. */
type turn = (vec, vec, vec)

let get = Orbit64Codec.get
let fail = Orbit64Codec.fail

let letters = ["U", "R", "F", "D", "L", "B"]

let range = (first: int, stop: int): array<int> =>
  Array.fromInitializer(~length=Math.Int.max(0, stop - first), i => first + i)

// ------------------------------------------------------------------ slot tables

let expandAxis = (n: int, base: int, depth: int, value: int): int =>
  if base == 4 {
    get([0, depth, n - 1 - depth, n - 1], value)
  } else {
    get([0, depth, n / 2, n - 1 - depth, n - 1], value)
  }

/** Carry a reference facelet of a `base x base` cube to wing depth `depth` of an `n x n x n`. */
let expandFacelet = (n: int, base: int, depth: int, index: int): int => {
  let face = index / (base * base)
  let row = mod(index / base, base)
  let col = mod(index, base)
  face * n * n + expandAxis(n, base, depth, row) * n + expandAxis(n, base, depth, col)
}

let expandTable = (n: int, base: int, depth: int, table: array<array<int>>): array<array<int>> =>
  table->Array.map(slot => slot->Array.map(i => expandFacelet(n, base, depth, i)))

let centerRepresentative = (n: int, row: int, col: int): bool => {
  let last = n - 1
  let rank = row * n + col
  rank <= col * n + last - row &&
  rank <= (last - row) * n + last - col &&
  rank <= (last - col) * n + row
}

/** The four quarter turn images of a cell, on all six faces, by facelet index. */
let centerTable = (n: int, row: int, col: int): array<int> => {
  let last = n - 1
  range(0, 6 * n * n)->Array.filter(i => {
    let cell = mod(i, n * n)
    cell == row * n + col ||
    cell == col * n + last - row ||
    cell == (last - row) * n + last - col ||
    cell == (last - col) * n + row
  })
}

/** Center orbits ordered by their lowest facelet; the fixed center of an odd cube is no orbit. */
let centerTables = (n: int): array<array<int>> => {
  let out = []
  for row in 1 to n - 2 {
    for col in 1 to n - 2 {
      if centerRepresentative(n, row, col) && !(V2.isOdd(n) && row == n / 2 && col == n / 2) {
        out->Array.push(centerTable(n, row, col))
      }
    }
  }
  out
}

let fixedFacelets = (n: int): array<int> => {
  let middle = (n * n - 1) / 2
  V2.isOdd(n) ? range(0, 6)->Array.map(f => f * n * n + middle) : []
}

/** The facelets of every slot of an `n x n x n`, in slot order, for `n = 2..15`. */
let buildTables = (n: int): tables => {
  corners: expandTable(n, 5, 1, Orbit64Codec.c5),
  midges: V2.isOdd(n) ? expandTable(n, 5, 1, Orbit64Codec.e5) : [],
  wings: range(1, V2.wingOrbits(n) + 1)->Array.map(d => expandTable(n, 4, d, Orbit64Codec.w4)),
  centers: centerTables(n),
  fixed: fixedFacelets(n),
}

/** The face color of a facelet: in the solved cube a sticker shows its face. */
let faceOf = (n: int, facelet: int): int => facelet / (n * n)

// --------------------------------------------------------------------- geometry

/** Position (doubled grid, `-m..m` with `m = n - 1`) and outward normal of a facelet. */
let geometry = (n: int, index: int): (vec, vec) => {
  let m = n - 1
  let face = index / (n * n)
  let a = 2 * mod(index, n) - m
  let b = 2 * mod(index / n, n) - m
  switch face {
  | 0 => ((a, m, b), (0, 1, 0))
  | 1 => ((m, -b, -a), (1, 0, 0))
  | 2 => ((a, -b, m), (0, 0, 1))
  | 3 => ((a, -m, -b), (0, -1, 0))
  | 4 => ((-m, -b, a), (-1, 0, 0))
  | _ => ((-a, -b, -m), (0, 0, -1))
  }
}

let faceOfNormal = ((x, y, z): vec): int =>
  switch (x, y, z) {
  | (0, 1, 0) => 0
  | (1, 0, 0) => 1
  | (0, 0, 1) => 2
  | (0, -1, 0) => 3
  | (-1, 0, 0) => 4
  | _ => 5
  }

let normalOf = (face: int): vec =>
  switch face {
  | 0 => (0, 1, 0)
  | 1 => (1, 0, 0)
  | 2 => (0, 0, 1)
  | 3 => (0, -1, 0)
  | 4 => (-1, 0, 0)
  | _ => (0, 0, -1)
  }

/** The `(a, b)` grid coordinates of a position on a face, as in `geometry`. */
let gridOf = (face: int, (x, y, z): vec): (int, int) =>
  switch face {
  | 0 => (x, z)
  | 1 => (-z, -y)
  | 2 => (x, -y)
  | 3 => (x, -z)
  | 4 => (z, -y)
  | _ => (-x, -y)
  }

/** The inverse of `geometry`. */
let faceletAt = (n: int, position: vec, normal: vec): int => {
  let m = n - 1
  let face = faceOfNormal(normal)
  let (a, b) = gridOf(face, position)
  face * n * n + (b + m) / 2 * n + (a + m) / 2
}

/** The 24 whole-cube frames of FORMAT.md in wire order: the physical face in each slot `U R F D L B`. */
let frameFaces: array<string> = [
  "URFDLB",
  "UBRDFL",
  "ULBDRF",
  "UFLDBR",
  "FRDBLU",
  "FURBDL",
  "FLUBRD",
  "FDLBUR",
  "DRBULF",
  "DFRUBL",
  "DLFURB",
  "DBLUFR",
  "BRUFLD",
  "BDRFUL",
  "BLDFRU",
  "BULFDR",
  "LUFRDB",
  "LBURFD",
  "LDBRUF",
  "LFDRBU",
  "RDFLUB",
  "RBDLFU",
  "RUBLDF",
  "RFULBD",
]

let frameCount = Array.length(frameFaces)

/** The physical faces in slots `U R F D L B` of frame `frame`, as indices. */
let facesOfFrame = (frame: int): array<int> =>
  get(frameFaces, frame)
  ->String.split("")
  ->Array.map(letter => String.indexOf("URFDLB", letter))

/** The rotation of frame `frame`: it moves physical face `faces[i]` onto slot `i`. */
let turnOf = (frame: int): turn => {
  let faces = facesOfFrame(frame)
  let slotOf = f => normalOf(Array.indexOf(faces, f))
  (slotOf(1), slotOf(0), slotOf(2))
}

let dot = ((ax, ay, az): vec, (bx, by, bz): vec): int => ax * bx + ay * by + az * bz

let scale = (k: int, (x, y, z): vec): vec => (k * x, k * y, k * z)

let add = ((ax, ay, az): vec, (bx, by, bz): vec): vec => (ax + bx, ay + by, az + bz)

let forward = ((ex, ey, ez): turn, (x, y, z): vec): vec =>
  add(scale(x, ex), add(scale(y, ey), scale(z, ez)))

/** The inverse of a rotation is its transpose. */
let backward = ((ex, ey, ez): turn, v: vec): vec => (dot(v, ex), dot(v, ey), dot(v, ez))

/** The stickers after the cube is rotated by `turn`: each sticker moves with its color. */
let rotate = (n: int, turn: turn, fs: array<int>): array<int> =>
  fs->Array.mapWithIndex((_, i) => {
    let (p, q) = geometry(n, i)
    get(fs, faceletAt(n, backward(turn, p), backward(turn, q)))
  })

/** The stickers of the cube rotated back: the inverse of `rotate`. */
let unrotate = (n: int, turn: turn, fs: array<int>): array<int> =>
  fs->Array.mapWithIndex((_, i) => {
    let (p, q) = geometry(n, i)
    get(fs, faceletAt(n, forward(turn, p), forward(turn, q)))
  })

// ------------------------------------------------------------------- the types

let isInt = V2.isInt

let isOneOf: ('a, array<string>) => bool = %raw(`function(value, names) {
  return typeof value === "string" && names.includes(value);
}`)

/** Why a type has no facelet string, if it has none: an unknown size, model or pose, or the 2x2x2 picture. */
let typeFault = (n: int, model: V2.model, pose: V2.pose): option<(string, string)> =>
  if !isInt(n) || n < 2 || n > 15 {
    Some(("UnsupportedType", "No V2 type for that size."))
  } else if !isOneOf(model, ["color", "picture"]) {
    Some(("UnsupportedModel", "The V2 models are color and picture."))
  } else if model == Picture && n == 2 {
    Some((
      "UnsupportedModel",
      "The 2x2x2 has no picture entry: its picture model is the color model.",
    ))
  } else if !isOneOf(pose, ["canonical", "framed"]) {
    Some(("UnsupportedPose", "The V2 poses are canonical and framed."))
  } else {
    None
  }

let describeFault = (n: int, model: V2.model, pose: V2.pose) =>
  switch typeFault(n, model, pose) {
  | Some((tag, message)) => Some(Orbit64Codec.fail(tag, message))
  | None => None
  }

/** The slot tables of an `n x n x n`, `n = 2..15`; any other size is an error. */
let tables = (n: int): result<tables, Orbit64Codec.orbitError> =>
  switch typeFault(n, Color, Canonical) {
  | Some((tag, message)) => fail(tag, message)
  | None => Ok(buildTables(n))
  }

/** Run `attempt`; any exception, however hostile, is a fixed error and is never read or echoed. */
let guard: (unit => result<'a, Orbit64Codec.orbitError>) => result<
  'a,
  Orbit64Codec.orbitError,
> = %raw(`function(attempt) {
  try {
    return attempt();
  } catch (_) {
    return {TAG: "Error", _0: {TAG: "InvalidState", message: "The state could not be read."}};
  }
}`)

// ------------------------------------------------------------ cube to stickers

/** What each sticker of each piece shows: the face color of its home facelet. */
let colorLabels = (n: int, table: array<array<int>>): array<array<int>> =>
  table->Array.map(slot => slot->Array.map(i => faceOf(n, i)))

/** What each sticker of each piece shows in the picture model: `m p + j`. */
let pictureLabels = (table: array<array<int>>): array<array<int>> =>
  table->Array.mapWithIndex((slot, p) => {
    let m = Array.length(slot)
    range(0, m)->Array.map(j => m * p + j)
  })

let labelsOf = (n: int, model: V2.model, table: array<array<int>>): array<array<int>> =>
  model == Picture ? pictureLabels(table) : colorLabels(n, table)

let writeOriented = (
  sticker: array<int>,
  table: array<array<int>>,
  labels: array<array<int>>,
  pieces: array<int>,
  twists: array<int>,
): unit =>
  table->Array.forEachWithIndex((slotFacelets, slot) => {
    let m = Array.length(slotFacelets)
    let shown = get(labels, get(pieces, slot))
    let twist = get(twists, slot)
    for k in 0 to m - 1 {
      sticker->Array.setUnsafe(get(slotFacelets, k), get(shown, mod(k - twist + m, m)))
    }
  })

let writeCenters = (sticker: array<int>, table: array<int>, colors: array<int>): unit =>
  table->Array.forEachWithIndex((facelet, slot) =>
    sticker->Array.setUnsafe(facelet, get(colors, slot))
  )

/**
 * A private, dense snapshot of a cube, taken once before anything is validated or painted.
 *
 * Every index and every property is read exactly once, so a getter or a mutating Proxy cannot
 * show the validation one cube and the painting another. Elements that are not integers become
 * `undefined`, which the shape check rejects as it rejected them before; an array whose length is
 * not an integer from 0 to 1024 (read once, never called back) and a non-array component become
 * `false`, which fail the same shape check. Absent components
 * become empty, as in `Orbit64V2.withDefaults`; anything but an object is `undefined`.
 */
let snapshot: 'a => option<V2.cube> = %raw(`function(value) {
  if (typeof value !== "object" || value === null) return undefined;
  const LIMIT = 1024;
  const element = x => (Number.isInteger(x) ? x : undefined);
  // The length of an array, read once; false unless it is an integer in 0..LIMIT.
  const lengthOf = v => {
    const length = v.length;
    return typeof length === "number" && Number.isInteger(length) && length >= 0 && length <= LIMIT
      ? length
      : false;
  };
  const vector = v => {
    if (!Array.isArray(v)) return false;
    const length = lengthOf(v);
    if (length === false) return false;
    const copy = new Array(length);
    for (let i = 0; i < length; i++) copy[i] = element(v[i]);
    return copy;
  };
  const matrix = v => {
    if (!Array.isArray(v)) return false;
    const length = lengthOf(v);
    if (length === false) return false;
    const copy = new Array(length);
    for (let i = 0; i < length; i++) copy[i] = vector(v[i]);
    return copy;
  };
  const component = (key, copy) => {
    const v = value[key];
    return v === undefined || v === null ? [] : copy(v);
  };
  const frame = value.frame;
  return {
    cornerPieces: component("cornerPieces", vector),
    cornerTwists: component("cornerTwists", vector),
    midgePieces: component("midgePieces", vector),
    midgeFlips: component("midgeFlips", vector),
    wings: component("wings", matrix),
    centers: component("centers", matrix),
    rotations: component("rotations", vector),
    frame: frame === undefined ? 0 : Number.isInteger(frame) ? frame : NaN,
  };
}`)

/** A fixed center shows its face color, or in the picture model its piece and rotation. */
let fixedValue = (model: V2.model, cube: V2.cube, face: int): int =>
  model == Picture ? 4 * face + get(cube.rotations, face) : face

/** The stickers of a canonical-pose cube; fixed centers are home. */
let paint = (n: int, t: tables, model: V2.model, cube: V2.cube): array<int> => {
  let sticker = Array.make(~length=6 * n * n, 0)
  let labels = table => labelsOf(n, model, table)
  t.fixed->Array.forEachWithIndex((facelet, f) =>
    sticker->Array.setUnsafe(facelet, fixedValue(model, cube, f))
  )
  writeOriented(sticker, t.corners, labels(t.corners), cube.cornerPieces, cube.cornerTwists)
  if V2.isOdd(n) {
    writeOriented(sticker, t.midges, labels(t.midges), cube.midgePieces, cube.midgeFlips)
  }
  t.wings->Array.forEachWithIndex((table, i) =>
    writeOriented(sticker, table, labels(table), get(cube.wings, i), Array.make(~length=24, 0))
  )
  t.centers->Array.forEachWithIndex((table, i) =>
    writeCenters(sticker, table, get(cube.centers, i))
  )
  sticker
}

/** The symbol of a sticker value: a letter in the color model, base64url in the picture model. */
let symbolOf = (model: V2.model, value: int): string =>
  model == Picture ? String.charAt(V2.digits, value) : get(letters, value)

let spell = (n: int, model: V2.model, fs: array<int>): string =>
  range(0, 6)
  ->Array.map(face =>
    range(0, n * n)->Array.map(i => symbolOf(model, get(fs, face * n * n + i)))->Array.join("")
  )
  ->Array.join(" ")

// ------------------------------------------------------ fixed center rotations

let cross = ((ax, ay, az): vec, (bx, by, bz): vec): vec => (
  ay * bz - az * by,
  az * bx - ax * bz,
  ax * by - ay * bx,
)

/** The reference direction of a face: toward row 0, so toward `B` on `U` and `F` on `D`. */
let reference = (face: int): vec =>
  switch face {
  | 0 => (0, 0, -1)
  | 3 => (0, 0, 1)
  | _ => (0, 1, 0)
  }

/** A direction on a face turned `k` clockwise quarter turns, seen from outside. */
let rec spin = (normal: vec, direction: vec, k: int): vec =>
  k <= 0 ? direction : spin(normal, cross(direction, normal), k - 1)

/** The clockwise quarter turns from the reference direction of `face` to `direction`. */
let quarterTurns = (face: int, direction: vec): int =>
  range(0, 4)
  ->Array.find(k => spin(normalOf(face), reference(face), k) == direction)
  ->Option.getOr(0)

/** Where the fixed center of `face` with rotation `r` lands under `move`, and its new rotation. */
let carryFixed = (move: vec => vec, face: int, r: int): (int, int) => {
  let own = spin(normalOf(face), reference(face), r)
  let landed = faceOfNormal(move(normalOf(face)))
  (landed, quarterTurns(landed, move(own)))
}

/** `permuted` is `before` with its facelets moved; carry the fixed centers along. */
let turnFixed = (n: int, move: vec => vec, before: array<int>, permuted: array<int>): array<
  int,
> => {
  let out = Array.copy(permuted)
  let fixed = fixedFacelets(n)
  range(0, 6)->Array.forEach(face => {
    let value = get(before, get(fixed, face))
    let (landed, r) = carryFixed(move, face, mod(value, 4))
    out->Array.setUnsafe(get(fixed, landed), 4 * (value / 4) + r)
  })
  out
}

/** The picture of a cube turned by `turn`: stickers and fixed center rotations. */
let rotatePicture = (n: int, turn: turn, fs: array<int>): array<int> =>
  turnFixed(n, v => forward(turn, v), fs, rotate(n, turn, fs))

/** The picture of a cube turned back by `turn`. */
let unrotatePicture = (n: int, turn: turn, fs: array<int>): array<int> =>
  turnFixed(n, v => backward(turn, v), fs, unrotate(n, turn, fs))

/** Shape, range and law checks of the V2 codec: the reason a state is no cube of the type. */
let stateFault = (n: int, model: V2.model, pose: V2.pose, cube: V2.cube): option<string> =>
  switch V2.layoutFault(n, model, pose, cube) {
  | Some(why) => Some(why)
  | None => V2.lawFault(n, model, pose, cube)
  }

/**
 * The facelet string of a cube state of the type `(n, model, pose)`.
 *
 * A canonical cube is written in its reference pose. A framed cube of an odd
 * size is that picture rotated by `cube.frame`; a framed cube of an even size
 * shows its pose in its corners already. The color model writes letters, the picture
 * model base64url symbols.
 */
let toFacelets = (n: int, model: V2.model, pose: V2.pose, cube: V2.cube): result<
  string,
  Orbit64Codec.orbitError,
> =>
  switch describeFault(n, model, pose) {
  | Some(error) => error
  | None =>
    guard(() =>
      switch snapshot(cube) {
      | None => fail("InvalidState", "The state must be an object.")
      | Some(cube) =>
        switch stateFault(n, model, pose, cube) {
        | Some(why) => fail("InvalidState", why)
        | None =>
          let fs = paint(n, buildTables(n), model, cube)
          let turned = if !V2.isOdd(n) {
            fs
          } else if model == Picture {
            rotatePicture(n, turnOf(cube.frame), fs)
          } else {
            rotate(n, turnOf(cube.frame), fs)
          }
          Ok(spell(n, model, turned))
        }
      }
    )
  }

// ------------------------------------------------------------ stickers to cube

let isString = V2.isString

/** The code points of a string; a surrogate pair is one character. */
let codePoints: string => array<string> = %raw(`function(text) { return Array.from(text); }`)

/** A character as written in a message; a code point past U+FFFF or a lone surrogate as `U+XXXX`. */
let describeChar: string => string = %raw(`function(c) {
  const code = c.codePointAt(0);
  const surrogate = code >= 0xd800 && code <= 0xdfff;
  return code > 0xffff || surrogate ? "U+" + code.toString(16).toUpperCase().padStart(4, "0") : c;
}`)

let letterIndex = (c: string): option<int> => {
  let i = String.indexOf("URFDLB", c)
  String.length(c) == 1 && i >= 0 ? Some(i) : None
}

let wrongLength = (n: int, length: int): Orbit64Codec.orbitError => {
  tag: "InvalidFaceletLength",
  message: `Expected ${Int.toString(6 * n * n)} facelets for the ${Int.toString(n)}x${Int.toString(
      n,
    )}x${Int.toString(n)}, got ${Int.toString(length)}.`,
}

/** The stickers of a facelet string as face indices, or why it is no string of `n^2` per face. */
let parse = (n: int, text: string): result<array<int>, Orbit64Codec.orbitError> => {
  let chars = codePoints(text)->Array.filter(c => c != " ")
  switch chars->Array.find(c => letterIndex(c) == None) {
  | Some(c) => fail("InvalidFacelet", `Facelet '${describeChar(c)}' is not one of U R F D L B.`)
  | None =>
    let length = Array.length(chars)
    if length != 6 * n * n {
      Error(wrongLength(n, length))
    } else {
      Ok(chars->Array.map(c => String.indexOf("URFDLB", c)))
    }
  }
}

/** What a scan of a picture string found: its symbol values, its first bad character or its count. */
type scanned =
  | Symbols(array<int>)
  | BadSymbol(string)
  | Count(int)

/**
 * Scan a picture string once, by code point and without building a copy of it: spaces are
 * skipped, the first character outside the base64url alphabet ends the scan, and values are
 * kept only up to `6 n^2`, so the memory is bounded however long the string is.
 */
let scanSymbols: (int, string, string) => scanned = %raw(`function(n, text, alphabet) {
  const expected = 6 * n * n;
  const values = [];
  let count = 0;
  for (const c of text) {
    if (c === " ") continue;
    const value = c.length === 1 ? alphabet.indexOf(c) : -1;
    if (value < 0) return {TAG: "BadSymbol", _0: c};
    if (count < expected) values.push(value);
    count += 1;
  }
  return count === expected ? {TAG: "Symbols", _0: values} : {TAG: "Count", _0: count};
}`)

/** The stickers of a picture string as symbol values, or why it is no string of `n^2` per face. */
let parsePicture = (n: int, text: string): result<array<int>, Orbit64Codec.orbitError> =>
  switch scanSymbols(n, text, V2.digits) {
  | BadSymbol(c) =>
    fail("InvalidFacelet", `Facelet '${describeChar(c)}' is not a base64url symbol.`)
  | Count(length) => Error(wrongLength(n, length))
  | Symbols(values) => Ok(values)
  }

let checkCounts = (n: int, fs: array<int>): option<Orbit64Codec.orbitError> =>
  range(0, 6)
  ->Array.find(f => V2.copies(fs, f) != n * n)
  ->Option.map(f => {
    Orbit64Codec.tag: "InvalidFaceletCounts",
    message: `Color ${get(letters, f)} occurs ${Int.toString(
        V2.copies(fs, f),
      )} times, expected ${Int.toString(n * n)}.`,
  })

/** The stickers on the facelets of one slot. */
let seenAt = (table: array<array<int>>, slot: int, fs: array<int>): array<int> =>
  get(table, slot)->Array.map(at => get(fs, at))

/** The piece and twist whose colors, read from the slot's first facelet, are `seen`. */
let readPiece = (n: int, table: array<array<int>>, seen: array<int>): option<(int, int)> => {
  let m = Array.length(seen)
  let found = ref(None)
  table->Array.forEachWithIndex((home, p) =>
    if found.contents == None {
      range(0, m)->Array.forEach(o =>
        if (
          found.contents == None &&
            range(0, m)->Array.every(k => get(seen, k) == faceOf(n, get(home, mod(k - o + m, m))))
        ) {
          found := Some((p, o))
        }
      )
    }
  )
  found.contents
}

let noPiece = (
  model: V2.model,
  what: string,
  slot: int,
  seen: array<int>,
): Orbit64Codec.orbitError => {
  let shown = seen->Array.map(v => symbolOf(model, v))->Array.join("")
  {
    tag: "InvalidFaceletPiece",
    message: `The ${what} slot ${Int.toString(
        slot,
      )} shows ${shown}, which is no ${what} of this cube.`,
  }
}

let readOriented = (n: int, what: string, table: array<array<int>>, fs: array<int>): result<
  (array<int>, array<int>),
  Orbit64Codec.orbitError,
> => {
  let pieces = []
  let twists = []
  let fault = ref(None)
  table->Array.forEachWithIndex((_, slot) =>
    if fault.contents == None {
      let seen = seenAt(table, slot, fs)
      switch readPiece(n, table, seen) {
      | Some((p, o)) =>
        pieces->Array.push(p)
        twists->Array.push(o)
      | None => fault := Some(noPiece(Color, what, slot, seen))
      }
    }
  )
  switch fault.contents {
  | Some(error) => Error(error)
  | None => Ok((pieces, twists))
  }
}

/** A wing carries no twist: its two stickers sit in the order of its home slot or not at all. */
let readWings = (n: int, table: array<array<int>>, fs: array<int>): result<
  array<int>,
  Orbit64Codec.orbitError,
> => {
  let solved = range(0, 6 * n * n)->Array.map(i => faceOf(n, i))
  let homes = table->Array.mapWithIndex((_, p) => seenAt(table, p, solved))
  let pieces = []
  let fault = ref(None)
  table->Array.forEachWithIndex((_, slot) =>
    if fault.contents == None {
      let seen = seenAt(table, slot, fs)
      switch homes->Array.findIndexOpt(home => home == seen) {
      | Some(p) => pieces->Array.push(p)
      | None => fault := Some(noPiece(Color, "wing", slot, seen))
      }
    }
  )
  switch fault.contents {
  | Some(error) => Error(error)
  | None => Ok(pieces)
  }
}

/** The coordinates of a canonical-pose string; the frame is `frame`. */
let readCube = (n: int, t: tables, frame: int, fs: array<int>): result<
  V2.cube,
  Orbit64Codec.orbitError,
> =>
  switch readOriented(n, "corner", t.corners, fs) {
  | Error(e) => Error(e)
  | Ok((cp, co)) =>
    let midges = V2.isOdd(n) ? readOriented(n, "midge", t.midges, fs) : Ok(([], []))
    switch midges {
    | Error(e) => Error(e)
    | Ok((mp, mo)) =>
      let wings = []
      let fault = ref(None)
      t.wings->Array.forEach(table =>
        if fault.contents == None {
          switch readWings(n, table, fs) {
          | Ok(w) => wings->Array.push(w)
          | Error(e) => fault := Some(e)
          }
        }
      )
      switch fault.contents {
      | Some(e) => Error(e)
      | None =>
        Ok({
          V2.cornerPieces: cp,
          cornerTwists: co,
          midgePieces: mp,
          midgeFlips: mo,
          wings,
          centers: t.centers->Array.map(table => table->Array.map(at => get(fs, at))),
          rotations: [],
          frame,
        })
      }
    }
  }

/** The frame whose faces, in slot order, are `shown`, or why the fixed centers are no frame. */
let frameShown = (shown: array<int>): result<int, Orbit64Codec.orbitError> =>
  switch range(0, frameCount)->Array.find(r => facesOfFrame(r) == shown) {
  | Some(r) => Ok(r)
  | None =>
    fail("InvalidFaceletFrame", "The six fixed centers are not a right-handed whole-cube frame.")
  }

/** Rotate an odd cube so that its fixed centers are home; the frame is the one they show. */
let normalizeOdd = (n: int, t: tables, fs: array<int>): result<
  (int, array<int>),
  Orbit64Codec.orbitError,
> =>
  frameShown(t.fixed->Array.map(at => get(fs, at)))->Result.map(r => (
    r,
    unrotate(n, turnOf(r), fs),
  ))

/** Rotate an even cube so that its DBL corner is in slot DBL with twist 0; `atHome` tells when it is. */
let normalizeEven = (n: int, fs: array<int>, atHome: array<int> => bool): result<
  array<int>,
  Orbit64Codec.orbitError,
> => {
  let homes = range(0, frameCount)->Array.map(r => unrotate(n, turnOf(r), fs))->Array.find(atHome)
  switch homes {
  | Some(rotated) => Ok(rotated)
  | None => fail("InvalidFaceletFrame", "No whole-cube rotation puts the DBL corner home.")
  }
}

/** The frame to record and the stickers in the pose the type reads them in. */
let posedStickers = (n: int, pose: V2.pose, t: tables, fs: array<int>): result<
  (int, array<int>),
  Orbit64Codec.orbitError,
> =>
  if V2.isOdd(n) {
    normalizeOdd(n, t, fs)->Result.map(((r, c)) => (pose == Framed ? r : 0, c))
  } else if pose == Canonical {
    normalizeEven(n, fs, rotated =>
      readPiece(n, t.corners, seenAt(t.corners, 6, rotated)) == Some((6, 0))
    )->Result.map(c => (0, c))
  } else {
    Ok((0, fs))
  }

// ------------------------------------------------------------- picture to cube

/** The stickers of one piece type: where they sit, how many values they can show, and how many name one piece. */
type group = {
  what: string,
  facelets: array<int>,
  limit: int,
  per: int,
}

/** Every sticker class of a cube, in the order the checks run. A sticker never leaves its class. */
let groups = (t: tables): array<group> =>
  Array.flat([
    [{what: "corner", facelets: Array.flat(t.corners), limit: 24, per: 1}],
    Array.length(t.midges) == 0
      ? []
      : [{what: "midge", facelets: Array.flat(t.midges), limit: 24, per: 1}],
    t.wings->Array.map(w => {what: "wing", facelets: Array.flat(w), limit: 48, per: 1}),
    t.centers->Array.map(c => {what: "center", facelets: c, limit: 24, per: 1}),
    Array.length(t.fixed) == 0
      ? []
      : [{what: "fixed center", facelets: t.fixed, limit: 24, per: 4}],
  ])

/** A sticker on a facelet of the wrong class, then a piece shown twice. */
let checkGroup = (vs: array<int>, g: group): option<Orbit64Codec.orbitError> => {
  let values = g.facelets->Array.map(at => get(vs, at))
  let shows = v => symbolOf(Picture, v)
  switch g.facelets->Array.find(at => get(vs, at) >= g.limit) {
  | Some(at) =>
    Some({
      tag: "InvalidFaceletPiece",
      message: `Facelet ${Int.toString(at)} shows '${shows(
          get(vs, at),
        )}', which is no ${g.what} sticker.`,
    })
  | None =>
    values
    ->Array.find(v => values->Array.filter(w => w / g.per == v / g.per)->Array.length > 1)
    ->Option.map(v => {
      Orbit64Codec.tag: "InvalidFaceletPiece",
      message: `The ${g.what} sticker '${shows(v)}' occurs more than once.`,
    })
  }
}

/** The piece and twist spelled by the `m` symbols of a slot: `m p + (k - o) mod m`. */
let readPictureSlot = (seen: array<int>): option<(int, int)> => {
  let m = Array.length(seen)
  let first = get(seen, 0)
  let p = first / m
  let o = mod(m - mod(first, m), m)
  range(0, m)->Array.every(k => get(seen, k) == m * p + mod(k - o + m, m)) ? Some((p, o)) : None
}

/** The pieces and twists of a table of slots; a `strict` slot admits no twist. */
let readPictureOriented = (
  what: string,
  table: array<array<int>>,
  strict: bool,
  vs: array<int>,
): result<(array<int>, array<int>), Orbit64Codec.orbitError> => {
  let pieces = []
  let twists = []
  let fault = ref(None)
  table->Array.forEachWithIndex((_, slot) =>
    if fault.contents == None {
      let seen = seenAt(table, slot, vs)
      switch readPictureSlot(seen) {
      | Some((p, o)) if !strict || o == 0 =>
        pieces->Array.push(p)
        twists->Array.push(o)
      | _ => fault := Some(noPiece(Picture, what, slot, seen))
      }
    }
  )
  switch fault.contents {
  | Some(error) => Error(error)
  | None => Ok((pieces, twists))
  }
}

/** The coordinates of a canonical-pose picture; the frame is `frame`. */
let readPictureCube = (n: int, t: tables, frame: int, vs: array<int>): result<
  V2.cube,
  Orbit64Codec.orbitError,
> =>
  switch readPictureOriented("corner", t.corners, false, vs) {
  | Error(e) => Error(e)
  | Ok((cp, co)) =>
    let midges = V2.isOdd(n) ? readPictureOriented("midge", t.midges, false, vs) : Ok(([], []))
    switch midges {
    | Error(e) => Error(e)
    | Ok((mp, mo)) =>
      let wings = []
      let fault = ref(None)
      t.wings->Array.forEach(table =>
        if fault.contents == None {
          switch readPictureOriented("wing", table, true, vs) {
          | Ok((w, _)) => wings->Array.push(w)
          | Error(e) => fault := Some(e)
          }
        }
      )
      switch fault.contents {
      | Some(e) => Error(e)
      | None =>
        Ok({
          V2.cornerPieces: cp,
          cornerTwists: co,
          midgePieces: mp,
          midgeFlips: mo,
          wings,
          centers: t.centers->Array.map(table => table->Array.map(at => get(vs, at))),
          rotations: t.fixed->Array.map(at => mod(get(vs, at), 4)),
          frame,
        })
      }
    }
  }

/** The frame to record and the symbols in the pose the type reads them in. */
let posedPicture = (n: int, pose: V2.pose, t: tables, vs: array<int>): result<
  (int, array<int>),
  Orbit64Codec.orbitError,
> =>
  if V2.isOdd(n) {
    frameShown(t.fixed->Array.map(at => get(vs, at) / 4))->Result.map(r => (
      pose == Framed ? r : 0,
      unrotatePicture(n, turnOf(r), vs),
    ))
  } else if pose == Canonical {
    normalizeEven(n, vs, rotated =>
      readPictureSlot(seenAt(t.corners, 6, rotated)) == Some((6, 0))
    )->Result.map(c => (0, c))
  } else {
    Ok((0, vs))
  }

/** Every sticker is of its class and every slot spells one piece, in any pose. */
let checkPieces = (n: int, t: tables, vs: array<int>): option<Orbit64Codec.orbitError> =>
  switch groups(t)->Array.findMap(g => checkGroup(vs, g)) {
  | Some(e) => Some(e)
  | None =>
    switch readPictureCube(n, t, 0, vs) {
    | Error(e) => Some(e)
    | Ok(_) => None
    }
  }

let readPictureStickers = (n: int, pose: V2.pose, text: string): result<
  V2.cube,
  Orbit64Codec.orbitError,
> =>
  switch parsePicture(n, text) {
  | Error(e) => Error(e)
  | Ok(vs) =>
    let t = buildTables(n)
    switch checkPieces(n, t, vs) {
    | Some(e) => Error(e)
    | None =>
      switch posedPicture(n, pose, t, vs) {
      | Error(e) => Error(e)
      | Ok((frame, posed)) =>
        switch readPictureCube(n, t, frame, posed) {
        | Error(e) => Error(e)
        | Ok(cube) =>
          switch stateFault(n, Picture, pose, cube) {
          | Some(why) => fail("InvalidState", why)
          | None => Ok(cube)
          }
        }
      }
    }
  }

let readStickers = (n: int, model: V2.model, pose: V2.pose, text: string): result<
  V2.cube,
  Orbit64Codec.orbitError,
> =>
  switch parse(n, text) {
  | Error(e) => Error(e)
  | Ok(fs) =>
    switch checkCounts(n, fs) {
    | Some(e) => Error(e)
    | None =>
      let t = buildTables(n)
      switch posedStickers(n, pose, t, fs) {
      | Error(e) => Error(e)
      | Ok((frame, posed)) =>
        switch readCube(n, t, frame, posed) {
        | Error(e) => Error(e)
        | Ok(cube) =>
          switch stateFault(n, model, pose, cube) {
          | Some(why) => fail("InvalidState", why)
          | None => Ok(cube)
          }
        }
      }
    }
  }

/**
 * The cube state shown by a facelet string, in the pose of `pose`.
 *
 * A canonical read turns the cube so that its reference is home first (fixed
 * centers on an odd cube, the DBL corner on an even one) and so accepts any
 * whole-cube orientation. A framed read of an odd cube keeps the orientation as
 * `cube.frame`; of an even cube, in its corners. Anything that is no reachable
 * cube is an error: wrong counts, a slot that shows no piece, a piece twice, a
 * broken orientation law or parity.
 */
let fromFacelets = (n: int, model: V2.model, pose: V2.pose, facelets: string): result<
  V2.cube,
  Orbit64Codec.orbitError,
> =>
  switch describeFault(n, model, pose) {
  | Some(error) => error
  | None =>
    if !isString(facelets) {
      fail("InvalidFacelet", "A facelet string is a string.")
    } else {
      guard(() =>
        model == Picture
          ? readPictureStickers(n, pose, facelets)
          : readStickers(n, model, pose, facelets)
      )
    }
  }

// ------------------------------------------------------- registry level helpers

/** The V2 token of the cube a facelet string shows, for registry entry `id`. */
let encode = (id: int, facelets: string): result<string, Orbit64Codec.orbitError> =>
  switch isInt(id) ? V2.entryById(id) : None {
  | None => fail("UnknownEntry", "The V2 registry has no such entry.")
  | Some(e) =>
    switch fromFacelets(e.n, e.model, e.pose, facelets) {
    | Error(error) => Error(error)
    | Ok(cube) => V2.encode(id, cube)
    }
  }

/** The registry entry of a token and the facelet string of its state. */
let decode = (token: string): result<(V2.entry, string), Orbit64Codec.orbitError> =>
  switch V2.decode(token) {
  | Error(error) => Error(error)
  | Ok({entry, cube}) =>
    toFacelets(entry.n, entry.model, entry.pose, cube)->Result.map(text => (entry, text))
  }
