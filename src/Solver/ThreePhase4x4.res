/*
 * Three-phase 4×4 port boundary.
 *
 * Derived from the GPLv3-or-later TPR-4x4x4-Solver interface by Shuang Chen;
 * see NOTICE. This module is the first ReScript port increment. It preserves
 * the upstream solver's U/R/F/D/L/B, row-major, 96-facelet contract while
 * using CubeLab's validated state codec at the boundary.
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
