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

let applyPath = (
  state: PieceReducer.pieceState,
  path: array<BeginnerSolver.action>,
) =>
  path->Array.reduce(state, (current, action) =>
    BeginnerSolver.applyCubie(current, action.transition)
  )

let maxInt = (left, right) => if left > right {left} else {right}

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
        if isGoal(current) {Some(path->Array.map(value => value))} else {None}
      } else {
        let key = BeginnerSolver.fullKey(current) ++
          "|" ++ previousFace->Int.toString ++ ":" ++ previousAxis->Int.toString
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
              found := dfs(
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
    let blockDistance = BeginnerSolver.atomicDistanceLowerBound(
      current,
      cornerTables,
      edgeTables,
    )
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

let solveBlockExpansion = (~state, ~atomics) => {
  let orders = [
    [AddCorner(2), AddEdge(3), AddEdge(10)],
    [AddCorner(2), AddEdge(10), AddEdge(3)],
    [AddEdge(3), AddCorner(2), AddEdge(10)],
    [AddEdge(3), AddEdge(10), AddCorner(2)],
    [AddEdge(10), AddCorner(2), AddEdge(3)],
    [AddEdge(10), AddEdge(3), AddCorner(2)],
  ]
  let found = ref(None)
  for orderIndex in 0 to orders->Array.length - 1 {
    if found.contents == None {
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
        found := Some((paths, current.contents))
      }
    }
  }
  found.contents
}

let solveTwoGeneratorF2l = (
  ~state: PieceReducer.pieceState,
  ~atomics: array<BeginnerSolver.action>,
) => {
  let twoGen = atomics->Array.filter((action: BeginnerSolver.action) =>
    action.faceIndex == BeginnerSolver.faceIndex(R) ||
      action.faceIndex == BeginnerSolver.faceIndex(D)
  )
  let tryOrder = firstRightWing => {
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
      ~maxDepth=14,
      ~maxNodes=2500000,
    ) {
    | None => None
    | Some(first) => {
        let afterFirst = applyPath(state, first)
        switch BeginnerSolver.searchAtomicWithLimit(
          ~state=afterFirst,
          ~corners=f2lCorners,
          ~edges=f2lEdges,
          ~actions=twoGen,
          ~maxDepth=14,
          ~maxNodes=2500000,
        ) {
        | None => None
        | Some(second) => Some((first, second, applyPath(afterFirst, second)))
        }
      }
    }
  }
  switch tryOrder(true) {
  | Some(result) => Some(result)
  | None => tryOrder(false)
  }
}

let splitSelectionAtGoal = (~state, ~solved, ~selection: CfopSolver.lastLayerSelection, ~isGoal) =>
  CfopSolver.splitSelectionAtGoal(~state, ~solved, ~selection, ~isGoal)

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
    if !isBlock222(current.contents) {throw(BuildFailure(BeginnerSolver.VerificationFailed))}

    let (block223Paths, block223State) = switch solveBlockExpansion(
      ~state=current.contents,
      ~atomics,
    ) {
    | Some(result) => result
    | None => throw(BuildFailure(BeginnerSolver.SearchFailed("the DBL 2×2×3 expansion")))
    }
    current := block223State
    if !isBlock223(current.contents) {throw(BuildFailure(BeginnerSolver.VerificationFailed))}

    let eoPath = switch solveEdgeOrientation(~state=current.contents, ~atomics) {
    | Some(path) => path
    | None => throw(BuildFailure(BeginnerSolver.SearchFailed("bad-edge orientation around the 2×2×3 block")))
    }
    current := applyPath(current.contents, eoPath)
    if !isPetrusEo(current.contents) {throw(BuildFailure(BeginnerSolver.VerificationFailed))}

    let (firstWing, secondWing, f2lState) = switch solveTwoGeneratorF2l(
      ~state=current.contents,
      ~atomics,
    ) {
    | Some(result) => result
    | None => throw(BuildFailure(BeginnerSolver.SearchFailed("the ⟨R,U⟩ Petrus F2L finish")))
    }
    current := f2lState
    if !BeginnerSolver.firstTwoLayersGoal(current.contents) || !edgesOriented(current.contents) {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }

    let combinedOll = CfopSolver.selectBeginnerOll(~state=current.contents, ~solved)
    let (_, ollCorners) = splitSelectionAtGoal(
      ~state=current.contents,
      ~solved,
      ~selection=combinedOll,
      ~isGoal=BeginnerSolver.orientedLastEdgesGoal,
    )
    current := combinedOll.state
    if !BeginnerSolver.orientedLastCornersGoal(current.contents) {
      throw(BuildFailure(BeginnerSolver.VerificationFailed))
    }

    let combinedPll = CfopSolver.selectBeginnerPll(~state=current.contents, ~solved)
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

    let hasPhysicalWork =
      block222Path->Array.length > 0 ||
      block223Paths->Array.some(path => path->Array.length > 0) ||
      eoPath->Array.length > 0 ||
      firstWing->Array.length > 0 ||
      secondWing->Array.length > 0 ||
      ollCorners.alg->Array.length > 0 ||
      pllCorners.alg->Array.length > 0 ||
      pllEdges.alg->Array.length > 0
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
    let block223Alg = block223Paths->Array.reduce([], (output, path) =>
      output->Array.concat(grouped(transform(BeginnerSolver.flattenActions(path))))
    )
    let eoAlg = transform(BeginnerSolver.flattenActions(eoPath))
    let firstWingAlg = transform(BeginnerSolver.flattenActions(firstWing))
    let secondWingAlg = transform(BeginnerSolver.flattenActions(secondWing))
    let f2lAlg = grouped(firstWingAlg)->Array.concat(grouped(secondWingAlg))
    let cornerAlg = transform(ollCorners.alg)
    let cornerPermutationAlg = transform(pllCorners.alg)
    let finalEdges = if hasPhysicalWork {
      transform(pllEdges.alg)->Array.concat(grouped(whiteDown))
    } else {
      transform(pllEdges.alg)
    }

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
    | Classical => common->Array.concat([
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
    | Enhanced => {
        let collAlg = grouped(cornerAlg->Array.concat(cornerPermutationAlg))
        let lastLayerAlg = collAlg->Array.concat(finalEdges)
        let labels = [
          "COLL: orient and position all four last-layer corners with EO preserved.",
          "EPLL: finish the remaining Ua, Ub, H, or Z edge case.",
        ]
        common->Array.concat([
          phase(
            5,
            "COLL + EPLL Finish",
            "Solve the last-layer corners with an EO-preserving COLL sequence, then execute one EPLL.",
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
