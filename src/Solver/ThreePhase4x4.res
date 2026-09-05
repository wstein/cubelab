/*
 * Three-phase 4×4 port boundary.
 *
 * Derived from the GPLv3-or-later TPR-4x4x4-Solver interface by Shuang Chen
 * (cs.threephase), supplied as repomix-output-cs0x7f-TPR-4x4x4-Solver.xml.
 * See NOTICE. This ReScript port preserves the upstream solver's U/R/F/D/L/B,
 * row-major, 96-facelet contract while using CubeLab's validated state codec
 * at the boundary.
 */

open StateTypes

type inputError =
  | UnsupportedState(string)
  | InvalidFacelets(string)
  | InvalidTransition(string)

let encodeFacelets = (state: cubeState): result<string, inputError> =>
  if state.size != 4 {
    Error(UnsupportedState("Three-phase 4×4 requires a complete 4×4 state."))
  } else {
    serializationOrder
    ->Array.map(face =>
      Belt.Array.getUnsafe(state.facelets, storageIndex(face))
      ->Array.map(faceToChar)
      ->Array.join("")
    )
    ->Array.join("")
    ->Ok
  }

let decodeFacelets = (facelets: string): result<cubeState, inputError> =>
  switch FaceletCodec.parse(~size=4, facelets) {
  | Ok(state) => Ok(state)
  | Error(_) => Error(InvalidFacelets("Three-phase 4×4 requires 96 legal URFDLB facelets."))
  }

/* Direct port of FullCube.centerFacelet, translated from Java's named u5/d5
 * constants to canonical U/R/F/D/L/B facelet offsets. The slot order is
 * U, D, F, B, R, L and is consumed by the three centre phases. */
let centreFaceletIndices = [
  5, 6, 10, 9,
  53, 54, 58, 57,
  37, 38, 42, 41,
  85, 86, 90, 89,
  21, 22, 26, 25,
  69, 70, 74, 73,
]

let extractCentres = (state: cubeState): string =>
  switch encodeFacelets(state) {
  | Error(_) => ""
  | Ok(facelets) =>
    centreFaceletIndices
    ->Array.map(index => facelets->String.get(index)->Belt.Option.getUnsafe->String.make)
    ->Array.join("")
  }

/* Direct port of FullCube.edgeFacelet. Each pair identifies the two stickers
 * belonging to one wing slot; ordering is significant to the edge phases. */
let wingFaceletIndices = [
  (13, 33), (4, 65), (2, 81), (11, 17),
  (61, 94), (52, 78), (50, 46), (59, 30),
  (75, 40), (68, 87), (27, 88), (20, 39),
  (34, 14), (66, 8), (82, 1), (18, 7),
  (93, 62), (77, 56), (45, 49), (29, 55),
  (36, 71), (91, 72), (84, 23), (43, 24),
]

let extractWings = (state: cubeState): array<string> =>
  switch encodeFacelets(state) {
  | Error(_) => []
  | Ok(facelets) =>
    wingFaceletIndices
    ->Array.map(((first, second)) =>
      facelets->String.get(first)->Belt.Option.getUnsafe->String.make ++
      facelets->String.get(second)->Belt.Option.getUnsafe->String.make
    )
  }

/* Direct port of FullCube.cornerFacelet. These fixed 3-sticker slots retain
 * the U/D-first orientation convention used by the phase-three handoff. */
let cornerFaceletIndices = [
  [15, 16, 35], [12, 32, 67], [0, 64, 83], [3, 80, 19],
  [51, 47, 28], [48, 79, 44], [60, 95, 76], [63, 31, 92],
]

let extractCorners = (state: cubeState): array<string> =>
  switch encodeFacelets(state) {
  | Error(_) => []
  | Ok(facelets) =>
    cornerFaceletIndices
    ->Array.map(indices =>
      indices
      ->Array.map(index => facelets->String.get(index)->Belt.Option.getUnsafe->String.make)
      ->Array.join("")
    )
  }

/* Transition oracle for ported coordinates. The later centre/edge tables are
 * generated against this exact 4×4 move semantics, so a table transition can
 * always be checked against the canonical state executor. */
let applyTransition = (
  state: cubeState,
  notation: string,
): result<cubeState, inputError> =>
  if state.size != 4 {
    Error(UnsupportedState("Three-phase transitions require a 4×4 state."))
  } else {
    switch MoveParser.parseWithOptions(~size=4, ~lowercaseMode=Wide, ~notationDialect=Modern, notation) {
    | Error(_) => Error(InvalidTransition("Invalid 4×4 transition notation."))
    | Ok(alg) =>
      switch MoveExecutor.applyAlg(state, alg) {
      | Ok(next) => Ok(next)
      | Error(_) => Error(InvalidTransition("4×4 transition could not be applied."))
      }
    }
  }

let serialFace = index =>
  switch index {
  | 0 => U
  | 1 => R
  | 2 => F
  | 3 => D
  | 4 => L
  | _ => B
  }

let markerState = (): cubeState => {
  size: 4,
  facelets: storageOrder->Array.map(_ => Array.make(~length=16, U)),
}

let rawMarkerIndex = (state: cubeState): int => {
  let found = ref(-1)
  for serialIndex in 0 to 5 {
    let stickers = Belt.Array.getUnsafe(state.facelets, storageIndex(serialFace(serialIndex)))
    for stickerIndex in 0 to 15 {
      if Belt.Array.getUnsafe(stickers, stickerIndex) == D {
        found := serialIndex * 16 + stickerIndex
      }
    }
  }
  found.contents
}

let centreSlotForFacelet = rawIndex => {
  let found = ref(-1)
  for slot in 0 to 23 {
    if Belt.Array.getUnsafe(centreFaceletIndices, slot) == rawIndex {
      found := slot
    }
  }
  found.contents
}

/* Generated table row in target->source form. A unique marker is moved through
 * the canonical executor for each source slot, avoiding hand-maintained move
 * permutations and making the coordinate table reproducible. */
let centreTransition = (notation: string): result<array<int>, inputError> => {
  let permutation = Array.make(~length=24, 0)
  let failure = ref(None)
  for sourceSlot in 0 to 23 {
    let marker = markerState()
    let sourceFacelet = Belt.Array.getUnsafe(centreFaceletIndices, sourceSlot)
    let face = serialFace(sourceFacelet / 16)
    Belt.Array.getUnsafe(marker.facelets, storageIndex(face))[sourceFacelet % 16] = D
    switch applyTransition(marker, notation) {
    | Error(error) => failure := Some(error)
    | Ok(moved) => {
      let targetSlot = rawMarkerIndex(moved)->centreSlotForFacelet
      if targetSlot == -1 {
        failure := Some(InvalidTransition("Transition moves a centre marker outside the centre coordinate."))
      } else {
        permutation[targetSlot] = sourceSlot
      }
    }
    }
  }
  switch failure.contents {
  | Some(error) => Error(error)
  | None => Ok(permutation)
  }
}

let applyCentreTransition = (centres: string, permutation: array<int>): string =>
  permutation
  ->Array.map(source => centres->String.get(source)->Belt.Option.getUnsafe->String.make)
  ->Array.join("")

/* Phase-one centre coordinate: choose the eight U/D-coloured centres among
 * the 24 ordered slots. This is the 735,471-state raw coordinate used before
 * symmetry reduction in the upstream Center1 table. */
let choose = (n: int, k: int): int => {
  if k < 0 || k > n {
    0
  } else {
    let reduced = if k > n - k {n - k} else {k}
    let value = ref(1)
    for offset in 1 to reduced {
      value := value.contents * (n - reduced + offset) / offset
    }
    value.contents
  }
}

let rankUdCentres = (centres: string): int => {
  if centres->String.length != 24 {
    -1
  } else {
    let selected = ref([])
    for slot in 0 to 23 {
      let colour = centres->String.get(slot)->Belt.Option.getUnsafe->String.make
      if colour == "U" || colour == "D" {
        selected := selected.contents->Array.concat([slot])
      }
    }
    if selected.contents->Array.length != 8 {
      -1
    } else {
      let rank = ref(0)
      let previous = ref(-1)
      for selectionIndex in 0 to 7 {
        let selectedSlot = Belt.Array.getUnsafe(selected.contents, selectionIndex)
        for candidate in previous.contents + 1 to selectedSlot - 1 {
          rank := rank.contents + choose(24 - candidate - 1, 8 - selectionIndex - 1)
        }
        previous := selectedSlot
      }
      rank.contents
    }
  }
}

let rankUdSlots = (selected: array<int>): int => {
  if selected->Array.length != 8 {
    -1
  } else {
    let rank = ref(0)
    let previous = ref(-1)
    for selectionIndex in 0 to 7 {
      let selectedSlot = Belt.Array.getUnsafe(selected, selectionIndex)
      for candidate in previous.contents + 1 to selectedSlot - 1 {
        rank := rank.contents + choose(24 - candidate - 1, 8 - selectionIndex - 1)
      }
      previous := selectedSlot
    }
    rank.contents
  }
}

let unrankUdCentres = (rank: int): array<int> => {
  if rank < 0 || rank >= choose(24, 8) {
    []
  } else {
    let remainingRank = ref(rank)
    let selected = ref([])
    let candidate = ref(0)
    for selectionIndex in 0 to 7 {
      let finding = ref(true)
      while finding.contents {
        let count = choose(24 - candidate.contents - 1, 8 - selectionIndex - 1)
        if remainingRank.contents < count {
          selected := selected.contents->Array.concat([candidate.contents])
          candidate := candidate.contents + 1
          finding := false
        } else {
          remainingRank := remainingRank.contents - count
          candidate := candidate.contents + 1
        }
      }
    }
    selected.contents
  }
}

let centreCoordinateSize = choose(24, 8)

/* Packed 4-bit distance table: 0xF means unseen. This is the storage used by
 * the forthcoming BFS, keeping the raw phase-one table below 400 KiB. */
let createCentrePruning = (): array<int> =>
  Array.make(~length=(centreCoordinateSize + 1) / 2, 255)

let pruningDepth = (table: array<int>, index: int): int => {
  let packed = Belt.Array.getUnsafe(table, index / 2)
  if index % 2 == 0 {packed % 16} else {packed / 16}
}

let setPruningDepth = (table: array<int>, index: int, depth: int): unit => {
  let tableIndex = index / 2
  let packed = Belt.Array.getUnsafe(table, tableIndex)
  let normalized = depth % 16
  if index % 2 == 0 {
    table[tableIndex] = (packed / 16) * 16 + normalized
  } else {
    table[tableIndex] = (packed % 16) + normalized * 16
  }
}

let centreMoveNotations = [
  "U", "U'", "U2", "R", "R'", "R2", "F", "F'", "F2",
  "D", "D'", "D2", "L", "L'", "L2", "B", "B'", "B2",
  "2U", "2U'", "2U2", "2R", "2R'", "2R2", "2F", "2F'", "2F2",
  "2D", "2D'", "2D2", "2L", "2L'", "2L2", "2B", "2B'", "2B2",
]

let transitionUdRank = (rank: int, permutation: array<int>): int => {
  let selected = unrankUdCentres(rank)
  let marked = Array.make(~length=24, false)
  selected->Array.forEach(slot => marked[slot] = true)
  let next = ref([])
  for targetSlot in 0 to 23 {
    if Belt.Array.getUnsafe(marked, Belt.Array.getUnsafe(permutation, targetSlot)) {
      next := next.contents->Array.concat([targetSlot])
    }
  }
  rankUdSlots(next.contents)
}

/* Port of Center1.initSym2Raw's 48-element centre symmetry walk. These are
 * not merely the 24 spatial cube rotations: the upstream coordinate also
 * uses the complementary centre transforms needed to canonicalise the U/D
 * subset. Keep them as coordinate permutations, derived from the canonical
 * executor, rather than treating display rotations as solver moves. */
let composeCentrePermutations = (first: array<int>, second: array<int>): array<int> =>
  second->Array.map(target => Belt.Array.getUnsafe(first, target))

let centreSymmetryGenerators = (): result<array<array<int>>, inputError> => {
  let generators = ref([])
  let failure = ref(None)
  /* Center1.rot: (0) Uw2 Dw2, (1) Rw Lw', (2) z2, (3) Uw Dw' Fw Bw'. The z2
   * transform is written directly because it is a coordinate reflection in
   * the upstream symmetry enumeration, not a searched cube rotation. */
  let notations = ["Uw2 Dw2", "Rw Lw'", "Uw Dw' Fw Bw'"]
  notations->Array.forEach(notation =>
    switch centreTransition(notation) {
    | Ok(permutation) => generators := generators.contents->Array.concat([permutation])
    | Error(reason) => failure := Some(reason)
    }
  )
  let z2 = [
    1, 0, 3, 2, 5, 4, 7, 6,
    9, 8, 11, 10, 13, 12, 15, 14,
    21, 20, 23, 22, 17, 16, 19, 18,
  ]
  switch failure.contents {
  | Some(reason) => Error(reason)
  | None => Ok([Belt.Array.getUnsafe(generators.contents, 0), Belt.Array.getUnsafe(generators.contents, 1), z2, Belt.Array.getUnsafe(generators.contents, 2)])
  }
}

let centreSymmetryPermutations = (): result<array<array<int>>, inputError> =>
  switch centreSymmetryGenerators() {
  | Error(reason) => Error(reason)
  | Ok(generators) => {
    let identity = Array.make(~length=24, 0)
    for slot in 0 to 23 { identity[slot] = slot }
    let permutations = ref([])
    let current = ref(identity)
    for index in 0 to 47 {
      permutations := permutations.contents->Array.concat([current.contents])
      current := composeCentrePermutations(current.contents, Belt.Array.getUnsafe(generators, 0))
      if index % 2 == 1 {
        current := composeCentrePermutations(current.contents, Belt.Array.getUnsafe(generators, 1))
      }
      if index % 8 == 7 {
        current := composeCentrePermutations(current.contents, Belt.Array.getUnsafe(generators, 2))
      }
      if index % 16 == 15 {
        current := composeCentrePermutations(current.contents, Belt.Array.getUnsafe(generators, 3))
      }
    }
    Ok(permutations.contents)
  }
  }

type canonicalCentreRank = {rawRank: int, symmetry: int}

/* Raw-to-symmetry seam. The returned symmetry identifies the transform which
 * maps rawRank to its orbit representative, enabling later packed-table
 * generators to store one distance per representative. */
let canonicalUdRank = (rawRank: int): result<canonicalCentreRank, inputError> =>
  if rawRank < 0 || rawRank >= centreCoordinateSize {
    Error(InvalidTransition("Invalid phase-one centre rank."))
  } else {
    switch centreSymmetryPermutations() {
    | Error(reason) => Error(reason)
    | Ok(symmetries) => {
      let bestRank = ref(rawRank)
      let bestSymmetry = ref(0)
      symmetries->Array.forEachWithIndex((permutation, symmetry) => {
        let candidate = transitionUdRank(rawRank, permutation)
        if candidate < bestRank.contents {
          bestRank := candidate
          bestSymmetry := symmetry
        }
      })
      Ok({rawRank: bestRank.contents, symmetry: bestSymmetry.contents})
    }
  }
  }

type centreSymmetryMap = {
  /* Same encoding as upstream Center1.raw2sym: high bits are a compact
   * representative rank; low six bits select the transform back to it. */
  rawToSymmetry: array<int>,
  representatives: array<int>,
}

let inverseCentreSymmetryIndices = (symmetries: array<array<int>>): array<int> => {
  let inverses = Array.make(~length=48, -1)
  for firstIndex in 0 to 47 {
    for secondIndex in 0 to 47 {
      let combined = composeCentrePermutations(
        Belt.Array.getUnsafe(symmetries, firstIndex),
        Belt.Array.getUnsafe(symmetries, secondIndex),
      )
      let identity = ref(true)
      for slot in 0 to 23 {
        if Belt.Array.getUnsafe(combined, slot) != slot { identity := false }
      }
      if identity.contents { inverses[firstIndex] = secondIndex }
    }
  }
  inverses
}

/* Enumerate each symmetry orbit once, in raw-rank order. The first raw rank
 * encountered is therefore its canonical representative. This is deliberately
 * a table-generation operation: the result is cached with the pruning table,
 * never rebuilt on an interactive solve. */
let buildCentreSymmetryMap = (): result<centreSymmetryMap, inputError> =>
  switch centreSymmetryPermutations() {
  | Error(reason) => Error(reason)
  | Ok(symmetries) => {
    let rawToSymmetry = Array.make(~length=centreCoordinateSize, -1)
    let inverses = inverseCentreSymmetryIndices(symmetries)
    let representatives = ref([])
    for rawRank in 0 to centreCoordinateSize - 1 {
      if Belt.Array.getUnsafe(rawToSymmetry, rawRank) == -1 {
        let compactRank = representatives.contents->Array.length
        representatives := representatives.contents->Array.concat([rawRank])
        symmetries->Array.forEachWithIndex((permutation, symmetry) => {
          let orbitRank = transitionUdRank(rawRank, permutation)
          if Belt.Array.getUnsafe(rawToSymmetry, orbitRank) == -1 {
            let inverse = Belt.Array.getUnsafe(inverses, symmetry)
            rawToSymmetry[orbitRank] = compactRank * 64 + inverse
          }
        })
      }
    }
    Ok({rawToSymmetry, representatives: representatives.contents})
  }
  }

let createPackedPruning = (size: int): array<int> =>
  Array.make(~length=(size + 1) / 2, 255)

/* Symmetry-reduced packed BFS. Every successor is converted through raw2sym
 * before enqueueing, so the stored coordinate is one of 15,582 orbit
 * representatives rather than one of 735,471 raw centre subsets. */
let buildSymmetryCentrePruning = (maximumDepth: int): result<array<int>, inputError> =>
  switch buildCentreSymmetryMap() {
  | Error(reason) => Error(reason)
  | Ok(symmetryMap) => {
    let transitions = ref([])
    let failure = ref(None)
    centreMoveNotations->Array.forEach(notation =>
      switch centreTransition(notation) {
      | Ok(permutation) => transitions := transitions.contents->Array.concat([permutation])
      | Error(reason) => failure := Some(reason)
      }
    )
    switch failure.contents {
    | Some(reason) => Error(reason)
    | None => {
      let table = createPackedPruning(symmetryMap.representatives->Array.length)
      let queue = Array.make(~length=symmetryMap.representatives->Array.length, 0)
      let head = ref(0)
      let tail = ref(1)
      setPruningDepth(table, 0, 0)
      queue[0] = 0
      while head.contents < tail.contents {
        let compactRank = Belt.Array.getUnsafe(queue, head.contents)
        head := head.contents + 1
        let depth = pruningDepth(table, compactRank)
        if depth < maximumDepth {
          let rawRank = Belt.Array.getUnsafe(symmetryMap.representatives, compactRank)
          transitions.contents->Array.forEach(permutation => {
            let successorRaw = transitionUdRank(rawRank, permutation)
            let successorCompact = Belt.Array.getUnsafe(symmetryMap.rawToSymmetry, successorRaw) / 64
            if pruningDepth(table, successorCompact) == 15 {
              setPruningDepth(table, successorCompact, depth + 1)
              queue[tail.contents] = successorCompact
              tail := tail.contents + 1
            }
          })
        }
      }
      Ok(table)
    }
    }
  }
  }

/* Breadth-first packed pruning build. maximumDepth permits deterministic,
 * small test builds; pass 15 for the complete raw-coordinate traversal. */
let buildCentrePruning = (maximumDepth: int): result<array<int>, inputError> => {
  let transitions = ref([])
  let error = ref(None)
  centreMoveNotations->Array.forEach(notation =>
    switch centreTransition(notation) {
    | Ok(permutation) => transitions := transitions.contents->Array.concat([permutation])
    | Error(reason) => error := Some(reason)
    }
  )
  switch error.contents {
  | Some(reason) => Error(reason)
  | None => {
    let table = createCentrePruning()
    let queue = Array.make(~length=centreCoordinateSize, 0)
    let head = ref(0)
    let tail = ref(1)
    setPruningDepth(table, 0, 0)
    queue[0] = 0
    while head.contents < tail.contents {
      let current = Belt.Array.getUnsafe(queue, head.contents)
      head := head.contents + 1
      let depth = pruningDepth(table, current)
      if depth < maximumDepth {
        transitions.contents->Array.forEach(permutation => {
          let next = transitionUdRank(current, permutation)
          if pruningDepth(table, next) == 15 {
            setPruningDepth(table, next, depth + 1)
            queue[tail.contents] = next
            tail := tail.contents + 1
          }
        })
      }
    }
    Ok(table)
  }
}
}
