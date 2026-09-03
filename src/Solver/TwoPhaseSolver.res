open StateTypes
open MoveTypes

type solution = {alg: alg, moveCount: int}

type phase1Coordinates = {twist: int, flip: int, slice: int}
type phase2Coordinates = {corners: int, edges: int, slice: int}
type phase2MovePermutations = {
  corners: array<array<int>>,
  edges: array<array<int>>,
  slice: array<array<int>>,
}
type pruningTable
type phase2MoveTable
type phase1MoveTable
type pruningQueue

@new external createUint8Array: int => pruningTable = "Uint8Array"
@get_index external getPruningByte: (pruningTable, int) => int = ""
@set_index external setPruningByte: (pruningTable, int, int) => unit = ""
@new external createUint16Array: int => phase2MoveTable = "Uint16Array"
@get_index external getPhase2Move: (phase2MoveTable, int) => int = ""
@set_index external setPhase2Move: (phase2MoveTable, int, int) => unit = ""
@new external createPhase1MoveTable: int => phase1MoveTable = "Uint16Array"
@get_index external getPhase1Move: (phase1MoveTable, int) => int = ""
@set_index external setPhase1Move: (phase1MoveTable, int, int) => unit = ""
@new external createUint32Array: int => pruningQueue = "Uint32Array"
@get_index external getPruningQueueIndex: (pruningQueue, int) => int = ""
@set_index external setPruningQueueIndex: (pruningQueue, int, int) => unit = ""

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
let phase2MoveCount = 10
let phase2MoveTableIndex = (coordinate, move) => coordinate * phase2MoveCount + move
let phase1MoveTableIndex = (coordinate, move) => coordinate * 18 + move

let twistMoveTableCache: ref<option<array<array<int>>>> = ref(None)
let flipMoveTableCache: ref<option<array<array<int>>>> = ref(None)
let sliceMoveTableCache: ref<option<array<array<int>>>> = ref(None)
let cornerMoveTableCache: ref<option<phase2MoveTable>> = ref(None)
let edgeMoveTableCache: ref<option<phase2MoveTable>> = ref(None)
let slicePermutationMoveTableCache: ref<option<phase2MoveTable>> = ref(None)
let sliceTwistPruningTableCache: ref<option<pruningTable>> = ref(None)
let sliceFlipPruningTableCache: ref<option<pruningTable>> = ref(None)
let cornerSlicePruningTableCache: ref<option<pruningTable>> = ref(None)
let edgeSlicePruningTableCache: ref<option<pruningTable>> = ref(None)
let compactTwistMoveTableCache: ref<option<phase1MoveTable>> = ref(None)
let compactFlipMoveTableCache: ref<option<phase1MoveTable>> = ref(None)
let compactSliceMoveTableCache: ref<option<phase1MoveTable>> = ref(None)

type solverError =
  | UnsupportedSize(int)
  | InvalidState(PieceReducer.pieceError)
  | InvalidCoordinate(string)
  | SearchFailed
  | VerificationFailed

let describeError = error =>
  switch error {
  | UnsupportedSize(size) => {
      let label = size->Int.toString
      `The two-phase solver supports only 3×3 cubes, not ${label}×${label}×${label}.`
    }
  | InvalidState(error) => PieceReducer.describeError(error)
  | InvalidCoordinate(message) => message
  | SearchFailed => "No two-phase solution was found within the selected depth."
  | VerificationFailed => "The generated two-phase solution failed exact facelet replay verification."
  }

let statesEqual = (left: cubeState, right: cubeState) =>
  left.size == right.size &&
    left.facelets->Array.everyWithIndex((facelets, faceIndex) => {
      let other = Belt.Array.getUnsafe(right.facelets, faceIndex)
      facelets->Array.everyWithIndex((facelet, index) =>
        facelet == Belt.Array.getUnsafe(other, index)
      )
    })

let verifiedSolution = (input: cubeState, alg: alg) =>
  switch (MoveExecutor.applyAlg(input, alg), StateTypes.solved(3)) {
  | (Ok(output), Ok(solved)) if statesEqual(output, solved) =>
    Ok({alg, moveCount: alg->Array.length})
  | _ => Error(VerificationFailed)
  }

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
    let reconstruct = cp =>
      PieceReducer.reconstruct({
        size: 3,
        cp,
        co: orientationState(coordinates.twist, 3, 8),
        ep: sliceState(coordinates.slice),
        eo: orientationState(coordinates.flip, 2, 12),
      })
    switch reconstruct([0, 1, 2, 3, 4, 5, 6, 7]) {
    | Ok(state) => Ok(state)
    | Error(_) =>
      reconstruct([1, 0, 2, 3, 4, 5, 6, 7])->Result.mapError(error => InvalidState(error))
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

let factorial = value => {
  let result = ref(1)
  for factor in 2 to value {
    result := result.contents * factor
  }
  result.contents
}

let permutationState = (coordinate, length) => {
  let available = Array.make(~length, 0)
  for index in 0 to length - 1 {
    available[index] = index
  }
  let permutation = Array.make(~length, 0)
  let remaining = ref(coordinate)
  for slot in 0 to length - 1 {
    let factor = factorial(length - slot - 1)
    let selected = if factor == 0 {
      0
    } else {
      remaining.contents / factor
    }
    permutation[slot] = Belt.Array.getUnsafe(available, selected)
    for index in selected to length - slot - 2 {
      available[index] = Belt.Array.getUnsafe(available, index + 1)
    }
    remaining := if factor == 0 {
        0
      } else {
        remaining.contents % factor
      }
  }
  permutation
}

let phase2State = (coordinates: phase2Coordinates): result<cubeState, solverError> =>
  if (
    coordinates.corners < 0 ||
    coordinates.corners >= 40320 ||
    coordinates.edges < 0 ||
    coordinates.edges >= 40320 ||
    coordinates.slice < 0 ||
    coordinates.slice >= 24
  ) {
    Error(InvalidCoordinate("Phase-two coordinates are outside their valid ranges."))
  } else {
    let slice = permutationState(coordinates.slice, 4)->Array.map(value => value + 8)
    let edges = permutationState(coordinates.edges, 8)->Array.concat(slice)
    switch PieceReducer.reconstruct({
      size: 3,
      cp: permutationState(coordinates.corners, 8),
      co: Array.make(~length=8, 0),
      ep: edges,
      eo: Array.make(~length=12, 0),
    }) {
    | Ok(state) => Ok(state)
    | Error(error) => Error(InvalidState(error))
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

let phase2Transition = (coordinates: phase2Coordinates, moveIndex: int): result<
  phase2Coordinates,
  solverError,
> =>
  switch (phase2State(coordinates), Belt.Array.get(searchActions(), moveIndex)) {
  | (Error(error), _) => Error(error)
  | (_, None) => Error(InvalidCoordinate("Phase-two move index must be between 0 and 17."))
  | (Ok(state), Some(action)) =>
    if !(phase2MoveIndices()->Array.some(index => index == moveIndex)) {
      Error(InvalidCoordinate("Phase-two moves must preserve G1."))
    } else {
      switch MoveExecutor.applyAlg(state, action.alg) {
      | Error(_) => Error(SearchFailed)
      | Ok(next) => phase2Coordinates(next)
      }
    }
  }

let phase2MovePermutationsCache: ref<option<phase2MovePermutations>> = ref(None)

let buildPhase2MovePermutations = (): phase2MovePermutations => {
  let moves = phase2MoveIndices()
  let corners = Array.make(~length=phase2MoveCount, Array.make(~length=8, 0))
  let edges = Array.make(~length=phase2MoveCount, Array.make(~length=8, 0))
  let slice = Array.make(~length=phase2MoveCount, Array.make(~length=4, 0))
  moves->Array.forEachWithIndex((moveIndex, column) =>
    switch phase2Transition({corners: 0, edges: 0, slice: 0}, moveIndex) {
    | Ok(next) => {
        corners[column] = permutationState(next.corners, 8)
        edges[column] = permutationState(next.edges, 8)
        slice[column] = permutationState(next.slice, 4)
      }
    | Error(_) => ()
    }
  )
  {corners, edges, slice}
}

let phase2MovePermutations = () =>
  switch phase2MovePermutationsCache.contents {
  | Some(permutations) => permutations
  | None => {
      let permutations = buildPhase2MovePermutations()
      phase2MovePermutationsCache := Some(permutations)
      permutations
    }
  }

let composePermutation = (permutation, move) => {
  let next = Array.make(~length=permutation->Array.length, 0)
  for slot in 0 to next->Array.length - 1 {
    next[slot] = Belt.Array.getUnsafe(permutation, Belt.Array.getUnsafe(move, slot))
  }
  next
}

let buildPhase2PermutationMoveTable = (length, moves) => {
  let table = createUint16Array(factorial(length) * phase2MoveCount)
  for coordinate in 0 to factorial(length) - 1 {
    let permutation = permutationState(coordinate, length)
    moves->Array.forEachWithIndex((move, column) =>
      setPhase2Move(
        table,
        phase2MoveTableIndex(coordinate, column),
        permutationCoordinate(composePermutation(permutation, move), length),
      )
    )
  }
  table
}

let buildCornerMoveTable = () => {
  switch cornerMoveTableCache.contents {
  | Some(table) => table
  | None => {
      let table = buildPhase2PermutationMoveTable(8, phase2MovePermutations().corners)
      cornerMoveTableCache := Some(table)
      table
    }
  }
}

let buildEdgeMoveTable = () => {
  switch edgeMoveTableCache.contents {
  | Some(table) => table
  | None => {
      let table = buildPhase2PermutationMoveTable(8, phase2MovePermutations().edges)
      edgeMoveTableCache := Some(table)
      table
    }
  }
}

let buildSlicePermutationMoveTable = () => {
  switch slicePermutationMoveTableCache.contents {
  | Some(table) => table
  | None => {
      let table = buildPhase2PermutationMoveTable(4, phase2MovePermutations().slice)
      slicePermutationMoveTableCache := Some(table)
      table
    }
  }
}

let buildTwistMoveTable = () => {
  switch twistMoveTableCache.contents {
  | Some(table) => table
  | None => {
      let table = Array.make(~length=2187, 0)->Array.map(_ => Array.make(~length=18, 0))
      for twist in 0 to 2186 {
        for moveIndex in 0 to 17 {
          switch phase1Transition({twist, flip: 0, slice: 0}, moveIndex) {
          | Ok(next) => Belt.Array.getUnsafe(table, twist)[moveIndex] = next.twist
          | Error(_) => ()
          }
        }
      }
      twistMoveTableCache := Some(table)
      table
    }
  }
}

let buildFlipMoveTable = () => {
  switch flipMoveTableCache.contents {
  | Some(table) => table
  | None => {
      let table = Array.make(~length=2048, 0)->Array.map(_ => Array.make(~length=18, 0))
      for flip in 0 to 2047 {
        for moveIndex in 0 to 17 {
          switch phase1Transition({twist: 0, flip, slice: 0}, moveIndex) {
          | Ok(next) => Belt.Array.getUnsafe(table, flip)[moveIndex] = next.flip
          | Error(_) => ()
          }
        }
      }
      flipMoveTableCache := Some(table)
      table
    }
  }
}

let buildSliceMoveTable = () => {
  switch sliceMoveTableCache.contents {
  | Some(table) => table
  | None => {
      let table = Array.make(~length=495, 0)->Array.map(_ => Array.make(~length=18, 0))
      for slice in 0 to 494 {
        for moveIndex in 0 to 17 {
          switch phase1Transition({twist: 0, flip: 0, slice}, moveIndex) {
          | Ok(next) => Belt.Array.getUnsafe(table, slice)[moveIndex] = next.slice
          | Error(_) => ()
          }
        }
      }
      sliceMoveTableCache := Some(table)
      table
    }
  }
}

// The public coordinate-row helpers above are convenient for tests and
// inspection. Search itself uses these flat typed arrays: they retain the same
// transitions without allocating thousands of boxed JavaScript sub-arrays.
let buildCompactPhase1MoveTable = (states, selectCoordinate) => {
  let table = createPhase1MoveTable(states * 18)
  for coordinate in 0 to states - 1 {
    for moveIndex in 0 to 17 {
      switch selectCoordinate(coordinate, moveIndex) {
      | Ok(next) => setPhase1Move(table, phase1MoveTableIndex(coordinate, moveIndex), next)
      | Error(_) => ()
      }
    }
  }
  table
}

let buildCompactTwistMoveTable = () =>
  switch compactTwistMoveTableCache.contents {
  | Some(table) => table
  | None => {
      let table = buildCompactPhase1MoveTable(2187, (twist, moveIndex) =>
        phase1Transition({twist, flip: 0, slice: 0}, moveIndex)->Result.map(next => next.twist)
      )
      compactTwistMoveTableCache := Some(table)
      table
    }
  }

let buildCompactFlipMoveTable = () =>
  switch compactFlipMoveTableCache.contents {
  | Some(table) => table
  | None => {
      let table = buildCompactPhase1MoveTable(2048, (flip, moveIndex) =>
        phase1Transition({twist: 0, flip, slice: 0}, moveIndex)->Result.map(next => next.flip)
      )
      compactFlipMoveTableCache := Some(table)
      table
    }
  }

let buildCompactSliceMoveTable = () =>
  switch compactSliceMoveTableCache.contents {
  | Some(table) => table
  | None => {
      let table = buildCompactPhase1MoveTable(495, (slice, moveIndex) =>
        phase1Transition({twist: 0, flip: 0, slice}, moveIndex)->Result.map(next => next.slice)
      )
      compactSliceMoveTableCache := Some(table)
      table
    }
  }

let buildPhase1PruningTable = (primaryMoves, primaryStates) => {
  let sliceMoves = buildCompactSliceMoveTable()
  let size = 495 * primaryStates
  let table = createPruningTable(size)
  let queue = createUint32Array(size)
  let head = ref(0)
  let tail = ref(1)
  setPruningDistance(table, 0, 0)
  while head.contents < tail.contents {
    let index = getPruningQueueIndex(queue, head.contents)
    head := head.contents + 1
    let depth = pruningDistance(table, index)
    let slice = index % 495
    let primary = index / 495
    for moveIndex in 0 to 17 {
      let nextPrimary = getPhase1Move(primaryMoves, phase1MoveTableIndex(primary, moveIndex))
      let nextSlice = getPhase1Move(sliceMoves, phase1MoveTableIndex(slice, moveIndex))
      let next = nextPrimary * 495 + nextSlice
      if pruningDistance(table, next) == 15 {
        setPruningDistance(table, next, depth + 1)
        setPruningQueueIndex(queue, tail.contents, next)
        tail := tail.contents + 1
      }
    }
  }
  table
}

let buildSliceTwistPruningTable = () =>
  switch sliceTwistPruningTableCache.contents {
  | Some(table) => table
  | None => {
      let table = buildPhase1PruningTable(buildCompactTwistMoveTable(), 2187)
      sliceTwistPruningTableCache := Some(table)
      table
    }
  }

let buildSliceFlipPruningTable = () =>
  switch sliceFlipPruningTableCache.contents {
  | Some(table) => table
  | None => {
      let table = buildPhase1PruningTable(buildCompactFlipMoveTable(), 2048)
      sliceFlipPruningTableCache := Some(table)
      table
    }
  }

let buildPhase2PruningTable = primaryMoves => {
  let sliceMoves = buildSlicePermutationMoveTable()
  let size = 40320 * 24
  let table = createPruningTable(size)
  let queue = createUint32Array(size)
  let head = ref(0)
  let tail = ref(1)
  setPruningDistance(table, 0, 0)
  while head.contents < tail.contents {
    let index = getPruningQueueIndex(queue, head.contents)
    head := head.contents + 1
    let depth = pruningDistance(table, index)
    let slice = index % 24
    let primary = index / 24
    for moveIndex in 0 to phase2MoveCount - 1 {
      let nextPrimary = getPhase2Move(primaryMoves, phase2MoveTableIndex(primary, moveIndex))
      let nextSlice = getPhase2Move(sliceMoves, phase2MoveTableIndex(slice, moveIndex))
      let next = nextPrimary * 24 + nextSlice
      if pruningDistance(table, next) == 15 {
        setPruningDistance(table, next, depth + 1)
        setPruningQueueIndex(queue, tail.contents, next)
        tail := tail.contents + 1
      }
    }
  }
  table
}

let buildCornerSlicePruningTable = () =>
  switch cornerSlicePruningTableCache.contents {
  | Some(table) => table
  | None => {
      let table = buildPhase2PruningTable(buildCornerMoveTable())
      cornerSlicePruningTableCache := Some(table)
      table
    }
  }

let buildEdgeSlicePruningTable = () =>
  switch edgeSlicePruningTableCache.contents {
  | Some(table) => table
  | None => {
      let table = buildPhase2PruningTable(buildEdgeMoveTable())
      edgeSlicePruningTableCache := Some(table)
      table
    }
  }

let prepareTables = () => {
  buildCompactTwistMoveTable()->ignore
  buildCompactFlipMoveTable()->ignore
  buildCompactSliceMoveTable()->ignore
  buildCornerMoveTable()->ignore
  buildEdgeMoveTable()->ignore
  buildSlicePermutationMoveTable()->ignore
  buildSliceTwistPruningTable()->ignore
  buildSliceFlipPruningTable()->ignore
  buildCornerSlicePruningTable()->ignore
  buildEdgeSlicePruningTable()->ignore
}

let solvedPieces = (pieces: PieceReducer.pieceState) =>
  isIdentity(pieces.cp) && allZero(pieces.co) && isIdentity(pieces.ep) && allZero(pieces.eo)

let maximum = (left, right) =>
  if left > right {
    left
  } else {
    right
  }

// Opposite faces commute. Keeping only U→D, R→L, and F→B at a branch point
// is a symmetry-breaking normal form: the rejected order can always be swapped
// without changing the resulting state or consuming another move.
let canonicalFaceTransition = (lastFace, nextFace) =>
  if nextFace == lastFace {
    false
  } else if lastFace < 0 || lastFace / 2 != nextFace / 2 {
    true
  } else {
    lastFace < nextFace
  }

let phase1Distance = (coordinates: phase1Coordinates, sliceTwist, sliceFlip) =>
  maximum(
    pruningDistance(sliceTwist, coordinates.twist * 495 + coordinates.slice),
    pruningDistance(sliceFlip, coordinates.flip * 495 + coordinates.slice),
  )

let phase2Distance = (coordinates: phase2Coordinates, cornerSlice, edgeSlice) =>
  maximum(
    pruningDistance(cornerSlice, coordinates.corners * 24 + coordinates.slice),
    pruningDistance(edgeSlice, coordinates.edges * 24 + coordinates.slice),
  )

let moveAlgorithm = moveIndex => Belt.Array.getUnsafe(searchActions(), moveIndex).alg

let algorithmForMoves = moves => {
  let algorithm = ref([])
  moves->Array.forEach(moveIndex =>
    algorithm := algorithm.contents->Array.concat(moveAlgorithm(moveIndex))
  )
  algorithm.contents
}

let rec searchPhase2 = (
  coordinates: phase2Coordinates,
  depth,
  lastFace,
  cornerMoves,
  edgeMoves,
  sliceMoves,
  cornerSlice,
  edgeSlice,
) =>
  if coordinates.corners == 0 && coordinates.edges == 0 && coordinates.slice == 0 {
    Some([])
  } else if depth == 0 || phase2Distance(coordinates, cornerSlice, edgeSlice) > depth {
    None
  } else {
    let found = ref(None)
    phase2MoveIndices()->Array.forEachWithIndex((moveIndex, column) => {
      let face = moveIndex / 3
      if found.contents == None && canonicalFaceTransition(lastFace, face) {
        let next: phase2Coordinates = {
          corners: getPhase2Move(cornerMoves, phase2MoveTableIndex(coordinates.corners, column)),
          edges: getPhase2Move(edgeMoves, phase2MoveTableIndex(coordinates.edges, column)),
          slice: getPhase2Move(sliceMoves, phase2MoveTableIndex(coordinates.slice, column)),
        }
        switch searchPhase2(
          next,
          depth - 1,
          face,
          cornerMoves,
          edgeMoves,
          sliceMoves,
          cornerSlice,
          edgeSlice,
        ) {
        | Some(tail) => found := Some([moveIndex]->Array.concat(tail))
        | None => ()
        }
      }
    })
    found.contents
  }

let rec searchPhase1WithinTotal = (
  state,
  coordinates: phase1Coordinates,
  phase1Depth,
  totalDepth,
  lastFace,
  moves,
  twistMoves,
  flipMoves,
  sliceMoves,
  sliceTwist,
  sliceFlip,
  cornerMoves,
  edgeMoves,
  slicePermutationMoves,
  cornerSlice,
  edgeSlice,
) =>
  if phase1Depth == 0 {
    if coordinates.twist != 0 || coordinates.flip != 0 || coordinates.slice != 0 {
      None
    } else {
      switch MoveExecutor.applyAlg(state, algorithmForMoves(moves)) {
      | Error(_) => None
      | Ok(phase1State) =>
        switch phase2Coordinates(phase1State) {
        | Error(_) => None
        | Ok(phase2Coordinates) =>
          switch searchPhase2(
            phase2Coordinates,
            totalDepth - moves->Array.length,
            -1,
            cornerMoves,
            edgeMoves,
            slicePermutationMoves,
            cornerSlice,
            edgeSlice,
          ) {
          | None => None
          | Some(phase2Moves) => Some(moves->Array.concat(phase2Moves))
          }
        }
      }
    }
  } else if phase1Distance(coordinates, sliceTwist, sliceFlip) > phase1Depth {
    None
  } else {
    let found = ref(None)
    for moveIndex in 0 to 17 {
      let face = moveIndex / 3
      if found.contents == None && canonicalFaceTransition(lastFace, face) {
        let next: phase1Coordinates = {
          twist: getPhase1Move(twistMoves, phase1MoveTableIndex(coordinates.twist, moveIndex)),
          flip: getPhase1Move(flipMoves, phase1MoveTableIndex(coordinates.flip, moveIndex)),
          slice: getPhase1Move(sliceMoves, phase1MoveTableIndex(coordinates.slice, moveIndex)),
        }
        found :=
          searchPhase1WithinTotal(
            state,
            next,
            phase1Depth - 1,
            totalDepth,
            face,
            moves->Array.concat([moveIndex]),
            twistMoves,
            flipMoves,
            sliceMoves,
            sliceTwist,
            sliceFlip,
            cornerMoves,
            edgeMoves,
            slicePermutationMoves,
            cornerSlice,
            edgeSlice,
          )
      }
    }
    found.contents
  }

let totalDepthSearch = (state, coordinates, totalDepth) => {
  let twistMoves = buildCompactTwistMoveTable()
  let flipMoves = buildCompactFlipMoveTable()
  let sliceMoves = buildCompactSliceMoveTable()
  let sliceTwist = buildSliceTwistPruningTable()
  let sliceFlip = buildSliceFlipPruningTable()
  let cornerMoves = buildCornerMoveTable()
  let edgeMoves = buildEdgeMoveTable()
  let slicePermutationMoves = buildSlicePermutationMoveTable()
  let cornerSlice = buildCornerSlicePruningTable()
  let edgeSlice = buildEdgeSlicePruningTable()
  let found = ref(None)
  let minimumPhase1Depth = phase1Distance(coordinates, sliceTwist, sliceFlip)
  let maximumPhase1Depth = if totalDepth < 12 {
    totalDepth
  } else {
    12
  }
  for phase1Depth in minimumPhase1Depth to maximumPhase1Depth {
    if found.contents == None {
      found :=
        searchPhase1WithinTotal(
          state,
          coordinates,
          phase1Depth,
          totalDepth,
          -1,
          [],
          twistMoves,
          flipMoves,
          sliceMoves,
          sliceTwist,
          sliceFlip,
          cornerMoves,
          edgeMoves,
          slicePermutationMoves,
          cornerSlice,
          edgeSlice,
        )
    }
  }
  found.contents
}

let solveAtDepth = (state: cubeState, totalDepth): result<solution, solverError> =>
  if totalDepth < 0 || totalDepth > 24 {
    Error(InvalidCoordinate("Two-phase depth must be between 0 and 24."))
  } else if state.size != 3 {
    Error(UnsupportedSize(state.size))
  } else {
    switch (PieceReducer.reduce(state), phase1Coordinates(state)) {
    | (Error(error), _) => Error(InvalidState(error))
    | (_, Error(error)) => Error(error)
    | (Ok(pieces), Ok(coordinates)) =>
      if solvedPieces(pieces) {
        verifiedSolution(state, [])
      } else {
        switch totalDepthSearch(state, coordinates, totalDepth) {
        | None => Error(SearchFailed)
        | Some(moves) => verifiedSolution(state, algorithmForMoves(moves))
        }
      }
    }
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
        verifiedSolution(state, [])
      } else {
        switch phase1Coordinates(state) {
        | Error(error) => Error(error)
        | Ok(coordinates) =>
          switch totalDepthSearch(state, coordinates, 24) {
          | None => Error(SearchFailed)
          | Some(moves) => verifiedSolution(state, algorithmForMoves(moves))
          }
        }
      }
    }
  }
