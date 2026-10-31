/**
 * Orbit64 V2 state tokens (flix-orbit64 FORMAT-V2.md), coordinates only.
 *
 * A registry of 54 `n x n x n` puzzle types allocates one token range each; a
 * state's rank is the mixed-radix combination of one digit per component. There
 * is no facelet bridge here: states are the orbit coordinates of Orbit64Codec's
 * V1 slot convention, and V1 behavior is untouched.
 *
 * Every function that takes outside data returns a result and never throws.
 */
module B = Orbit64Codec.BigInt

type model =
  | @as("color") Color
  | @as("picture") Picture

type pose =
  | @as("canonical") Canonical
  | @as("framed") Framed

/** One puzzle type with its allocated token range `[offset, offset + count)`. */
type entry = {
  id: int,
  n: int,
  model: model,
  pose: pose,
  length: int,
  offset: B.t,
  count: B.t,
}

/**
 * Orbit coordinates of one cube. Components a type lacks are empty. Fixed
 * centers of odd cubes are implicitly home; `rotations` holds `r_U r_R r_F r_D
 * r_L r_B` (odd picture cubes) and `frame` a frame rank (odd framed cubes, else 0).
 */
type cube = {
  cornerPieces: array<int>,
  cornerTwists: array<int>,
  midgePieces: array<int>,
  midgeFlips: array<int>,
  wings: array<array<int>>,
  centers: array<array<int>>,
  rotations: array<int>,
  frame: int,
}

type decoded = {entry: entry, cube: cube}

let fail = Orbit64Codec.fail
let get = Orbit64Codec.get

let isOdd = (n: int): bool => mod(n, 2) == 1
let wingOrbits = (n: int): int => (n - 2) / 2

/** The `(row, column)` names of the center orbits, ordered by lowest facelet. */
let centerOrbits = (n: int): array<(int, int)> => {
  let out = []
  for r in 1 to n - 2 {
    for c in r to n - 2 - r {
      out->Array.push((r, c))
    }
  }
  out
}

/** Even canonical cubes leave the DBL corner out: it is home by definition. */
let dropsCorner = (n: int, pose: pose): bool => !isOdd(n) && pose == Canonical

type part =
  | CornerPerm
  | CornerTwist
  | MidgePerm
  | MidgeFlip
  | Wing(int)
  | Center(int)
  | FixedRot
  | FrameDigit

/** The digits of the layout in FORMAT-V2.md, most significant first. */
let parts = (n: int, model: model, pose: pose): array<part> => {
  let out = [CornerPerm, CornerTwist]
  if isOdd(n) {
    out->Array.push(MidgePerm)
    out->Array.push(MidgeFlip)
  }
  for i in 1 to wingOrbits(n) {
    out->Array.push(Wing(i))
  }
  for i in 1 to Array.length(centerOrbits(n)) {
    out->Array.push(Center(i))
  }
  if isOdd(n) && model == Picture {
    out->Array.push(FixedRot)
  }
  if isOdd(n) && pose == Framed {
    out->Array.push(FrameDigit)
  }
  out
}

let storedCorners = (n: int, pose: pose): int => dropsCorner(n, pose) ? 7 : 8

let colorCenterRadix = B.div(
  Orbit64Codec.factorial(24),
  B.pow(Orbit64Codec.factorial(4), B.fromInt(6)),
)
let pictureCenterRadix = B.div(Orbit64Codec.factorial(24), B.two)

let radix = (n: int, model: model, pose: pose, part: part): B.t =>
  switch part {
  | CornerPerm => Orbit64Codec.factorial(storedCorners(n, pose))
  | CornerTwist => B.pow(B.three, B.fromInt(storedCorners(n, pose) - 1))
  | MidgePerm => B.div(Orbit64Codec.factorial(12), B.two)
  | MidgeFlip => B.pow(B.two, B.fromInt(11))
  | Wing(_) => Orbit64Codec.factorial(24)
  | Center(_) => model == Color ? colorCenterRadix : pictureCenterRadix
  | FixedRot => B.pow(B.two, B.fromInt(11))
  | FrameDigit => B.fromInt(24)
  }

/** The number of states of a type. */
let count = (n: int, model: model, pose: pose): B.t =>
  parts(n, model, pose)->Array.reduce(B.one, (acc, p) => B.mul(acc, radix(n, model, pose, p)))

/** The registry types in order as `(n, model, pose)`; a 2x2x2 has no picture model. */
let initialTypes: array<(int, model, pose)> = {
  let out = []
  for n in 2 to 15 {
    out->Array.push((n, Color, Canonical))
    out->Array.push((n, Color, Framed))
    if n > 2 {
      out->Array.push((n, Picture, Canonical))
      out->Array.push((n, Picture, Framed))
    }
  }
  out
}

let used = (entries: array<entry>, length: int): B.t =>
  entries->Array.reduce(B.zero, (acc, e) => e.length == length ? B.add(e.offset, e.count) : acc)

/** The least length `L >= 1` with `used(L) + count <= 64^L`. */
let shortestLength = (entries: array<entry>, count: B.t): int => {
  let length = ref(1)
  let capacity = ref(B.fromInt(64))
  while B.gt(B.add(used(entries, length.contents), count), capacity.contents) {
    length := length.contents + 1
    capacity := B.mul(capacity.contents, B.fromInt(64))
  }
  length.contents
}

/** Place `types` in order with the allocation rule of FORMAT-V2.md. */
let allocate = (types: array<(int, model, pose)>): array<entry> => {
  let entries = []
  types->Array.forEachWithIndex(((n, model, pose), id) => {
    let count = count(n, model, pose)
    let length = shortestLength(entries, count)
    let offset = used(entries, length)
    entries->Array.push({id, n, model, pose, length, offset, count})
  })
  entries
}

/** Every entry of the registry with its length and offset, in ID order. */
let registry: array<entry> = allocate(initialTypes)

let maxLength: int = registry->Array.reduce(0, (acc, e) => Math.Int.max(acc, e.length))

let entryById = (id: int): option<entry> => registry->Array.find(e => e.id == id)

let isInt: 'a => bool = %raw(`function(value) { return Number.isInteger(value); }`)

/** The solved state of a type: every digit is zero. */
let solved = (n: int, model: model): cube => {
  let identity = k => Array.fromInitializer(~length=k, i => i)
  let odd = isOdd(n)
  {
    cornerPieces: identity(8),
    cornerTwists: Array.make(~length=8, 0),
    midgePieces: odd ? identity(12) : [],
    midgeFlips: odd ? Array.make(~length=12, 0) : [],
    wings: Array.fromInitializer(~length=wingOrbits(n), _ => identity(24)),
    centers: Array.fromInitializer(~length=Array.length(centerOrbits(n)), _ =>
      model == Color ? Array.fromInitializer(~length=24, i => i / 4) : identity(24)
    ),
    rotations: odd && model == Picture ? Array.make(~length=6, 0) : [],
    frame: 0,
  }
}

// ---------------------------------------------------------------- validation

/** True for an array of `size` integers; an absent (undefined) value counts as empty. */
let intArray: ('a, int) => bool = %raw(`function(value, size) {
  if (value === undefined || value === null) return size === 0;
  return Array.isArray(value) && value.length === size && value.every(Number.isInteger);
}`)

let intMatrix: ('a, int, int) => bool = %raw(`function(value, rows, size) {
  if (value === undefined || value === null) return rows === 0;
  return Array.isArray(value) && value.length === rows
    && value.every(row => Array.isArray(row) && row.length === size && row.every(Number.isInteger));
}`)

/** A shallow copy with absent array components made empty; anything but an object stays `undefined`. */
let withDefaults: 'a => option<cube> = %raw(`function(value) {
  if (typeof value !== "object" || value === null) return undefined;
  const empty = key => (value[key] === undefined || value[key] === null ? [] : value[key]);
  return {
    ...value,
    midgePieces: empty("midgePieces"),
    midgeFlips: empty("midgeFlips"),
    wings: empty("wings"),
    centers: empty("centers"),
    rotations: empty("rotations"),
    frame: value.frame === undefined ? 0 : value.frame,
  };
}`)

let isPermutation = (v: array<int>, k: int): bool =>
  Array.length(v) == k &&
    Array.fromInitializer(~length=k, i => i)->Array.every(i => v->Array.includes(i))

let inRange = (v: array<int>, bound: int): bool => v->Array.every(x => x >= 0 && x < bound)

let sum = (v: array<int>): int => v->Array.reduce(0, (a, b) => a + b)

let parityOf = Orbit64Codec.parity

let copies = (v: array<int>, color: int): int => v->Array.filter(x => x == color)->Array.length

let firstFault = (checks: array<(bool, string)>): option<string> =>
  checks->Array.find(((ok, _)) => !ok)->Option.map(((_, why)) => why)

/** Wing orbit parity `W_k`, zero when the cube has no wing orbit at depth `k`. */
let wingParity = (n: int, wings: array<array<int>>, k: int): int =>
  k >= 1 && k <= wingOrbits(n) ? parityOf(get(wings, k - 1)) : 0

/** The parity the `index`-th (from 0) center orbit of a picture cube must have. */
let requiredCenterParity = (
  n: int,
  cornerParity: int,
  wings: array<array<int>>,
  index: int,
): int => {
  let (r, c) = get(centerOrbits(n), index)
  let d = Math.Int.min(c, n - 1 - c)
  mod(cornerParity + wingParity(n, wings, r) + wingParity(n, wings, d), 2)
}

let centerValid = (model: model, v: array<int>): bool =>
  model == Color
    ? inRange(v, 6) && Array.fromInitializer(~length=6, t => t)->Array.every(t => copies(v, t) == 4)
    : isPermutation(v, 24)

/** Shape and range checks; only after they pass may the laws index into the vectors. */
let layoutFault = (n: int, model: model, pose: pose, cube: cube): option<string> => {
  let odd = isOdd(n)
  let w = wingOrbits(n)
  let m = Array.length(centerOrbits(n))
  let rotated = odd && model == Picture
  let framed = odd && pose == Framed
  let shapeOk =
    intArray(cube.cornerPieces, 8) &&
    intArray(cube.cornerTwists, 8) &&
    intArray(cube.midgePieces, odd ? 12 : 0) &&
    intArray(cube.midgeFlips, odd ? 12 : 0) &&
    intMatrix(cube.wings, w, 24) &&
    intMatrix(cube.centers, m, 24) &&
    intArray(cube.rotations, rotated ? 6 : 0) &&
    isInt(cube.frame)
  if !shapeOk {
    Some("The cube coordinates do not have the shape of this puzzle type.")
  } else {
    firstFault([
      (isPermutation(cube.cornerPieces, 8), "Corner pieces are not a permutation of 8."),
      (inRange(cube.cornerTwists, 3), "Corner twists must be in 0..2."),
      (!odd || isPermutation(cube.midgePieces, 12), "Midge pieces are not a permutation of 12."),
      (inRange(cube.midgeFlips, 2), "Midge flips must be in 0..1."),
      (
        cube.wings->Array.every(v => isPermutation(v, 24)),
        "A wing orbit is not a permutation of 24.",
      ),
      (
        cube.centers->Array.every(v => centerValid(model, v)),
        "A center orbit is not a valid color multiset or permutation of 24.",
      ),
      (inRange(cube.rotations, 4), "Fixed-center rotations must be in 0..3."),
      (
        framed ? cube.frame >= 0 && cube.frame < 24 : cube.frame == 0,
        "The frame must be 0..23 on odd framed cubes and 0 otherwise.",
      ),
    ])
  }
}

let lawFault = (n: int, model: model, pose: pose, cube: cube): option<string> => {
  let odd = isOdd(n)
  let c = parityOf(cube.cornerPieces)
  firstFault([
    (mod(sum(cube.cornerTwists), 3) == 0, "Corner twists must sum to 0 mod 3."),
    (!odd || mod(sum(cube.midgeFlips), 2) == 0, "Midge flips must sum to 0 mod 2."),
    (
      !dropsCorner(n, pose) || (get(cube.cornerPieces, 6) == 6 && get(cube.cornerTwists, 6) == 0),
      "A canonical even cube has its DBL corner home with twist 0.",
    ),
    (!odd || parityOf(cube.midgePieces) == c, "Midge parity must equal corner parity."),
    (
      !(odd && model == Picture) || mod(sum(cube.rotations), 2) == c,
      "Fixed-center rotation parity must equal corner parity.",
    ),
    (
      model == Color ||
        cube.centers->Array.everyWithIndex((v, i) =>
          parityOf(v) == requiredCenterParity(n, c, cube.wings, i)
        ),
      "A center orbit parity breaks the picture relation.",
    ),
  ])
}

// ------------------------------------------------------------------- ranking

let cornerSlots = (n: int, pose: pose): array<int> =>
  dropsCorner(n, pose) ? [0, 1, 2, 3, 4, 5, 7] : [0, 1, 2, 3, 4, 5, 6, 7]

let rotationDigit = (r: array<int>): B.t => {
  let weights = [1, 4, 16, 64, 256, 1024]
  let value = ref(0)
  weights->Array.forEachWithIndex((w, i) => {
    let v = get(r, i)
    value := value.contents + w * (i == 5 ? v / 2 : v)
  })
  B.fromInt(value.contents)
}

let digitOf = (n: int, model: model, pose: pose, cube: cube, part: part): B.t =>
  switch part {
  | CornerPerm =>
    let drop = dropsCorner(n, pose)
    Orbit64Codec.permRank(
      cornerSlots(n, pose)->Array.map(s => {
        let p = get(cube.cornerPieces, s)
        drop && p > 6 ? p - 1 : p
      }),
    )
  | CornerTwist =>
    let twists = cornerSlots(n, pose)->Array.map(s => get(cube.cornerTwists, s))
    Orbit64Codec.baseRank(twists, 3, Array.length(twists) - 1)
  | MidgePerm => Orbit64Codec.permRankWithParity(cube.midgePieces)
  | MidgeFlip => Orbit64Codec.baseRank(cube.midgeFlips, 2, 11)
  | Wing(i) => Orbit64Codec.permRank(get(cube.wings, i - 1))
  | Center(i) =>
    let v = get(cube.centers, i - 1)
    model == Color ? Orbit64Codec.multisetRank(v) : Orbit64Codec.permRankWithParity(v)
  | FixedRot => rotationDigit(cube.rotations)
  | FrameDigit => B.fromInt(cube.frame)
  }

let digits = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

/** `value` as a big-endian base-64 numeral of exactly `length` characters. */
let toBase64 = (value: B.t, length: int): string => {
  let base = B.fromInt(64)
  let remainder = ref(value)
  let out = Array.make(~length, "A")
  for i in length - 1 downto 0 {
    let d = B.toInt(B.rem(remainder.contents, base))
    out->Array.setUnsafe(i, String.charAt(digits, d))
    remainder := B.div(remainder.contents, base)
  }
  out->Array.join("")
}

let describe = Orbit64Codec.describeError

/** Encode a state of registry entry `id`; an invalid state is an error, never a token. */
let encode = (id: int, cube: cube): result<string, Orbit64Codec.orbitError> =>
  switch isInt(id) ? entryById(id) : None {
  | None => fail("UnknownEntry", "The V2 registry has no such entry.")
  | Some(_) if withDefaults(cube) == None => fail("InvalidState", "The state must be an object.")
  | Some(e) =>
    try {
      let cube = switch withDefaults(cube) {
      | Some(filled) => filled
      | None => cube
      }
      let fault = switch layoutFault(e.n, e.model, e.pose, cube) {
      | Some(why) => Some(why)
      | None => lawFault(e.n, e.model, e.pose, cube)
      }
      switch fault {
      | Some(why) => fail("InvalidState", why)
      | None =>
        let rank =
          parts(e.n, e.model, e.pose)->Array.reduce(B.zero, (acc, p) =>
            B.add(
              B.mul(acc, radix(e.n, e.model, e.pose, p)),
              digitOf(e.n, e.model, e.pose, cube, p),
            )
          )
        Ok(toBase64(B.add(e.offset, rank), e.length))
      }
    } catch {
    | exn => fail("InvalidState", describe(exn))
    }
  }

// ----------------------------------------------------------------- unranking

/** Re-insert the left-out DBL corner (slot 6) and undo the piece renumbering. */
let restoreDbl = (stored: array<int>, dbl: int, renumber: bool): array<int> => {
  let at = i => {
    let p = get(stored, i)
    renumber && p >= 6 ? p + 1 : p
  }
  Array.fromInitializer(~length=8, i => i < 6 ? at(i) : i == 6 ? dbl : at(6))
}

/** The state with the given rank, which must be in `[0, count)`. */
let unrank = (e: entry, rank: B.t): cube => {
  let n = e.n
  let all = parts(n, e.model, e.pose)
  let values = Array.make(~length=Array.length(all), B.zero)
  let rest = ref(rank)
  for i in Array.length(all) - 1 downto 0 {
    let r = radix(n, e.model, e.pose, get(all, i))
    Array.setUnsafe(values, i, B.rem(rest.contents, r))
    rest := B.div(rest.contents, r)
  }
  let digit = target => {
    let found = ref(B.zero)
    all->Array.forEachWithIndex((p, i) =>
      if p == target {
        found := get(values, i)
      }
    )
    found.contents
  }
  let odd = isOdd(n)
  let drop = dropsCorner(n, e.pose)
  let stored = storedCorners(n, e.pose)
  let pieces = Orbit64Codec.permUnrank(digit(CornerPerm), stored)
  let twists = Orbit64Codec.baseUnrank(digit(CornerTwist), 3, stored - 1)
  let cornerPieces = drop ? restoreDbl(pieces, 6, true) : pieces
  let cornerTwists = drop ? restoreDbl(twists, 0, false) : twists
  let c = parityOf(cornerPieces)
  let wings = Array.fromInitializer(~length=wingOrbits(n), i =>
    Orbit64Codec.permUnrank(digit(Wing(i + 1)), 24)
  )
  let centers = Array.fromInitializer(~length=Array.length(centerOrbits(n)), i =>
    e.model == Color
      ? Orbit64Codec.multisetUnrank(digit(Center(i + 1)))
      : Orbit64Codec.permUnrankWithParity(
          digit(Center(i + 1)),
          24,
          requiredCenterParity(n, c, wings, i),
        )
  )
  let rotations = if odd && e.model == Picture {
    // The low bit of r_B is not stored: it follows from R = C.
    let d = digit(FixedRot)
    let part = i => B.toInt(B.rem(B.div(d, B.pow(B.fromInt(4), B.fromInt(i))), B.fromInt(4)))
    let five = Array.fromInitializer(~length=5, part)
    let low = mod(mod(c - sum(five), 2) + 2, 2)
    Array.concat(five, [2 * B.toInt(B.div(d, B.fromInt(1024))) + low])
  } else {
    []
  }
  {
    cornerPieces,
    cornerTwists,
    midgePieces: odd ? Orbit64Codec.permUnrankWithParity(digit(MidgePerm), 12, c) : [],
    midgeFlips: odd ? Orbit64Codec.baseUnrank(digit(MidgeFlip), 2, 11) : [],
    wings,
    centers,
    rotations,
    frame: odd && e.pose == Framed ? B.toInt(digit(FrameDigit)) : 0,
  }
}

let isString: 'a => bool = %raw(`function(value) { return typeof value === "string"; }`)

/** Read a token to its registry entry and state; anything else is an error. */
let decode = (token: string): result<decoded, Orbit64Codec.orbitError> =>
  if !isString(token) {
    fail("InvalidToken", "A V2 state token is a string.")
  } else {
    let length = String.length(token)
    let invalid = chars => chars->Array.some(ch => String.indexOf(digits, ch) < 0)
    if length == 0 || length > maxLength {
      fail("UnknownToken", "Not a known V2 state token.")
    } else if invalid(String.split(token, "")) {
      fail("InvalidTokenCharacter", "Orbit64 uses only the Base64URL alphabet.")
    } else {
      let value =
        String.split(token, "")->Array.reduce(B.zero, (acc, ch) =>
          B.add(B.mul(acc, B.fromInt(64)), B.fromInt(String.indexOf(digits, ch)))
        )
      switch registry->Array.find(e =>
        e.length == length && B.gte(value, e.offset) && B.lt(value, B.add(e.offset, e.count))
      ) {
      | None => fail("UnknownToken", "Not a known V2 state token.")
      | Some(e) =>
        try Ok({entry: e, cube: unrank(e, B.sub(value, e.offset))}) catch {
        | exn => fail("InvalidToken", describe(exn))
        }
      }
    }
  }
