/**
 * Reachability invariants for cubie coordinates.
 *
 * Shape, range, and duplicate-piece validation deliberately live in
 * PieceReducer. This module answers the narrower mathematical question:
 * can an otherwise well-formed coordinate tuple describe a physical cube?
 */
type coordinates = {
  size: int,
  cp: array<int>,
  co: array<int>,
  ep: array<int>,
  eo: array<int>,
}

type violation =
  | CornerTwist({sum: int, affectedSlots: array<int>})
  | EdgeFlip({sum: int, affectedSlots: array<int>})
  | PermutationParityMismatch

let cornerNames = ["UFR", "UFL", "ULB", "UBR", "DFR", "DLF", "DBL", "DRB"]
let edgeNames = ["UR", "UF", "UL", "UB", "DR", "DF", "DL", "DB", "FR", "FL", "BL", "BR"]

let permutationParity = permutation => {
  let inversions = ref(0)
  for left in 0 to permutation->Array.length - 2 {
    for right in left + 1 to permutation->Array.length - 1 {
      if Belt.Array.getUnsafe(permutation, left) > Belt.Array.getUnsafe(permutation, right) {
        inversions := inversions.contents + 1
      }
    }
  }
  inversions.contents % 2
}

let affectedSlots = orientations =>
  orientations
  ->Array.mapWithIndex((orientation, index) => (orientation, index))
  ->Array.filter(((orientation, _)) => orientation != 0)
  ->Array.map(((_, index)) => index)

let describeSlots = (names, slots) =>
  slots
  ->Array.map(slot => Belt.Array.getUnsafe(names, slot))
  ->Array.join(", ")

let describe = violation =>
  switch violation {
  | CornerTwist({sum: _, affectedSlots}) => {
      let locations = describeSlots(cornerNames, affectedSlots)
      if locations == "" {
        "Impossible state: corner orientations do not add up to a whole-cube turn."
      } else {
        `Impossible state: a corner twist makes this cube unreachable (affected slots: ${locations}).`
      }
    }
  | EdgeFlip({sum: _, affectedSlots}) => {
      let locations = describeSlots(edgeNames, affectedSlots)
      if locations == "" {
        "Impossible state: edge orientations do not add up to a whole-cube turn."
      } else {
        `Impossible state: an edge flip makes this cube unreachable (affected slots: ${locations}).`
      }
    }
  | PermutationParityMismatch => "Impossible state: one pair of pieces is swapped (corner and edge permutation parity differs)."
  }

let validate = (state: coordinates): result<unit, violation> => {
  let cornerSum = state.co->Array.reduce(0, (sum, value) => sum + value)
  if cornerSum % 3 != 0 {
    Error(CornerTwist({sum: cornerSum, affectedSlots: affectedSlots(state.co)}))
  } else if state.size == 3 {
    let edgeSum = state.eo->Array.reduce(0, (sum, value) => sum + value)
    if edgeSum % 2 != 0 {
      Error(EdgeFlip({sum: edgeSum, affectedSlots: affectedSlots(state.eo)}))
    } else if permutationParity(state.cp) != permutationParity(state.ep) {
      Error(PermutationParityMismatch)
    } else {
      Ok()
    }
  } else {
    Ok()
  }
}
