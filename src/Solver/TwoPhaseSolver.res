open StateTypes
open MoveTypes

type solution = {alg: alg, moveCount: int}

type solverError =
  | UnsupportedSize(int)
  | InvalidState(PieceReducer.pieceError)
  | SearchFailed

let isIdentity = permutation => permutation->Array.everyWithIndex((piece, slot) => piece == slot)

let allZero = values => values->Array.every(value => value == 0)

let middleSliceIsPlaced = edgePermutation => {
  let placed = ref(true)
  for slot in 8 to 11 {
    if Belt.Array.getUnsafe(edgePermutation, slot) < 8 {
      placed := false
    }
  }
  placed.contents
}

let isPhase1Solved = (state: cubeState): bool =>
  switch PieceReducer.reduce(state) {
  | Error(_) => false
  | Ok(pieces) =>
    pieces.size == 3 && allZero(pieces.co) && allZero(pieces.eo) && middleSliceIsPlaced(pieces.ep)
  }

let solve = (state: cubeState): result<solution, solverError> =>
  if state.size != 3 {
    Error(UnsupportedSize(state.size))
  } else {
    switch PieceReducer.reduce(state) {
    | Error(error) => Error(InvalidState(error))
    | Ok(pieces) =>
      if (
        isIdentity(pieces.cp) && allZero(pieces.co) && isIdentity(pieces.ep) && allZero(pieces.eo)
      ) {
        Ok({alg: [], moveCount: 0})
      } else {
        Error(SearchFailed)
      }
    }
  }
