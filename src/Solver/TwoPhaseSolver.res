open StateTypes
open MoveTypes

type solution = {alg: alg, moveCount: int}

type phase1Coordinates = {twist: int, flip: int, slice: int}
type phase2Coordinates = {corners: int, edges: int, slice: int}
type pruningTable

@new external createUint8Array: int => pruningTable = "Uint8Array"
@get_index external getPruningByte: (pruningTable, int) => int = ""
@set_index external setPruningByte: (pruningTable, int, int) => unit = ""

let createPruningTable = entries => {
  let table = createUint8Array((entries + 1) / 2)
  for index in 0 to (entries + 1) / 2 - 1 {
    setPruningByte(table, index, 255)
  }
  table
}

let pruningDistance = (table, index) => {
  let byte = getPruningByte(table, index / 2)
  if index % 2 == 0 {
    byte % 16
  } else {
    byte / 16
  }
}

let setPruningDistance = (table, index, distance) => {
  let byteIndex = index / 2
  let byte = getPruningByte(table, byteIndex)
  let value = distance % 16
  let next = if index % 2 == 0 {
    byte / 16 * 16 + value
  } else {
    byte % 16 + value * 16
  }
  setPruningByte(table, byteIndex, next)
}

let phase1MoveIndices = () => {
  let moves = Array.make(~length=18, 0)
  for index in 0 to 17 {
    moves[index] = index
  }
  moves
}

// U/D may turn by a quarter; the four side faces may only turn by a half.
// searchActions orders faces as U, D, R, L, F, B.
let phase2MoveIndices = () => [0, 1, 2, 3, 4, 5, 7, 10, 13, 16]

type solverError =
  | UnsupportedSize(int)
  | InvalidState(PieceReducer.pieceError)
  | InvalidCoordinate(string)
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

let orientationState = (coordinate, base, length) => {
  let orientations = Array.make(~length, 0)
  let remaining = ref(coordinate)
  let sum = ref(0)
  for slot in length - 2 downto 0 {
    let value = remaining.contents % base
    orientations[slot] = value
    sum := sum.contents + value
    remaining := remaining.contents / base
  }
  orientations[length - 1] = (base - sum.contents % base) % base
  orientations
}

let sliceState = coordinate => {
  let selected = Array.make(~length=12, false)
  let remaining = ref(494 - coordinate)
  let candidate = ref(11)
  for count in 4 downto 1 {
    while choose(candidate.contents, count) > remaining.contents {
      candidate := candidate.contents - 1
    }
    selected[candidate.contents] = true
    remaining := remaining.contents - choose(candidate.contents, count)
    candidate := candidate.contents - 1
  }
  let edges = Array.make(~length=12, 0)
  let slicePiece = ref(8)
  let otherPiece = ref(0)
  for slot in 0 to 11 {
    if Belt.Array.getUnsafe(selected, slot) {
      edges[slot] = slicePiece.contents
      slicePiece := slicePiece.contents + 1
    } else {
      edges[slot] = otherPiece.contents
      otherPiece := otherPiece.contents + 1
    }
  }
  edges
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

let phase1State = (coordinates: phase1Coordinates): result<cubeState, solverError> =>
  if coordinates.twist < 0 || coordinates.twist >= 2187 {
    Error(InvalidCoordinate("Twist must be between 0 and 2186."))
  } else if coordinates.flip < 0 || coordinates.flip >= 2048 {
    Error(InvalidCoordinate("Flip must be between 0 and 2047."))
  } else if coordinates.slice < 0 || coordinates.slice >= 495 {
    Error(InvalidCoordinate("Slice must be between 0 and 494."))
  } else {
    PieceReducer.reconstruct({
      size: 3,
      cp: [0, 1, 2, 3, 4, 5, 6, 7],
      co: orientationState(coordinates.twist, 3, 8),
      ep: sliceState(coordinates.slice),
      eo: orientationState(coordinates.flip, 2, 12),
    })->Result.mapError(error => InvalidState(error))
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

let phase1Transition = (coordinates: phase1Coordinates, moveIndex: int): result<
  phase1Coordinates,
  solverError,
> =>
  switch (phase1State(coordinates), Belt.Array.get(searchActions(), moveIndex)) {
  | (Error(error), _) => Error(error)
  | (_, None) => Error(InvalidCoordinate("Phase-one move index must be between 0 and 17."))
  | (Ok(state), Some(action)) =>
    switch MoveExecutor.applyAlg(state, action.alg) {
    | Error(_) => Error(SearchFailed)
    | Ok(next) => phase1Coordinates(next)
    }
  }

let phase1TransitionRow = (coordinates: phase1Coordinates): result<
  array<phase1Coordinates>,
  solverError,
> => {
  let row = Array.make(~length=18, {twist: 0, flip: 0, slice: 0})
  let failure = ref(None)
  for moveIndex in 0 to 17 {
    switch phase1Transition(coordinates, moveIndex) {
    | Ok(next) => row[moveIndex] = next
    | Error(error) => failure := Some(error)
    }
  }
  switch failure.contents {
  | Some(error) => Error(error)
  | None => Ok(row)
  }
}

let buildTwistMoveTable = () => {
  let table = Array.make(~length=2187, 0)->Array.map(_ => Array.make(~length=18, 0))
  for twist in 0 to 2186 {
    for moveIndex in 0 to 17 {
      switch phase1Transition({twist, flip: 0, slice: 0}, moveIndex) {
      | Ok(next) => Belt.Array.getUnsafe(table, twist)[moveIndex] = next.twist
      | Error(_) => ()
      }
    }
  }
  table
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
