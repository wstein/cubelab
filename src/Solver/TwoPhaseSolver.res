open StateTypes
open MoveTypes

type solution = {alg: alg, moveCount: int}

type phase1Coordinates = {twist: int, flip: int, slice: int}
type phase2Coordinates = {corners: int, edges: int, slice: int}

type solverError =
  | UnsupportedSize(int)
  | InvalidState(PieceReducer.pieceError)
  | SearchFailed

let isIdentity = permutation => permutation->Array.everyWithIndex((piece, slot) => piece == slot)

let allZero = values => values->Array.every(value => value == 0)

let choose = (n, k) => {
  if k < 0 || k > n {
    0
  } else {
    let numerator = ref(1)
    let denominator = ref(1)
    for factor in 1 to k {
      numerator := numerator.contents * (n - k + factor)
      denominator := denominator.contents * factor
    }
    numerator.contents / denominator.contents
  }
}

let orientationCoordinate = (orientations, base, limit) => {
  let coordinate = ref(0)
  for slot in 0 to limit - 1 {
    coordinate := coordinate.contents * base + Belt.Array.getUnsafe(orientations, slot)
  }
  coordinate.contents
}

let sliceCoordinate = edgePermutation => {
  let rank = ref(0)
  let selected = ref(0)
  for slot in 0 to 11 {
    if Belt.Array.getUnsafe(edgePermutation, slot) >= 8 {
      selected := selected.contents + 1
      rank := rank.contents + choose(slot, selected.contents)
    }
  }
  494 - rank.contents
}

let permutationCoordinate = (permutation, length) => {
  let coordinate = ref(0)
  for left in 0 to length - 2 {
    let smaller = ref(0)
    for right in left + 1 to length - 1 {
      if Belt.Array.getUnsafe(permutation, right) < Belt.Array.getUnsafe(permutation, left) {
        smaller := smaller.contents + 1
      }
    }
    coordinate := coordinate.contents * (length - left) + smaller.contents
  }
  coordinate.contents
}

let slicePermutationCoordinate = edgePermutation =>
  permutationCoordinate(
    [
      Belt.Array.getUnsafe(edgePermutation, 8) - 8,
      Belt.Array.getUnsafe(edgePermutation, 9) - 8,
      Belt.Array.getUnsafe(edgePermutation, 10) - 8,
      Belt.Array.getUnsafe(edgePermutation, 11) - 8,
    ],
    4,
  )

let phase1Coordinates = (state: cubeState): result<phase1Coordinates, solverError> =>
  if state.size != 3 {
    Error(UnsupportedSize(state.size))
  } else {
    switch PieceReducer.reduce(state) {
    | Error(error) => Error(InvalidState(error))
    | Ok(pieces) =>
      Ok({
        twist: orientationCoordinate(pieces.co, 3, 7),
        flip: orientationCoordinate(pieces.eo, 2, 11),
        slice: sliceCoordinate(pieces.ep),
      })
    }
  }

let phase2Coordinates = (state: cubeState): result<phase2Coordinates, solverError> =>
  if state.size != 3 {
    Error(UnsupportedSize(state.size))
  } else {
    switch PieceReducer.reduce(state) {
    | Error(error) => Error(InvalidState(error))
    | Ok(pieces) =>
      Ok({
        corners: permutationCoordinate(pieces.cp, 8),
        edges: permutationCoordinate(pieces.ep, 8),
        slice: slicePermutationCoordinate(pieces.ep),
      })
    }
  }

let middleSliceIsPlaced = edgePermutation => {
  let placed = ref(true)
  for slot in 8 to 11 {
    if Belt.Array.getUnsafe(edgePermutation, slot) < 8 {
      placed := false
    }
  }
  placed.contents
}

let generatedLoc = {start: 0, end_: 0}
let located = desc => {desc, loc: generatedLoc}
let outerRange = {from_: 1, to_: 1}

type searchAction = {alg: alg, faceIndex: int}

let searchActions = () => {
  let actions = []
  let faces = [U, D, R, L, F, B]
  let turns = [1, 2, -1]
  faces->Array.forEachWithIndex((face, faceIndex) =>
    turns->Array.forEach(turn =>
      actions->Array.push({
        alg: [located(Move(FaceTurn(face, outerRange), turn))],
        faceIndex,
      })
    )
  )
  actions
}

let solvedPieces = (pieces: PieceReducer.pieceState) =>
  isIdentity(pieces.cp) && allZero(pieces.co) && isIdentity(pieces.ep) && allZero(pieces.eo)

let rec exactSearch = (state, depth, lastFace): option<alg> => {
  switch PieceReducer.reduce(state) {
  | Error(_) => None
  | Ok(pieces) =>
    if solvedPieces(pieces) {
      Some([])
    } else if depth == 0 {
      None
    } else {
      let found = ref(None)
      searchActions()->Array.forEach(action => {
        if found.contents == None && action.faceIndex != lastFace {
          switch MoveExecutor.applyAlg(state, action.alg) {
          | Error(_) => ()
          | Ok(next) =>
            switch exactSearch(next, depth - 1, action.faceIndex) {
            | None => ()
            | Some(tail) => found := Some(action.alg->Array.concat(tail))
            }
          }
        }
      })
      found.contents
    }
  }
}

let shallowOptimalSearch = state => {
  let result = ref(None)
  for depth in 0 to 6 {
    if result.contents == None {
      result := exactSearch(state, depth, -1)
    }
  }
  result.contents
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
      if solvedPieces(pieces) {
        Ok({alg: [], moveCount: 0})
      } else {
        switch shallowOptimalSearch(state) {
        | Some(alg) => Ok({alg, moveCount: alg->Array.length})
        | None => Error(SearchFailed)
        }
      }
    }
  }
