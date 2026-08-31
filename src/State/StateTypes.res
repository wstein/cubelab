type face =
  | U
  | L
  | F
  | R
  | B
  | D

type cubeState = {
  size: int,
  facelets: array<array<face>>,
}

type stateError =
  | InvalidSize(string)
  | InvalidLength({expected: int, actual: int})
  | InvalidFacelet({index: int, character: string})
  | InvalidColourCount({face: face, expected: int, actual: int})
  | InvalidColour({index: int, character: string})
  | InvalidColourScheme(string)
  | InvalidNet(string)

let storageOrder = [U, L, F, R, B, D]
let serializationOrder = [U, R, F, D, L, B]

let faceToChar = face =>
  switch face {
  | U => "U"
  | R => "R"
  | F => "F"
  | D => "D"
  | L => "L"
  | B => "B"
  }

let charToFace = character =>
  switch character {
  | "U" => Some(U)
  | "R" => Some(R)
  | "F" => Some(F)
  | "D" => Some(D)
  | "L" => Some(L)
  | "B" => Some(B)
  | _ => None
  }

let storageIndex = face =>
  switch face {
  | U => 0
  | L => 1
  | F => 2
  | R => 3
  | B => 4
  | D => 5
  }

let isSupportedSize = size => size >= 2 && size <= 5

let solved = (size: int): result<cubeState, stateError> =>
  if !isSupportedSize(size) {
    Error(InvalidSize("Cube size must be between 2 and 5."))
  } else {
    let stickersPerFace = size * size
    Ok({
      size,
      facelets: storageOrder->Array.map(face => Array.make(~length=stickersPerFace, face)),
    })
  }
