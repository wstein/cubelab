// Move-token inversion, cancellation, and LIFO recovery-stack logic for the
// smart-cube coaching flow. A physical slip during a lesson is never folded
// silently into the timeline: this module computes the shortest undo path
// back to the last known-good state and tracks further slips on top of it.

type expectedMove = {
  timelineIndex: int,
  token: string,
}

type recoveryState = {
  expected: expectedMove,
  undoMoves: array<string>,
  deviations: array<string>,
}

type recoveryAssessment =
  | Realigned({received: string})
  | Recovering({received: string, state: recoveryState})
  | Extended({received: string, state: recoveryState})
  | Unsupported({received: string, state: recoveryState})

let canonicalMove = (token: string): string => {
  let trimmed = token->String.trim
  let face = switch trimmed->String.length > 0 ? Some(trimmed->String.charAt(0)) : None {
  | Some("U") | Some("u") => Some("U")
  | Some("R") | Some("r") => Some("R")
  | Some("F") | Some("f") => Some("F")
  | Some("D") | Some("d") => Some("D")
  | Some("L") | Some("l") => Some("L")
  | Some("B") | Some("b") => Some("B")
  | _ => None
  }
  switch (face, trimmed->String.length) {
  | (Some(letter), 1) => letter
  | (Some(letter), 2) =>
    switch trimmed->String.charAt(1) {
    | "2" => letter ++ "2"
    | "'" => letter ++ "'"
    | _ => trimmed
    }
  | _ => trimmed
  }
}

let isFaceLetter = (character: string): bool =>
  switch character {
  | "U" | "R" | "F" | "D" | "L" | "B" => true
  | _ => false
  }

let parsedFaceTurn = (token: string): option<(string, int)> => {
  let move = canonicalMove(token)
  let face = move->String.length > 0 ? move->String.charAt(0) : ""
  if !isFaceLetter(face) {
    None
  } else {
    switch move->String.length {
    | 1 => Some((face, 1))
    | 2 =>
      switch move->String.charAt(1) {
      | "2" => Some((face, 2))
      | "'" => Some((face, 3))
      | _ => None
      }
    | _ => None
    }
  }
}

let renderedFaceTurn = (face: string, turns: int): string => {
  let normalized = mod(mod(turns, 4) + 4, 4)
  switch normalized {
  | 2 => face ++ "2"
  | 3 => face ++ "'"
  | _ => face
  }
}

let inverseSmartCubeMove = (token: string): option<string> =>
  switch parsedFaceTurn(token) {
  | None => None
  | Some(face, turns) => Some(renderedFaceTurn(face, mod(4 - turns, 4)))
  }

let quarterTurnsCancel = (left: string, right: string): bool => {
  let first = canonicalMove(left)
  let second = canonicalMove(right)
  inverseSmartCubeMove(first) == Some(second) && !(first->String.endsWith("2"))
}

let normalizeSmartCubeMoves = (tokens: array<string>): array<string> => {
  let result: array<(string, int)> = []
  tokens->Array.forEach(token =>
    switch parsedFaceTurn(token) {
    | None => ()
    | Some(face, turns) =>
      switch result->Belt.Array.get(result->Array.length - 1) {
      | Some(previousFace, previousTurns) if previousFace == face =>
        result->Array.pop->ignore
        let combined = mod(previousTurns + turns, 4)
        if combined != 0 {
          result->Array.push((face, combined))
        }
      | _ => result->Array.push((face, turns))
      }
    }
  )
  result->Array.map(((face, turns)) => renderedFaceTurn(face, turns))
}

let smartCubeRecoveryMatchesExpected = (state: recoveryState): bool => {
  let expected = normalizeSmartCubeMoves([state.expected.token])
  if expected->Array.length != state.deviations->Array.length {
    false
  } else {
    let matches = ref(true)
    for index in 0 to expected->Array.length - 1 {
      if Belt.Array.getUnsafe(expected, index) != Belt.Array.getUnsafe(state.deviations, index) {
        matches := false
      }
    }
    matches.contents
  }
}

let undoSequence = (deviations: array<string>): array<string> => {
  let result = []
  for index in deviations->Array.length - 1 downto 0 {
    switch inverseSmartCubeMove(Belt.Array.getUnsafe(deviations, index)) {
    | Some(move) => result->Array.push(move)
    | None => ()
    }
  }
  result
}

let recoveryCost = (deviations: array<string>): int =>
  deviations->Array.reduce(0, (total, move) => total + (move->String.endsWith("2") ? 2 : 1))

let beginSmartCubeRecovery = (expected: expectedMove, received: string): option<recoveryState> => {
  let actual = canonicalMove(received)
  switch inverseSmartCubeMove(actual) {
  | None => None
  | Some(_) =>
    let deviations = normalizeSmartCubeMoves([actual])
    Some({expected, undoMoves: undoSequence(deviations), deviations})
  }
}

let assessSmartCubeRecovery = (state: recoveryState, received: string): recoveryAssessment => {
  let actual = canonicalMove(received)
  switch inverseSmartCubeMove(actual) {
  | None => Unsupported({received: actual, state})
  | Some(_) =>
    let deviations = normalizeSmartCubeMoves(Array.concat(state.deviations, [actual]))
    if deviations->Array.length == 0 {
      Realigned({received: actual})
    } else {
      let nextState = {...state, deviations, undoMoves: undoSequence(deviations)}
      if recoveryCost(deviations) < recoveryCost(state.deviations) {
        Recovering({received: actual, state: nextState})
      } else {
        Extended({received: actual, state: nextState})
      }
    }
  }
}

let smartCubeRecoveryPrompt = (state: recoveryState): string => {
  let next = state.undoMoves->Belt.Array.get(0)->Belt.Option.getWithDefault("")
  let later = state.undoMoves->Array.length > 1 ? state.undoMoves->Belt.Array.sliceToEnd(1) : []
  let suffix = later->Array.length > 0 ? `, then ${later->Array.join(" ")}` : ""
  `Slip detected: turn ${next}${suffix} to realign, then ${state.expected.token}.`
}
