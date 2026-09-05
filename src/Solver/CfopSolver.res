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
type level = Beginner | Full | Advanced
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
type lastLayerSelection = {
  alg: alg,
  labels: array<string>,
  state: PieceReducer.pieceState,
}
type crossSelection = {
  path: array<BeginnerSolver.action>,
  candidates: int,
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

let biasedActions = (actions: array<BeginnerSolver.action>, preferredFace) => {
  let ranked = actions->Array.map(action => action)
  ranked->Array.sort((left, right) => {
    let leftBias = if left.faceIndex == preferredFace {
      0
    } else {
      1
    }
    let rightBias = if right.faceIndex == preferredFace {
      0
    } else {
      1
    }
    let biasDifference = leftBias - rightBias
    if biasDifference != 0 {
      biasDifference->Int.toFloat
    } else {
      let leftScore = physicalScore(left.alg->MoveTransform.rotate(~axis=X, ~turns=2))
      let rightScore = physicalScore(right.alg->MoveTransform.rotate(~axis=X, ~turns=2))
      (leftScore - rightScore)->Int.toFloat
    }
  })
  ranked
}

let crossPathKey = path =>
  path
  ->BeginnerSolver.flattenActions
  ->MoveTransform.serialize

let crossCandidateScore = (state, path) => {
  let after = applyPath(state, path)
  let solvedPairs =
    [0, 1, 2, 3]->Array.filter(pair =>
      BeginnerSolver.isSolvedCorner(after, pair) && BeginnerSolver.isSolvedEdge(after, 8 + pair)
    )
  let humanAlg = BeginnerSolver.flattenActions(path)->MoveTransform.rotate(~axis=X, ~turns=2)
  physicalScore(humanAlg) - solvedPairs->Array.length * 90
}

let selectCross = (~state, ~atomics): option<crossSelection> => {
  let paths = []
  let seen = Dict.make()
  let collect = candidate =>
    switch candidate {
    | Some(path) => {
        let key = crossPathKey(path)
        if Dict.get(seen, key) == None {
          Dict.set(seen, key, true)
          paths->Array.push(path)
        }
      }
    | None => ()
    }
  collect(
    BeginnerSolver.searchAtomic(
      ~state,
      ~corners=[],
      ~edges=[0, 1, 2, 3],
      ~actions=atomics->rankedActions,
      ~maxDepth=8,
    ),
  )
  // Explore a distinct ergonomic side-face-first solution instead of
  // accepting the first shortest path. The retained candidate is scored for
  // both turn cost and already-preserved F2L pairs.
  [2]->Array.forEach(preferredFace =>
    collect(
      BeginnerSolver.searchAtomicWithLimit(
        ~state,
        ~corners=[],
        ~edges=[0, 1, 2, 3],
        ~actions=biasedActions(atomics, preferredFace),
        ~maxDepth=8,
        ~maxNodes=100000,
      ),
    )
  )
  if paths->Array.length == 0 {
    None
  } else {
    let best = ref(Belt.Array.getUnsafe(paths, 0))
    let bestScore = ref(crossCandidateScore(state, best.contents))
    for index in 1 to paths->Array.length - 1 {
      let candidate = Belt.Array.getUnsafe(paths, index)
      let score = crossCandidateScore(state, candidate)
      if score < bestScore.contents {
        best := candidate
        bestScore := score
      }
    }
    Some({path: best.contents, candidates: paths->Array.length})
  }
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

let f2lPlanScore = plan =>
  plan->Array.reduce(0, (total, candidate: pairCandidate) => total + candidate.score)

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

let rec planF2lWithTail = (
  ~state: PieceReducer.pieceState,
  ~completed: array<int>,
  ~atomics: array<BeginnerSolver.action>,
  ~maxDepth: int,
  ~maxNodes: int,
  ~allSides: bool,
  ~rootCandidates: int,
  ~failed,
  ~tailCost: PieceReducer.pieceState => int,
): option<(array<pairCandidate>, int)> => {
  if completed->Array.length == 4 {
    Some(([], tailCost(state)))
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
        let bestScore = ref(100000000)
        let candidateLimit = if candidates->Array.length < rootCandidates {
          candidates->Array.length
        } else {
          rootCandidates
        }
        for index in 0 to candidateLimit - 1 {
          let candidate = Belt.Array.getUnsafe(candidates, index)
          let nextState = applyPath(state, candidate.path)
          let nextCompleted = completed->Array.concat([candidate.pair])
          switch planF2lWithTail(
            ~state=nextState,
            ~completed=nextCompleted,
            ~atomics,
            ~maxDepth,
            ~maxNodes,
            ~allSides,
            ~rootCandidates,
            ~failed,
            ~tailCost,
          ) {
          | Some(rest, restTailCost) => {
              let plan = [candidate]->Array.concat(rest)
              let score = f2lPlanScore(plan) + restTailCost
              if score < bestScore.contents {
                bestScore := score
                result := Some(plan, restTailCost)
              }
            }
          | None => ()
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

let lastLayerSlots = [4, 5, 6, 7]

let orientationKey = (state: PieceReducer.pieceState) =>
  lastLayerSlots
  ->Array.map(slot => Belt.Array.getUnsafe(state.co, slot)->Int.toString)
  ->Array.join("") ++
  "|" ++
  lastLayerSlots
  ->Array.map(slot => Belt.Array.getUnsafe(state.eo, slot)->Int.toString)
  ->Array.join("")

let permutationKey = (state: PieceReducer.pieceState) =>
  lastLayerSlots
  ->Array.map(slot => Belt.Array.getUnsafe(state.cp, slot)->Int.toString)
  ->Array.join("") ++
  "|" ++
  lastLayerSlots
  ->Array.map(slot => Belt.Array.getUnsafe(state.ep, slot)->Int.toString)
  ->Array.join("")

let downAction = (solved, turns): option<BeginnerSolver.action> => {
  let normalized = (turns % 4 + 4) % 4
  if normalized == 0 {
    None
  } else {
    let canonical = if normalized == 3 {
      -1
    } else {
      normalized
    }
    BeginnerSolver.downTurns(solved)->Array.find(action =>
      switch action.alg {
      | [{desc: Move(FaceTurn(D, _), actionTurns)}] => actionTurns == canonical
      | _ => false
      }
    )
  }
}

let applyDown = (state, solved, turns) =>
  switch downAction(solved, turns) {
  | Some(action) => BeginnerSolver.applyCubie(state, action.transition)
  | None => state
  }

let normalizedLastLayerKey = (~state, ~solved, ~key) => {
  let best = ref(key(state))
  for turns in 1 to 3 {
    let candidate = key(applyDown(state, solved, turns))
    if candidate < best.contents {
      best := candidate
    }
  }
  best.contents
}

let caseAction = (solved, algorithm) =>
  BeginnerSolver.macroVariant(solved, BeginnerSolver.parseInternal(algorithm), 0)

let inverseSetup = (solved, action: BeginnerSolver.action) =>
  BeginnerSolver.transitionForAlg(solved, MoveTransform.invert(action.alg))

let appendActionGroup = (output: alg, action: BeginnerSolver.action) => {
  output->Array.push(located(Group(action.alg, 1)))
  output->Array.push(located(TimedPause(0.5)))
}

let validateCaseLibraries = solved => {
  if CfopCases.oll->Array.length != 57 || CfopCases.pll->Array.length != 21 {
    throw(BuildFailure(BeginnerSolver.VerificationFailed))
  }
  let ollSignatures = Dict.make()
  CfopCases.oll->Array.forEach(entry => {
    let action = caseAction(solved, entry.algorithm)
    let setup = inverseSetup(solved, action)
    if !BeginnerSolver.firstTwoLayersGoal(setup) {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }
    let replay = BeginnerSolver.applyCubie(setup, action.transition)
    if !BeginnerSolver.solvedCubiesGoal(replay) {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }
    let signature = normalizedLastLayerKey(~state=setup, ~solved, ~key=orientationKey)
    if Dict.get(ollSignatures, signature) != None {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }
    Dict.set(ollSignatures, signature, entry.id)
  })
  let pllSignatures = Dict.make()
  CfopCases.pll->Array.forEach(entry => {
    let action = caseAction(solved, entry.algorithm)
    let setup = inverseSetup(solved, action)
    if !BeginnerSolver.orientedLastCornersGoal(setup) {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }
    let replay = BeginnerSolver.applyCubie(setup, action.transition)
    if !BeginnerSolver.solvedCubiesGoal(replay) {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }
    let signature = normalizedLastLayerKey(~state=setup, ~solved, ~key=permutationKey)
    if Dict.get(pllSignatures, signature) != None {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }
    Dict.set(pllSignatures, signature, entry.id)
  })
  (ollSignatures, pllSignatures)
}

let caseLibraryCache = ref(None)
let cachedCaseLibraries = solved =>
  switch caseLibraryCache.contents {
  | Some(libraries) => libraries
  | None => {
      let libraries = validateCaseLibraries(solved)
      caseLibraryCache := Some(libraries)
      libraries
    }
  }

let selectOll = (~state, ~solved, ~signatures): option<lastLayerSelection> => {
  if BeginnerSolver.orientedLastCornersGoal(state) {
    Some({alg: [], labels: ["OLL already oriented."], state})
  } else {
    let signature = normalizedLastLayerKey(~state, ~solved, ~key=orientationKey)
    switch Dict.get(signatures, signature) {
    | None => None
    | Some(caseId) => {
        let recognized = CfopCases.oll->Array.find(entry => entry.id == caseId)
        switch recognized {
        | None => None
        | Some(entry) => {
            let action = caseAction(solved, entry.algorithm)
            let best = ref(None)
            let bestScore = ref(1000000)
            for turns in 0 to 3 {
              let aligned = applyDown(state, solved, turns)
              let after = BeginnerSolver.applyCubie(aligned, action.transition)
              if BeginnerSolver.orientedLastCornersGoal(after) {
                let candidateAlg = []
                let labels = []
                switch downAction(solved, turns) {
                | Some(auf) => {
                    appendActionGroup(candidateAlg, auf)
                    labels->Array.push("AUF: align the recognized OLL case.")
                  }
                | None => ()
                }
                appendActionGroup(candidateAlg, action)
                labels->Array.push(
                  `OLL ${entry.id->Int.toString} · ${entry.family} — one-look orientation.`,
                )
                let score = physicalScore(candidateAlg->MoveTransform.rotate(~axis=X, ~turns=2))
                if score < bestScore.contents {
                  bestScore := score
                  best := Some({alg: candidateAlg, labels, state: after})
                }
              }
            }
            best.contents
          }
        }
      }
    }
  }
}

let selectPll = (~state, ~solved): option<lastLayerSelection> => {
  if BeginnerSolver.solvedCubiesGoal(state) {
    Some({alg: [], labels: ["PLL already solved."], state})
  } else {
    let aufOnly = ref(None)
    for turns in 1 to 3 {
      let after = applyDown(state, solved, turns)
      if aufOnly.contents == None && BeginnerSolver.solvedCubiesGoal(after) {
        switch downAction(solved, turns) {
        | Some(auf) => {
            let alg = []
            appendActionGroup(alg, auf)
            aufOnly := Some({alg, labels: ["Final PLL AUF."], state: after})
          }
        | None => ()
        }
      }
    }
    switch aufOnly.contents {
    | Some(selection) => Some(selection)
    | None => {
        let best = ref(None)
        let bestScore = ref(1000000)
        CfopCases.pll->Array.forEach(entry => {
          let action = caseAction(solved, entry.algorithm)
          for preTurns in 0 to 3 {
            let aligned = applyDown(state, solved, preTurns)
            let permuted = BeginnerSolver.applyCubie(aligned, action.transition)
            for postTurns in 0 to 3 {
              let after = applyDown(permuted, solved, postTurns)
              if BeginnerSolver.solvedCubiesGoal(after) {
                let candidateAlg = []
                let labels = []
                switch downAction(solved, preTurns) {
                | Some(auf) => {
                    appendActionGroup(candidateAlg, auf)
                    labels->Array.push("AUF: align the recognized PLL case.")
                  }
                | None => ()
                }
                appendActionGroup(candidateAlg, action)
                labels->Array.push(`${entry.id}-Perm — one-look permutation.`)
                switch downAction(solved, postTurns) {
                | Some(auf) => {
                    appendActionGroup(candidateAlg, auf)
                    labels->Array.push("Final PLL AUF.")
                  }
                | None => ()
                }
                let score = physicalScore(candidateAlg->MoveTransform.rotate(~axis=X, ~turns=2))
                if score < bestScore.contents {
                  bestScore := score
                  best := Some({alg: candidateAlg, labels, state: after})
                }
              }
            }
          }
        })
        best.contents
      }
    }
  }
}

let describeEdgeOrientation = (state: PieceReducer.pieceState) => {
  let oriented = lastLayerSlots->Array.filter(slot => Belt.Array.getUnsafe(state.eo, slot) == 0)
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
  let oriented = lastLayerSlots->Array.filter(slot => Belt.Array.getUnsafe(state.co, slot) == 0)
  switch oriented->Array.length {
  | 1 => "Orient the Sune or anti-Sune corner case."
  | 2 => "Orient the two-corner OLL case."
  | 0 => "Orient the four-corner OLL case."
  | _ => "Align the final OLL corner case."
  }
}

let describeCornerPermutation = (state: PieceReducer.pieceState) => {
  let positioned =
    lastLayerSlots->Array.filter(piece => BeginnerSolver.isSolvedCorner(state, piece))
  switch positioned->Array.length {
  | 0 => "Permute three last-layer corners from the diagonal/headlights case."
  | 1 | 2 => "Permute three last-layer corners from the headlights case."
  | _ => "Apply the final corner AUF."
  }
}

let describeEdgePermutation = (state: PieceReducer.pieceState) => {
  let positioned = lastLayerSlots->Array.filter(piece => BeginnerSolver.isSolvedEdge(state, piece))
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
    appendActionGroup(alg, action)
    current := BeginnerSolver.applyCubie(current.contents, action.transition)
  })
  (alg, labels, current.contents)
}

let selectBeginnerOll = (~state, ~solved): lastLayerSelection => {
  let edgePrimitives =
    BeginnerSolver.macroVariants(solved, "F R U R' U' F'")
    ->Array.concat(BeginnerSolver.macroVariants(solved, "F U R U' R' F'"))
    ->Array.concat(BeginnerSolver.macroVariants(solved, "F R U R' U' F' U2 F U R U' R' F'"))
  let edgeActions =
    BeginnerSolver.downTurns(solved)->Array.concat(edgePrimitives->rankedActions)->rankedActions
  let edgePath = switch BeginnerSolver.searchMacros(
    ~state,
    ~actions=edgeActions,
    ~isGoal=BeginnerSolver.orientedLastEdgesGoal,
    ~maxDepth=2,
  ) {
  | Some(path) => path
  | None => throw(BuildFailure(BeginnerSolver.SearchFailed("two-look OLL edge orientation")))
  }
  let (edgeAlg, edgeLabels, afterEdges) = groupedPathWithLabels(
    ~state,
    ~path=edgePath,
    ~describe=describeEdgeOrientation,
  )
  let cornerAlgorithms = [
    "R U R' U R U2 R'",
    "R U2 R' U' R U' R'",
    "R U2 R2 U' R2 U' R2 U2 R",
    "R U R' U R U' R' U R U2 R'",
    "r U R' U' r' F R F'",
    "F' r U R' U' r' F R",
    "R2 D R' U2 R D' R' U2 R'",
  ]
  let cornerPrimitives =
    cornerAlgorithms->Array.reduce([], (all, algorithm) =>
      all->Array.concat(BeginnerSolver.macroVariants(solved, algorithm))
    )
  let cornerActions =
    BeginnerSolver.downTurns(solved)->Array.concat(cornerPrimitives->rankedActions)->rankedActions
  let cornerPath = switch BeginnerSolver.searchMacros(
    ~state=afterEdges,
    ~actions=cornerActions,
    ~isGoal=BeginnerSolver.orientedLastCornersGoal,
    ~maxDepth=2,
  ) {
  | Some(path) => path
  | None => throw(BuildFailure(BeginnerSolver.SearchFailed("two-look OLL corner orientation")))
  }
  let (cornerAlg, cornerLabels, afterCorners) = groupedPathWithLabels(
    ~state=afterEdges,
    ~path=cornerPath,
    ~describe=describeCornerOrientation,
  )
  {
    alg: edgeAlg->Array.concat(cornerAlg),
    labels: edgeLabels->Array.concat(cornerLabels),
    state: afterCorners,
  }
}

let selectBeginnerPll = (~state, ~solved): lastLayerSelection => {
  let cornerPll = BeginnerSolver.parseInternal("R' F R' B2 R F' R' B2 R2")
  let tPerm = BeginnerSolver.parseInternal("R U R' U' R' F R2 U' R' U' R U R' F'")
  let yPerm = BeginnerSolver.parseInternal("F R U' R' U' R U R' F' R U R' U' R' F R F'")
  let cornerAlgorithms = [cornerPll, MoveTransform.invert(cornerPll), tPerm, yPerm]
  let cornerActions =
    BeginnerSolver.downTurns(solved)
    ->Array.concat(
      cornerAlgorithms->Array.reduce([], (all, algorithm) =>
        all->Array.concat(
          [0, 1, 2, 3]->Array.map(y => BeginnerSolver.macroVariant(solved, algorithm, y)),
        )
      ),
    )
    ->rankedActions
  let cornerPath = switch BeginnerSolver.searchMacros(
    ~state,
    ~actions=cornerActions,
    ~isGoal=BeginnerSolver.positionedLastCornersGoal,
    ~maxDepth=5,
  ) {
  | Some(path) => path
  | None => throw(BuildFailure(BeginnerSolver.SearchFailed("two-look PLL corner permutation")))
  }
  let (cornerAlg, cornerLabels, afterCorners) = groupedPathWithLabels(
    ~state,
    ~path=cornerPath,
    ~describe=describeCornerPermutation,
  )
  let ua = BeginnerSolver.parseInternal("R U' R U R U R U' R' U' R2")
  let edgeAlgorithms = [
    ua,
    MoveTransform.invert(ua),
    BeginnerSolver.parseInternal("M2 U M2 U2 M2 U M2"),
    BeginnerSolver.parseInternal("M2 U M2 U M' U2 M2 U2 M' U2"),
  ]
  let edgeActions =
    BeginnerSolver.downTurns(solved)
    ->Array.concat(
      edgeAlgorithms->Array.reduce([], (all, algorithm) =>
        all->Array.concat(
          [0, 1, 2, 3]->Array.map(y => BeginnerSolver.macroVariant(solved, algorithm, y)),
        )
      ),
    )
    ->rankedActions
  let edgePath = switch BeginnerSolver.searchMacros(
    ~state=afterCorners,
    ~actions=edgeActions,
    ~isGoal=BeginnerSolver.solvedCubiesGoal,
    ~maxDepth=4,
  ) {
  | Some(path) => path
  | None => throw(BuildFailure(BeginnerSolver.SearchFailed("two-look PLL edge permutation")))
  }
  let (edgeAlg, edgeLabels, afterEdges) = groupedPathWithLabels(
    ~state=afterCorners,
    ~path=edgePath,
    ~describe=describeEdgePermutation,
  )
  {
    alg: cornerAlg->Array.concat(edgeAlg),
    labels: cornerLabels->Array.concat(edgeLabels),
    state: afterEdges,
  }
}

let splitSelectionAtGoal = (
  ~state: PieceReducer.pieceState,
  ~solved,
  ~selection: lastLayerSelection,
  ~isGoal,
) => {
  let cursor = ref(state)
  let splitGroups = ref(
    if isGoal(state) {
      0
    } else {
      -1
    },
  )
  for index in 0 to selection.labels->Array.length - 1 {
    if splitGroups.contents == -1 {
      let group = [
        Belt.Array.getUnsafe(selection.alg, index * 2),
        Belt.Array.getUnsafe(selection.alg, index * 2 + 1),
      ]
      let transition = BeginnerSolver.transitionForAlg(solved, group)
      cursor := BeginnerSolver.applyCubie(cursor.contents, transition)
      if isGoal(cursor.contents) {
        splitGroups := index + 1
      }
    }
  }
  if splitGroups.contents == -1 {
    throw(BuildFailure(BeginnerSolver.VerificationFailed))
  }
  let splitUnits = splitGroups.contents * 2
  let firstAlg = []
  let secondAlg = []
  selection.alg->Array.forEachWithIndex((unit, index) => {
    if index < splitUnits {
      firstAlg->Array.push(unit)
    } else {
      secondAlg->Array.push(unit)
    }
  })
  let firstLabels = []
  let secondLabels = []
  selection.labels->Array.forEachWithIndex((label, index) => {
    if index < splitGroups.contents {
      firstLabels->Array.push(label)
    } else {
      secondLabels->Array.push(label)
    }
  })
  (
    {alg: firstAlg, labels: firstLabels, state: cursor.contents},
    {alg: secondAlg, labels: secondLabels, state: selection.state},
  )
}

let layerPlanKey = (state: PieceReducer.pieceState, pieces, completed) =>
  BeginnerSolver.fullKey(state) ++
  "|" ++
  pieces
  ->Array.map(piece =>
    if completed->Array.some(value => value == piece) {
      "1"
    } else {
      "0"
    }
  )
  ->Array.join("")

let rotatedMacroActions = (solved, sources) => {
  let output = []
  sources->Array.forEach(source => {
    let base = BeginnerSolver.parseInternal(source)
    for yTurns in 0 to 3 {
      output->Array.push(
        BeginnerSolver.macroAction(solved, base->MoveTransform.rotate(~axis=Y, ~turns=yTurns)),
      )
    }
  })
  output
}

// These one-shot corner triggers keep the first-layer planner responsive.
// Its small atomic fallback remains available for unusual corner positions.
let advancedCornerTriggers = solved =>
  rotatedMacroActions(
    solved,
    [
      "R U R'",
      "R U' R'",
      "R U2 R'",
      "R' U' R",
      "R' U R",
      "R' U2 R",
      "F' U' F",
      "F' U F",
      "F' U2 F",
      "F U F'",
      "F U' F'",
      "F U2 F'",
      "U R U' R'",
      "U' R U R'",
      "U R' U' R",
      "U' R' U R",
    ],
  )

let triggerLayerCandidate = (~state, ~corners, ~edges, ~triggers) => {
  let best = ref(None)
  let bestScore = ref(1000000)
  triggers->Array.forEach(action => {
    let after = applyPath(state, [action])
    if BeginnerSolver.lockedGoal(after, corners, edges) {
      let score = action.alg->MoveTransform.rotate(~axis=X, ~turns=2)->physicalScore
      if score < bestScore.contents {
        bestScore := score
        best := Some([action])
      }
    }
  })
  best.contents
}

let rec planLayerPiecesFrom = (
  ~state: PieceReducer.pieceState,
  ~pieces: array<int>,
  ~completed: array<int>,
  ~baseCorners: array<int>,
  ~baseEdges: array<int>,
  ~corners: bool,
  ~atomics: array<BeginnerSolver.action>,
  ~triggers: array<BeginnerSolver.action>,
  ~labels: array<string>,
  ~failed,
) => {
  if completed->Array.length == pieces->Array.length {
    Some([])
  } else {
    let key = layerPlanKey(state, pieces, completed)
    if Dict.get(failed, key) != None {
      None
    } else {
      let candidates = []
      pieces->Array.forEachWithIndex((piece, labelIndex) => {
        if !(completed->Array.some(value => value == piece)) {
          let targetCorners = if corners {
            baseCorners->Array.concat(completed)->Array.concat([piece])
          } else {
            baseCorners
          }
          let targetEdges = if corners {
            baseEdges
          } else {
            baseEdges->Array.concat(completed)->Array.concat([piece])
          }
          switch triggerLayerCandidate(
            ~state,
            ~corners=targetCorners,
            ~edges=targetEdges,
            ~triggers,
          ) {
          | Some(path) => {
              let score =
                BeginnerSolver.flattenActions(path)
                ->MoveTransform.rotate(~axis=X, ~turns=2)
                ->physicalScore
              candidates->Array.push({
                pair: piece,
                path,
                score,
                label: Belt.Array.getUnsafe(labels, labelIndex),
              })
            }
          | None => {
              // The trigger catalogue covers the ordinary LBL cases. Keep
              // the rare fallback deliberately bounded: this planner runs at
              // every branch, so an unbounded-depth retry can make one state
              // appear never to finish.
              let found = BeginnerSolver.searchAtomicWithLimit(
                ~state,
                ~corners=targetCorners,
                ~edges=targetEdges,
                ~actions=atomics->rankedActions,
                ~maxDepth=9,
                ~maxNodes=40000,
              )
              switch found {
              | Some(path) => {
                  let score =
                    BeginnerSolver.flattenActions(path)
                    ->MoveTransform.rotate(~axis=X, ~turns=2)
                    ->physicalScore
                  candidates->Array.push({
                    pair: piece,
                    path,
                    score,
                    label: Belt.Array.getUnsafe(labels, labelIndex),
                  })
                }
              | None => ()
              }
            }
          }
        }
      })
      candidates->Array.sort(comparePairs)
      let result = ref(None)
      for index in 0 to candidates->Array.length - 1 {
        if result.contents == None {
          let selected = Belt.Array.getUnsafe(candidates, index)
          let nextState = applyPath(state, selected.path)
          switch planLayerPiecesFrom(
            ~state=nextState,
            ~pieces,
            ~completed=completed->Array.concat([selected.pair]),
            ~baseCorners,
            ~baseEdges,
            ~corners,
            ~atomics,
            ~triggers,
            ~labels,
            ~failed,
          ) {
          | Some(rest) => result := Some([selected]->Array.concat(rest))
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

let findLayerPlanPieces = (
  ~state,
  ~pieces,
  ~baseCorners,
  ~baseEdges,
  ~corners,
  ~atomics,
  ~triggers,
  ~labels,
) => {
  let attempt = triggers =>
    planLayerPiecesFrom(
      ~state,
      ~pieces,
      ~completed=[],
      ~baseCorners,
      ~baseEdges,
      ~corners,
      ~atomics,
      ~triggers,
      ~labels,
      ~failed=Dict.make(),
    )
  let plan = switch attempt(triggers) {
  | Some(plan) => Some(plan)
  // A recognized trigger is an optimization, never a constraint. If its
  // continuation is incompatible with later locked pieces, retry exactly the
  // established generic planner before reporting a failure.
  | None if triggers->Array.length > 0 => attempt([])
  | None => None
  }
  plan
}

let planLayerPieces = (
  ~state,
  ~pieces,
  ~baseCorners,
  ~baseEdges,
  ~corners,
  ~atomics,
  ~triggers,
  ~labels,
) =>
  switch findLayerPlanPieces(
    ~state,
    ~pieces,
    ~baseCorners,
    ~baseEdges,
    ~corners,
    ~atomics,
    ~triggers,
    ~labels,
  ) {
  | None => throw(BuildFailure(BeginnerSolver.SearchFailed("optimized layer-by-layer insertion")))
  | Some(plan) => (
      plan,
      plan->Array.reduce(state, (current, selected) => applyPath(current, selected.path)),
    )
  }

// Middle-layer insertion has a compact, complete move set: U turns and the
// two standard left/right insertion algorithms. Search over those macros,
// rather than repeatedly running an 18-turn atomic DFS at every candidate
// branch. This is the same bounded construction used by the verified
// beginner solver, but preserves Advanced LBL's per-edge phase descriptions.
let planMiddleLayerPieces = (~state, ~solved, ~baseCorners, ~baseEdges, ~pieces, ~labels) => {
  let actions =
    BeginnerSolver.downTurns(solved)
    ->Array.concat(BeginnerSolver.macroVariants(solved, "U R U' R' U' F' U F"))
    ->Array.concat(BeginnerSolver.macroVariants(solved, "U' L' U L U F U' F'"))
  let current = ref(state)
  let plan = []
  for offset in 0 to pieces->Array.length - 1 {
    let targets =
      baseEdges->Array.concat(
        Belt.Array.makeBy(offset + 1, index => Belt.Array.getUnsafe(pieces, index)),
      )
    let projection = candidate => BeginnerSolver.projectionKey(candidate, baseCorners, targets)
    let goal = candidate => BeginnerSolver.lockedGoal(candidate, baseCorners, targets)
    let path = switch BeginnerSolver.searchMacros(
      ~state=current.contents,
      ~actions,
      ~isGoal=goal,
      ~projection,
      ~maxDepth=5,
    ) {
    | Some(path) => path
    | None => throw(BuildFailure(BeginnerSolver.SearchFailed("the middle-layer edges")))
    }
    plan->Array.push({
      pair: Belt.Array.getUnsafe(pieces, offset),
      path,
      score: BeginnerSolver.flattenActions(path)
      ->MoveTransform.rotate(~axis=X, ~turns=2)
      ->physicalScore,
      label: Belt.Array.getUnsafe(labels, offset),
    })
    current := applyPath(current.contents, path)
  }
  (plan, current.contents)
}

let solveLevel = (input: cubeState, level: level): result<solution, solverError> => {
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
    let (ollSignatures, _pllSignatures) = cachedCaseLibraries(solved)
    // Ranking F2L candidates on their own move cost alone can prefer a cheaper
    // prefix that lands on a far costlier OLL/PLL case. Score the last-layer
    // cost of the resulting state too, so a multi-candidate search (Advanced,
    // and any level's deeper fallback tiers) optimizes the whole solve.
    let tailCost = (state: PieceReducer.pieceState): int =>
      switch level {
      | Beginner => {
          let ollSelection = selectBeginnerOll(~state, ~solved)
          let pllSelection = selectBeginnerPll(~state=ollSelection.state, ~solved)
          physicalScore(ollSelection.alg) + physicalScore(pllSelection.alg)
        }
      | Full | Advanced =>
        switch selectOll(~state, ~solved, ~signatures=ollSignatures) {
        | None => 1000000
        | Some(ollSelection) =>
          switch selectPll(~state=ollSelection.state, ~solved) {
          | None => 1000000
          | Some(pllSelection) => physicalScore(ollSelection.alg) + physicalScore(pllSelection.alg)
          }
        }
      }

    let crossCandidate = switch level {
    | Advanced => selectCross(~state=current.contents, ~atomics)
    | Beginner | Full =>
      switch BeginnerSolver.searchAtomic(
        ~state=current.contents,
        ~corners=[],
        ~edges=[0, 1, 2, 3],
        ~actions=atomics->rankedActions,
        ~maxDepth=8,
      ) {
      | Some(path) => Some({path, candidates: 1})
      | None => None
      }
    }
    let crossSelection = switch crossCandidate {
    | Some(selection) => selection
    | None => throw(BuildFailure(BeginnerSolver.SearchFailed("a move-optimized white cross")))
    }
    let crossPath = crossSelection.path
    current := applyPath(current.contents, crossPath)
    if !BeginnerSolver.lockedGoal(current.contents, [], [0, 1, 2, 3]) {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }

    let fastF2lPlan = planF2lWithTail(
      ~state=current.contents,
      ~completed=[],
      ~atomics,
      ~maxDepth=11,
      ~maxNodes=180000,
      ~allSides=false,
      ~rootCandidates=if level == Advanced {
        3
      } else {
        1
      },
      ~failed=Dict.make(),
      ~tailCost,
    )
    let mediumF2lPlan = () =>
      planF2lWithTail(
        ~state=current.contents,
        ~completed=[],
        ~atomics,
        ~maxDepth=12,
        ~maxNodes=300000,
        ~allSides=true,
        ~rootCandidates=2,
        ~failed=Dict.make(),
        ~tailCost,
      )
    let f2lPlan = switch fastF2lPlan {
    | Some(plan, _) => plan
    | None =>
      switch mediumF2lPlan() {
      | Some(plan, _) => plan
      | None =>
        switch planF2lWithTail(
          ~state=current.contents,
          ~completed=[],
          ~atomics,
          ~maxDepth=12,
          ~maxNodes=600000,
          ~allSides=true,
          ~rootCandidates=4,
          ~failed=Dict.make(),
          ~tailCost,
        ) {
        | Some(plan, _) => plan
        | None =>
          throw(BuildFailure(BeginnerSolver.SearchFailed("four locked F2L corner-edge pairs")))
        }
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

    let ollSelection = switch level {
    | Beginner => selectBeginnerOll(~state=current.contents, ~solved)
    | Full | Advanced =>
      switch selectOll(~state=current.contents, ~solved, ~signatures=ollSignatures) {
      | Some(selection) => selection
      | None => throw(BuildFailure(BeginnerSolver.SearchFailed("one-look OLL recognition")))
      }
    }
    current := ollSelection.state
    if !BeginnerSolver.orientedLastCornersGoal(current.contents) {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }
    let pllSelection = switch level {
    | Beginner => selectBeginnerPll(~state=current.contents, ~solved)
    | Full | Advanced =>
      switch selectPll(~state=current.contents, ~solved) {
      | Some(selection) => selection
      | None => throw(BuildFailure(BeginnerSolver.SearchFailed("one-look PLL recognition")))
      }
    }
    current := pllSelection.state
    if !BeginnerSolver.solvedCubiesGoal(current.contents) {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }

    let hasPhysicalWork =
      crossPath->Array.length > 0 ||
      f2lAlg.contents->Array.length > 0 ||
      ollSelection.alg->Array.length > 0 ||
      pllSelection.alg->Array.length > 0
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
        let planning = if level == Advanced {
          ` after ranking ${crossSelection.candidates->Int.toString} candidate plans`
        } else {
          ""
        }
        crossLabels->Array.push(
          `Build the move-optimized white cross in ${crossPath
            ->Array.length
            ->Int.toString} moves${planning}.`,
        )
      }
    }
    let transformedF2l = f2lAlg.contents->MoveTransform.rotate(~axis=X, ~turns=2)
    let transformedOll = ollSelection.alg->MoveTransform.rotate(~axis=X, ~turns=2)
    let transformedPll = pllSelection.alg->MoveTransform.rotate(~axis=X, ~turns=2)
    let pllAlg = if hasPhysicalWork {
      transformedPll->Array.concat(grouped(whiteDown))
    } else {
      transformedPll
    }
    let pllLabels = pllSelection.labels->Array.map(label => label)
    if hasPhysicalWork {
      pllLabels->Array.push("Restore the canonical white-up export frame.")
    }
    let ollTitle = if level == Beginner {
      "Two-Look OLL"
    } else {
      "One-Look OLL"
    }
    let ollInstruction = if level == Beginner {
      "Orient last-layer edges first, then recognize and orient the corners."
    } else {
      "Recognize one of all 57 OLL cases and orient the complete last layer in one algorithm."
    }
    let pllTitle = if level == Beginner {
      "Two-Look PLL"
    } else {
      "One-Look PLL"
    }
    let pllInstruction = if level == Beginner {
      "Permute last-layer corners first, then solve the remaining edge cycle."
    } else {
      "Recognize one of all 21 PLL cases and permute the complete last layer in one algorithm."
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
      phase(3, ollTitle, ollInstruction, transformedOll->withPhasePause, ollSelection.labels),
      phase(4, pllTitle, pllInstruction, pllAlg, pllLabels),
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

let solveAdvancedLbl = (input: cubeState): result<solution, solverError> => {
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
    let cornerTriggers = advancedCornerTriggers(solved)
    let current = ref(start)

    let crossSelection = switch selectCross(~state=current.contents, ~atomics) {
    | Some(selection) => selection
    | None => throw(BuildFailure(BeginnerSolver.SearchFailed("a direct white cross")))
    }
    current := applyPath(current.contents, crossSelection.path)
    if !BeginnerSolver.lockedGoal(current.contents, [], [0, 1, 2, 3]) {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }
    let cornerNames = [
      "Insert the white–green–red first-layer corner with one optimized trigger.",
      "Insert the white–green–orange first-layer corner with one optimized trigger.",
      "Insert the white–blue–orange first-layer corner with one optimized trigger.",
      "Insert the white–blue–red first-layer corner with one optimized trigger.",
    ]
    let (cornerPlan, afterCorners) = planLayerPieces(
      ~state=current.contents,
      ~pieces=[0, 1, 2, 3],
      ~baseCorners=[],
      ~baseEdges=[0, 1, 2, 3],
      ~corners=true,
      ~atomics,
      ~triggers=cornerTriggers,
      ~labels=cornerNames,
    )
    current := afterCorners
    if !BeginnerSolver.lockedGoal(current.contents, [0, 1, 2, 3], [0, 1, 2, 3]) {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }
    let middleNames = [
      "Insert the green–red middle edge with an optimized left/right trigger.",
      "Insert the green–orange middle edge with an optimized left/right trigger.",
      "Insert the blue–orange middle edge with an optimized left/right trigger.",
      "Insert the blue–red middle edge with an optimized left/right trigger.",
    ]
    let (middlePlan, afterMiddle) = planMiddleLayerPieces(
      ~state=current.contents,
      ~solved,
      ~pieces=[8, 9, 10, 11],
      ~baseCorners=[0, 1, 2, 3],
      ~baseEdges=[0, 1, 2, 3],
      ~labels=middleNames,
    )
    current := afterMiddle
    if !BeginnerSolver.firstTwoLayersGoal(current.contents) {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }
    let combinedOll = selectBeginnerOll(~state=current.contents, ~solved)
    let (ollEdges, ollCorners) = splitSelectionAtGoal(
      ~state=current.contents,
      ~solved,
      ~selection=combinedOll,
      ~isGoal=BeginnerSolver.orientedLastEdgesGoal,
    )
    current := combinedOll.state
    if !BeginnerSolver.orientedLastCornersGoal(current.contents) {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }
    let combinedPll = selectBeginnerPll(~state=current.contents, ~solved)
    let (pllCorners, pllEdges) = splitSelectionAtGoal(
      ~state=current.contents,
      ~solved,
      ~selection=combinedPll,
      ~isGoal=BeginnerSolver.positionedLastCornersGoal,
    )
    current := combinedPll.state
    if !BeginnerSolver.solvedCubiesGoal(current.contents) {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }

    let cornerAlg =
      cornerPlan->Array.reduce([], (output, selected) =>
        output->Array.concat(grouped(BeginnerSolver.flattenActions(selected.path)))
      )
    let middleAlg =
      middlePlan->Array.reduce([], (output, selected) =>
        output->Array.concat(grouped(BeginnerSolver.flattenActions(selected.path)))
      )
    let hasPhysicalWork =
      crossSelection.path->Array.length > 0 ||
      cornerAlg->Array.length > 0 ||
      middleAlg->Array.length > 0 ||
      combinedOll.alg->Array.length > 0 ||
      combinedPll.alg->Array.length > 0
    let whiteDown = [located(Move(Rotation(X), 2))]
    let crossCore = BeginnerSolver.flattenActions(crossSelection.path)
    let crossAlg = ref(grouped(frameAlg))
    let crossLabels = []
    if frameAlg->Array.length > 0 {
      crossLabels->Array.push("Normalize the centre frame before planning the cross.")
    }
    if hasPhysicalWork {
      crossAlg := crossAlg.contents->Array.concat(grouped(whiteDown))
      crossLabels->Array.push("Regrip once so white stays on the bottom.")
      if crossCore->Array.length > 0 {
        crossAlg :=
          crossAlg.contents->Array.concat(
            grouped(crossCore->MoveTransform.rotate(~axis=X, ~turns=2)),
          )
        crossLabels->Array.push(
          `Build the direct white cross in ${crossSelection.path
            ->Array.length
            ->Int.toString} moves.`,
        )
      }
    }
    let transform = alg => alg->MoveTransform.rotate(~axis=X, ~turns=2)
    let finalEdges = if hasPhysicalWork {
      transform(pllEdges.alg)->Array.concat(grouped(whiteDown))
    } else {
      transform(pllEdges.alg)
    }
    let finalLabels = pllEdges.labels->Array.map(label => label)
    if hasPhysicalWork {
      finalLabels->Array.push("Restore the canonical white-up export frame.")
    }
    let phases = [
      phase(
        1,
        "Direct White Cross",
        "Build the complete white cross directly on the bottom without making a daisy.",
        crossAlg.contents->withPhasePause,
        crossLabels,
      ),
      phase(
        2,
        "First-Layer Corners",
        "Insert each white corner once while preserving the direct cross.",
        transform(cornerAlg)->withPhasePause,
        cornerPlan->Array.map(candidate => candidate.label),
      ),
      phase(
        3,
        "Middle-Layer Edges",
        "Insert each middle edge with an efficient trigger while preserving the first layer.",
        transform(middleAlg)->withPhasePause,
        middlePlan->Array.map(candidate => candidate.label),
      ),
      phase(
        4,
        "Yellow Cross",
        "Recognize the dot, line, or hook and orient all four last-layer edges.",
        transform(ollEdges.alg)->withPhasePause,
        ollEdges.labels,
      ),
      phase(
        5,
        "Orient Yellow Corners",
        "Recognize the corner case and orient the yellow face without repeated Sune spam.",
        transform(ollCorners.alg)->withPhasePause,
        ollCorners.labels,
      ),
      phase(
        6,
        "Permute Yellow Corners",
        "Recognize headlights or the diagonal case and position all last-layer corners.",
        transform(pllCorners.alg)->withPhasePause,
        pllCorners.labels,
      ),
      phase(
        7,
        "Permute Yellow Edges",
        "Finish with the recognized Ua, Ub, H, or Z edge permutation.",
        finalEdges,
        finalLabels,
      ),
    ]
    let annotated = phases->Array.reduce([], (output, item) =>
      output
      ->Array.concat([
        located(
          BlockComment(
            ` ADVANCED LBL ${item.number->Int.toString}: ${item.title} — ${item.instruction} `,
          ),
        ),
      ])
      ->Array.concat(item.alg)
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

let solveBeginner = input => solveLevel(input, Beginner)
let solveFull = input => solveLevel(input, Full)
let solveAdvanced = input => solveLevel(input, Advanced)

// Keep the original API on the strongest planner for existing integrations.
let solve = solveAdvanced
