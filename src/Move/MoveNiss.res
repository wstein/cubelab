open MoveTypes

type nissError =
  | UnsupportedSize(int)
  | ExecutionError(MoveExecutor.executionError)
  | CandidateDoesNotSolve

type recombination = {
  inverseScramble: alg,
  solution: alg,
  moveCount: int,
}

let describeError = error =>
  switch error {
  | UnsupportedSize(size) =>
    `NISS verification is unavailable for ${size->Int.toString}×${size->Int.toString}×${size->Int.toString}.`
  | ExecutionError(MoveExecutor.InvalidState(message)) => message
  | ExecutionError(MoveExecutor.ExpansionLimitExceeded(limit)) =>
    `Expanded algorithms may not exceed ${limit->Int.toString} moves.`
  | CandidateDoesNotSolve => "The recombined sequence does not solve the current scramble in the canonical frame. Check the side assignment and move order."
  }

let invertScramble = (scramble: alg): alg => MoveTransform.invert(scramble)

let combine = (~normal: alg, ~inverse: alg): alg =>
  normal->Array.concat(MoveTransform.invert(inverse))

let statesEqual = (left: StateTypes.cubeState, right: StateTypes.cubeState) =>
  left.size == right.size &&
    left.facelets->Array.everyWithIndex((facelets, faceIndex) => {
      let other = Belt.Array.getUnsafe(right.facelets, faceIndex)
      facelets->Array.everyWithIndex((facelet, index) =>
        facelet == Belt.Array.getUnsafe(other, index)
      )
    })

let verify = (~size: int, ~scramble: alg, ~normal: alg, ~inverse: alg): result<
  recombination,
  nissError,
> =>
  if size != 3 {
    Error(UnsupportedSize(size))
  } else {
    switch StateTypes.solved(size) {
    | Error(_) => Error(UnsupportedSize(size))
    | Ok(solved) => {
        let solution = combine(~normal, ~inverse)
        let candidate = scramble->Array.concat(solution)
        switch MoveExecutor.applyAlg(solved, candidate) {
        | Error(error) => Error(ExecutionError(error))
        | Ok(result) if !statesEqual(result, solved) => Error(CandidateDoesNotSolve)
        | Ok(_) =>
          switch MoveExecutor.expand(solution) {
          | Error(error) => Error(ExecutionError(error))
          | Ok(steps) =>
            Ok({
              inverseScramble: invertScramble(scramble),
              solution,
              moveCount: steps->Array.length,
            })
          }
        }
      }
    }
  }
