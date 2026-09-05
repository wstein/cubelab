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
