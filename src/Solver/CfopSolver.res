open StateTypes
open MoveTypes

type phase = {
  number: int,
  title: string,
  instruction: string,
  alg: alg,
  sequences: array<string>,
}

type solution = {phases: array<phase>, alg: alg, moveCount: int}
type solverError = BeginnerSolver.solverError
type pairCandidate = {
  pair: int,
  path: array<BeginnerSolver.action>,
  score: int,
  label: string,
}

exception BuildFailure(solverError)

let generatedLoc = {start: 0, end_: 0}
let located = desc => {desc, loc: generatedLoc}
let describeError = BeginnerSolver.describeError
let phase = (number, title, instruction, alg, sequences) => {
  number,
  title,
  instruction,
  alg,
  sequences,
}
let commentForPhase = phase =>
  located(
    BlockComment(` CFOP ${phase.number->Int.toString}: ${phase.title} — ${phase.instruction} `),
  )
let grouped = (alg: alg): alg => BeginnerSolver.groupedSequence(alg)

let withPhasePause = (alg: alg): alg => {
  let output = alg->Array.map(unit => unit)
  if output->Array.length > 0 {
    let lastIndex = output->Array.length - 1
    switch Belt.Array.getUnsafe(output, lastIndex).desc {
    | TimedPause(_) => output[lastIndex] = located(TimedPause(1.2))
    | _ => ()
    }
  }
  output
}

let applyPath = (
  state: PieceReducer.pieceState,
  path: array<BeginnerSolver.action>,
): PieceReducer.pieceState =>
  path->Array.reduce(state, (current, action) =>
    BeginnerSolver.applyCubie(current, action.transition)
  )

let physicalScore = (alg: alg): int =>
  switch MoveExecutor.expand(alg) {
  | Error(_) => 1000000
  | Ok(steps) =>
    steps->Array.reduce(0, (score, step) => {
      let turnCost = if step.turns % 2 == 0 {
        180
      } else {
        100
      }
      switch step.move {
      | Rotation(_) => score + 18
      | FaceTurn(B, _) => score + turnCost + 10
      | FaceTurn(L, _) => score + turnCost + 4
      | FaceTurn(_, _) | SliceTurn(_) => score + turnCost
      }
    })
  }

let rankedActions = (actions: array<BeginnerSolver.action>): array<BeginnerSolver.action> => {
  let ranked = actions->Array.map(action => (action, physicalScore(action.alg)))
  ranked->Array.sort((left, right) => {
    let (_, leftScore) = left
    let (_, rightScore) = right
    (leftScore - rightScore)->Int.toFloat
  })
  ranked->Array.map(((action, _)) => action)
}

let actionIsAlignment = (action: BeginnerSolver.action) =>
  switch action.alg {
  | [{desc: Move(FaceTurn(D, _), _)}] => true
  | _ => false
  }

let pairNames = [
  "white–green–red",
  "white–green–orange",
  "white–blue–orange",
  "white–blue–red",
]
let cornerSlots = ["UFR", "UFL", "UBL", "UBR", "DFR", "DLF", "DBL", "DRB"]
let edgeSlots = ["UR", "UF", "UL", "UB", "DR", "DF", "DL", "DB", "FR", "FL", "BL", "BR"]

let physicalPosition = position =>
  position
  ->String.split("")
  ->Array.map(face =>
    switch face {
    | "U" => "D"
    | "D" => "U"
    | "F" => "B"
    | "B" => "F"
    | other => other
    }
  )
  ->Array.join("")

let describePairCase = (state: PieceReducer.pieceState, pair) => {
  let cornerSlot = BeginnerSolver.findPiece(state.cp, pair)
  let edgeSlot = BeginnerSolver.findPiece(state.ep, 8 + pair)
  let cornerPosition = Belt.Array.getUnsafe(cornerSlots, cornerSlot)->physicalPosition
  let edgePosition = Belt.Array.getUnsafe(edgeSlots, edgeSlot)->physicalPosition
  let situation = if cornerSlot >= 4 && edgeSlot >= 4 && edgeSlot <= 7 {
    "both pieces in the top layer"
  } else if cornerSlot >= 4 && edgeSlot >= 8 {
    "corner on top; edge trapped in an F2L slot"
  } else if cornerSlot < 4 {
    "corner trapped in the first layer"
  } else {
    "separated corner-edge pair"
  }
  `Solve the ${Belt.Array.getUnsafe(
      pairNames,
      pair,
    )} pair — ${situation} (corner ${cornerPosition}, edge ${edgePosition}).`
}

let f2lFaces = pair =>
  switch pair {
  | 0 => [1, 2, 4]
  | 1 => [1, 4, 3]
  | 2 => [1, 3, 5]
  | _ => [1, 5, 2]
  }

let findPairCandidate = (
  ~state: PieceReducer.pieceState,
  ~completed: array<int>,
  ~pair: int,
  ~atomics: array<BeginnerSolver.action>,
): option<pairCandidate> => {
  let targets = completed->Array.concat([pair])
  let edges = [0, 1, 2, 3]->Array.concat(targets->Array.map(value => 8 + value))
  let faces = f2lFaces(pair)
  let actions = atomics->Array.filter(action => faces->Array.some(face => face == action.faceIndex))
  switch BeginnerSolver.searchAtomicWithLimit(
    ~state,
    ~corners=targets,
    ~edges,
    ~actions,
    ~maxDepth=11,
    ~maxNodes=180000,
  ) {
  | None => None
  | Some(path) => {
      let alg = BeginnerSolver.flattenActions(path)
      Some({
        pair,
        path,
        score: physicalScore(alg),
        label: describePairCase(state, pair),
      })
    }
  }
}

let betterPair = (candidate, current) =>
  switch current {
  | None => Some(candidate)
  | Some(best) if candidate.score < best.score => Some(candidate)
  | Some(best)
    if candidate.score == best.score && candidate.path->Array.length < best.path->Array.length =>
    Some(candidate)
  | Some(_) => current
  }

let describeEdgeOrientation = (state: PieceReducer.pieceState) => {
  let oriented = [4, 5, 6, 7]->Array.filter(slot => Belt.Array.getUnsafe(state.eo, slot) == 0)
  switch oriented->Array.length {
  | 0 => "Orient the OLL dot into a yellow cross."
  | 2 => {
      let delta = Belt.Array.getUnsafe(oriented, 0) - Belt.Array.getUnsafe(oriented, 1)
      let distance = if delta < 0 {
        -delta
      } else {
        delta
      }
      if distance == 2 {
        "Orient the OLL line into a yellow cross."
      } else {
        "Orient the OLL L-shape into a yellow cross."
      }
    }
  | _ => "Align the yellow-edge OLL case."
  }
}

let describeCornerOrientation = (state: PieceReducer.pieceState) => {
  let oriented = [4, 5, 6, 7]->Array.filter(slot => Belt.Array.getUnsafe(state.co, slot) == 0)
  switch oriented->Array.length {
  | 1 => "Orient the Sune or anti-Sune corner case."
  | 2 => "Orient the two-corner OLL case."
  | 0 => "Orient the four-corner OLL case."
  | _ => "Align the final OLL corner case."
  }
}

let describeCornerPermutation = (state: PieceReducer.pieceState) => {
  let positioned = [4, 5, 6, 7]->Array.filter(piece => BeginnerSolver.isSolvedCorner(state, piece))
  switch positioned->Array.length {
  | 0 => "Permute the diagonal/headlights corner PLL case."
  | 1 | 2 => "Align the headlights and permute the last-layer corners."
  | _ => "Apply the final corner AUF."
  }
}

let describeEdgePermutation = (state: PieceReducer.pieceState) => {
  let positioned = [4, 5, 6, 7]->Array.filter(piece => BeginnerSolver.isSolvedEdge(state, piece))
  switch positioned->Array.length {
  | 1 => "Solve the Ua/Ub three-edge cycle."
  | 0 => "Solve the H/Z four-edge permutation."
  | _ => "Apply the final PLL AUF."
  }
}

let groupedPathWithLabels = (
  ~state: PieceReducer.pieceState,
  ~path: array<BeginnerSolver.action>,
  ~describe: PieceReducer.pieceState => string,
) => {
  let current = ref(state)
  let alg = []
  let labels = []
  path->Array.forEach(action => {
    labels->Array.push(
      if action->actionIsAlignment {
        "AUF: align the recognized case."
      } else {
        describe(current.contents)
      },
    )
    alg->Array.push(located(Group(action.alg, 1)))
    alg->Array.push(located(TimedPause(0.5)))
    current := BeginnerSolver.applyCubie(current.contents, action.transition)
  })
  (alg, labels, current.contents)
}

let solve = (input: cubeState): result<solution, solverError> => {
  try {
    if input.size != 3 {
      throw(BuildFailure(BeginnerSolver.UnsupportedSize(input.size)))
    }
    switch PieceReducer.reduce(input) {
    | Error(error) => throw(BuildFailure(BeginnerSolver.InvalidState(error)))
    | Ok(_) => ()
    }
    let (orientedState, frameAlg) = switch BeginnerSolver.orientFrame(input) {
    | Some(value) => value
    | None => throw(BuildFailure(BeginnerSolver.SearchFailed("centre-frame normalization")))
    }
    let solved = switch StateTypes.solved(3) {
    | Ok(state) => state
    | Error(_) => throw(BuildFailure(BeginnerSolver.UnsupportedSize(3)))
    }
    let start = switch PieceReducer.reduce(orientedState) {
    | Ok(pieces) => pieces
    | Error(error) => throw(BuildFailure(BeginnerSolver.InvalidState(error)))
    }
    let atomics = BeginnerSolver.atomicActions(solved)
    let current = ref(start)

    let crossPath = switch BeginnerSolver.searchAtomic(
      ~state=current.contents,
      ~corners=[],
      ~edges=[0, 1, 2, 3],
      ~actions=atomics,
      ~maxDepth=8,
    ) {
    | Some(path) => path
    | None => throw(BuildFailure(BeginnerSolver.SearchFailed("a move-optimized white cross")))
    }
    current := applyPath(current.contents, crossPath)
    if !BeginnerSolver.lockedGoal(current.contents, [], [0, 1, 2, 3]) {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }

    let f2lAlg = ref([])
    let f2lLabels = []
    let completedPairs = []
    while completedPairs->Array.length < 4 {
      let best = ref(None)
      for pair in 0 to 3 {
        if !(completedPairs->Array.some(value => value == pair)) {
          switch findPairCandidate(
            ~state=current.contents,
            ~completed=completedPairs,
            ~pair,
            ~atomics,
          ) {
          | Some(candidate) => best := betterPair(candidate, best.contents)
          | None => ()
          }
        }
      }
      let selected = switch best.contents {
      | Some(candidate) => candidate
      | None => throw(BuildFailure(BeginnerSolver.SearchFailed("a locked F2L corner-edge pair")))
      }
      current := applyPath(current.contents, selected.path)
      completedPairs->Array.push(selected.pair)
      let lockedEdges = [0, 1, 2, 3]->Array.concat(completedPairs->Array.map(pair => 8 + pair))
      if !BeginnerSolver.lockedGoal(current.contents, completedPairs, lockedEdges) {
        throw(BuildFailure(BeginnerSolver.VerificationFailed))
      }
      f2lAlg := f2lAlg.contents->Array.concat(grouped(BeginnerSolver.flattenActions(selected.path)))
      f2lLabels->Array.push(selected.label)
    }
    if !BeginnerSolver.firstTwoLayersGoal(current.contents) {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }

    let ollEdgePrimitives =
      BeginnerSolver.macroVariants(solved, "F R U R' U' F'")
      ->Array.concat(BeginnerSolver.macroVariants(solved, "F U R U' R' F'"))
      ->Array.concat(BeginnerSolver.macroVariants(solved, "F R U R' U' F' U2 F U R U' R' F'"))
    let ollEdgeCases = ollEdgePrimitives->rankedActions
    let ollEdgeActions = BeginnerSolver.downTurns(solved)->Array.concat(ollEdgeCases)->rankedActions
    let ollEdgePath = switch BeginnerSolver.searchMacros(
      ~state=current.contents,
      ~actions=ollEdgeActions,
      ~isGoal=BeginnerSolver.orientedLastEdgesGoal,
      ~maxDepth=2,
    ) {
    | Some(path) => path
    | None => throw(BuildFailure(BeginnerSolver.SearchFailed("two-look OLL edge orientation")))
    }
    let (ollEdgeAlg, ollEdgeLabels, afterOllEdges) = groupedPathWithLabels(
      ~state=current.contents,
      ~path=ollEdgePath,
      ~describe=describeEdgeOrientation,
    )
    current := afterOllEdges
    let ollCornerAlgorithms = [
      "R U R' U R U2 R'",
      "R U2 R' U' R U' R'",
      "R U2 R2 U' R2 U' R2 U2 R",
      "R U R' U R U' R' U R U2 R'",
      "r U R' U' r' F R F'",
      "F' r U R' U' r' F R",
      "R2 D R' U2 R D' R' U2 R'",
    ]
    let ollCornerPrimitives =
      ollCornerAlgorithms->Array.reduce([], (all, algorithm) =>
        all->Array.concat(BeginnerSolver.macroVariants(solved, algorithm))
      )
    let ollCornerCases = ollCornerPrimitives->rankedActions
    let ollCornerActions =
      BeginnerSolver.downTurns(solved)->Array.concat(ollCornerCases)->rankedActions
    let ollCornerPath = switch BeginnerSolver.searchMacros(
      ~state=current.contents,
      ~actions=ollCornerActions,
      ~isGoal=BeginnerSolver.orientedLastCornersGoal,
      ~maxDepth=2,
    ) {
    | Some(path) => path
    | None => throw(BuildFailure(BeginnerSolver.SearchFailed("two-look OLL corner orientation")))
    }
    let (ollCornerAlg, ollCornerLabels, afterOllCorners) = groupedPathWithLabels(
      ~state=current.contents,
      ~path=ollCornerPath,
      ~describe=describeCornerOrientation,
    )
    current := afterOllCorners
    if !BeginnerSolver.orientedLastCornersGoal(current.contents) {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }

    let cornerPll = BeginnerSolver.parseInternal("R' F R' B2 R F' R' B2 R2")
    let pllCornerActions =
      BeginnerSolver.downTurns(solved)
      ->Array.concat(
        [0, 1, 2, 3]->Array.map(y => BeginnerSolver.macroVariant(solved, cornerPll, y)),
      )
      ->Array.concat(
        [0, 1, 2, 3]->Array.map(y =>
          BeginnerSolver.macroVariant(solved, MoveTransform.invert(cornerPll), y)
        ),
      )
      ->rankedActions
    let pllCornerPath = switch BeginnerSolver.searchMacros(
      ~state=current.contents,
      ~actions=pllCornerActions,
      ~isGoal=BeginnerSolver.positionedLastCornersGoal,
      ~maxDepth=5,
    ) {
    | Some(path) => path
    | None => throw(BuildFailure(BeginnerSolver.SearchFailed("two-look PLL corner permutation")))
    }
    let (pllCornerAlg, pllCornerLabels, afterPllCorners) = groupedPathWithLabels(
      ~state=current.contents,
      ~path=pllCornerPath,
      ~describe=describeCornerPermutation,
    )
    current := afterPllCorners
    let ua = BeginnerSolver.parseInternal("R U' R U R U R U' R' U' R2")
    let ub = MoveTransform.invert(ua)
    let h = BeginnerSolver.parseInternal("M2 U M2 U2 M2 U M2")
    let z = BeginnerSolver.parseInternal("M2 U M2 U M' U2 M2 U2 M' U2")
    let pllEdgeActions =
      BeginnerSolver.downTurns(solved)
      ->Array.concat(
        [ua, ub, h, z]->Array.reduce([], (all, algorithm) =>
          all->Array.concat(
            [0, 1, 2, 3]->Array.map(y => BeginnerSolver.macroVariant(solved, algorithm, y)),
          )
        ),
      )
      ->rankedActions
    let pllEdgePath = switch BeginnerSolver.searchMacros(
      ~state=current.contents,
      ~actions=pllEdgeActions,
      ~isGoal=BeginnerSolver.solvedCubiesGoal,
      ~maxDepth=4,
    ) {
    | Some(path) => path
    | None => throw(BuildFailure(BeginnerSolver.SearchFailed("two-look PLL edge permutation")))
    }
    let (pllEdgeAlg, pllEdgeLabels, afterPllEdges) = groupedPathWithLabels(
      ~state=current.contents,
      ~path=pllEdgePath,
      ~describe=describeEdgePermutation,
    )
    current := afterPllEdges
    if !BeginnerSolver.solvedCubiesGoal(current.contents) {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }

    let hasPhysicalWork =
      crossPath->Array.length > 0 ||
      f2lAlg.contents->Array.length > 0 ||
      ollEdgePath->Array.length > 0 ||
      ollCornerPath->Array.length > 0 ||
      pllCornerPath->Array.length > 0 ||
      pllEdgePath->Array.length > 0
    let whiteDown = [located(Move(Rotation(X), 2))]
    let crossCore = BeginnerSolver.flattenActions(crossPath)
    let crossAlg = ref(grouped(frameAlg))
    let crossLabels = []
    if frameAlg->Array.length > 0 {
      crossLabels->Array.push("Normalize the centre frame before planning the cross.")
    }
    if hasPhysicalWork {
      crossAlg := crossAlg.contents->Array.concat(grouped(whiteDown))
      crossLabels->Array.push("Regrip once so white stays on the bottom for CFOP.")
      if crossCore->Array.length > 0 {
        crossAlg :=
          crossAlg.contents->Array.concat(
            grouped(crossCore->MoveTransform.rotate(~axis=X, ~turns=2)),
          )
        crossLabels->Array.push(
          `Build the move-optimized white cross in ${crossPath->Array.length->Int.toString} moves.`,
        )
      }
    }
    let transformedF2l = f2lAlg.contents->MoveTransform.rotate(~axis=X, ~turns=2)
    let transformedOll =
      ollEdgeAlg->Array.concat(ollCornerAlg)->MoveTransform.rotate(~axis=X, ~turns=2)
    let transformedPll =
      pllCornerAlg->Array.concat(pllEdgeAlg)->MoveTransform.rotate(~axis=X, ~turns=2)
    let pllAlg = if hasPhysicalWork {
      transformedPll->Array.concat(grouped(whiteDown))
    } else {
      transformedPll
    }
    let pllLabels = pllCornerLabels->Array.concat(pllEdgeLabels)
    if hasPhysicalWork {
      pllLabels->Array.push("Restore the canonical white-up export frame.")
    }
    let phases = [
      phase(
        1,
        "Cross",
        "Plan the complete white-bottom cross before execution and minimize physical turns.",
        crossAlg.contents->withPhasePause,
        crossLabels,
      ),
      phase(
        2,
        "F2L Pairs",
        "Solve four corner-edge pairs together while preserving the cross and every completed slot.",
        transformedF2l->withPhasePause,
        f2lLabels,
      ),
      phase(
        3,
        "Two-Look OLL",
        "Recognize and orient last-layer edges, then recognize and orient the corners.",
        transformedOll->withPhasePause,
        ollEdgeLabels->Array.concat(ollCornerLabels),
      ),
      phase(
        4,
        "Two-Look PLL",
        "Recognize and permute last-layer corners, then solve the Ua/Ub/H/Z edge case.",
        pllAlg,
        pllLabels,
      ),
    ]
    let annotated =
      phases->Array.reduce([], (output, item) =>
        output->Array.concat([commentForPhase(item)])->Array.concat(item.alg)
      )
    let moveCount = switch MoveExecutor.expand(annotated) {
    | Error(error) => throw(BuildFailure(BeginnerSolver.ExpansionFailed(error)))
    | Ok(steps) =>
      steps
      ->Array.filter(step =>
        switch step.move {
        | Rotation(_) => false
        | FaceTurn(_, _) | SliceTurn(_) => true
        }
      )
      ->Array.length
    }
    let result = switch MoveExecutor.applyAlg(input, annotated) {
    | Error(error) => throw(BuildFailure(BeginnerSolver.ExpansionFailed(error)))
    | Ok(state) => state
    }
    if !BeginnerSolver.statesEqual(result, solved) {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }
    Ok({phases, alg: annotated, moveCount})
  } catch {
  | BuildFailure(error) => Error(error)
  }
}
