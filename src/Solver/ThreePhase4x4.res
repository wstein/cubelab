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

/* The upstream u/r/f/d/l/b move indices (Center1.move cases 6–11) rotate the
 * outer face and its adjacent inner slice together — e.g. case 6 (u) swaps
 * ct[0..3] (the outer U face) in the same call as the inner-slice cycles —
 * so they are wide/block turns, not bare inner slices. "2U" in this
 * codebase's SiGN-derived notation means only the second layer from U (the
 * inner slice alone, leaving the U face fixed); "Uw" is the block turn that
 * matches upstream. Confirmed by comparing centreTransition("2U") against
 * centreTransition("Uw"): only the latter also permutes slots 0–3. */
let centreMoveNotations = [
  "U", "U'", "U2", "R", "R'", "R2", "F", "F'", "F2",
  "D", "D'", "D2", "L", "L'", "L2", "B", "B'", "B2",
  "Uw", "Uw'", "Uw2", "Rw", "Rw'", "Rw2", "Fw", "Fw'", "Fw2",
  "Dw", "Dw'", "Dw2", "Lw", "Lw'", "Lw2", "Bw", "Bw'", "Bw2",
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

/* Port of Moves.move2std / move3std: the restricted move sets searched by
 * phases two and three. Upstream numbers each of the twelve outer/wide faces
 * 0..11 as U,R,F,D,L,B,u,r,f,d,l,b and derives both lists from that single
 * numbering; this port keeps the same faceId so the ckmv rule below ports
 * directly, while spelling each move in this codebase's own notation instead
 * of transcribing Moves.java's byte tables. */
type restrictedMove = {notation: string, faceId: int}

let phase2Moves: array<restrictedMove> = [
  {notation: "U", faceId: 0}, {notation: "U2", faceId: 0}, {notation: "U'", faceId: 0},
  {notation: "R", faceId: 1}, {notation: "R2", faceId: 1}, {notation: "R'", faceId: 1},
  {notation: "F", faceId: 2}, {notation: "F2", faceId: 2}, {notation: "F'", faceId: 2},
  {notation: "D", faceId: 3}, {notation: "D2", faceId: 3}, {notation: "D'", faceId: 3},
  {notation: "L", faceId: 4}, {notation: "L2", faceId: 4}, {notation: "L'", faceId: 4},
  {notation: "B", faceId: 5}, {notation: "B2", faceId: 5}, {notation: "B'", faceId: 5},
  {notation: "Uw2", faceId: 6},
  {notation: "Rw", faceId: 7}, {notation: "Rw2", faceId: 7}, {notation: "Rw'", faceId: 7},
  {notation: "Fw2", faceId: 8},
  {notation: "Dw2", faceId: 9},
  {notation: "Lw", faceId: 10}, {notation: "Lw2", faceId: 10}, {notation: "Lw'", faceId: 10},
  {notation: "Bw2", faceId: 11},
]

let phase3Moves: array<restrictedMove> = [
  {notation: "U", faceId: 0}, {notation: "U2", faceId: 0}, {notation: "U'", faceId: 0},
  {notation: "R2", faceId: 1},
  {notation: "F", faceId: 2}, {notation: "F2", faceId: 2}, {notation: "F'", faceId: 2},
  {notation: "D", faceId: 3}, {notation: "D2", faceId: 3}, {notation: "D'", faceId: 3},
  {notation: "L2", faceId: 4},
  {notation: "B", faceId: 5}, {notation: "B2", faceId: 5}, {notation: "B'", faceId: 5},
  {notation: "Uw2", faceId: 6},
  {notation: "Rw2", faceId: 7},
  {notation: "Fw2", faceId: 8},
  {notation: "Dw2", faceId: 9},
  {notation: "Lw2", faceId: 10},
  {notation: "Bw2", faceId: 11},
]

/* Port of Moves.ckmv, specialised to face ids rather than raw move indices:
 * `ckmv[i][j]` upstream is true exactly when a search node must reject move
 * j after move i (same face repeated, or an axis pair — faceId mod 3 — taken
 * out of ascending order). Because same-axis moves commute, rejecting the
 * descending order never excludes an optimal solution; it only removes a
 * redundant reordering, exactly like this codebase's existing
 * TwoPhaseSolver.canonicalFaceTransition for the un-restricted 3×3 move set.
 * lastFaceId of -1 marks the start of a search, where every move is legal. */
let axisTransitionAllowed = (lastFaceId: int, nextFaceId: int): bool =>
  lastFaceId < 0 ||
    (lastFaceId != nextFaceId && (lastFaceId % 3 != nextFaceId % 3 || lastFaceId < nextFaceId))

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

/* Phase-two centre coordinate: an independent redesign of upstream's Center2,
 * not a bit-compatible port. Reverse-engineering (and empirically running,
 * via a compiled copy of the upstream Java) Center2's raw ct[]/rl[] arrays
 * showed they rely on group-theoretic preconditions established by Center1's
 * full 48-symmetry search plus a 3-case post-solve canonicalisation
 * (`Center1.finish`) that increment 8 did not port; feeding Center2 a state
 * that only satisfies our own phase-one rank-0 (reached by an arbitrary move
 * path, not upstream's specific symmetry-reduced search) reproducibly throws
 * inside upstream's own getct().
 *
 * A first attempt tracked "which 8 of slots 8–23 hold F or B", assuming that
 * boundary was closed under phase-two's restricted moves the way slots 16–23
 * are. It is not: applying the wide quarter turn Rw to a phase-one-solved
 * state (verified with the canonical executor) moves a U/D-coloured sticker
 * from slot 5 into slot 9, disturbing rankUdCentres away from 0. Phase-two's
 * restricted moves keep slots 16–23 closed (confirmed the same way) but not
 * a 0–7/8–23 split, so any coordinate assuming that split can go undefined
 * mid-search.
 *
 * This is the corrected design: track two independent whole-24-slot ranks,
 * exactly like phase-one's own rankUdCentres, which is always well-defined
 * because there are always exactly 8 U/D and 8 F/B stickers somewhere among
 * all 24 slots regardless of arrangement.
 *   - udRank: rankUdCentres, target 0 (unchanged from phase one).
 *   - fbRank: rankFbCentres below, target phase2TargetFbRank (F/B holds
 *     slots 8–15).
 * Both transition via the existing transitionUdRank, fed the same full
 * 24-slot permutation from centreTransition — no new move derivation is
 * needed. A whole-cube "x" rotation conjugates the U/D target {0..7} to the
 * F/B target {8..15} (verified: transitionUdRank(0, x) equals
 * rankUdSlots([8..15])), so fbRank's distance to its target can reuse the
 * already-built phase-one symmetry pruning table by rotating fbRank back
 * into the U/D frame first, instead of building a second table. This bound
 * uses the full move set rather than phase-two's restricted 28, so it is
 * still admissible (more available moves can only shorten the true
 * distance) but looser; tightening it to a phase-two-specific table is a
 * follow-up if search performance needs it.
 *
 * This does not track upstream's centre/wing parity-avoidance bit (used to
 * bias which phase-one candidate to extend), so a search built on this may
 * find that no phase-one endpoint it tries is reachable to (0, target) by
 * phase-two's restricted moves alone. That is expected — the fix is trying
 * more phase-one candidates, matching upstream's own multi-candidate retry
 * — not a flaw in this coordinate, and is deferred to phase-one/two
 * chaining. Separately, dropping parity-avoidance means a search built on
 * this may land in a state whose reduction later needs the existing
 * OLL/PLL-4×4 parity repair in Reduction4x4.res; that is a move-count
 * quality tradeoff to revisit, not a correctness gap. */
let rankFbCentres = (centres: string): int =>
  if centres->String.length != 24 {
    -1
  } else {
    let selected = ref([])
    for slot in 0 to 23 {
      let colour = centres->String.get(slot)->Belt.Option.getUnsafe->String.make
      if colour == "F" || colour == "B" {
        selected := selected.contents->Array.concat([slot])
      }
    }
    rankUdSlots(selected.contents)
  }

let phase2TargetFbRank = rankUdSlots([8, 9, 10, 11, 12, 13, 14, 15])

/* Cached once at module load, mirroring how centreCoordinateSize is a plain
 * top-level computation: cheap, pure, and reused by every distance query. */
let phase2FbRotation: result<array<int>, inputError> = centreTransition("x")
let phase2FbRotationInverse: result<array<int>, inputError> = centreTransition("x'")

/* buildSymmetryCentrePruning packs one distance per compact orbit index
 * (0..15,581), not per raw rank (0..735,470) — canonicalUdRank's rawRank is
 * the orbit's minimal raw member, a different integer from its compact
 * index. rawToSymmetry already carries that raw→compact mapping (the
 * comment on centreSymmetryMap: "compactRank * 64 + inverse symmetry"), so
 * distance lookups go through it directly rather than through
 * canonicalUdRank. */
let udRankDistance = (
  udRank: int,
  symmetryMap: centreSymmetryMap,
  symmetryTable: array<int>,
): result<int, inputError> =>
  if udRank < 0 || udRank >= centreCoordinateSize {
    Error(InvalidTransition("Invalid phase-two U/D rank."))
  } else {
    let compactRank = Belt.Array.getUnsafe(symmetryMap.rawToSymmetry, udRank) / 64
    Ok(pruningDepth(symmetryTable, compactRank))
  }

let phase2FbDistance = (
  fbRank: int,
  symmetryMap: centreSymmetryMap,
  symmetryTable: array<int>,
): result<int, inputError> =>
  switch phase2FbRotationInverse {
  | Error(reason) => Error(reason)
  | Ok(permutation) => udRankDistance(transitionUdRank(fbRank, permutation), symmetryMap, symmetryTable)
  }

let phase2CombinedDistance = (
  udRank: int,
  fbRank: int,
  symmetryMap: centreSymmetryMap,
  symmetryTable: array<int>,
): result<int, inputError> =>
  switch (
    udRankDistance(udRank, symmetryMap, symmetryTable),
    phase2FbDistance(fbRank, symmetryMap, symmetryTable),
  ) {
  | (Error(reason), _) => Error(reason)
  | (_, Error(reason)) => Error(reason)
  | (Ok(udDistance), Ok(fbDistance)) => Ok(udDistance > fbDistance ? udDistance : fbDistance)
  }

/* Phase-one IDA* search over the raw U/D-centre coordinate, using the full
 * 36-move set and the already-committed symmetry pruning table as an
 * admissible heuristic (udRankDistance) — the same table-driven IDA* shape
 * already proven out in TwoPhaseSolver.searchPhase1WithinTotal, adapted to
 * this coordinate's single-rank goal. centreMoveFaceIds tags each of
 * centreMoveNotations' 36 entries with the upstream face id its
 * axisTransitionAllowed rule keys on: outer and wide turns of the same
 * physical face get distinct ids (U=0, its wide counterpart u=6), since a
 * wide turn does not merely repeat the outer one. */
let centreMoveFaceIds = [
  0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5,
  6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11,
]

let centreMovePermutationsCache: ref<option<array<array<int>>>> = ref(None)

let centreMovePermutations = (): result<array<array<int>>, inputError> =>
  switch centreMovePermutationsCache.contents {
  | Some(permutations) => Ok(permutations)
  | None => {
      let permutations = ref([])
      let failure = ref(None)
      centreMoveNotations->Array.forEach(notation =>
        switch centreTransition(notation) {
        | Ok(permutation) => permutations := permutations.contents->Array.concat([permutation])
        | Error(reason) => failure := Some(reason)
        }
      )
      switch failure.contents {
      | Some(reason) => Error(reason)
      | None => {
          centreMovePermutationsCache := Some(permutations.contents)
          Ok(permutations.contents)
        }
      }
    }
  }

let centreSymmetryMapCache: ref<option<centreSymmetryMap>> = ref(None)

/* Cached the same way TwoPhaseSolver caches its own move/pruning tables:
 * built once per process, reused by every subsequent search call. */
let cachedCentreSymmetryMap = (): result<centreSymmetryMap, inputError> =>
  switch centreSymmetryMapCache.contents {
  | Some(map) => Ok(map)
  | None =>
    switch buildCentreSymmetryMap() {
    | Ok(map) => {
        centreSymmetryMapCache := Some(map)
        Ok(map)
      }
    | Error(reason) => Error(reason)
    }
  }

let centreSymmetryTableCache: ref<option<array<int>>> = ref(None)

let cachedCentreSymmetryTable = (): result<array<int>, inputError> =>
  switch centreSymmetryTableCache.contents {
  | Some(table) => Ok(table)
  | None =>
    switch buildSymmetryCentrePruning(15) {
    | Ok(table) => {
        centreSymmetryTableCache := Some(table)
        Ok(table)
      }
    | Error(reason) => Error(reason)
    }
  }

let rec searchPhase1Rank = (
  rank: int,
  depth: int,
  lastFaceId: int,
  permutations: array<array<int>>,
  symmetryMap: centreSymmetryMap,
  symmetryTable: array<int>,
): option<array<int>> =>
  if rank == 0 {
    Some([])
  } else if depth == 0 {
    None
  } else {
    switch udRankDistance(rank, symmetryMap, symmetryTable) {
    | Error(_) => None
    | Ok(distance) if distance > depth => None
    | Ok(_) => {
        let found = ref(None)
        for moveIndex in 0 to 35 {
          if found.contents == None {
            let faceId = Belt.Array.getUnsafe(centreMoveFaceIds, moveIndex)
            if axisTransitionAllowed(lastFaceId, faceId) {
              let next = transitionUdRank(rank, Belt.Array.getUnsafe(permutations, moveIndex))
              switch searchPhase1Rank(next, depth - 1, faceId, permutations, symmetryMap, symmetryTable) {
              | Some(tail) => found := Some([moveIndex]->Array.concat(tail))
              | None => ()
              }
            }
          }
        }
        found.contents
      }
    }
  }

type moveSolution = {moveIndices: array<int>, notations: array<string>}

/* IDA*: try each total depth in turn, starting from the admissible bound at
 * the root, exactly like TwoPhaseSolver.totalDepthSearch. maximumDepth caps
 * the search rather than running unbounded, since a state whose rank is
 * outside 0..centreCoordinateSize-1 (not exactly eight U/D stickers) would
 * otherwise search forever. */
let solvePhase1Centres = (centres: string, maximumDepth: int): result<moveSolution, inputError> => {
  let rank = rankUdCentres(centres)
  if rank < 0 {
    Error(InvalidFacelets("Phase-one search requires a centre string with exactly eight U/D stickers."))
  } else {
    switch (centreMovePermutations(), cachedCentreSymmetryMap(), cachedCentreSymmetryTable()) {
    | (Error(reason), _, _) => Error(reason)
    | (_, Error(reason), _) => Error(reason)
    | (_, _, Error(reason)) => Error(reason)
    | (Ok(permutations), Ok(symmetryMap), Ok(symmetryTable)) =>
      switch udRankDistance(rank, symmetryMap, symmetryTable) {
      | Error(reason) => Error(reason)
      | Ok(minimumDepth) => {
          let found = ref(None)
          let depth = ref(minimumDepth)
          while found.contents == None && depth.contents <= maximumDepth {
            found := searchPhase1Rank(rank, depth.contents, -1, permutations, symmetryMap, symmetryTable)
            if found.contents == None {
              depth := depth.contents + 1
            }
          }
          switch found.contents {
          | None =>
            Error(InvalidTransition("No phase-one solution was found within the given depth."))
          | Some(moveIndices) =>
            Ok({
              moveIndices,
              notations: moveIndices->Array.map(index =>
                Belt.Array.getUnsafe(centreMoveNotations, index)
              ),
            })
          }
        }
      }
    }
  }
}

/* Phase-one/two chaining. Reaching phase-one's own rank 0 does not by
 * itself guarantee phase-two's restricted moves can reach the joint target:
 * whatever F/B-vs-R/L contamination phase-one's move path left in place is
 * frozen from phase-two's perspective (its restricted moves permute R/L and
 * U/D/F/B block content independently — verified in increment ten's own
 * design note — so they can rearrange but not repair a bad split). Matching
 * upstream's own strategy of trying many phase-one endpoints rather than
 * trusting the first one, searchPhase1Candidates collects several distinct
 * phase-one solutions at each depth (stopping each branch the moment it
 * reaches rank 0, so it is a looser enumeration than upstream's
 * exactly-this-length search, which is fine — this only needs diversity,
 * not a specific count), and solveCentreReduction retries phase-two against
 * each until one succeeds. */
let searchPhase1Candidates = (
  rank: int,
  depth: int,
  permutations: array<array<int>>,
  symmetryMap: centreSymmetryMap,
  symmetryTable: array<int>,
  limit: int,
): array<array<int>> => {
  let collected = ref([])
  let rec go = (currentRank: int, remaining: int, lastFaceId: int, moves: array<int>) =>
    if collected.contents->Array.length >= limit {
      ()
    } else if currentRank == 0 {
      collected := collected.contents->Array.concat([moves])
    } else if remaining == 0 {
      ()
    } else {
      switch udRankDistance(currentRank, symmetryMap, symmetryTable) {
      | Error(_) => ()
      | Ok(distance) if distance > remaining => ()
      | Ok(_) =>
        for moveIndex in 0 to 35 {
          if collected.contents->Array.length < limit {
            let faceId = Belt.Array.getUnsafe(centreMoveFaceIds, moveIndex)
            if axisTransitionAllowed(lastFaceId, faceId) {
              let next = transitionUdRank(currentRank, Belt.Array.getUnsafe(permutations, moveIndex))
              go(next, remaining - 1, faceId, moves->Array.concat([moveIndex]))
            }
          }
        }
      }
    }
  go(rank, depth, -1, [])
  collected.contents
}

let phase2MovePermutationsCache: ref<option<array<array<int>>>> = ref(None)

let phase2MovePermutations = (): result<array<array<int>>, inputError> =>
  switch phase2MovePermutationsCache.contents {
  | Some(permutations) => Ok(permutations)
  | None => {
      let permutations = ref([])
      let failure = ref(None)
      phase2Moves->Array.forEach(move =>
        switch centreTransition(move.notation) {
        | Ok(permutation) => permutations := permutations.contents->Array.concat([permutation])
        | Error(reason) => failure := Some(reason)
        }
      )
      switch failure.contents {
      | Some(reason) => Error(reason)
      | None => {
          phase2MovePermutationsCache := Some(permutations.contents)
          Ok(permutations.contents)
        }
      }
    }
  }

let rec searchPhase2Ranks = (
  udRank: int,
  fbRank: int,
  depth: int,
  lastFaceId: int,
  permutations: array<array<int>>,
  symmetryMap: centreSymmetryMap,
  symmetryTable: array<int>,
): option<array<int>> =>
  if udRank == 0 && fbRank == phase2TargetFbRank {
    Some([])
  } else if depth == 0 {
    None
  } else {
    switch phase2CombinedDistance(udRank, fbRank, symmetryMap, symmetryTable) {
    | Error(_) => None
    | Ok(distance) if distance > depth => None
    | Ok(_) => {
        let found = ref(None)
        for moveIndex in 0 to phase2Moves->Array.length - 1 {
          if found.contents == None {
            let move = Belt.Array.getUnsafe(phase2Moves, moveIndex)
            if axisTransitionAllowed(lastFaceId, move.faceId) {
              let permutation = Belt.Array.getUnsafe(permutations, moveIndex)
              let nextUdRank = transitionUdRank(udRank, permutation)
              let nextFbRank = transitionUdRank(fbRank, permutation)
              switch searchPhase2Ranks(
                nextUdRank,
                nextFbRank,
                depth - 1,
                move.faceId,
                permutations,
                symmetryMap,
                symmetryTable,
              ) {
              | Some(tail) => found := Some([moveIndex]->Array.concat(tail))
              | None => ()
              }
            }
          }
        }
        found.contents
      }
    }
  }

let solvePhase2Ranks = (
  udRank: int,
  fbRank: int,
  maximumDepth: int,
  permutations: array<array<int>>,
  symmetryMap: centreSymmetryMap,
  symmetryTable: array<int>,
): option<array<int>> =>
  switch phase2CombinedDistance(udRank, fbRank, symmetryMap, symmetryTable) {
  | Error(_) => None
  | Ok(minimumDepth) => {
      let found = ref(None)
      let depth = ref(minimumDepth)
      while found.contents == None && depth.contents <= maximumDepth {
        found := searchPhase2Ranks(udRank, fbRank, depth.contents, -1, permutations, symmetryMap, symmetryTable)
        if found.contents == None {
          depth := depth.contents + 1
        }
      }
      found.contents
    }
  }

type centreReduction = {
  phase1Notations: array<string>,
  phase2Notations: array<string>,
}

/* Entry point for the combined phase-one/two centre reduction. Tries
 * increasing phase-one depths; at each depth, tries up to candidatesPerDepth
 * distinct phase-one endpoints against phase-two before giving up on that
 * depth and searching one move deeper. This mirrors upstream's own
 * multi-candidate retry (Search.doSearch's PHASE2_ATTEMPTS loop) without
 * needing its value = ctp + length1 priority ordering — an admissible
 * phase-two bound already rejects unreachable candidates quickly, so trying
 * candidates in the order they are found is enough at this scale. */
let solveCentreReduction = (
  centres: string,
  maximumPhase1Depth: int,
  maximumPhase2Depth: int,
  candidatesPerDepth: int,
): result<centreReduction, inputError> => {
  let udRank = rankUdCentres(centres)
  let fbRank = rankFbCentres(centres)
  if udRank < 0 || fbRank < 0 {
    Error(
      InvalidFacelets(
        "Centre reduction requires a centre string with exactly eight U/D and eight F/B stickers.",
      ),
    )
  } else {
    switch (
      centreMovePermutations(),
      phase2MovePermutations(),
      cachedCentreSymmetryMap(),
      cachedCentreSymmetryTable(),
    ) {
    | (Error(reason), _, _, _) => Error(reason)
    | (_, Error(reason), _, _) => Error(reason)
    | (_, _, Error(reason), _) => Error(reason)
    | (_, _, _, Error(reason)) => Error(reason)
    | (Ok(phase1Permutations), Ok(phase2Permutations), Ok(symmetryMap), Ok(symmetryTable)) =>
      switch udRankDistance(udRank, symmetryMap, symmetryTable) {
      | Error(reason) => Error(reason)
      | Ok(minimumPhase1Depth) => {
          let found = ref(None)
          let phase1Depth = ref(minimumPhase1Depth)
          while found.contents == None && phase1Depth.contents <= maximumPhase1Depth {
            let candidates = searchPhase1Candidates(
              udRank,
              phase1Depth.contents,
              phase1Permutations,
              symmetryMap,
              symmetryTable,
              candidatesPerDepth,
            )
            candidates->Array.forEach(phase1Moves =>
              if found.contents == None {
                let endFbRank = phase1Moves->Array.reduce(fbRank, (rank, moveIndex) =>
                  transitionUdRank(rank, Belt.Array.getUnsafe(phase1Permutations, moveIndex))
                )
                switch solvePhase2Ranks(
                  0,
                  endFbRank,
                  maximumPhase2Depth,
                  phase2Permutations,
                  symmetryMap,
                  symmetryTable,
                ) {
                | Some(phase2Moves_) =>
                  found := Some({
                    phase1Notations: phase1Moves->Array.map(index =>
                      Belt.Array.getUnsafe(centreMoveNotations, index)
                    ),
                    phase2Notations: phase2Moves_->Array.map(index =>
                      Belt.Array.getUnsafe(phase2Moves, index).notation
                    ),
                  })
                | None => ()
                }
              }
            )
            if found.contents == None {
              phase1Depth := phase1Depth.contents + 1
            }
          }
          switch found.contents {
          | Some(reduction) => Ok(reduction)
          | None =>
            Error(
              InvalidTransition(
                "No centre reduction was found within the given phase-one/two depth and candidate limits.",
              ),
            )
          }
        }
      }
    }
  }
}

/* Phase-three centre coordinate: again an independent design, not a
 * bit-compatible port of Center3. Center3 reads CornerCube.getParity() to
 * keep its own coordinate consistent with the untouched corner permutation
 * and the wing/edge parity — machinery this port does not need, because
 * this codebase's existing OLL/PLL-4×4 parity detection and repair
 * (Reduction4x4.res) already runs downstream of reduction. Dropping it
 * simplifies phase three to its real remaining job once phase two is
 * solved (U/D confined to slots 0–7, F/B to 8–15, R/L to 16–23): resolve
 * which specific face within each pair each slot belongs to.
 *
 * Verified against the canonical executor before relying on it: every one
 * of phase-three's 20 restricted moves keeps each of those three blocks
 * closed (checked centreTransition's full 24-slot permutation for every
 * outer move and every wide half turn phase three allows — each stays
 * within 0–7, 8–15, and 16–23 respectively, never crossing between them).
 * That licenses three independent 8-slot choose-4 coordinates — reusing
 * rankSubset/unrankSubset the way increment ten first tried and then
 * corrected away from at the 24-slot level, safe here because the
 * boundary really is closed:
 *   - udHalfRank: which 4 of slots 0–7 hold D (target: slots 4–7).
 *   - fbHalfRank: which 4 of slots 8–15 hold B (target: slots 12–15,
 *     relative 4–7 within the block).
 *   - rlHalfRank: which 4 of slots 16–23 hold L (target: slots 20–23,
 *     relative 4–7 within the block).
 * All three share the same target rank by construction (the same relative
 * pattern), so one constant serves all three. */
let rankSubset = (n: int, k: int, selected: array<int>): int =>
  if selected->Array.length != k {
    -1
  } else {
    let rank = ref(0)
    let previous = ref(-1)
    for selectionIndex in 0 to k - 1 {
      let selectedSlot = Belt.Array.getUnsafe(selected, selectionIndex)
      for candidate in previous.contents + 1 to selectedSlot - 1 {
        rank := rank.contents + choose(n - candidate - 1, k - selectionIndex - 1)
      }
      previous := selectedSlot
    }
    rank.contents
  }

let unrankSubset = (n: int, k: int, rank: int): array<int> =>
  if rank < 0 || rank >= choose(n, k) {
    []
  } else {
    let remainingRank = ref(rank)
    let selected = ref([])
    let candidate = ref(0)
    for selectionIndex in 0 to k - 1 {
      let finding = ref(true)
      while finding.contents {
        let count = choose(n - candidate.contents - 1, k - selectionIndex - 1)
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

let halfBlockCoordinateSize = choose(8, 4)
let halfBlockTargetRank = rankSubset(8, 4, [4, 5, 6, 7])

let rankHalfBlock = (centres: string, offset: int, markColour: string): int =>
  if centres->String.length != 24 {
    -1
  } else {
    let selected = ref([])
    for relative in 0 to 7 {
      let colour = centres->String.get(offset + relative)->Belt.Option.getUnsafe->String.make
      if colour == markColour {
        selected := selected.contents->Array.concat([relative])
      }
    }
    rankSubset(8, 4, selected.contents)
  }

let rankUdHalf = (centres: string): int => rankHalfBlock(centres, 0, "D")
let rankFbHalf = (centres: string): int => rankHalfBlock(centres, 8, "B")
let rankRlHalf = (centres: string): int => rankHalfBlock(centres, 16, "L")

let transitionSubsetRank = (rank: int, permutation: array<int>, n: int, k: int): int => {
  let selected = unrankSubset(n, k, rank)
  let marked = Array.make(~length=n, false)
  selected->Array.forEach(slot => marked[slot] = true)
  let next = ref([])
  for targetSlot in 0 to n - 1 {
    if Belt.Array.getUnsafe(marked, Belt.Array.getUnsafe(permutation, targetSlot)) {
      next := next.contents->Array.concat([targetSlot])
    }
  }
  rankSubset(n, k, next.contents)
}

let restrictPermutation = (permutation: array<int>, offset: int, size: int): result<
  array<int>,
  inputError,
> => {
  let restricted = Array.make(~length=size, 0)
  let failure = ref(None)
  for targetRelative in 0 to size - 1 {
    let source = Belt.Array.getUnsafe(permutation, offset + targetRelative) - offset
    if source < 0 || source >= size {
      failure := Some(InvalidTransition("Transition crosses a phase-three block boundary."))
    } else {
      restricted[targetRelative] = source
    }
  }
  switch failure.contents {
  | Some(reason) => Error(reason)
  | None => Ok(restricted)
  }
}

type phase3MovePermutations = {
  udHalf: array<array<int>>,
  fbHalf: array<array<int>>,
  rlHalf: array<array<int>>,
}

let phase3MovePermutationsCache: ref<option<phase3MovePermutations>> = ref(None)

let phase3MovePermutations = (): result<phase3MovePermutations, inputError> =>
  switch phase3MovePermutationsCache.contents {
  | Some(permutations) => Ok(permutations)
  | None => {
      let udHalf = ref([])
      let fbHalf = ref([])
      let rlHalf = ref([])
      let failure = ref(None)
      phase3Moves->Array.forEach(move =>
        switch centreTransition(move.notation) {
        | Error(reason) => failure := Some(reason)
        | Ok(permutation) =>
          switch (
            restrictPermutation(permutation, 0, 8),
            restrictPermutation(permutation, 8, 8),
            restrictPermutation(permutation, 16, 8),
          ) {
          | (Ok(ud), Ok(fb), Ok(rl)) => {
              udHalf := udHalf.contents->Array.concat([ud])
              fbHalf := fbHalf.contents->Array.concat([fb])
              rlHalf := rlHalf.contents->Array.concat([rl])
            }
          | (Error(reason), _, _) | (_, Error(reason), _) | (_, _, Error(reason)) =>
            failure := Some(reason)
          }
        }
      )
      switch failure.contents {
      | Some(reason) => Error(reason)
      | None => {
          let permutations = {udHalf: udHalf.contents, fbHalf: fbHalf.contents, rlHalf: rlHalf.contents}
          phase3MovePermutationsCache := Some(permutations)
          Ok(permutations)
        }
      }
    }
  }

/* Each half-block coordinate has only 70 raw states, so a full unpacked BFS
 * (no nibble packing, no symmetry reduction) is instant and more than small
 * enough to keep three of them resident — unlike phase one's 735,471-state
 * space, there is no packing trade-off worth making here. */
let buildHalfBlockPruning = (permutations: array<array<int>>): array<int> => {
  let table = Array.make(~length=halfBlockCoordinateSize, 255)
  let queue = Array.make(~length=halfBlockCoordinateSize, 0)
  let head = ref(0)
  let tail = ref(1)
  table[halfBlockTargetRank] = 0
  queue[0] = halfBlockTargetRank
  while head.contents < tail.contents {
    let current = Belt.Array.getUnsafe(queue, head.contents)
    head := head.contents + 1
    let depth = Belt.Array.getUnsafe(table, current)
    permutations->Array.forEach(permutation => {
      let next = transitionSubsetRank(current, permutation, 8, 4)
      if Belt.Array.getUnsafe(table, next) == 255 {
        table[next] = depth + 1
        queue[tail.contents] = next
        tail := tail.contents + 1
      }
    })
  }
  table
}

type phase3CentreTables = {
  permutations: phase3MovePermutations,
  udHalfPruning: array<int>,
  fbHalfPruning: array<int>,
  rlHalfPruning: array<int>,
}

let phase3CentreTablesCache: ref<option<phase3CentreTables>> = ref(None)

let cachedPhase3CentreTables = (): result<phase3CentreTables, inputError> =>
  switch phase3CentreTablesCache.contents {
  | Some(tables) => Ok(tables)
  | None =>
    switch phase3MovePermutations() {
    | Error(reason) => Error(reason)
    | Ok(permutations) => {
        let tables = {
          permutations,
          udHalfPruning: buildHalfBlockPruning(permutations.udHalf),
          fbHalfPruning: buildHalfBlockPruning(permutations.fbHalf),
          rlHalfPruning: buildHalfBlockPruning(permutations.rlHalf),
        }
        phase3CentreTablesCache := Some(tables)
        Ok(tables)
      }
    }
  }

let phase3CentreDistance = (udHalfRank: int, fbHalfRank: int, rlHalfRank: int, tables: phase3CentreTables): int => {
  let udDistance = Belt.Array.getUnsafe(tables.udHalfPruning, udHalfRank)
  let fbDistance = Belt.Array.getUnsafe(tables.fbHalfPruning, fbHalfRank)
  let rlDistance = Belt.Array.getUnsafe(tables.rlHalfPruning, rlHalfRank)
  let maxUdFb = udDistance > fbDistance ? udDistance : fbDistance
  maxUdFb > rlDistance ? maxUdFb : rlDistance
}

let rec searchPhase3Centres = (
  udHalfRank: int,
  fbHalfRank: int,
  rlHalfRank: int,
  depth: int,
  lastFaceId: int,
  tables: phase3CentreTables,
): option<array<int>> =>
  if udHalfRank == halfBlockTargetRank && fbHalfRank == halfBlockTargetRank && rlHalfRank == halfBlockTargetRank {
    Some([])
  } else if depth == 0 {
    None
  } else if phase3CentreDistance(udHalfRank, fbHalfRank, rlHalfRank, tables) > depth {
    None
  } else {
    let found = ref(None)
    for moveIndex in 0 to phase3Moves->Array.length - 1 {
      if found.contents == None {
        let move = Belt.Array.getUnsafe(phase3Moves, moveIndex)
        if axisTransitionAllowed(lastFaceId, move.faceId) {
          let nextUd = transitionSubsetRank(
            udHalfRank,
            Belt.Array.getUnsafe(tables.permutations.udHalf, moveIndex),
            8,
            4,
          )
          let nextFb = transitionSubsetRank(
            fbHalfRank,
            Belt.Array.getUnsafe(tables.permutations.fbHalf, moveIndex),
            8,
            4,
          )
          let nextRl = transitionSubsetRank(
            rlHalfRank,
            Belt.Array.getUnsafe(tables.permutations.rlHalf, moveIndex),
            8,
            4,
          )
          switch searchPhase3Centres(nextUd, nextFb, nextRl, depth - 1, move.faceId, tables) {
          | Some(tail) => found := Some([moveIndex]->Array.concat(tail))
          | None => ()
          }
        }
      }
    }
    found.contents
  }

/* Entry point mirroring solvePhase1Centres' shape: given a centre string
 * that is already phase-two-solved (each pair confined to its own block —
 * callers are expected to have reached that via solveCentreReduction first),
 * find the shortest phase-three move sequence resolving all three
 * half-blocks to their target. Does not yet combine with wing pairing
 * (Edge3's equivalent) or chain from phase two automatically; both are
 * later increments. */
let solvePhase3Centres = (centres: string, maximumDepth: int): result<moveSolution, inputError> => {
  let udHalfRank = rankUdHalf(centres)
  let fbHalfRank = rankFbHalf(centres)
  let rlHalfRank = rankRlHalf(centres)
  if udHalfRank < 0 || fbHalfRank < 0 || rlHalfRank < 0 {
    Error(
      InvalidFacelets(
        "Phase-three centre search requires a phase-two-solved centre string (each pair confined to its own block).",
      ),
    )
  } else {
    switch cachedPhase3CentreTables() {
    | Error(reason) => Error(reason)
    | Ok(tables) => {
        let minimumDepth = phase3CentreDistance(udHalfRank, fbHalfRank, rlHalfRank, tables)
        let found = ref(None)
        let depth = ref(minimumDepth)
        while found.contents == None && depth.contents <= maximumDepth {
          found := searchPhase3Centres(udHalfRank, fbHalfRank, rlHalfRank, depth.contents, -1, tables)
          if found.contents == None {
            depth := depth.contents + 1
          }
        }
        switch found.contents {
        | None =>
          Error(InvalidTransition("No phase-three centre solution was found within the given depth."))
        | Some(moveIndices) =>
          Ok({
            moveIndices,
            notations: moveIndices->Array.map(index =>
              Belt.Array.getUnsafe(phase3Moves, index).notation
            ),
          })
        }
      }
    }
  }
}
