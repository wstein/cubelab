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
type method = Classical | Enhanced

type searchNode = {
  state: PieceReducer.pieceState,
  path: array<BeginnerSolver.action>,
}

exception BuildFailure(solverError)

let generatedLoc = {start: 0, end_: 0}
let located = desc => {desc, loc: generatedLoc}
let describeError = BeginnerSolver.describeError

// The internal white-up frame is displayed through x2, so this UFL anchor is
// the physical DBL block. The expanded U-left slab leaves physical R/U free.
let block222Corners = [1]
let block222Edges = [1, 2, 9]
let block223Corners = [1, 2]
let block223Edges = [1, 2, 3, 9, 10]
let f2lCorners = [0, 1, 2, 3]
let f2lEdges = [0, 1, 2, 3, 8, 9, 10, 11]

let isBlock222 = state => BeginnerSolver.lockedGoal(state, block222Corners, block222Edges)
let isBlock223 = state => BeginnerSolver.lockedGoal(state, block223Corners, block223Edges)
let edgesOriented = (state: PieceReducer.pieceState) => state.eo->Array.every(value => value == 0)
let isPetrusEo = state => isBlock223(state) && edgesOriented(state)

let phase = (number, title, instruction, alg, sequences) => {
  number,
  title,
  instruction,
  alg,
  sequences,
}

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

let applyPath = (state: PieceReducer.pieceState, path: array<BeginnerSolver.action>) =>
  path->Array.reduce(state, (current, action) =>
    BeginnerSolver.applyCubie(current, action.transition)
  )

let maxInt = (left, right) =>
  if left > right {
    left
  } else {
    right
  }

let searchGoal = (
  ~state: PieceReducer.pieceState,
  ~actions: array<BeginnerSolver.action>,
  ~isGoal,
  ~heuristic,
  ~maxDepth,
  ~maxNodes,
): option<array<BeginnerSolver.action>> => {
  if isGoal(state) {
    Some([])
  } else {
    let rec dfs = (current, remaining, previousFace, previousAxis, path, seen, nodes) => {
      nodes := nodes.contents + 1
      if nodes.contents > maxNodes || heuristic(current) > remaining {
        None
      } else if remaining == 0 {
        if isGoal(current) {
          Some(path->Array.map(value => value))
        } else {
          None
        }
      } else {
        let key =
          BeginnerSolver.fullKey(current) ++
          "|" ++
          previousFace->Int.toString ++
          ":" ++
          previousAxis->Int.toString
        let alreadySeen = switch Dict.get(seen, key) {
        | Some(depth) => depth >= remaining
        | None => false
        }
        if alreadySeen {
          None
        } else {
          Dict.set(seen, key, remaining)
          let found = ref(None)
          for index in 0 to actions->Array.length - 1 {
            let action = Belt.Array.getUnsafe(actions, index)
            let sameFace = action.faceIndex == previousFace
            let reorderedOpposite =
              action.axisIndex == previousAxis && action.faceIndex < previousFace
            if found.contents == None && !sameFace && !reorderedOpposite {
              path->Array.push(action)
              found :=
                dfs(
                  BeginnerSolver.applyCubie(current, action.transition),
                  remaining - 1,
                  action.faceIndex,
                  action.axisIndex,
                  path,
                  seen,
                  nodes,
                )
              path->Array.pop->ignore
            }
          }
          found.contents
        }
      }
    }
    let found = ref(None)
    for depth in 1 to maxDepth {
      if found.contents == None {
        found := dfs(state, depth, -1, -1, [], Dict.make(), ref(0))
      }
    }
    found.contents
  }
}

let solveEdgeOrientation = (
  ~state: PieceReducer.pieceState,
  ~atomics: array<BeginnerSolver.action>,
) => {
  let (cornerTables, edgeTables) = BeginnerSolver.atomicDistanceTables(
    ~corners=block223Corners,
    ~edges=block223Edges,
    ~actions=atomics,
  )
  let heuristic = current => {
    let blockDistance = BeginnerSolver.atomicDistanceLowerBound(current, cornerTables, edgeTables)
    let badEdges = current.eo->Array.filter(value => value != 0)->Array.length
    maxInt(blockDistance, (badEdges + 3) / 4)
  }
  searchGoal(
    ~state,
    ~actions=atomics,
    ~isGoal=isPetrusEo,
    ~heuristic,
    ~maxDepth=9,
    ~maxNodes=3500000,
  )
}

type blockAddition = AddCorner(int) | AddEdge(int)

type blockExpansion = {
  paths: array<array<BeginnerSolver.action>>,
  state: PieceReducer.pieceState,
}

type f2lProgress = {
  expansion: blockExpansion,
  eoPath: array<BeginnerSolver.action>,
  firstWing: array<BeginnerSolver.action>,
  secondWing: array<BeginnerSolver.action>,
  state: PieceReducer.pieceState,
}

let solveBlockExpansions = (~state, ~atomics) => {
  let orders = [
    [AddCorner(2), AddEdge(3), AddEdge(10)],
    [AddCorner(2), AddEdge(10), AddEdge(3)],
    [AddEdge(3), AddCorner(2), AddEdge(10)],
    [AddEdge(3), AddEdge(10), AddCorner(2)],
    [AddEdge(10), AddCorner(2), AddEdge(3)],
    [AddEdge(10), AddEdge(3), AddCorner(2)],
  ]
  let found = []
  for orderIndex in 0 to orders->Array.length - 1 {
    let current = ref(state)
    let corners = block222Corners->Array.map(piece => piece)
    let edges = block222Edges->Array.map(piece => piece)
    let paths = []
    let failed = ref(false)
    let order = Belt.Array.getUnsafe(orders, orderIndex)
    order->Array.forEach(addition => {
      if !failed.contents {
        switch addition {
        | AddCorner(piece) => corners->Array.push(piece)
        | AddEdge(piece) => edges->Array.push(piece)
        }
        switch BeginnerSolver.searchAtomicWithLimit(
          ~state=current.contents,
          ~corners,
          ~edges,
          ~actions=atomics,
          ~maxDepth=10,
          ~maxNodes=750000,
        ) {
        | None => failed := true
        | Some(path) => {
            paths->Array.push(path)
            current := applyPath(current.contents, path)
          }
        }
      }
    })
    if !failed.contents && isBlock223(current.contents) {
      found->Array.push({paths, state: current.contents})
    }
  }
  found
}

let solveBlockExpansion = (~state, ~atomics) => {
  let expansions = solveBlockExpansions(~state, ~atomics)
  switch Belt.Array.get(expansions, 0) {
  | None => None
  | Some(first) => Some((first.paths, first.state))
  }
}

let solveTwoGeneratorF2l = (
  ~state: PieceReducer.pieceState,
  ~atomics: array<BeginnerSolver.action>,
) => {
  let twoGen =
    atomics->Array.filter((action: BeginnerSolver.action) =>
      action.faceIndex == BeginnerSolver.faceIndex(R) ||
        action.faceIndex == BeginnerSolver.faceIndex(D)
    )
  let tryOrder = (firstRightWing, maxDepth, maxNodes) => {
    let firstCorners = if firstRightWing {
      block223Corners->Array.concat([0])
    } else {
      block223Corners->Array.concat([3])
    }
    let firstEdges = if firstRightWing {
      block223Edges->Array.concat([0, 8])
    } else {
      block223Edges->Array.concat([0, 11])
    }
    switch BeginnerSolver.searchAtomicWithLimit(
      ~state,
      ~corners=firstCorners,
      ~edges=firstEdges,
      ~actions=twoGen,
      ~maxDepth,
      ~maxNodes,
    ) {
    | None => None
    | Some(first) => {
        let afterFirst = applyPath(state, first)
        switch BeginnerSolver.searchAtomicWithLimit(
          ~state=afterFirst,
          ~corners=f2lCorners,
          ~edges=f2lEdges,
          ~actions=twoGen,
          ~maxDepth,
          ~maxNodes,
        ) {
        | None => None
        | Some(second) => Some((first, second, applyPath(afterFirst, second)))
        }
      }
    }
  }
  switch tryOrder(true, 14, 2500000) {
  | Some(result) => Some(result)
  | None => tryOrder(false, 14, 2500000)
  }
}

let completeF2l = (~expansion: blockExpansion, ~atomics): option<f2lProgress> => {
  switch solveEdgeOrientation(~state=expansion.state, ~atomics) {
  | None => None
  | Some(eoPath) => {
      let afterEo = applyPath(expansion.state, eoPath)
      if !isPetrusEo(afterEo) {
        None
      } else {
        switch solveTwoGeneratorF2l(~state=afterEo, ~atomics) {
        | None => None
        | Some((firstWing, secondWing, state)) =>
          if BeginnerSolver.firstTwoLayersGoal(state) && edgesOriented(state) {
            Some({expansion, eoPath, firstWing, secondWing, state})
          } else {
            None
          }
        }
      }
    }
  }
}

let splitSelectionAtGoal = (~state, ~solved, ~selection: CfopSolver.lastLayerSelection, ~isGoal) =>
  CfopSolver.splitSelectionAtGoal(~state, ~solved, ~selection, ~isGoal)

type collSelection = {
  alg: alg,
  labels: array<string>,
  state: PieceReducer.pieceState,
  caseId: string,
}

type collRecognition = {caseId: string, yTurns: int}

let collKey = (state: PieceReducer.pieceState) =>
  [4, 5, 6, 7]
  ->Array.map(slot => Belt.Array.getUnsafe(state.cp, slot)->Int.toString)
  ->Array.join("") ++
  "|" ++
  [4, 5, 6, 7]
  ->Array.map(slot => Belt.Array.getUnsafe(state.co, slot)->Int.toString)
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

let normalizedCollKey = (~state, ~solved) => {
  let best = ref(collKey(state))
  for turns in 1 to 3 {
    let candidate = collKey(applyDown(state, solved, turns))
    if candidate < best.contents {
      best := candidate
    }
  }
  best.contents
}

let collBaseAlg = algorithm => {
  let parsed = BeginnerSolver.parseInternal(algorithm)
  switch Belt.Array.get(parsed, 0) {
  | Some({desc: Move(FaceTurn(U, _), _)}) =>
    parsed->Array.slice(~start=1, ~end=parsed->Array.length)
  | _ => parsed
  }
}

let appendActionGroup = (output: alg, action: BeginnerSolver.action) => {
  output->Array.push(located(Group(action.alg, 1)))
  output->Array.push(located(TimedPause(0.5)))
}

let physicalMoveCount = (candidate: alg) =>
  switch MoveExecutor.expand(candidate) {
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

let validateCollLibrary = solved => {
  if PetrusCases.coll->Array.length != 40 {
    throw(BuildFailure(BeginnerSolver.VerificationFailed))
  }
  let baseSignatures = Dict.make()
  let signatures: Dict.t<collRecognition> = Dict.make()
  PetrusCases.coll->Array.forEach(entry => {
    for yTurns in 0 to 3 {
      let action = BeginnerSolver.macroVariant(solved, collBaseAlg(entry.algorithm), yTurns)
      let setup = BeginnerSolver.transitionForAlg(solved, MoveTransform.invert(action.alg))
      if !BeginnerSolver.firstTwoLayersGoal(setup) || !edgesOriented(setup) {
        throw(BuildFailure(BeginnerSolver.VerificationFailed))
      }
      let replay = BeginnerSolver.applyCubie(setup, action.transition)
      if !BeginnerSolver.solvedCubiesGoal(replay) {
        throw(BuildFailure(BeginnerSolver.VerificationFailed))
      }
      let signature = normalizedCollKey(~state=setup, ~solved)
      if yTurns == 0 {
        if Dict.get(baseSignatures, signature) != None {
          throw(BuildFailure(BeginnerSolver.VerificationFailed))
        }
        Dict.set(baseSignatures, signature, entry.id)
      }
      if Dict.get(signatures, signature) == None {
        Dict.set(signatures, signature, {caseId: entry.id, yTurns})
      }
    }
  })
  signatures
}

let collLibraryCache = ref(None)
let cachedCollLibrary = solved =>
  switch collLibraryCache.contents {
  | Some(signatures) => signatures
  | None => {
      let signatures = validateCollLibrary(solved)
      collLibraryCache := Some(signatures)
      signatures
    }
  }

let selectColl = (~state, ~solved, ~signatures): option<collSelection> => {
  let skip = ref(None)
  if BeginnerSolver.orientedLastCornersGoal(state) {
    for turns in 0 to 3 {
      let after = applyDown(state, solved, turns)
      if skip.contents == None && BeginnerSolver.positionedLastCornersGoal(after) {
        let alg = []
        let labels = ["COLL skip — corners already oriented and permuted."]
        switch downAction(solved, turns) {
        | Some(auf) => {
            appendActionGroup(alg, auf)
            labels->Array.push("COLL AUF: align all four solved corners.")
          }
        | None => ()
        }
        skip := Some({alg, labels, state: after, caseId: "Skip"})
      }
    }
    if skip.contents == None {
      let combinedPll = CfopSolver.selectBeginnerPll(~state, ~solved)
      let (pllCorners, _) = splitSelectionAtGoal(
        ~state,
        ~solved,
        ~selection=combinedPll,
        ~isGoal=BeginnerSolver.positionedLastCornersGoal,
      )
      skip :=
        Some({
          alg: pllCorners.alg,
          labels: pllCorners.labels,
          state: pllCorners.state,
          caseId: "Oriented (Corner Permutation)",
        })
    }
  }
  switch skip.contents {
  | Some(selection) => Some(selection)
  | None => {
      let signature = normalizedCollKey(~state, ~solved)
      switch Dict.get(signatures, signature) {
      | None => None
      | Some(recognition) =>
        switch PetrusCases.coll->Array.find(entry => entry.id == recognition.caseId) {
        | None => None
        | Some(entry) => {
            let action = BeginnerSolver.macroVariant(
              solved,
              collBaseAlg(entry.algorithm),
              recognition.yTurns,
            )
            let best = ref(None)
            let bestScore = ref(1000000)
            for preTurns in 0 to 3 {
              let aligned = applyDown(state, solved, preTurns)
              let transformed = BeginnerSolver.applyCubie(aligned, action.transition)
              for postTurns in 0 to 3 {
                let after = applyDown(transformed, solved, postTurns)
                if (
                  BeginnerSolver.firstTwoLayersGoal(after) &&
                  edgesOriented(after) &&
                  BeginnerSolver.orientedLastCornersGoal(after) &&
                  BeginnerSolver.positionedLastCornersGoal(after)
                ) {
                  let candidate = []
                  let labels = []
                  switch downAction(solved, preTurns) {
                  | Some(auf) => {
                      appendActionGroup(candidate, auf)
                      labels->Array.push("AUF: align the recognized COLL case.")
                    }
                  | None => ()
                  }
                  appendActionGroup(candidate, action)
                  labels->Array.push(
                    `COLL ${entry.id} · ${entry.family} — orient and permute all four corners.`,
                  )
                  switch downAction(solved, postTurns) {
                  | Some(auf) => {
                      appendActionGroup(candidate, auf)
                      labels->Array.push("COLL AUF: align all four solved corners.")
                    }
                  | None => ()
                  }
                  let score = physicalMoveCount(candidate->MoveTransform.rotate(~axis=X, ~turns=2))
                  if score < bestScore.contents {
                    bestScore := score
                    best := Some({alg: candidate, labels, state: after, caseId: entry.id})
                  }
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

let annotatedSolution = (~input, ~solved, ~phases) => {
  let annotated = phases->Array.reduce([], (output, item) =>
    output
    ->Array.concat([
      located(
        BlockComment(
          ` PETRUS ${item.number->Int.toString}: ${item.title} — ${item.instruction} `,
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
  {phases, alg: annotated, moveCount}
}

let solveMethod = (input: cubeState, method): result<solution, solverError> => {
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
    let current = ref(
      switch PieceReducer.reduce(orientedState) {
      | Ok(pieces) => pieces
      | Error(error) => throw(BuildFailure(BeginnerSolver.InvalidState(error)))
      },
    )
    let atomics = BeginnerSolver.atomicActions(solved)

    let block222Path = switch BeginnerSolver.searchAtomic(
      ~state=current.contents,
      ~corners=block222Corners,
      ~edges=block222Edges,
      ~actions=atomics,
      ~maxDepth=8,
    ) {
    | Some(path) => path
    | None => throw(BuildFailure(BeginnerSolver.SearchFailed("a DBL 2×2×2 block")))
    }
    current := applyPath(current.contents, block222Path)
    if !isBlock222(current.contents) {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }

    let expansions = solveBlockExpansions(~state=current.contents, ~atomics)
    if expansions->Array.length == 0 {
      throw(BuildFailure(BeginnerSolver.SearchFailed("the DBL 2×2×3 expansion")))
    }
    // Keep the expansion ordering deterministic, but do not reject a valid
    // Petrus state merely because its first 2×2×3 order lies outside the
    // strict two-generator finish subgroup.
    let (progress, enhancedFinish) = switch method {
    | Classical => {
        let selected = ref(None)
        expansions->Array.forEach(expansion => {
          if selected.contents == None {
            selected := completeF2l(~expansion, ~atomics)
          }
        })
        switch selected.contents {
        | Some(value) => (value, None)
        | None =>
          throw(BuildFailure(BeginnerSolver.SearchFailed("the ⟨R,U⟩ Petrus F2L finish")))
        }
      }
    | Enhanced => {
        let signatures = cachedCollLibrary(solved)
        let best = ref(None)
        let bestScore = ref(1000000)
        let enhancedExpansions = [
          Belt.Array.getUnsafe(
            expansions,
            if expansions->Array.length > 2 {
              2
            } else {
              0
            },
          ),
          Belt.Array.getUnsafe(expansions, 0),
        ]
        enhancedExpansions->Array.forEach(expansion => {
          switch completeF2l(~expansion, ~atomics) {
          | None => ()
          | Some(candidate) =>
            switch selectColl(~state=candidate.state, ~solved, ~signatures) {
            | None => ()
            | Some(coll) =>
              switch CfopSolver.selectPll(~state=coll.state, ~solved) {
              | None => ()
              | Some(epll) =>
                if BeginnerSolver.solvedCubiesGoal(epll.state) {
                  let score =
                    candidate.expansion.paths->Array.reduce(0, (total, path) =>
                      total + path->Array.length
                    ) +
                    candidate.eoPath->Array.length +
                    candidate.firstWing->Array.length +
                    candidate.secondWing->Array.length +
                    physicalMoveCount(coll.alg) +
                    physicalMoveCount(epll.alg)
                  if score < bestScore.contents {
                    bestScore := score
                    best := Some((candidate, coll, epll))
                  }
                }
              }
            }
          }
        })
        switch best.contents {
        | Some((candidate, coll, epll)) => (candidate, Some((coll, epll)))
        | None =>
          throw(BuildFailure(BeginnerSolver.SearchFailed("a replay-valid Enhanced Petrus finish")))
        }
      }
    }
    let block223Paths = progress.expansion.paths
    let eoPath = progress.eoPath
    let firstWing = progress.firstWing
    let secondWing = progress.secondWing
    current := progress.state

    let hasPhysicalWork =
      block222Path->Array.length > 0 ||
      block223Paths->Array.some(path => path->Array.length > 0) ||
      eoPath->Array.length > 0 ||
      firstWing->Array.length > 0 ||
      secondWing->Array.length > 0 ||
      !BeginnerSolver.solvedCubiesGoal(current.contents)
    let whiteDown = [located(Move(Rotation(X), 2))]
    let transform = alg => alg->MoveTransform.rotate(~axis=X, ~turns=2)
    let firstAlg = ref(grouped(frameAlg))
    let firstLabels = []
    if frameAlg->Array.length > 0 {
      firstLabels->Array.push("Normalize the centre frame before block planning.")
    }
    if hasPhysicalWork {
      firstAlg := firstAlg.contents->Array.concat(grouped(whiteDown))
      firstLabels->Array.push("Place the DBL anchor at the working corner.")
    }
    let block222Alg = BeginnerSolver.flattenActions(block222Path)
    if block222Alg->Array.length > 0 {
      firstAlg := firstAlg.contents->Array.concat(grouped(transform(block222Alg)))
      firstLabels->Array.push("Connect the DB, DL, and BL edges to the DBL corner.")
    }
    let block223Alg =
      block223Paths->Array.reduce([], (output, path) =>
        output->Array.concat(grouped(transform(BeginnerSolver.flattenActions(path))))
      )
    let eoAlg = transform(BeginnerSolver.flattenActions(eoPath))
    let firstWingAlg = transform(BeginnerSolver.flattenActions(firstWing))
    let secondWingAlg = transform(BeginnerSolver.flattenActions(secondWing))
    let f2lAlg = grouped(firstWingAlg)->Array.concat(grouped(secondWingAlg))
    let common = [
      phase(
        1,
        "Build a 2×2×2 Block",
        "Build the DBL corner block from one corner and its three adjacent edges.",
        firstAlg.contents->withPhasePause,
        firstLabels,
      ),
      phase(
        2,
        "Expand to 2×2×3",
        "Extend the anchor through the left slab while keeping physical R and U free.",
        block223Alg->withPhasePause,
        [
          "Add the next DFL expansion piece while preserving the 2×2×2 anchor.",
          "Connect the second expansion piece to the growing left slab.",
          "Lock the final DFL, DF, or FL piece to complete the 2×2×3 block.",
        ],
      ),
      phase(
        3,
        "Orient Bad Edges",
        "Fix every bad edge while preserving the complete 2×2×3 block.",
        grouped(eoAlg)->withPhasePause,
        ["Turn the amber bad-edge set into one fully oriented edge group."],
      ),
      phase(
        4,
        "2-Generator F2L Finish",
        "Complete the remaining first-two-layer pieces using only physical R and U turns.",
        f2lAlg->withPhasePause,
        [
          "Solve the first free R/U wing without disturbing the block or EO.",
          "Close the final R/U wing with edge orientation locked.",
        ],
      ),
    ]
    let phases = switch method {
    | Classical => {
        let combinedOll = CfopSolver.selectBeginnerOll(~state=current.contents, ~solved)
        let (_, ollCorners) = splitSelectionAtGoal(
          ~state=current.contents,
          ~solved,
          ~selection=combinedOll,
          ~isGoal=BeginnerSolver.orientedLastEdgesGoal,
        )
        let afterOll = combinedOll.state
        if !BeginnerSolver.orientedLastCornersGoal(afterOll) {
          throw(BuildFailure(BeginnerSolver.VerificationFailed))
        }
        let combinedPll = CfopSolver.selectBeginnerPll(~state=afterOll, ~solved)
        let (pllCorners, pllEdges) = splitSelectionAtGoal(
          ~state=afterOll,
          ~solved,
          ~selection=combinedPll,
          ~isGoal=BeginnerSolver.positionedLastCornersGoal,
        )
        if !BeginnerSolver.solvedCubiesGoal(combinedPll.state) {
          throw(BuildFailure(BeginnerSolver.VerificationFailed))
        }
        let cornerAlg = transform(ollCorners.alg)
        let cornerPermutationAlg = transform(pllCorners.alg)
        let finalEdges = if hasPhysicalWork {
          transform(pllEdges.alg)->Array.concat(grouped(whiteDown))
        } else {
          transform(pllEdges.alg)
        }
        common->Array.concat([
          phase(
            5,
            "Orient Last-Layer Corners",
            "Use the recognized Sune-family case; the yellow edge cross stays oriented.",
            cornerAlg->withPhasePause,
            ollCorners.labels,
          ),
          phase(
            6,
            "Permute Last-Layer Corners",
            "Position adjacent or diagonal last-layer corners while preserving edge orientation.",
            cornerPermutationAlg->withPhasePause,
            pllCorners.labels,
          ),
          phase(
            7,
            "Permute Last-Layer Edges",
            "Finish with the recognized Ua, Ub, H, or Z edge permutation.",
            finalEdges,
            pllEdges.labels,
          ),
        ])
      }
    | Enhanced => {
        let (coll, epll) = switch enhancedFinish {
        | Some(finish) => finish
        | None => throw(BuildFailure(BeginnerSolver.VerificationFailed))
        }
        if !BeginnerSolver.solvedCubiesGoal(epll.state) {
          throw(BuildFailure(BeginnerSolver.VerificationFailed))
        }
        let lastLayerAlg = grouped(transform(coll.alg))->Array.concat(
          if hasPhysicalWork {
            transform(epll.alg)->Array.concat(grouped(whiteDown))
          } else {
            transform(epll.alg)
          },
        )
        let labels = coll.labels->Array.concat(epll.labels->Array.map(label => "EPLL: " ++ label))
        common->Array.concat([
          phase(
            5,
            "COLL + EPLL Finish",
            "Recognize and execute one EO-preserving COLL case, then finish the remaining EPLL.",
            lastLayerAlg,
            labels,
          ),
        ])
      }
    }
    Ok(annotatedSolution(~input, ~solved, ~phases))
  } catch {
  | BuildFailure(error) => Error(error)
  | BeginnerSolver.BuildFailure(error) => Error(error)
  | CfopSolver.BuildFailure(error) => Error(error)
  }
}

let solveClassical = input => solveMethod(input, Classical)
let solveEnhanced = input => solveMethod(input, Enhanced)
let solve = solveClassical
