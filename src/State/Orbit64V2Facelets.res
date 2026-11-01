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
 * Only the color model has letters; the picture model is a separate task and its
 * entries are an error here. Every function returns a result and never throws.
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
let tables = (n: int): tables => {
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

let show: 'a => string = %raw(`function(value) { return String(value); }`)

/** Why a type has no facelet letters, if it has none. */
let typeFault = (n: int, model: V2.model): option<(string, string)> =>
  if !isInt(n) || n < 2 || n > 15 {
    let shown = show(n)
    Some(("UnsupportedType", `No V2 type for the ${shown}x${shown}x${shown}.`))
  } else if model == Picture {
    Some(("UnsupportedModel", "The picture model has no letters."))
  } else {
    None
  }

let describeFault = (n: int, model: V2.model) =>
  switch typeFault(n, model) {
  | Some((tag, message)) => Some(Orbit64Codec.fail(tag, message))
  | None => None
  }

// ------------------------------------------------------------ cube to stickers

let writeOriented = (
  n: int,
  sticker: array<int>,
  table: array<array<int>>,
  pieces: array<int>,
  twists: array<int>,
): unit =>
  table->Array.forEachWithIndex((slotFacelets, slot) => {
    let m = Array.length(slotFacelets)
    let home = get(table, get(pieces, slot))
    let twist = get(twists, slot)
    for k in 0 to m - 1 {
      sticker->Array.setUnsafe(get(slotFacelets, k), faceOf(n, get(home, mod(k - twist + m, m))))
    }
  })

let writeCenters = (sticker: array<int>, table: array<int>, colors: array<int>): unit =>
  table->Array.forEachWithIndex((facelet, slot) =>
    sticker->Array.setUnsafe(facelet, get(colors, slot))
  )

/** The stickers of a canonical-pose cube; fixed centers are home. */
let paint = (n: int, t: tables, cube: V2.cube): array<int> => {
  let sticker = Array.make(~length=6 * n * n, 0)
  t.fixed->Array.forEachWithIndex((facelet, f) => sticker->Array.setUnsafe(facelet, f))
  writeOriented(n, sticker, t.corners, cube.cornerPieces, cube.cornerTwists)
  if V2.isOdd(n) {
    writeOriented(n, sticker, t.midges, cube.midgePieces, cube.midgeFlips)
  }
  t.wings->Array.forEachWithIndex((table, i) =>
    writeOriented(n, sticker, table, get(cube.wings, i), Array.make(~length=24, 0))
  )
  t.centers->Array.forEachWithIndex((table, i) =>
    writeCenters(sticker, table, get(cube.centers, i))
  )
  sticker
}

let spell = (n: int, fs: array<int>): string =>
  range(0, 6)
  ->Array.map(face =>
    range(0, n * n)->Array.map(i => get(letters, get(fs, face * n * n + i)))->Array.join("")
  )
  ->Array.join(" ")

/** The message of a caught exception; ReScript wraps JavaScript exceptions, so unwrap first. */
let describe = V2.describe

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
 * shows its pose in its corners already. Only the color model has letters.
 */
let toFacelets = (n: int, model: V2.model, pose: V2.pose, cube: V2.cube): result<
  string,
  Orbit64Codec.orbitError,
> =>
  switch describeFault(n, model) {
  | Some(error) => error
  | None =>
    try {
      switch V2.withDefaults(cube) {
      | None => fail("InvalidState", "The state must be an object.")
      | Some(cube) =>
        switch stateFault(n, model, pose, cube) {
        | Some(why) => fail("InvalidState", why)
        | None =>
          let fs = paint(n, tables(n), cube)
          Ok(spell(n, V2.isOdd(n) ? rotate(n, turnOf(cube.frame), fs) : fs))
        }
      }
    } catch {
    | exn => fail("InvalidState", describe(exn))
    }
  }

// ------------------------------------------------------------ stickers to cube

let isString = V2.isString

let letterIndex = (c: string): option<int> => {
  let i = String.indexOf("URFDLB", c)
  String.length(c) == 1 && i >= 0 ? Some(i) : None
}

/** The stickers of a facelet string as face indices, or why it is no string of `n^2` per face. */
let parse = (n: int, text: string): result<array<int>, Orbit64Codec.orbitError> => {
  let chars = String.split(text, "")->Array.filter(c => c != " ")
  switch chars->Array.find(c => letterIndex(c) == None) {
  | Some(c) => fail("InvalidFacelet", `Facelet '${c}' is not one of U R F D L B.`)
  | None =>
    let length = Array.length(chars)
    if length != 6 * n * n {
      fail(
        "InvalidFaceletLength",
        `Expected ${Int.toString(6 * n * n)} facelets for the ${Int.toString(n)}x${Int.toString(
            n,
          )}x${Int.toString(n)}, got ${Int.toString(length)}.`,
      )
    } else {
      Ok(chars->Array.map(c => String.indexOf("URFDLB", c)))
    }
  }
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

let noPiece = (what: string, slot: int, seen: array<int>): Orbit64Codec.orbitError => {
  let shown = seen->Array.map(f => get(letters, f))->Array.join("")
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
      | None => fault := Some(noPiece(what, slot, seen))
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
      | None => fault := Some(noPiece("wing", slot, seen))
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

/** Rotate an odd cube so that its fixed centers are home; the frame is the one they show. */
let normalizeOdd = (n: int, t: tables, fs: array<int>): result<
  (int, array<int>),
  Orbit64Codec.orbitError,
> => {
  let shown = t.fixed->Array.map(at => get(fs, at))
  switch range(0, frameCount)->Array.find(r => facesOfFrame(r) == shown) {
  | Some(r) => Ok((r, unrotate(n, turnOf(r), fs)))
  | None =>
    fail("InvalidFaceletFrame", "The six fixed centers are not a right-handed whole-cube frame.")
  }
}

/** Rotate an even cube so that its DBL corner is in slot DBL with twist 0. */
let normalizeEven = (n: int, t: tables, fs: array<int>): result<
  array<int>,
  Orbit64Codec.orbitError,
> => {
  let homes =
    range(0, frameCount)
    ->Array.map(r => unrotate(n, turnOf(r), fs))
    ->Array.find(rotated => readPiece(n, t.corners, seenAt(t.corners, 6, rotated)) == Some((6, 0)))
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
    normalizeEven(n, t, fs)->Result.map(c => (0, c))
  } else {
    Ok((0, fs))
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
      let t = tables(n)
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
  switch describeFault(n, model) {
  | Some(error) => error
  | None =>
    if !isString(facelets) {
      fail("InvalidFacelet", "A facelet string is a string.")
    } else {
      try readStickers(n, model, pose, facelets) catch {
      | exn => fail("InvalidState", describe(exn))
      }
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
