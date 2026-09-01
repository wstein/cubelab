open MoveTypes

type executionError =
  | InvalidState(string)
  | ExpansionLimitExceeded(int)

type vector = {
  x: int,
  y: int,
  z: int,
}

type sticker = {
  position: vector,
  normal: vector,
}

type step = {
  move: baseMove,
  turns: int,
}

exception ExpansionFailure(executionError)

let maxExpandedMoves = 100000

let faceToSticker = (~size: int, face: StateTypes.face, ~row: int, ~col: int): sticker => {
  let last = size - 1
  switch face {
  | U => {position: {x: col, y: last, z: row}, normal: {x: 0, y: 1, z: 0}}
  | D => {position: {x: col, y: 0, z: last - row}, normal: {x: 0, y: -1, z: 0}}
  | F => {position: {x: col, y: last - row, z: last}, normal: {x: 0, y: 0, z: 1}}
  | B => {position: {x: last - col, y: last - row, z: 0}, normal: {x: 0, y: 0, z: -1}}
  | R => {position: {x: last, y: last - row, z: last - col}, normal: {x: 1, y: 0, z: 0}}
  | L => {position: {x: 0, y: last - row, z: col}, normal: {x: -1, y: 0, z: 0}}
  }
}

let stickerToFacelet = (~size: int, sticker: sticker) => {
  let last = size - 1
  let {position: {x, y, z}, normal} = sticker
  if normal.y == 1 {
    (StateTypes.U, z, x)
  } else if normal.y == -1 {
    (StateTypes.D, last - z, x)
  } else if normal.z == 1 {
    (StateTypes.F, last - y, x)
  } else if normal.z == -1 {
    (StateTypes.B, last - y, last - x)
  } else if normal.x == 1 {
    (StateTypes.R, last - y, last - z)
  } else {
    (StateTypes.L, last - y, z)
  }
}

let rotateVector = (
  ~last: int,
  vector: vector,
  axis: axis,
  ~direction: int,
  ~coordinate: bool,
): vector => {
  let invert = value =>
    if coordinate {
      last - value
    } else {
      -value
    }
  switch (axis, direction) {
  | (X, 1) => {x: vector.x, y: invert(vector.z), z: vector.y}
  | (X, _) => {x: vector.x, y: vector.z, z: invert(vector.y)}
  | (Y, 1) => {x: vector.z, y: vector.y, z: invert(vector.x)}
  | (Y, _) => {x: invert(vector.z), y: vector.y, z: vector.x}
  | (Z, 1) => {x: invert(vector.y), y: vector.x, z: vector.z}
  | (Z, _) => {x: vector.y, y: invert(vector.x), z: vector.z}
  }
}

let rotateSticker = (~size: int, sticker: sticker, axis: axis, ~direction: int): sticker => {
  let last = size - 1
  {
    position: rotateVector(~last, sticker.position, axis, ~direction, ~coordinate=true),
    normal: rotateVector(~last, sticker.normal, axis, ~direction, ~coordinate=false),
  }
}

let axisAndDirection = move =>
  switch move {
  | FaceTurn(face, _) =>
    switch face {
    | R => (X, -1)
    | L => (X, 1)
    | U => (Y, -1)
    | D => (Y, 1)
    | F => (Z, -1)
    | B => (Z, 1)
    }
  | SliceTurn(slice) =>
    switch slice {
    | M => (X, 1)
    | E => (Y, 1)
    | S => (Z, -1)
    }
  | Rotation(axis) =>
    switch axis {
    | X => (X, -1)
    | Y => (Y, -1)
    | Z => (Z, -1)
    }
  }

let depthFromFace = (~size: int, face: StateTypes.face, position: vector) =>
  switch face {
  | R => size - position.x
  | L => position.x + 1
  | U => size - position.y
  | D => position.y + 1
  | F => size - position.z
  | B => position.z + 1
  }

let affectsSticker = (~size: int, move: baseMove, sticker: sticker) =>
  switch move {
  | Rotation(_) => true
  | SliceTurn(slice) => {
      let middle = size / 2
      switch slice {
      | M => sticker.position.x == middle
      | E => sticker.position.y == middle
      | S => sticker.position.z == middle
      }
    }
  | FaceTurn(face, range) => {
      let depth = depthFromFace(~size, face, sticker.position)
      depth >= range.from_ && depth <= range.to_
    }
  }

let copyState = (state: StateTypes.cubeState): StateTypes.cubeState => {
  size: state.size,
  facelets: state.facelets->Array.map(facelets => facelets->Array.map(value => value)),
}

let applyQuarter = (
  state: StateTypes.cubeState,
  move: baseMove,
  ~direction: int,
): StateTypes.cubeState => {
  let output = copyState(state)
  let (axis, baseDirection) = axisAndDirection(move)
  let rotationDirection = baseDirection * direction
  let size = state.size
  for faceIndex in 0 to 5 {
    let face = Belt.Array.getUnsafe(StateTypes.storageOrder, faceIndex)
    let sourceFacelets = Belt.Array.getUnsafe(state.facelets, faceIndex)
    for row in 0 to size - 1 {
      for col in 0 to size - 1 {
        let sourceIndex = row * size + col
        let sticker = faceToSticker(~size, face, ~row, ~col)
        if affectsSticker(~size, move, sticker) {
          let target = rotateSticker(~size, sticker, axis, ~direction=rotationDirection)
          let (targetFace, targetRow, targetCol) = stickerToFacelet(~size, target)
          let targetFacelets = Belt.Array.getUnsafe(
            output.facelets,
            StateTypes.storageIndex(targetFace),
          )
          targetFacelets[
            targetRow * size + targetCol
          ] = Belt.Array.getUnsafe(sourceFacelets, sourceIndex)
        }
      }
    }
  }
  output
}

let normalizeTurns = turns => {
  let normalized = turns % 4
  if normalized < 0 {
    normalized + 4
  } else {
    normalized
  }
}

let applyStep = (state: StateTypes.cubeState, step: step): StateTypes.cubeState => {
  let result = ref(state)
  let quarters = normalizeTurns(step.turns)
  for _ in 1 to quarters {
    result := applyQuarter(result.contents, step.move, ~direction=1)
  }
  result.contents
}

let pushStep = (steps, move, turns) => {
  if steps->Array.length >= maxExpandedMoves {
    throw(ExpansionFailure(ExpansionLimitExceeded(maxExpandedMoves)))
  }
  if normalizeTurns(turns) != 0 {
    steps->Array.push({move, turns})
  }
}

let rec expandSequence = (steps, units: array<locatedUnit>, ~direction: int) => {
  for offset in 0 to units->Array.length - 1 {
    let index = if direction == 1 {
      offset
    } else {
      units->Array.length - 1 - offset
    }
    expandUnit(steps, Belt.Array.getUnsafe(units, index), ~direction)
  }
}

and expandRepeated = (steps, units, repeat, ~direction) => {
  let repetitions = if repeat < 0 {
    -repeat
  } else {
    repeat
  }
  let nestedDirection =
    direction * if repeat < 0 {
      -1
    } else {
      1
    }
  for _ in 1 to repetitions {
    expandSequence(steps, units, ~direction=nestedDirection)
  }
}

and expandCommutator = (steps, left, right, ~direction) => {
  if direction == 1 {
    expandSequence(steps, left, ~direction=1)
    expandSequence(steps, right, ~direction=1)
    expandSequence(steps, left, ~direction=-1)
    expandSequence(steps, right, ~direction=-1)
  } else {
    expandSequence(steps, right, ~direction=1)
    expandSequence(steps, left, ~direction=1)
    expandSequence(steps, right, ~direction=-1)
    expandSequence(steps, left, ~direction=-1)
  }
}

and expandConjugate = (steps, left, right, ~direction) => {
  expandSequence(steps, left, ~direction=1)
  expandSequence(steps, right, ~direction)
  expandSequence(steps, left, ~direction=-1)
}

and expandUnit = (steps, unit: locatedUnit, ~direction: int) =>
  switch unit.desc {
  | Move(move, turns) => pushStep(steps, move, turns * direction)
  | Pause | BlockComment(_) => ()
  | Group(units, repeat) => expandRepeated(steps, units, repeat, ~direction)
  | Commutator(left, right, repeat) => {
      let repetitions = if repeat < 0 {
        -repeat
      } else {
        repeat
      }
      let nestedDirection =
        direction * if repeat < 0 {
          -1
        } else {
          1
        }
      for _ in 1 to repetitions {
        expandCommutator(steps, left, right, ~direction=nestedDirection)
      }
    }
  | Conjugate(left, right, repeat) => {
      let repetitions = if repeat < 0 {
        -repeat
      } else {
        repeat
      }
      let nestedDirection =
        direction * if repeat < 0 {
          -1
        } else {
          1
        }
      for _ in 1 to repetitions {
        expandConjugate(steps, left, right, ~direction=nestedDirection)
      }
    }
  }

let expand = (alg: alg): result<array<step>, executionError> =>
  try {
    let steps = []
    expandSequence(steps, alg, ~direction=1)
    Ok(steps)
  } catch {
  | ExpansionFailure(error) => Error(error)
  }

let validateState = (state: StateTypes.cubeState): result<unit, executionError> => {
  if !StateTypes.isSupportedSize(state.size) {
    Error(InvalidState("Cube size must be between 2 and 5."))
  } else if state.facelets->Array.length != 6 {
    Error(InvalidState("A cube state must contain six faces."))
  } else {
    let expected = state.size * state.size
    let valid = state.facelets->Array.every(facelets => facelets->Array.length == expected)
    if valid {
      Ok()
    } else {
      Error(InvalidState("Every face must contain size² stickers."))
    }
  }
}

let applyAlg = (state: StateTypes.cubeState, alg: alg): result<
  StateTypes.cubeState,
  executionError,
> =>
  switch validateState(state) {
  | Error(reason) => Error(reason)
  | Ok() =>
    switch expand(alg) {
    | Error(reason) => Error(reason)
    | Ok(steps) => Ok(steps->Array.reduce(state, applyStep))
    }
  }

let parseAndApplyWithOptions = (
  ~size: int,
  ~lowercaseMode: lowercaseMode,
  ~notationDialect: notationDialect,
  input: string,
): result<StateTypes.cubeState, string> =>
  switch MoveParser.parseWithOptions(~size, ~lowercaseMode, ~notationDialect, input) {
  | Error(error) => Error(error.message)
  | Ok(alg) =>
    switch StateTypes.solved(size) {
    | Error(_) => Error("Cube size must be between 2 and 5.")
    | Ok(state) =>
      switch applyAlg(state, alg) {
      | Error(InvalidState(message)) => Error(message)
      | Error(ExpansionLimitExceeded(limit)) =>
        Error(`Expanded algorithms may not exceed ${limit->Int.toString} moves.`)
      | Ok(result) => Ok(result)
      }
    }
  }

let parseAndApplyWithLowercaseMode = (
  ~size: int,
  ~lowercaseMode: lowercaseMode,
  input: string,
): result<StateTypes.cubeState, string> =>
  parseAndApplyWithOptions(~size, ~lowercaseMode, ~notationDialect=Modern, input)

let parseAndApply = (~size: int, input: string): result<StateTypes.cubeState, string> =>
  parseAndApplyWithLowercaseMode(~size, ~lowercaseMode=Wide, input)
