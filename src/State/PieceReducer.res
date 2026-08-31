open StateTypes
open MoveTypes

type pieceState = {
  size: int,
  cp: array<int>,
  co: array<int>,
  ep: array<int>,
  eo: array<int>,
}

type pieceError =
  | UnsupportedSize(int)
  | InvalidSyntax(string)
  | InvalidFaceletState(string)
  | InvalidPiece(string)
  | InvalidPermutation(string)
  | InvalidOrientation(string)
  | ParityMismatch
  | InvalidCenters(string)

type faceletLocation = (face, int)

exception ReductionFailure(pieceError)

let cornerColours = [
  [U, R, F],
  [U, F, L],
  [U, L, B],
  [U, B, R],
  [D, F, R],
  [D, L, F],
  [D, B, L],
  [D, R, B],
]

let edgeColours = [
  [U, R],
  [U, F],
  [U, L],
  [U, B],
  [D, R],
  [D, F],
  [D, L],
  [D, B],
  [F, R],
  [F, L],
  [B, L],
  [B, R],
]

let cornerFacelets = size =>
  switch size {
  | 2 =>
    Ok([
      [(U, 3), (R, 0), (F, 1)],
      [(U, 2), (F, 0), (L, 1)],
      [(U, 0), (L, 0), (B, 1)],
      [(U, 1), (B, 0), (R, 1)],
      [(D, 1), (F, 3), (R, 2)],
      [(D, 0), (L, 3), (F, 2)],
      [(D, 2), (B, 3), (L, 2)],
      [(D, 3), (R, 3), (B, 2)],
    ])
  | 3 =>
    Ok([
      [(U, 8), (R, 0), (F, 2)],
      [(U, 6), (F, 0), (L, 2)],
      [(U, 0), (L, 0), (B, 2)],
      [(U, 2), (B, 0), (R, 2)],
      [(D, 2), (F, 8), (R, 6)],
      [(D, 0), (L, 8), (F, 6)],
      [(D, 6), (B, 8), (L, 6)],
      [(D, 8), (R, 8), (B, 6)],
    ])
  | size => Error(UnsupportedSize(size))
  }

let edgeFacelets = [
  [(U, 5), (R, 1)],
  [(U, 7), (F, 1)],
  [(U, 3), (L, 1)],
  [(U, 1), (B, 1)],
  [(D, 5), (R, 7)],
  [(D, 1), (F, 7)],
  [(D, 3), (L, 7)],
  [(D, 7), (B, 7)],
  [(F, 5), (R, 3)],
  [(F, 3), (L, 5)],
  [(B, 5), (L, 3)],
  [(B, 3), (R, 5)],
]

let describeError = error =>
  switch error {
  | UnsupportedSize(size) => {
      let label = size->Int.toString
      `Piece coordinates are unavailable for ${label}×${label}×${label}.`
    }
  | InvalidFaceletState(message)
  | InvalidSyntax(message)
  | InvalidPiece(message)
  | InvalidPermutation(message)
  | InvalidOrientation(message)
  | InvalidCenters(message) => message
  | ParityMismatch => "Corner and edge permutations must have matching parity."
  }

let getFacelet = (state: cubeState, (face, index): faceletLocation) => {
  let values = Belt.Array.getUnsafe(state.facelets, storageIndex(face))
  Belt.Array.getUnsafe(values, index)
}

let setFacelet = (state: cubeState, (face, index): faceletLocation, value: face) => {
  let values = Belt.Array.getUnsafe(state.facelets, storageIndex(face))
  values[index] = value
}

let validateStateShape = (state: cubeState) => {
  if state.size != 2 && state.size != 3 {
    throw(ReductionFailure(UnsupportedSize(state.size)))
  }
  if state.facelets->Array.length != 6 {
    throw(ReductionFailure(InvalidFaceletState("A cube state must contain exactly six faces.")))
  }
  let expected = state.size * state.size
  state.facelets->Array.forEach(values => {
    if values->Array.length != expected {
      throw(
        ReductionFailure(
          InvalidFaceletState(
            `Every face must contain exactly ${expected->Int.toString} facelets.`,
          ),
        ),
      )
    }
  })
}

let centresAreCanonical = (state: cubeState) => {
  let centre = state.size * state.size / 2
  storageOrder->Array.every(face => getFacelet(state, (face, centre)) == face)
}

let rotateTimes = (state, move, turns) => {
  let result = ref(state)
  for _ in 1 to turns {
    result := MoveExecutor.applyQuarter(result.contents, move, ~direction=1)
  }
  result.contents
}

let normalizeCentres = (state: cubeState) => {
  if centresAreCanonical(state) {
    state
  } else {
    let normalized = ref(None)
    for xTurns in 0 to 3 {
      let afterX = rotateTimes(state, Rotation(X), xTurns)
      for yTurns in 0 to 3 {
        let afterY = rotateTimes(afterX, Rotation(Y), yTurns)
        for zTurns in 0 to 3 {
          let candidate = rotateTimes(afterY, Rotation(Z), zTurns)
          if normalized.contents == None && centresAreCanonical(candidate) {
            normalized := Some(candidate)
          }
        }
      }
    }
    switch normalized.contents {
    | Some(state) => state
    | None =>
      throw(
        ReductionFailure(
          InvalidCenters("The six centre facelets do not define a valid cube orientation."),
        ),
      )
    }
  }
}

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

let validatePermutation = (name, permutation, expectedLength) => {
  if permutation->Array.length != expectedLength {
    throw(
      ReductionFailure(
        InvalidPermutation(`${name} must contain exactly ${expectedLength->Int.toString} values.`),
      ),
    )
  }
  let seen = Array.make(~length=expectedLength, false)
  permutation->Array.forEach(value => {
    if value < 0 || value >= expectedLength || Belt.Array.getUnsafe(seen, value) {
      throw(
        ReductionFailure(
          InvalidPermutation(
            `${name} must be a permutation of 0 through ${(expectedLength - 1)->Int.toString}.`,
          ),
        ),
      )
    }
    seen[value] = true
  })
}

let validateOrientations = (name, orientations, expectedLength, modulus) => {
  if orientations->Array.length != expectedLength {
    throw(
      ReductionFailure(
        InvalidOrientation(`${name} must contain exactly ${expectedLength->Int.toString} values.`),
      ),
    )
  }
  let sum = ref(0)
  orientations->Array.forEach(value => {
    if value < 0 || value >= modulus {
      throw(
        ReductionFailure(
          InvalidOrientation(
            `${name} values must be between 0 and ${(modulus - 1)->Int.toString}.`,
          ),
        ),
      )
    }
    sum := sum.contents + value
  })
  if sum.contents % modulus != 0 {
    throw(
      ReductionFailure(
        InvalidOrientation(
          `${name} orientation sum must be divisible by ${modulus->Int.toString}.`,
        ),
      ),
    )
  }
}

let validateOrThrow = (pieces: pieceState) => {
  if pieces.size != 2 && pieces.size != 3 {
    throw(ReductionFailure(UnsupportedSize(pieces.size)))
  }
  validatePermutation("cp", pieces.cp, 8)
  validateOrientations("co", pieces.co, 8, 3)
  if pieces.size == 2 {
    if pieces.ep->Array.length != 0 || pieces.eo->Array.length != 0 {
      throw(
        ReductionFailure(InvalidPiece("A 2×2×2 piece state cannot contain edge coordinates.")),
      )
    }
  } else {
    validatePermutation("ep", pieces.ep, 12)
    validateOrientations("eo", pieces.eo, 12, 2)
    if permutationParity(pieces.cp) != permutationParity(pieces.ep) {
      throw(ReductionFailure(ParityMismatch))
    }
  }
}

let validate = pieces => {
  try {
    validateOrThrow(pieces)
    Ok()
  } catch {
  | ReductionFailure(error) => Error(error)
  }
}

let identifyCorners = (state, locations) =>
  locations->Array.mapWithIndex((slotFacelets, slot) => {
    let orientation = ref(-1)
    for index in 0 to 2 {
      let colour = getFacelet(state, Belt.Array.getUnsafe(slotFacelets, index))
      if colour == U || colour == D {
        orientation := index
      }
    }
    if orientation.contents == -1 {
      throw(
        ReductionFailure(InvalidPiece(`Corner slot ${slot->Int.toString} has no U or D facelet.`)),
      )
    }
    let second = getFacelet(
      state,
      Belt.Array.getUnsafe(slotFacelets, (orientation.contents + 1) % 3),
    )
    let third = getFacelet(
      state,
      Belt.Array.getUnsafe(slotFacelets, (orientation.contents + 2) % 3),
    )
    let piece = ref(-1)
    for candidate in 0 to 7 {
      let colours = Belt.Array.getUnsafe(cornerColours, candidate)
      let first = getFacelet(state, Belt.Array.getUnsafe(slotFacelets, orientation.contents))
      if (
        first == Belt.Array.getUnsafe(colours, 0) &&
        second == Belt.Array.getUnsafe(colours, 1) &&
        third == Belt.Array.getUnsafe(colours, 2)
      ) {
        piece := candidate
      }
    }
    if piece.contents == -1 {
      throw(
        ReductionFailure(
          InvalidPiece(`Corner slot ${slot->Int.toString} contains an unknown colour combination.`),
        ),
      )
    }
    (piece.contents, orientation.contents)
  })

let identifyEdges = state =>
  edgeFacelets->Array.mapWithIndex((slotFacelets, slot) => {
    let first = getFacelet(state, Belt.Array.getUnsafe(slotFacelets, 0))
    let second = getFacelet(state, Belt.Array.getUnsafe(slotFacelets, 1))
    let piece = ref(-1)
    let orientation = ref(-1)
    for candidate in 0 to 11 {
      let colours = Belt.Array.getUnsafe(edgeColours, candidate)
      if first == Belt.Array.getUnsafe(colours, 0) && second == Belt.Array.getUnsafe(colours, 1) {
        piece := candidate
        orientation := 0
      } else if (
        first == Belt.Array.getUnsafe(colours, 1) && second == Belt.Array.getUnsafe(colours, 0)
      ) {
        piece := candidate
        orientation := 1
      }
    }
    if piece.contents == -1 {
      throw(
        ReductionFailure(
          InvalidPiece(`Edge slot ${slot->Int.toString} contains an unknown colour combination.`),
        ),
      )
    }
    (piece.contents, orientation.contents)
  })

let reduce = (input: cubeState): result<pieceState, pieceError> => {
  try {
    validateStateShape(input)
    let state = if input.size == 3 {
      normalizeCentres(input)
    } else {
      input
    }
    let locations = switch cornerFacelets(state.size) {
    | Ok(locations) => locations
    | Error(error) => throw(ReductionFailure(error))
    }
    let corners = identifyCorners(state, locations)
    let (ep, eo) = if state.size == 3 {
      let edges = identifyEdges(state)
      (edges->Array.map(((piece, _)) => piece), edges->Array.map(((_, orientation)) => orientation))
    } else {
      ([], [])
    }
    let pieces = {
      size: state.size,
      cp: corners->Array.map(((piece, _)) => piece),
      co: corners->Array.map(((_, orientation)) => orientation),
      ep,
      eo,
    }
    validateOrThrow(pieces)
    Ok(pieces)
  } catch {
  | ReductionFailure(error) => Error(error)
  }
}

let reconstruct = (pieces: pieceState): result<cubeState, pieceError> => {
  try {
    validateOrThrow(pieces)
    let state = switch solved(pieces.size) {
    | Ok(state) => state
    | Error(_) => throw(ReductionFailure(UnsupportedSize(pieces.size)))
    }
    let locations = switch cornerFacelets(pieces.size) {
    | Ok(locations) => locations
    | Error(error) => throw(ReductionFailure(error))
    }
    for slot in 0 to 7 {
      let slotFacelets = Belt.Array.getUnsafe(locations, slot)
      let colours = Belt.Array.getUnsafe(cornerColours, Belt.Array.getUnsafe(pieces.cp, slot))
      let orientation = Belt.Array.getUnsafe(pieces.co, slot)
      for colourIndex in 0 to 2 {
        let target = Belt.Array.getUnsafe(slotFacelets, (colourIndex + orientation) % 3)
        setFacelet(state, target, Belt.Array.getUnsafe(colours, colourIndex))
      }
    }
    if pieces.size == 3 {
      for slot in 0 to 11 {
        let slotFacelets = Belt.Array.getUnsafe(edgeFacelets, slot)
        let colours = Belt.Array.getUnsafe(edgeColours, Belt.Array.getUnsafe(pieces.ep, slot))
        let orientation = Belt.Array.getUnsafe(pieces.eo, slot)
        for colourIndex in 0 to 1 {
          let target = Belt.Array.getUnsafe(slotFacelets, (colourIndex + orientation) % 2)
          setFacelet(state, target, Belt.Array.getUnsafe(colours, colourIndex))
        }
      }
    }
    Ok(state)
  } catch {
  | ReductionFailure(error) => Error(error)
  }
}

let renderValues = values => values->Array.map(value => value->Int.toString)->Array.join(" ")

let render = (pieces: pieceState): result<string, pieceError> =>
  switch validate(pieces) {
  | Error(error) => Error(error)
  | Ok() => {
      let corners = `cp: ${renderValues(pieces.cp)}; co: ${renderValues(pieces.co)}`
      if pieces.size == 2 {
        Ok(corners)
      } else {
        Ok(`${corners}; ep: ${renderValues(pieces.ep)}; eo: ${renderValues(pieces.eo)}`)
      }
    }
  }

let parseField = (field, expectedLabel) => {
  let parts = field->String.split(":")
  if parts->Array.length != 2 || Belt.Array.getUnsafe(parts, 0)->String.trim != expectedLabel {
    throw(
      ReductionFailure(
        InvalidSyntax(`Expected the '${expectedLabel}:' coordinate field in canonical order.`),
      ),
    )
  }
  let valueText = Belt.Array.getUnsafe(parts, 1)->String.trim
  if valueText == "" {
    []
  } else {
    valueText
    ->String.split(" ")
    ->Array.filter(value => value != "")
    ->Array.map(value =>
      switch Int.fromString(value) {
      | Some(value) => value
      | None =>
        throw(
          ReductionFailure(
            InvalidSyntax(`'${value}' is not a valid integer in the '${expectedLabel}' field.`),
          ),
        )
      }
    )
  }
}

let parse = (~size: int, input: string): result<pieceState, pieceError> => {
  try {
    if size != 2 && size != 3 {
      throw(ReductionFailure(UnsupportedSize(size)))
    }
    let fields = input->String.trim->String.split(";")
    let expectedFields = if size == 2 {
      2
    } else {
      4
    }
    if fields->Array.length != expectedFields {
      throw(
        ReductionFailure(
          InvalidSyntax(
            `A ${size->Int.toString}×${size->Int.toString} cubie state requires ${expectedFields->Int.toString} coordinate fields.`,
          ),
        ),
      )
    }
    let pieces = {
      size,
      cp: parseField(Belt.Array.getUnsafe(fields, 0), "cp"),
      co: parseField(Belt.Array.getUnsafe(fields, 1), "co"),
      ep: if size == 3 {
        parseField(Belt.Array.getUnsafe(fields, 2), "ep")
      } else {
        []
      },
      eo: if size == 3 {
        parseField(Belt.Array.getUnsafe(fields, 3), "eo")
      } else {
        []
      },
    }
    validateOrThrow(pieces)
    Ok(pieces)
  } catch {
  | ReductionFailure(error) => Error(error)
  }
}

let parseState = (~size: int, input: string): result<cubeState, pieceError> =>
  switch parse(~size, input) {
  | Error(error) => Error(error)
  | Ok(pieces) => reconstruct(pieces)
  }
