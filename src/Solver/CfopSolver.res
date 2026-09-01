open StateTypes
open MoveTypes

type phase = {
  number: int,
  title: string,
  instruction: string,
  alg: alg,
}

type solution = {
  phases: array<phase>,
  alg: alg,
  moveCount: int,
}

type solverError = BeginnerSolver.solverError

let generatedLoc = {start: 0, end_: 0}
let located = desc => {desc, loc: generatedLoc}

let describeError = BeginnerSolver.describeError

let phase = (number, title, instruction, alg) => {number, title, instruction, alg}

let commentForPhase = phase =>
  located(
    BlockComment(` CFOP ${phase.number->Int.toString}: ${phase.title} — ${phase.instruction} `),
  )

let groupedHalfTurn = [located(Group([located(Move(Rotation(X), 2))], 1)), located(TimedPause(0.5))]

let withSequencePause = (alg: alg): alg => {
  let output = alg->Array.map(unit => unit)
  if output->Array.length > 0 {
    let lastIndex = output->Array.length - 1
    switch Belt.Array.getUnsafe(output, lastIndex).desc {
    | TimedPause(_) => output[lastIndex] = located(TimedPause(0.5))
    | _ => ()
    }
  }
  output
}

let isHalfTurnRegrip = unit =>
  switch unit.desc {
  | Group(contents, 1) if contents->Array.length == 1 =>
    switch Belt.Array.getUnsafe(contents, 0).desc {
    | Move(Rotation(X), turns) => turns % 4 == 2 || turns % 4 == -2
    | _ => false
    }
  | _ => false
  }

let withoutLeadingYellowUp = (alg: alg): alg => {
  if (
    alg->Array.length >= 2 &&
    Belt.Array.getUnsafe(alg, 0)->isHalfTurnRegrip &&
    switch Belt.Array.getUnsafe(alg, 1).desc {
    | TimedPause(_) => true
    | _ => false
    }
  ) {
    alg->Array.slice(~start=2, ~end=alg->Array.length)
  } else {
    alg
  }
}

let statesEqual = (left: cubeState, right: cubeState) =>
  left.size == right.size &&
    left.facelets->Array.everyWithIndex((facelets, faceIndex) => {
      let other = Belt.Array.getUnsafe(right.facelets, faceIndex)
      facelets->Array.everyWithIndex((facelet, index) =>
        facelet == Belt.Array.getUnsafe(other, index)
      )
    })

let solve = (input: cubeState): result<solution, solverError> =>
  switch BeginnerSolver.solve(input) {
  | Error(error) => Error(error)
  | Ok(beginner) => {
      let beginnerPhases = beginner.phases
      let cross = if beginner.moveCount == 0 {
        Belt.Array.getUnsafe(beginnerPhases, 0).alg
      } else {
        groupedHalfTurn->Array.concat(
          Belt.Array.getUnsafe(beginnerPhases, 0).alg->MoveTransform.rotate(~axis=X, ~turns=2),
        )
      }
      let firstLayer =
        Belt.Array.getUnsafe(beginnerPhases, 1).alg
        ->MoveTransform.rotate(~axis=X, ~turns=2)
        ->withSequencePause
      let middle = Belt.Array.getUnsafe(beginnerPhases, 2).alg->withoutLeadingYellowUp
      let f2l = firstLayer->Array.concat(middle)
      let oll =
        Belt.Array.getUnsafe(beginnerPhases, 3).alg
        ->withSequencePause
        ->Array.concat(Belt.Array.getUnsafe(beginnerPhases, 4).alg)
      let pll =
        Belt.Array.getUnsafe(beginnerPhases, 5).alg
        ->withSequencePause
        ->Array.concat(Belt.Array.getUnsafe(beginnerPhases, 6).alg)
      let phases = [
        phase(
          1,
          "Cross",
          "Build the white cross on the bottom and align every edge with its side centre.",
          cross,
        ),
        phase(
          2,
          "F2L Foundation",
          "Complete the first two layers with corner placement followed by left/right edge insertions; pair-first F2L is the next optimization.",
          f2l,
        ),
        phase(
          3,
          "Two-Look OLL",
          "Orient the last layer in two looks: form the yellow cross, then orient its corners.",
          oll,
        ),
        phase(
          4,
          "Two-Look PLL",
          "Permute last-layer corners, then cycle the remaining edges to solve the cube.",
          pll,
        ),
      ]
      let annotated =
        phases->Array.reduce([], (output, item) =>
          output->Array.concat([commentForPhase(item)])->Array.concat(item.alg)
        )
      let solved = switch StateTypes.solved(3) {
      | Ok(state) => state
      | Error(_) => input
      }
      switch MoveExecutor.applyAlg(input, annotated) {
      | Error(error) => Error(BeginnerSolver.ExpansionFailed(error))
      | Ok(result) if statesEqual(result, solved) =>
        Ok({phases, alg: annotated, moveCount: beginner.moveCount})
      | Ok(_) => Error(BeginnerSolver.VerificationFailed)
      }
    }
  }
