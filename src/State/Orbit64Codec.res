/**
 * Orbit64 state adapter, compatible with flix-orbit64 FORMAT.md.
 *
 * State tokens use the base64url alphabet and pack the orbit coordinates in
 * Horner mixed-radix order. The facelet tables below are the published
 * `orbit64-<n>x<n>-draft@1` convention (U R F D L B, row-major).
 */

open StateTypes

type orbitError = {
  @as("TAG") tag: string,
  message: string,
}

type coordinate =
  | Corner({p: array<int>, o: array<int>})
  | Midge({p: array<int>, o: array<int>})
  | Wing({p: array<int>})
  | Center({p: array<int>})

type coordKind = KCorner | KMidge | KWing | KCenter

let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

let widths: Dict.t<int> = %raw(`{2: 5, 3: 12, 4: 27, 5: 43}`)

let faces = "URFDLB"

let ok = value => Ok(value)
let fail = (tag, message) => Error({tag, message})

let isCubeState: 'a => bool = %raw(`function(value) {
  if (typeof value !== "object" || value === null) return false;
  return typeof value.size === "number"
    && Number.isInteger(value.size)
    && Array.isArray(value.facelets)
    && value.facelets.length === 6
    && value.facelets.every(face => Array.isArray(face) && face.every(facelet => typeof facelet === "string"));
}`)

let describeError: 'a => string = %raw(`function(error) {
  return typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : String(error);
}`)

let get = (arr, i) => Belt.Array.getUnsafe(arr, i)
let set = (arr, i, v) => Belt.Array.setUnsafe(arr, i, v)

module BigInt = {
  type t
  @val external fromInt: int => t = "BigInt"
  @val external fromString: string => t = "BigInt"
  @val external toInt: t => int = "Number"
  let zero = fromInt(0)
  let one = fromInt(1)
  let two = fromInt(2)
  let three = fromInt(3)
  let add: (t, t) => t = %raw(`(a, b) => a + b`)
  let sub: (t, t) => t = %raw(`(a, b) => a - b`)
  let mul: (t, t) => t = %raw(`(a, b) => a * b`)
  let div: (t, t) => t = %raw(`(a, b) => a / b`)
  let rem: (t, t) => t = %raw(`(a, b) => a % b`)
  let pow: (t, t) => t = %raw(`(a, b) => a ** b`)
  let gte: (t, t) => bool = %raw(`(a, b) => a >= b`)
  let lte: (t, t) => bool = %raw(`(a, b) => a <= b`)
  let gt: (t, t) => bool = %raw(`(a, b) => a > b`)
  let lt: (t, t) => bool = %raw(`(a, b) => a < b`)
}

open BigInt

let factorial = (n: int): t => {
  let result = ref(one)
  for i in 2 to n {
    result := mul(result.contents, fromInt(i))
  }
  result.contents
}

let choose = (n: int, k: int): t => {
  let result = ref(one)
  for i in 1 to k {
    result := div(mul(result.contents, fromInt(n - k + i)), fromInt(i))
  }
  result.contents
}

let parity = (p: array<int>): int => {
  let sum = ref(0)
  let len = Array.length(p)
  for i in 0 to len - 1 {
    let v = get(p, i)
    for j in i + 1 to len - 1 {
      if get(p, j) < v {
        sum := sum.contents + 1
      }
    }
  }
  Int.bitwiseAnd(sum.contents, 1)
}

let permRank = (p: array<int>): t => {
  let len = Array.length(p)
  let rank = ref(zero)
  for i in 0 to len - 1 {
    let v = get(p, i)
    let count = ref(0)
    for j in i + 1 to len - 1 {
      if get(p, j) < v {
        count := count.contents + 1
      }
    }
    rank := add(mul(rank.contents, fromInt(len - i)), fromInt(count.contents))
  }
  rank.contents
}

let permUnrank = (rank: t, n: int): array<int> => {
  let available = Array.fromInitializer(~length=n, i => i)
  let output = []
  let remainder = ref(rank)
  for i in n downto 1 {
    let factor = factorial(i - 1)
    let index = toInt(div(remainder.contents, factor))
    remainder := rem(remainder.contents, factor)
    let item = get(available, index)
    available->Array.splice(~start=index, ~remove=1, ~insert=[])
    output->Array.push(item)
  }
  output
}

let permRankWithParity = (p: array<int>): t => {
  let len = Array.length(p)
  let value = ref(zero)
  for i in 0 to len - 3 {
    let v = get(p, i)
    let count = ref(0)
    for j in i + 1 to len - 1 {
      if get(p, j) < v {
        count := count.contents + 1
      }
    }
    value := add(mul(value.contents, fromInt(len - i)), fromInt(count.contents))
  }
  value.contents
}

let permUnrankWithParity = (rank: t, n: int, required: int): array<int> => {
  let available = Array.fromInitializer(~length=n, i => i)
  let output = []
  let remainder = ref(rank)
  while Array.length(available) > 2 {
    let divisor = div(factorial(Array.length(available) - 1), two)
    let index = toInt(div(remainder.contents, divisor))
    remainder := rem(remainder.contents, divisor)
    let item = get(available, index)
    available->Array.splice(~start=index, ~remove=1, ~insert=[])
    output->Array.push(item)
  }
  let direct = Array.concat(output, [get(available, 0), get(available, 1)])
  if parity(direct) == required {
    direct
  } else {
    Array.concat(output, [get(available, 1), get(available, 0)])
  }
}

/** Orbit64 orientation digits are little-endian: the first is the units digit. */
let baseRank = (digits: array<int>, base: int, count: int): t => {
  let value = ref(zero)
  let place = ref(one)
  let baseB = fromInt(base)
  for i in 0 to count - 1 {
    let digit = get(digits, i)
    value := add(value.contents, mul(fromInt(digit), place.contents))
    place := mul(place.contents, baseB)
  }
  value.contents
}

let baseUnrank = (value: t, base: int, count: int): array<int> => {
  let output = Array.make(~length=count + 1, 0)
  let remainder = ref(value)
  let baseB = fromInt(base)
  for i in 0 to count - 1 {
    set(output, i, toInt(rem(remainder.contents, baseB)))
    remainder := div(remainder.contents, baseB)
  }
  let sum = ref(0)
  for i in 0 to count - 1 {
    sum := sum.contents + get(output, i)
  }
  let remBase = mod(sum.contents, base)
  let diff = mod(base - remBase, base)
  set(output, count, diff)
  output
}

let multisetRank = (labels: array<int>): t => {
  let remaining = ref(Array.fromInitializer(~length=24, i => i))
  let value = ref(zero)
  for colour in 0 to 4 {
    let remArr = remaining.contents
    let selected = []
    for i in 0 to Array.length(remArr) - 1 {
      let slot = get(remArr, i)
      if get(labels, slot) == colour {
        selected->Array.push(i)
      }
    }
    let rank = ref(zero)
    for i in 0 to Array.length(selected) - 1 {
      let cell = get(selected, i)
      rank := add(rank.contents, choose(cell, i + 1))
    }
    value := add(mul(value.contents, choose(Array.length(remArr), 4)), rank.contents)
    let chosen = Set.fromArray(selected->Array.map(i => get(remArr, i)))
    remaining := remArr->Array.filter(slot => !Set.has(chosen, slot))
  }
  value.contents
}

let combUnrank = (value: t, count: int): array<int> => {
  let result = []
  let remainder = ref(value)
  for i in count downto 1 {
    let candidate = ref(i - 1)
    while lte(choose(candidate.contents + 1, i), remainder.contents) {
      candidate := candidate.contents + 1
    }
    result->Array.unshift(candidate.contents)
    remainder := sub(remainder.contents, choose(candidate.contents, i))
  }
  result
}

let multisetUnrank = (value: t): array<int> => {
  let radices = [choose(24, 4), choose(20, 4), choose(16, 4), choose(12, 4), choose(8, 4)]
  let digits = Array.make(~length=5, 0)
  let remainder = ref(value)
  for i in 4 downto 0 {
    set(digits, i, toInt(rem(remainder.contents, get(radices, i))))
    remainder := div(remainder.contents, get(radices, i))
  }
  let slots = ref(Array.fromInitializer(~length=24, i => i))
  let result = Array.make(~length=24, 5)
  for colour in 0 to 4 {
    let digit = get(digits, colour)
    let indexes = combUnrank(fromInt(digit), 4)
    let curSlots = slots.contents
    let selected = indexes->Array.map(index => get(curSlots, index))
    selected->Array.forEach(slot => {
      set(result, slot, colour)
    })
    let used = Set.fromArray(selected)
    slots := curSlots->Array.filter(slot => !Set.has(used, slot))
  }
  result
}

let radixCorner = mul(factorial(8), pow(three, fromInt(7)))
let radixMidge = mul(factorial(12), pow(two, fromInt(11)))
let radixWing = factorial(24)
let radixCenter = mul(
  mul(mul(mul(choose(24, 4), choose(20, 4)), choose(16, 4)), choose(12, 4)),
  choose(8, 4),
)

let radixForKind = (kind: coordKind): t =>
  switch kind {
  | KCorner => radixCorner
  | KMidge => radixMidge
  | KWing => radixWing
  | KCenter => radixCenter
  }

let layout = (size: int): array<coordKind> =>
  switch size {
  | 2 => [KCorner]
  | 3 => [KCorner, KMidge]
  | 4 => [KCorner, KWing, KCenter]
  | _ => [KCorner, KMidge, KWing, KCenter, KCenter]
  }

let rankCoordinate = (coord: coordinate): t =>
  switch coord {
  | Corner({p, o}) => add(mul(permRank(p), pow(three, fromInt(7))), baseRank(o, 3, 7))
  | Midge({p, o}) => add(mul(permRank(p), pow(two, fromInt(11))), baseRank(o, 2, 11))
  | Wing({p}) => permRank(p)
  | Center({p}) => multisetRank(p)
  }

let unrankCoordinate = (kind: coordKind, value: t): coordinate =>
  switch kind {
  | KCorner =>
    let pow37 = pow(three, fromInt(7))
    Corner({
      p: permUnrank(div(value, pow37), 8),
      o: baseUnrank(rem(value, pow37), 3, 7),
    })
  | KMidge =>
    let pow211 = pow(two, fromInt(11))
    Midge({
      p: permUnrank(div(value, pow211), 12),
      o: baseUnrank(rem(value, pow211), 2, 11),
    })
  | KWing => Wing({p: permUnrank(value, 24)})
  | KCenter => Center({p: multisetUnrank(value)})
  }

let carriesFrame = (size: int): bool => size == 3 || size == 5

let rotationSteps: array<string> = {
  let steps = []
  for index in 0 to 15 {
    let x = index / 4
    let y = mod(index, 4)
    let xStr = String.repeat("x ", x)
    let yStr = String.repeat("y ", y)
    steps->Array.push(String.trim(xStr ++ yStr))
  }
  for z in 1 to 3 {
    if z == 1 || z == 3 {
      for y in 0 to 3 {
        let zStr = String.repeat("z ", z)
        let yStr = String.repeat("y ", y)
        steps->Array.push(String.trim(zStr ++ yStr))
      }
    }
  }
  steps
}

let inverseRotation = (algorithm: string): string =>
  algorithm
  ->String.split(" ")
  ->Array.filter(s => s != "")
  ->Array.toReversed
  ->Array.map(m => m ++ "'")
  ->Array.join(" ")

external unsafeAsCubeState: 'a => cubeState = "%identity"

let transform = (state: cubeState, algorithm: string): option<cubeState> =>
  if algorithm == "" {
    Some(state)
  } else {
    let size = state.size
    switch MoveParser.parse(~size, algorithm) {
    | Ok(alg) =>
      switch MoveExecutor.applyAlg(state, alg) {
      | Ok(applied) => Some(applied)
      | Error(_) => None
      }
    | Error(_) => None
    }
  }

let fixedCentreFrame = (size: int, facelets: string): string => {
  let chars = []
  let s2 = size * size
  let mid = s2 / 2
  for face in 0 to 5 {
    let idx = face * s2 + mid
    chars->Array.push(facelets->String.slice(~start=idx, ~end=idx + 1))
  }
  chars->Array.join("")
}

let hasCanonicalFixedCentres = (size: int, state: cubeState): bool => {
  let rendered = FaceletCodec.render(state)
  fixedCentreFrame(size, rendered) == faces
}

let frameForState = (state: cubeState): int => {
  let size = state.size
  let found = ref(-1)
  for index in 0 to Array.length(rotationSteps) - 1 {
    if found.contents < 0 {
      let step = get(rotationSteps, index)
      let inv = inverseRotation(step)
      switch transform(state, inv) {
      | Some(canonical) if hasCanonicalFixedCentres(size, canonical) =>
        found := index
      | _ => ()
      }
    }
  }
  found.contents
}

let coordinateCount = (size: int): t => {
  let kinds = layout(size)
  let total = kinds->Array.reduce(one, (value, kind) => mul(value, radixForKind(kind)))
  if carriesFrame(size) {
    div(total, two)
  } else {
    total
  }
}

let stateCount = (size: int): t =>
  mul(coordinateCount(size), fromInt(if carriesFrame(size) { 24 } else { 1 }))

let rankCoordinates = (size: int, coordinates: array<coordinate>): t => {
  if !carriesFrame(size) {
    let kinds = layout(size)
    let value = ref(zero)
    for i in 0 to Array.length(coordinates) - 1 {
      let coord = get(coordinates, i)
      let kind = get(kinds, i)
      value := add(mul(value.contents, radixForKind(kind)), rankCoordinate(coord))
    }
    value.contents
  } else {
    let (cornerP, cornerO) = switch get(coordinates, 0) {
    | Corner({p, o}) => (p, o)
    | _ => panic("expected corner")
    }
    let (midgeP, midgeO) = switch get(coordinates, 1) {
    | Midge({p, o}) => (p, o)
    | _ => panic("expected midge")
    }
    let halfMidge = div(radixMidge, two)
    let value = ref(
      add(
        mul(rankCoordinate(Corner({p: cornerP, o: cornerO})), halfMidge),
        add(
          mul(permRankWithParity(midgeP), fromInt(2048)),
          baseRank(midgeO, 2, 11),
        ),
      ),
    )
    let kinds = layout(size)
    for i in 2 to Array.length(coordinates) - 1 {
      let coord = get(coordinates, i)
      let kind = get(kinds, i)
      value := add(mul(value.contents, radixForKind(kind)), rankCoordinate(coord))
    }
    value.contents
  }
}

let unrankCoordinates = (size: int, value: t): array<coordinate> => {
  let kinds = layout(size)
  let len = Array.length(kinds)
  if !carriesFrame(size) {
    let output = Array.make(~length=len, Corner({p: [], o: []}))
    let remainder = ref(value)
    for i in len - 1 downto 0 {
      let rad = radixForKind(get(kinds, i))
      set(output, i, unrankCoordinate(get(kinds, i), rem(remainder.contents, rad)))
      remainder := div(remainder.contents, rad)
    }
    output
  } else {
  let tailKinds = kinds->Array.slice(~start=2, ~end=kinds->Array.length)
    let tailRadix = tailKinds->Array.reduce(one, (v, kind) => mul(v, radixForKind(kind)))
    let header = div(value, tailRadix)
    let tailValue = ref(rem(value, tailRadix))
    let halfMidge = div(radixMidge, two)
    let cornerRank = div(header, halfMidge)
    let midgeValue = rem(header, halfMidge)
    let (cornerP, cornerO) = switch unrankCoordinate(KCorner, cornerRank) {
    | Corner({p, o}) => (p, o)
    | _ => panic("expected corner")
    }
    let midgeP = permUnrankWithParity(
      div(midgeValue, fromInt(2048)),
      12,
      parity(cornerP),
    )
    let midgeO = baseUnrank(rem(midgeValue, fromInt(2048)), 2, 11)
    let decodedTail = Array.make(~length=Array.length(tailKinds), Corner({p: [], o: []}))
    for i in Array.length(tailKinds) - 1 downto 0 {
      let rad = radixForKind(get(tailKinds, i))
      set(decodedTail, i, unrankCoordinate(get(tailKinds, i), rem(tailValue.contents, rad)))
      tailValue := div(tailValue.contents, rad)
    }
    Array.concat([Corner({p: cornerP, o: cornerO}), Midge({p: midgeP, o: midgeO})], decodedTail)
  }
}

let c3 = [
  [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
  [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51]
]
let e3 = [
  [5, 10], [7, 19], [3, 37], [1, 46],
  [32, 16], [28, 25], [30, 43], [34, 52],
  [23, 12], [21, 41], [50, 39], [48, 14]
]
let cc = [
  [0, 1, 2], [0, 2, 4], [0, 4, 5], [0, 5, 1],
  [3, 2, 1], [3, 4, 2], [3, 5, 4], [3, 1, 5]
]
let ec = [
  [0, 1], [0, 2], [0, 4], [0, 5],
  [3, 1], [3, 2], [3, 4], [3, 5],
  [2, 1], [2, 4], [5, 4], [5, 1]
]
let c4 = [
  [15, 16, 35], [12, 32, 67], [0, 64, 83], [3, 80, 19],
  [51, 47, 28], [48, 79, 44], [60, 95, 76], [63, 31, 92]
]
let w4 = [
  [1, 82], [7, 18], [8, 66], [14, 34],
  [17, 11], [23, 84], [24, 43], [30, 59],
  [33, 13], [39, 20], [40, 75], [46, 50],
  [49, 45], [55, 29], [56, 77], [62, 93],
  [65, 4], [71, 36], [72, 91], [78, 52],
  [81, 2], [87, 68], [88, 27], [94, 61]
]
let z4 = [
  5, 6, 9, 10, 21, 22, 25, 26, 37, 38, 41, 42,
  53, 54, 57, 58, 69, 70, 73, 74, 85, 86, 89, 90
]
let wc = [
  [0, 5], [0, 1], [0, 4], [0, 2],
  [1, 0], [1, 5], [1, 2], [1, 3],
  [2, 0], [2, 1], [2, 4], [2, 3],
  [3, 2], [3, 1], [3, 4], [3, 5],
  [4, 0], [4, 2], [4, 5], [4, 3],
  [5, 0], [5, 4], [5, 1], [5, 3]
]
let c5 = [
  [24, 25, 54], [20, 50, 104], [0, 100, 129], [4, 125, 29],
  [79, 74, 45], [75, 124, 70], [95, 149, 120], [99, 49, 145]
]
let e5 = [
  [14, 27], [22, 52], [10, 102], [2, 127],
  [89, 47], [77, 72], [85, 122], [97, 147],
  [64, 35], [60, 114], [139, 110], [135, 39]
]
let w5 = [
  [1, 128], [9, 28], [15, 103], [23, 53],
  [26, 19], [34, 130], [40, 69], [48, 94],
  [51, 21], [59, 30], [65, 119], [73, 78],
  [76, 71], [84, 46], [90, 121], [98, 146],
  [101, 5], [109, 55], [115, 144], [123, 80],
  [126, 3], [134, 105], [140, 44], [148, 96]
]
let x5 = [
  6, 8, 16, 18, 31, 33, 41, 43, 56, 58, 66, 68,
  81, 83, 91, 93, 106, 108, 116, 118, 131, 133, 141, 143
]
let p5 = [
  7, 11, 13, 17, 32, 36, 38, 42, 57, 61, 63, 67,
  82, 86, 88, 92, 107, 111, 113, 117, 132, 136, 138, 142
]

let readOriented = (
  fs: array<int>,
  slots: array<array<int>>,
  colours: array<array<int>>,
  isCorner: bool,
): option<coordinate> => {
  let p = []
  let o = []
  let failed = ref(false)
  for s in 0 to Array.length(slots) - 1 {
    if !failed.contents {
      let slot = get(slots, s)
      let seen = slot->Array.map(index => get(fs, index))
      let foundPiece = ref(-1)
      let foundOrient = ref(-1)
      let slotLen = Array.length(seen)
      for pieceIndex in 0 to Array.length(colours) - 1 {
        let piece = get(colours, pieceIndex)
        for orientation in 0 to slotLen - 1 {
          if foundPiece.contents < 0 {
            let matchAll = ref(true)
            for i in 0 to slotLen - 1 {
              let expected = get(piece, mod(i - orientation + slotLen, slotLen))
              if get(seen, i) != expected {
                matchAll := false
              }
            }
            if matchAll.contents {
              foundPiece := pieceIndex
              foundOrient := orientation
            }
          }
        }
      }
      if foundPiece.contents < 0 {
        failed := true
      } else {
        p->Array.push(foundPiece.contents)
        o->Array.push(foundOrient.contents)
      }
    }
  }
  if failed.contents {
    None
  } else if isCorner {
    Some(Corner({p, o}))
  } else {
    Some(Midge({p, o}))
  }
}

let readPlain = (fs: array<int>, slots: array<array<int>>): option<coordinate> => {
  let p = []
  let failed = ref(false)
  for s in 0 to Array.length(slots) - 1 {
    if !failed.contents {
      let slot = get(slots, s)
      let c0 = get(fs, get(slot, 0))
      let c1 = get(fs, get(slot, 1))
      let found = ref(-1)
      for pieceIndex in 0 to Array.length(wc) - 1 {
        let piece = get(wc, pieceIndex)
        if get(piece, 0) == c0 && get(piece, 1) == c1 {
          found := pieceIndex
        }
      }
      if found.contents < 0 {
        failed := true
      } else {
        p->Array.push(found.contents)
      }
    }
  }
  if failed.contents {
    None
  } else {
    Some(Wing({p: p}))
  }
}

let readCenters = (fs: array<int>, slots: array<int>): coordinate =>
  Center({p: slots->Array.map(index => get(fs, index))})

let inputCoordinates = (size: int, facelets: string): option<array<coordinate>> => {
  let len = String.length(facelets)
  let fs = Array.make(~length=len, 0)
  let invalid = ref(false)
  for i in 0 to len - 1 {
    let char = facelets->String.slice(~start=i, ~end=i + 1)
    let idx = String.indexOf(faces, char)
    if idx < 0 {
      invalid := true
    } else {
      set(fs, i, idx)
    }
  }
  if invalid.contents {
    None
  } else if size == 2 {
    let grid = Array.make(~length=54, 0)
    for index in 0 to 53 {
      let face = index / 9
      let row = mod(index / 3, 3)
      let col = mod(index, 3)
      let value = if mod(row, 2) == 0 && mod(col, 2) == 0 {
        get(fs, face * 4 + (row / 2) * 2 + col / 2)
      } else {
        face
      }
      set(grid, index, value)
    }
    switch readOriented(grid, c3, cc, true) {
    | Some(corner) => Some([corner])
    | None => None
    }
  } else if size == 3 {
    let corner = readOriented(fs, c3, cc, true)
    let midge = readOriented(fs, e3, ec, false)
    switch (corner, midge) {
    | (Some(c), Some(m)) => Some([c, m])
    | _ => None
    }
  } else if size == 4 {
    let corner = readOriented(fs, c4, cc, true)
    let wing = readPlain(fs, w4)
    switch (corner, wing) {
    | (Some(c), Some(w)) => Some([c, w, readCenters(fs, z4)])
    | _ => None
    }
  } else {
    let corner = readOriented(fs, c5, cc, true)
    let midge = readOriented(fs, e5, ec, false)
    let wing = readPlain(fs, w5)
    switch (corner, midge, wing) {
    | (Some(c), Some(m), Some(w)) =>
      Some([c, m, w, readCenters(fs, x5), readCenters(fs, p5)])
    | _ => None
    }
  }
}

let renderCoordinates = (size: int, coordinates: array<coordinate>): string => {
  let fs = Array.make(~length=6 * size * size, 0)
  let writeOriented = (p: array<int>, o: array<int>, slots: array<array<int>>, colours: array<array<int>>) =>
    slots->Array.forEachWithIndex((slot, s) =>
      slot->Array.forEachWithIndex((at, k) => {
        let piece = get(colours, get(p, s))
        let slotLen = Array.length(slot)
        let idx = mod(k - get(o, s) + slotLen, slotLen)
        set(fs, at, get(piece, idx))
      })
    )
  let writeWing = (p: array<int>, slots: array<array<int>>) =>
    slots->Array.forEachWithIndex((slot, s) =>
      slot->Array.forEachWithIndex((at, k) => {
        set(fs, at, get(get(wc, get(p, s)), k))
      })
    )

  if size == 2 || size == 3 {
    let grid = Array.make(~length=54, 0)
    for f in 0 to 5 {
      set(grid, f * 9 + 4, f)
    }
    let (cornerP, cornerO) = switch get(coordinates, 0) {
    | Corner({p, o}) => (p, o)
    | _ => panic("expected corner")
    }
    c3->Array.forEachWithIndex((slot, s) =>
      slot->Array.forEachWithIndex((_at, k) => {
        let slotIdx = mod(k + get(cornerO, s), 3)
        set(grid, get(get(c3, s), slotIdx), get(get(cc, get(cornerP, s)), k))
      })
    )
    if size == 3 {
      let (midgeP, midgeO) = switch get(coordinates, 1) {
      | Midge({p, o}) => (p, o)
      | _ => panic("expected midge")
      }
      e3->Array.forEachWithIndex((slot, s) =>
        slot->Array.forEachWithIndex((_at, k) => {
          let slotIdx = mod(k + get(midgeO, s), 2)
          set(grid, get(get(e3, s), slotIdx), get(get(ec, get(midgeP, s)), k))
        })
      )
      grid->Array.map(x => faces->String.slice(~start=x, ~end=x + 1))->Array.join("")
    } else {
      let chars = []
      for i in 0 to 23 {
        let face = i / 4
        let row = mod(i / 2, 2)
        let col = mod(i, 2)
        let x = get(grid, face * 9 + row * 6 + col * 2)
        chars->Array.push(faces->String.slice(~start=x, ~end=x + 1))
      }
      chars->Array.join("")
    }
  } else {
    if size == 4 {
      let (cP, cO) = switch get(coordinates, 0) {
      | Corner({p, o}) => (p, o)
      | _ => panic("expected corner")
      }
      writeOriented(cP, cO, c4, cc)
      let wP = switch get(coordinates, 1) {
      | Wing({p}) => p
      | _ => panic("expected wing")
      }
      writeWing(wP, w4)
      let zP = switch get(coordinates, 2) {
      | Center({p}) => p
      | _ => panic("expected center")
      }
      zP->Array.forEachWithIndex((colour, i) => {
        set(fs, get(z4, i), colour)
      })
    } else {
      let fixedIndices = [12, 37, 62, 87, 112, 137]
      for f in 0 to 5 {
        set(fs, get(fixedIndices, f), f)
      }
      let (cP, cO) = switch get(coordinates, 0) {
      | Corner({p, o}) => (p, o)
      | _ => panic("expected corner")
      }
      writeOriented(cP, cO, c5, cc)
      let (mP, mO) = switch get(coordinates, 1) {
      | Midge({p, o}) => (p, o)
      | _ => panic("expected midge")
      }
      writeOriented(mP, mO, e5, ec)
      let wP = switch get(coordinates, 2) {
      | Wing({p}) => p
      | _ => panic("expected wing")
      }
      writeWing(wP, w5)
      let xP = switch get(coordinates, 3) {
      | Center({p}) => p
      | _ => panic("expected center")
      }
      xP->Array.forEachWithIndex((colour, i) => {
        set(fs, get(x5, i), colour)
      })
      let pP = switch get(coordinates, 4) {
      | Center({p}) => p
      | _ => panic("expected center")
      }
      pP->Array.forEachWithIndex((colour, i) => {
        set(fs, get(p5, i), colour)
      })
    }
    fs->Array.map(x => faces->String.slice(~start=x, ~end=x + 1))->Array.join("")
  }
}

let decodeState = (input: string): result<cubeState, orbitError> => {
  let token = String.trim(input)
  let tokLen = String.length(token)
  let foundSize = ref(0)
  let supportedSizes = [2, 3, 4, 5]
  for i in 0 to Array.length(supportedSizes) - 1 {
    let s = get(supportedSizes, i)
    switch Dict.get(widths, Int.toString(s)) {
    | Some(w) if w == tokLen => foundSize := s
    | _ => ()
    }
  }
  if foundSize.contents == 0 {
    fail("InvalidTokenLength", "Orbit64 state tokens use 5, 12, 27, or 43 characters for 2×2×2 through 5×5×5.")
  } else {
    let hasInvalidChar = ref(false)
    for i in 0 to tokLen - 1 {
      let ch = token->String.slice(~start=i, ~end=i + 1)
      if String.indexOf(alphabet, ch) < 0 {
        hasInvalidChar := true
      }
    }
    if hasInvalidChar.contents {
      fail("InvalidTokenCharacter", "Orbit64 uses only the Base64URL alphabet.")
    } else {
      let firstChar = token->String.slice(~start=0, ~end=1)
      if String.indexOf(alphabet, firstChar) > 15 {
        fail("InvalidHeader", "This Orbit64 token is not a state token (its leading class bits are not 00).")
      } else {
        let n = foundSize.contents
        let value = ref(zero)
        let b64 = fromInt(64)
        for i in 0 to tokLen - 1 {
          let ch = token->String.slice(~start=i, ~end=i + 1)
          let alphaIdx = String.indexOf(alphabet, ch)
          value := add(mul(value.contents, b64), fromInt(alphaIdx))
        }
        if gte(value.contents, stateCount(n)) {
          fail("InvalidState", `The token is out of range for ${Int.toString(n)}×${Int.toString(n)}×${Int.toString(n)}.`)
        } else {
          let frameCount = fromInt(if carriesFrame(n) { 24 } else { 1 })
          let frame = toInt(rem(value.contents, frameCount))
          let rendered = renderCoordinates(n, unrankCoordinates(n, div(value.contents, frameCount)))
          switch FaceletCodec.parse(~size=n, rendered) {
          | Error(_) => fail("InvalidState", "Decoded Orbit64 facelets are invalid.")
          | Ok(parsed) =>
            if !carriesFrame(n) || frame == 0 {
              ok(parsed)
            } else {
              switch transform(parsed, get(rotationSteps, frame)) {
              | Some(framed) => ok(framed)
              | None => fail("InvalidFrame", "Orbit64's stored whole-cube frame could not be applied.")
              }
            }
          }
        }
      }
    }
  }
}

let encodeState = (state: cubeState): result<string, orbitError> => {
  if !isCubeState(state) {
    fail("InvalidState", "Orbit64 state input must contain six facelet arrays.")
  } else {
    let n = state.size
    switch Dict.get(widths, Int.toString(n)) {
    | None => fail("UnsupportedSize", "Orbit64 supports 2×2×2 through 5×5×5.")
    | Some(expectedWidth) =>
      let facelets = state.facelets
      let hasBadFace = facelets->Array.some(face => Array.length(face) != n * n)
      if hasBadFace {
        fail("InvalidState", `A ${Int.toString(n)}×${Int.toString(n)}×${Int.toString(n)} Orbit64 state needs ${Int.toString(n * n)} facelets per face.`)
      } else {
        let canonical = ref(state)
        let frame = ref(0)
        let frameError = ref(false)
        if carriesFrame(n) {
          let f = frameForState(state)
          if f < 0 {
            frameError := true
          } else {
            frame := f
            switch transform(state, inverseRotation(get(rotationSteps, f))) {
            | Some(t) => canonical := t
            | None => frameError := true
            }
          }
        }
        if frameError.contents {
          fail("InvalidCoordinates", "The odd-cube fixed centres do not form a right-handed whole-cube frame.")
        } else {
          let canonicalFacelets: string = FaceletCodec.render(canonical.contents)
          switch inputCoordinates(n, canonicalFacelets) {
          | None => fail("InvalidCoordinates", "The facelets do not describe Orbit64's published piece convention.")
          | Some(coordinates) =>
            let parityMismatch = if carriesFrame(n) {
              let cP = switch get(coordinates, 0) {
              | Corner({p}) => p
              | _ => []
              }
              let mP = switch get(coordinates, 1) {
              | Midge({p}) => p
              | _ => []
              }
              parity(cP) != parity(mP)
            } else {
              false
            }
            if parityMismatch {
              fail("InvalidCoordinates", "Corner and midge permutation parity must match.")
            } else {
              let frameMul = fromInt(if carriesFrame(n) { 24 } else { 1 })
              let value = ref(add(mul(rankCoordinates(n, coordinates), frameMul), fromInt(frame.contents)))
              let output = ref("")
              let b64 = fromInt(64)
              for _ in 0 to expectedWidth - 1 {
                let digit = toInt(rem(value.contents, b64))
                let ch = alphabet->String.slice(~start=digit, ~end=digit + 1)
                output := ch ++ output.contents
                value := div(value.contents, b64)
              }
              ok(output.contents)
            }
          }
        }
      }
    }
  }
}

/** Rotate an odd cube into Orbit64's canonical U/R/F fixed-centre frame. */
let canonicaliseState = (state: cubeState): result<cubeState, orbitError> => {
  if !isCubeState(state) {
    fail("InvalidState", "Orbit64 state input must contain six facelet arrays.")
  } else {
    let size = state.size
    if !carriesFrame(size) {
      fail("UnsupportedSize", "Orientation canonicalisation is available for 3×3×3 and 5×5×5 states.")
    } else {
      let facelets = state.facelets
      let s2 = size * size
      let hasBadFace = facelets->Array.some(face => Array.length(face) != s2)
      if hasBadFace {
        fail("InvalidState", `A ${Int.toString(size)}×${Int.toString(size)}×${Int.toString(size)} state needs ${Int.toString(s2)} facelets per face.`)
      } else {
        let f = frameForState(state)
        if f < 0 {
          fail("InvalidCoordinates", "The fixed centres do not form a right-handed whole-cube frame.")
        } else {
          switch transform(state, inverseRotation(get(rotationSteps, f))) {
          | Some(canonical) => ok(canonical)
          | None => fail("InvalidFrame", "The fixed-centre frame could not be canonicalised.")
          }
        }
      }
    }
  }
}
