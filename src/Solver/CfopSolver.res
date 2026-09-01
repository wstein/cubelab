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
type physicalCost = {
  total: int,
  physicalMoves: int,
  rotations: int,
  estimatedRegrips: int,
  ergonomicPenalty: int,
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

let physicalCost = (alg: alg): physicalCost =>
  switch MoveExecutor.expand(alg) {
  | Error(_) => {
      total: 1000000,
      physicalMoves: 0,
      rotations: 0,
      estimatedRegrips: 0,
      ergonomicPenalty: 0,
    }
  | Ok(steps) =>
    let physicalMoves = ref(0)
    let halfTurns = ref(0)
    let rotations = ref(0)
    let estimatedRegrips = ref(0)
    let ergonomicPenalty = ref(0)
    steps->Array.forEach(step => {
      if step.turns % 2 == 0 {
        halfTurns := halfTurns.contents + 1
      }
      switch step.move {
      | Rotation(_) => {
          rotations := rotations.contents + 1
          estimatedRegrips := estimatedRegrips.contents + 1
        }
      | FaceTurn(B, _) => {
          physicalMoves := physicalMoves.contents + 1
          estimatedRegrips := estimatedRegrips.contents + 1
          ergonomicPenalty := ergonomicPenalty.contents + 12
        }
      | FaceTurn(L, _) => {
          physicalMoves := physicalMoves.contents + 1
          ergonomicPenalty := ergonomicPenalty.contents + 5
        }
      | FaceTurn(_, _) => physicalMoves := physicalMoves.contents + 1
      | SliceTurn(_) => {
          physicalMoves := physicalMoves.contents + 1
          ergonomicPenalty := ergonomicPenalty.contents + 8
        }
      }
    })
    {
      total: physicalMoves.contents * 100 +
      halfTurns.contents * 25 +
      rotations.contents * 35 +
      estimatedRegrips.contents * 18 +
      ergonomicPenalty.contents,
      physicalMoves: physicalMoves.contents,
      rotations: rotations.contents,
      estimatedRegrips: estimatedRegrips.contents,
      ergonomicPenalty: ergonomicPenalty.contents,
    }
  }

let physicalScore = alg => physicalCost(alg).total

let rankedActions = (actions: array<BeginnerSolver.action>): array<BeginnerSolver.action> => {
  let ranked =
    actions->Array.map(action => (
      action,
      physicalScore(action.alg->MoveTransform.rotate(~axis=X, ~turns=2)),
    ))
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
  let connected =
    edgePosition->String.split("")->Array.every(face => cornerPosition->String.includes(face))
  let situation = if connected && cornerSlot >= 4 && edgeSlot >= 4 && edgeSlot <= 7 {
    "connected pair in the top layer"
  } else if connected {
    "connected pair outside its target slot"
  } else if cornerSlot >= 4 && edgeSlot >= 4 && edgeSlot <= 7 {
    "both pieces separated in the top layer"
  } else if cornerSlot >= 4 && edgeSlot >= 8 {
    "corner on top; edge trapped in an F2L slot"
  } else if cornerSlot < 4 {
    "corner trapped in the first layer"
  } else {
    "separated corner-edge pair"
  }
  let whiteFace = Belt.Array.getUnsafe(
    cornerPosition->String.split(""),
    Belt.Array.getUnsafe(state.co, cornerSlot),
  )
  let whiteOrientation = switch whiteFace {
  | "U" => "white sticker faces up"
  | "D" => "white sticker faces down"
  | face => `white sticker faces ${face}`
  }
  let edgeOrientation = if Belt.Array.getUnsafe(state.eo, edgeSlot) == 0 {
    "edge oriented"
  } else {
    "edge flipped"
  }
  `Solve the ${Belt.Array.getUnsafe(
      pairNames,
      pair,
    )} pair — ${situation}; ${whiteOrientation}; ${edgeOrientation} (corner ${cornerPosition}, edge ${edgePosition}).`
}

let addPositionFaces = (faces: array<int>, position: string) =>
  position
  ->String.split("")
  ->Array.forEach(face => {
    let index = switch face {
    | "R" => 2
    | "L" => 3
    | "F" => 4
    | "B" => 5
    | _ => -1
    }
    if index != -1 && !(faces->Array.some(candidate => candidate == index)) {
      faces->Array.push(index)
    }
  })

let f2lFaces = (~state: PieceReducer.pieceState, ~pair: int, ~allSides: bool) => {
  if allSides {
    [1, 2, 3, 4, 5]
  } else {
    let faces = [1]
    addPositionFaces(faces, Belt.Array.getUnsafe(cornerSlots, pair))
    addPositionFaces(faces, Belt.Array.getUnsafe(edgeSlots, 8 + pair))
    addPositionFaces(
      faces,
      Belt.Array.getUnsafe(cornerSlots, BeginnerSolver.findPiece(state.cp, pair)),
    )
    addPositionFaces(
      faces,
      Belt.Array.getUnsafe(edgeSlots, BeginnerSolver.findPiece(state.ep, 8 + pair)),
    )
    faces
  }
}

let findPairCandidate = (
  ~state: PieceReducer.pieceState,
  ~completed: array<int>,
  ~pair: int,
  ~atomics: array<BeginnerSolver.action>,
  ~maxDepth: int,
  ~maxNodes: int,
  ~allSides: bool,
): option<pairCandidate> => {
  let targets = completed->Array.concat([pair])
  let edges = [0, 1, 2, 3]->Array.concat(targets->Array.map(value => 8 + value))
  let faces = f2lFaces(~state, ~pair, ~allSides)
  let actions = atomics->Array.filter(action => faces->Array.some(face => face == action.faceIndex))
  switch BeginnerSolver.searchAtomicWithLimit(
    ~state,
    ~corners=targets,
    ~edges,
    ~actions,
    ~maxDepth,
    ~maxNodes,
  ) {
  | None => None
  | Some(path) => {
      let alg = BeginnerSolver.flattenActions(path)
      let humanAlg = alg->MoveTransform.rotate(~axis=X, ~turns=2)
      Some({
        pair,
        path,
        score: physicalScore(humanAlg),
        label: describePairCase(state, pair),
      })
    }
  }
}

let comparePairs = (left: pairCandidate, right: pairCandidate) => {
  let scoreDifference = left.score - right.score
  if scoreDifference != 0 {
    scoreDifference->Int.toFloat
  } else {
    (left.path->Array.length - right.path->Array.length)->Int.toFloat
  }
}

let f2lPlanKey = (state: PieceReducer.pieceState, completed: array<int>) =>
  BeginnerSolver.fullKey(state) ++
  "|" ++
  [0, 1, 2, 3]
  ->Array.map(pair =>
    if completed->Array.some(value => value == pair) {
      "1"
    } else {
      "0"
    }
  )
  ->Array.join("")

let rec planF2l = (
  ~state: PieceReducer.pieceState,
  ~completed: array<int>,
  ~atomics: array<BeginnerSolver.action>,
  ~maxDepth: int,
  ~maxNodes: int,
  ~allSides: bool,
  ~failed,
): option<array<pairCandidate>> => {
  if completed->Array.length == 4 {
    Some([])
  } else {
    let key = f2lPlanKey(state, completed)
    switch Dict.get(failed, key) {
    | Some(_) => None
    | None => {
        let candidates = []
        for pair in 0 to 3 {
          if !(completed->Array.some(value => value == pair)) {
            switch findPairCandidate(
              ~state,
              ~completed,
              ~pair,
              ~atomics,
              ~maxDepth,
              ~maxNodes,
              ~allSides,
            ) {
            | Some(candidate) => candidates->Array.push(candidate)
            | None => ()
            }
          }
        }
        candidates->Array.sort(comparePairs)
        let result = ref(None)
        for index in 0 to candidates->Array.length - 1 {
          if result.contents == None {
            let candidate = Belt.Array.getUnsafe(candidates, index)
            let nextState = applyPath(state, candidate.path)
            let nextCompleted = completed->Array.concat([candidate.pair])
            switch planF2l(
              ~state=nextState,
              ~completed=nextCompleted,
              ~atomics,
              ~maxDepth,
              ~maxNodes,
              ~allSides,
              ~failed,
            ) {
            | Some(rest) => result := Some([candidate]->Array.concat(rest))
            | None => ()
            }
          }
        }
        if result.contents == None {
          Dict.set(failed, key, true)
        }
        result.contents
      }
    }
  }
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
  | 0 => "Permute three last-layer corners — A-perm from the diagonal/headlights case."
  | 1 | 2 => "Permute three last-layer corners — A-perm from the headlights case."
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

    let fastF2lPlan = planF2l(
      ~state=current.contents,
      ~completed=[],
      ~atomics,
      ~maxDepth=11,
      ~maxNodes=180000,
      ~allSides=false,
      ~failed=Dict.make(),
    )
    let f2lPlan = switch fastF2lPlan {
    | Some(plan) => plan
    | None =>
      switch planF2l(
        ~state=current.contents,
        ~completed=[],
        ~atomics,
        ~maxDepth=12,
        ~maxNodes=600000,
        ~allSides=true,
        ~failed=Dict.make(),
      ) {
      | Some(plan) => plan
      | None =>
        throw(BuildFailure(BeginnerSolver.SearchFailed("four locked F2L corner-edge pairs")))
      }
    }
    let f2lAlg = ref([])
    let f2lLabels = []
    let completedPairs = []
    f2lPlan->Array.forEach(selected => {
      current := applyPath(current.contents, selected.path)
      completedPairs->Array.push(selected.pair)
      let lockedEdges = [0, 1, 2, 3]->Array.concat(completedPairs->Array.map(pair => 8 + pair))
      if !BeginnerSolver.lockedGoal(current.contents, completedPairs, lockedEdges) {
        throw(BuildFailure(BeginnerSolver.VerificationFailed))
      }
      f2lAlg := f2lAlg.contents->Array.concat(grouped(BeginnerSolver.flattenActions(selected.path)))
      f2lLabels->Array.push(selected.label)
    })
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
