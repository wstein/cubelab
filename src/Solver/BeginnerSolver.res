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

type solverError =
  | UnsupportedSize(int)
  | InvalidState(PieceReducer.pieceError)
  | SearchFailed(string)
  | ExpansionFailed(MoveExecutor.executionError)
  | VerificationFailed

type action = {
  alg: alg,
  transition: PieceReducer.pieceState,
  faceIndex: int,
  axisIndex: int,
}

type searchNode = {
  state: PieceReducer.pieceState,
  path: array<action>,
}

exception BuildFailure(solverError)

let generatedLoc = {start: 0, end_: 0}
let located = desc => {desc, loc: generatedLoc}
let outerRange = {from_: 1, to_: 1}
let maxAtomicNodes = 2500000

let describeError = error =>
  switch error {
  | UnsupportedSize(size) =>
    `The beginner tutorial solver supports 3×3×3, not ${size->Int.toString}×${size->Int.toString}×${size->Int.toString}.`
  | InvalidState(error) => PieceReducer.describeError(error)
  | SearchFailed(phase) =>
    `The bounded beginner-method search could not complete ${phase}. The input state was left unchanged.`
  | ExpansionFailed(MoveExecutor.InvalidState(message)) => message
  | ExpansionFailed(MoveExecutor.ExpansionLimitExceeded(limit)) =>
    `The generated tutorial exceeded the ${limit->Int.toString}-move safety limit.`
  | VerificationFailed => "The generated tutorial failed exact facelet replay verification. The input state was left unchanged."
  }

let concatAlg = (left: alg, right: alg): alg => left->Array.concat(right)

let faceIndex = face =>
  switch face {
  | U => 0
  | D => 1
  | R => 2
  | L => 3
  | F => 4
  | B => 5
  }

let axisIndex = face =>
  switch face {
  | U | D => 0
  | R | L => 1
  | F | B => 2
  }

let applyCubie = (
  state: PieceReducer.pieceState,
  transition: PieceReducer.pieceState,
): PieceReducer.pieceState => {
  size: 3,
  cp: transition.cp->Array.map(source => Belt.Array.getUnsafe(state.cp, source)),
  co: transition.cp->Array.mapWithIndex((source, target) =>
    (Belt.Array.getUnsafe(state.co, source) + Belt.Array.getUnsafe(transition.co, target)) % 3
  ),
  ep: transition.ep->Array.map(source => Belt.Array.getUnsafe(state.ep, source)),
  eo: transition.ep->Array.mapWithIndex((source, target) =>
    (Belt.Array.getUnsafe(state.eo, source) + Belt.Array.getUnsafe(transition.eo, target)) % 2
  ),
}

let transitionForAlg = (solved, alg) =>
  switch MoveExecutor.applyAlg(solved, alg) {
  | Error(error) => throw(BuildFailure(ExpansionFailed(error)))
  | Ok(state) =>
    switch PieceReducer.reduce(state) {
    | Error(error) => throw(BuildFailure(InvalidState(error)))
    | Ok(pieces) => pieces
    }
  }

let atomicActions = solved => {
  let actions = []
  let faces = [U, D, R, L, F, B]
  let turns = [1, 2, -1]
  faces->Array.forEach(face =>
    turns->Array.forEach(turn => {
      let alg = [located(Move(FaceTurn(face, outerRange), turn))]
      actions->Array.push({
        alg,
        transition: transitionForAlg(solved, alg),
        faceIndex: faceIndex(face),
        axisIndex: axisIndex(face),
      })
    })
  )
  actions
}

let isSolvedCorner = (state: PieceReducer.pieceState, piece) =>
  Belt.Array.getUnsafe(state.cp, piece) == piece && Belt.Array.getUnsafe(state.co, piece) == 0

let isSolvedEdge = (state: PieceReducer.pieceState, piece) =>
  Belt.Array.getUnsafe(state.ep, piece) == piece && Belt.Array.getUnsafe(state.eo, piece) == 0

let lockedGoal = (state, corners, edges) =>
  corners->Array.every(piece => isSolvedCorner(state, piece)) &&
    edges->Array.every(piece => isSolvedEdge(state, piece))

let findPiece = (permutation, piece) => {
  let slot = permutation->Array.findIndex(candidate => candidate == piece)
  if slot == -1 {
    throw(BuildFailure(SearchFailed("piece identification")))
  }
  slot
}

let projectionKey = (state: PieceReducer.pieceState, corners, edges) => {
  let cornerKey =
    corners
    ->Array.map(piece => {
      let slot = findPiece(state.cp, piece)
      (slot * 3 + Belt.Array.getUnsafe(state.co, slot))->Int.toString
    })
    ->Array.join(",")
  let edgeKey =
    edges
    ->Array.map(piece => {
      let slot = findPiece(state.ep, piece)
      (slot * 2 + Belt.Array.getUnsafe(state.eo, slot))->Int.toString
    })
    ->Array.join(",")
  cornerKey ++ "|" ++ edgeKey
}

let searchAtomic = (~state, ~corners, ~edges, ~actions, ~maxDepth) => {
  if lockedGoal(state, corners, edges) {
    Some([])
  } else {
    let rec dfs = (current, remaining, previousFace, previousAxis, path, seen, nodes) => {
      nodes := nodes.contents + 1
      if nodes.contents > maxAtomicNodes {
        None
      } else if remaining == 0 {
        if lockedGoal(current, corners, edges) {
          Some(path->Array.map(value => value))
        } else {
          None
        }
      } else {
        let key = projectionKey(current, corners, edges)
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
            let candidate = Belt.Array.getUnsafe(actions, index)
            let sameFace = candidate.faceIndex == previousFace
            let reorderedOpposite =
              candidate.axisIndex == previousAxis && candidate.faceIndex < previousFace
            if found.contents == None && !sameFace && !reorderedOpposite {
              path->Array.push(candidate)
              found :=
                dfs(
                  applyCubie(current, candidate.transition),
                  remaining - 1,
                  candidate.faceIndex,
                  candidate.axisIndex,
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
        let seen = Dict.make()
        let nodes = ref(0)
        found := dfs(state, depth, -1, -1, [], seen, nodes)
      }
    }
    found.contents
  }
}

let flattenActions = actions =>
  actions->Array.reduce([], (output, action) => concatAlg(output, action.alg))

let parseInternal = input =>
  switch MoveParser.parse(~size=3, input) {
  | Ok(alg) => alg
  | Error(_) => throw(BuildFailure(SearchFailed("an internal beginner algorithm")))
  }

let macroAction = (solved, alg) => {
  alg,
  transition: transitionForAlg(solved, alg),
  faceIndex: -1,
  axisIndex: -1,
}

let downLayerVariant = (alg, yTurns) =>
  alg
  ->MoveTransform.rotate(~axis=Y, ~turns=yTurns)
  ->MoveTransform.rotate(~axis=X, ~turns=2)

let macroVariants = (solved, source) => {
  let base = parseInternal(source)
  [0, 1, 2, 3]->Array.map(yTurns => macroAction(solved, downLayerVariant(base, yTurns)))
}

let downTurns = solved =>
  [1, 2, -1]->Array.map(turn => {
    let alg = [located(Move(FaceTurn(D, outerRange), turn))]
    macroAction(solved, alg)
  })

let fullKey = (state: PieceReducer.pieceState) =>
  state.cp->Array.map(value => value->Int.toString)->Array.join("") ++
  state.co->Array.map(value => value->Int.toString)->Array.join("") ++
  state.ep->Array.map(value => (value + 65)->String.fromCharCode)->Array.join("") ++
  state.eo->Array.map(value => value->Int.toString)->Array.join("")

let searchMacros = (~state, ~actions, ~isGoal, ~projection=fullKey, ~maxDepth) => {
  if isGoal(state) {
    Some([])
  } else {
    let frontier = ref([{state, path: []}])
    let seen = Dict.make()
    let found = ref(None)
    for _depth in 1 to maxDepth {
      if found.contents == None {
        let next = []
        frontier.contents->Array.forEach(node => {
          let key = projection(node.state)
          if found.contents == None && Dict.get(seen, key) == None {
            Dict.set(seen, key, true)
            actions->Array.forEach(action => {
              if found.contents == None {
                let candidateState = applyCubie(node.state, action.transition)
                let candidatePath = node.path->Array.concat([action])
                if isGoal(candidateState) {
                  found := Some(candidatePath)
                } else {
                  next->Array.push({state: candidateState, path: candidatePath})
                }
              }
            })
          }
        })
        frontier := next
      }
    }
    found.contents
  }
}

let firstLayerGoal = state => lockedGoal(state, [0, 1, 2, 3], [0, 1, 2, 3])

let firstTwoLayersGoal = state =>
  firstLayerGoal(state) && [8, 9, 10, 11]->Array.every(piece => isSolvedEdge(state, piece))

let orientedLastEdgesGoal = state =>
  firstTwoLayersGoal(state) &&
  [4, 5, 6, 7]->Array.every(slot => Belt.Array.getUnsafe(state.eo, slot) == 0)

let orientedLastCornersGoal = state =>
  orientedLastEdgesGoal(state) &&
  [4, 5, 6, 7]->Array.every(slot => Belt.Array.getUnsafe(state.co, slot) == 0)

let positionedLastCornersGoal = state =>
  orientedLastCornersGoal(state) && [4, 5, 6, 7]->Array.every(piece => isSolvedCorner(state, piece))

let solvedCubiesGoal = state =>
  [0, 1, 2, 3, 4, 5, 6, 7]->Array.every(piece => isSolvedCorner(state, piece)) &&
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]->Array.every(piece => isSolvedEdge(state, piece))

let statesEqual = (left: cubeState, right: cubeState) =>
  left.size == right.size &&
    left.facelets->Array.everyWithIndex((facelets, faceIndex) => {
      let other = Belt.Array.getUnsafe(right.facelets, faceIndex)
      facelets->Array.everyWithIndex((facelet, index) =>
        facelet == Belt.Array.getUnsafe(other, index)
      )
    })

let centresCanonical = state =>
  storageOrder->Array.every(face => {
    let facelets = Belt.Array.getUnsafe(state.facelets, storageIndex(face))
    Belt.Array.getUnsafe(facelets, 4) == face
  })

let rotateState = (state, axis, turns) => {
  let result = ref(state)
  for _ in 1 to turns {
    result :=
      MoveExecutor.applyStep(
        result.contents,
        {
          move: Rotation(axis),
          turns: 1,
        },
      )
  }
  result.contents
}

let orientFrame = state => {
  let found = ref(None)
  for xTurns in 0 to 3 {
    let afterX = rotateState(state, X, xTurns)
    for yTurns in 0 to 3 {
      let afterY = rotateState(afterX, Y, yTurns)
      for zTurns in 0 to 3 {
        let candidate = rotateState(afterY, Z, zTurns)
        if found.contents == None && centresCanonical(candidate) {
          let alg = []
          if xTurns != 0 {
            alg->Array.push(located(Move(Rotation(X), xTurns)))
          }
          if yTurns != 0 {
            alg->Array.push(located(Move(Rotation(Y), yTurns)))
          }
          if zTurns != 0 {
            alg->Array.push(located(Move(Rotation(Z), zTurns)))
          }
          found := Some((candidate, alg))
        }
      }
    }
  }
  found.contents
}

let phase = (number, title, instruction, alg) => {number, title, instruction, alg}

let commentForPhase = phase =>
  located(
    BlockComment(` STEP ${phase.number->Int.toString}: ${phase.title} — ${phase.instruction} `),
  )

let solve = (input: cubeState): result<solution, solverError> => {
  try {
    if input.size != 3 {
      throw(BuildFailure(UnsupportedSize(input.size)))
    }
    switch PieceReducer.reduce(input) {
    | Error(error) => throw(BuildFailure(InvalidState(error)))
    | Ok(_) => ()
    }
    let (orientedState, frameAlg) = switch orientFrame(input) {
    | Some(value) => value
    | None => throw(BuildFailure(SearchFailed("centre-frame normalization")))
    }
    let solved = switch StateTypes.solved(3) {
    | Ok(state) => state
    | Error(_) => throw(BuildFailure(UnsupportedSize(3)))
    }
    let start = switch PieceReducer.reduce(orientedState) {
    | Ok(pieces) => pieces
    | Error(error) => throw(BuildFailure(InvalidState(error)))
    }
    let atomics = atomicActions(solved)
    let current = ref(start)

    let crossAlg = ref([])
    for piece in 0 to 3 {
      let targets = Belt.Array.makeBy(piece + 1, index => index)
      let path = switch searchAtomic(
        ~state=current.contents,
        ~corners=[],
        ~edges=targets,
        ~actions=atomics,
        ~maxDepth=9,
      ) {
      | Some(path) => path
      | None => throw(BuildFailure(SearchFailed("the white cross")))
      }
      path->Array.forEach(action => current := applyCubie(current.contents, action.transition))
      crossAlg := concatAlg(crossAlg.contents, flattenActions(path))
    }

    let cornerAlg = ref([])
    for piece in 0 to 3 {
      let targets = Belt.Array.makeBy(piece + 1, index => index)
      let path = switch searchAtomic(
        ~state=current.contents,
        ~corners=targets,
        ~edges=[0, 1, 2, 3],
        ~actions=atomics,
        ~maxDepth=10,
      ) {
      | Some(path) => path
      | None => throw(BuildFailure(SearchFailed("the first-layer corners")))
      }
      path->Array.forEach(action => current := applyCubie(current.contents, action.transition))
      cornerAlg := concatAlg(cornerAlg.contents, flattenActions(path))
    }

    let middleActions =
      downTurns(solved)
      ->Array.concat(macroVariants(solved, "U R U' R' U' F' U F"))
      ->Array.concat(macroVariants(solved, "U' L' U L U F U' F'"))
    let middleAlg = ref([])
    for offset in 0 to 3 {
      let targets = Belt.Array.makeBy(offset + 1, index => 8 + index)
      let projection = state => projectionKey(state, [], targets)
      let goal = state =>
        firstLayerGoal(state) && targets->Array.every(piece => isSolvedEdge(state, piece))
      let path = switch searchMacros(
        ~state=current.contents,
        ~actions=middleActions,
        ~isGoal=goal,
        ~projection,
        ~maxDepth=5,
      ) {
      | Some(path) => path
      | None => throw(BuildFailure(SearchFailed("the middle-layer edges")))
      }
      path->Array.forEach(action => current := applyCubie(current.contents, action.transition))
      middleAlg := concatAlg(middleAlg.contents, flattenActions(path))
    }

    let lastEdgeActions = downTurns(solved)->Array.concat(macroVariants(solved, "F R U R' U' F'"))
    let lastEdgePath = switch searchMacros(
      ~state=current.contents,
      ~actions=lastEdgeActions,
      ~isGoal=orientedLastEdgesGoal,
      ~maxDepth=4,
    ) {
    | Some(path) => path
    | None => throw(BuildFailure(SearchFailed("the yellow cross")))
    }
    lastEdgePath->Array.forEach(action =>
      current := applyCubie(current.contents, action.transition)
    )

    let lastCornerActions =
      downTurns(solved)
      ->Array.concat(macroVariants(solved, "R U R' U R U2 R'"))
      ->Array.concat(macroVariants(solved, "R U2 R' U' R U' R'"))
    let lastCornerPath = switch searchMacros(
      ~state=current.contents,
      ~actions=lastCornerActions,
      ~isGoal=orientedLastCornersGoal,
      ~maxDepth=5,
    ) {
    | Some(path) => path
    | None => throw(BuildFailure(SearchFailed("yellow-corner orientation")))
    }
    lastCornerPath->Array.forEach(action =>
      current := applyCubie(current.contents, action.transition)
    )

    let cornerPermutationActions =
      downTurns(solved)->Array.concat(macroVariants(solved, "R' F R' B2 R F' R' B2 R2"))
    let cornerPermutationPath = switch searchMacros(
      ~state=current.contents,
      ~actions=cornerPermutationActions,
      ~isGoal=positionedLastCornersGoal,
      ~maxDepth=5,
    ) {
    | Some(path) => path
    | None => throw(BuildFailure(SearchFailed("last-layer corner positioning")))
    }
    cornerPermutationPath->Array.forEach(action =>
      current := applyCubie(current.contents, action.transition)
    )

    let ua = parseInternal("R U' R U R U R U' R' U' R2")
    let ub = MoveTransform.invert(ua)
    let edgePermutationActions =
      downTurns(solved)
      ->Array.concat([0, 1, 2, 3]->Array.map(y => macroAction(solved, downLayerVariant(ua, y))))
      ->Array.concat([0, 1, 2, 3]->Array.map(y => macroAction(solved, downLayerVariant(ub, y))))
    let edgePermutationPath = switch searchMacros(
      ~state=current.contents,
      ~actions=edgePermutationActions,
      ~isGoal=solvedCubiesGoal,
      ~maxDepth=5,
    ) {
    | Some(path) => path
    | None => throw(BuildFailure(SearchFailed("last-layer edge positioning")))
    }

    let corePhases = [
      phase(
        1,
        "White Cross",
        "Align the four white edges with their side centres.",
        crossAlg.contents,
      ),
      phase(
        2,
        "First-Layer Corners",
        "Insert the four white corners while preserving the cross.",
        cornerAlg.contents,
      ),
      phase(
        3,
        "Middle Layer",
        "Insert the four non-yellow edges with beginner left/right insertions.",
        middleAlg.contents,
      ),
      phase(
        4,
        "Yellow Cross",
        "Orient the four yellow edges into a cross.",
        flattenActions(lastEdgePath),
      ),
      phase(
        5,
        "Orient Yellow Corners",
        "Use Sune and anti-Sune cases until the yellow face is oriented.",
        flattenActions(lastCornerPath),
      ),
      phase(
        6,
        "Position Yellow Corners",
        "Place the oriented corners over their matching side colours.",
        flattenActions(cornerPermutationPath),
      ),
      phase(
        7,
        "Position Yellow Edges",
        "Cycle the final edges to finish the cube.",
        flattenActions(edgePermutationPath),
      ),
    ]
    let phases = corePhases->Array.map(item => {
      ...item,
      alg: MoveTransform.rotate(item.alg, ~axis=X, ~turns=2),
    })
    let coreHasMoves = corePhases->Array.some(item => item.alg->Array.length > 0)
    let whiteDown = if coreHasMoves {
      [located(Move(Rotation(X), 2))]
    } else {
      []
    }
    phases[0] = {
      ...Belt.Array.getUnsafe(phases, 0),
      alg: frameAlg->Array.concat(whiteDown)->Array.concat(Belt.Array.getUnsafe(phases, 0).alg),
    }
    phases[6] = {
      ...Belt.Array.getUnsafe(phases, 6),
      alg: Belt.Array.getUnsafe(phases, 6).alg->Array.concat(whiteDown),
    }
    let annotated =
      phases->Array.reduce([], (output, item) =>
        output->Array.concat([commentForPhase(item)])->Array.concat(item.alg)
      )
    let moveCount = switch MoveExecutor.expand(annotated) {
    | Error(error) => throw(BuildFailure(ExpansionFailed(error)))
    | Ok(steps) => steps->Array.length
    }
    let result = switch MoveExecutor.applyAlg(input, annotated) {
    | Error(error) => throw(BuildFailure(ExpansionFailed(error)))
    | Ok(result) => result
    }
    if !statesEqual(result, solved) {
      throw(BuildFailure(VerificationFailed))
    }
    Ok({phases, alg: annotated, moveCount})
  } catch {
  | BuildFailure(error) => Error(error)
  }
}
