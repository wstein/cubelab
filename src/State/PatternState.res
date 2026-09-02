// Invariant pattern recognition and holding-adaptation logic across
// the 24 cube rotations for 2×2×2 through 5×5×5.

type orientation = {
  alg: MoveTypes.alg,
  rotatedSolved: StateTypes.cubeState,
}

let parseAlg = (size: int, notation: string): MoveTypes.alg => {
  switch MoveParser.parseWithOptions(
    ~size,
    ~lowercaseMode=Wide,
    ~notationDialect=Modern,
    notation,
  ) {
  | Ok(nodes) => nodes
  | Error(_) => []
  }
}

let applyAlg = (state: StateTypes.cubeState, alg: MoveTypes.alg): StateTypes.cubeState => {
  switch MoveExecutor.applyAlg(state, alg) {
  | Ok(next) => next
  | Error(_) => state
  }
}

let solvedState = (size: int): StateTypes.cubeState => {
  switch StateTypes.solved(size) {
  | Ok(state) => state
  | Error(_) => {size, facelets: []}
  }
}

let computeOrientations = (size: int): array<orientation> => {
  let origin = solvedState(size)
  let generators = [parseAlg(size, "x"), parseAlg(size, "y"), parseAlg(size, "z")]
  let found: array<orientation> = [{alg: [], rotatedSolved: origin}]
  let seen = ref(Belt.Set.String.empty->Belt.Set.String.add(FaceletCodec.render(origin)))

  let cursor = ref(0)
  while cursor.contents < found->Array.length && found->Array.length < 24 {
    let current = Belt.Array.getUnsafe(found, cursor.contents)
    generators->Array.forEach(generator => {
      let alg = Array.concat(current.alg, generator)
      let rotatedSolved = applyAlg(origin, alg)
      let key = FaceletCodec.render(rotatedSolved)
      if !(seen.contents->Belt.Set.String.has(key)) {
        seen := seen.contents->Belt.Set.String.add(key)
        found->Array.push({alg, rotatedSolved})
      }
    })
    cursor := cursor.contents + 1
  }
  found
}

let cachedOrientations: ref<Belt.Map.Int.t<array<orientation>>> = ref(Belt.Map.Int.empty)

let orientationAlgorithms = (size: int): array<orientation> => {
  switch cachedOrientations.contents->Belt.Map.Int.get(size) {
  | Some(list) => list
  | None =>
    let calculated = computeOrientations(size)
    cachedOrientations := cachedOrientations.contents->Belt.Map.Int.set(size, calculated)
    calculated
  }
}

let conjugatedFacelets = (state: StateTypes.cubeState, orientation: orientation): string => {
  let rotated = applyAlg(state, orientation.alg)
  let colourMap = ref(Belt.Map.String.empty)
  let order = StateTypes.storageOrder
  for faceIndex in 0 to order->Array.length - 1 {
    let faceStickers = orientation.rotatedSolved.facelets->Belt.Array.get(faceIndex)
    let originalColour = switch faceStickers {
    | Some(stickers) =>
      switch stickers->Belt.Array.get(0) {
      | Some(face) => StateTypes.faceToChar(face)
      | None => ""
      }
    | None => ""
    }
    let canonicalFace = switch order->Belt.Array.get(faceIndex) {
    | Some(face) => StateTypes.faceToChar(face)
    | None => ""
    }
    colourMap := colourMap.contents->Belt.Map.String.set(originalColour, canonicalFace)
  }
  rotated.facelets
  ->Array.map(face =>
    face
    ->Array.map(faceSticker => {
      let char = StateTypes.faceToChar(faceSticker)
      colourMap.contents->Belt.Map.String.get(char)->Belt.Option.getWithDefault(char)
    })
    ->Array.join("")
  )
  ->Array.join("")
}

let patternStateKey = (state: StateTypes.cubeState): string => {
  let orientations = orientationAlgorithms(state.size)
  let variants = orientations->Array.map(orientation =>
    if state.size == 2 {
      FaceletCodec.render(applyAlg(state, orientation.alg))
    } else {
      conjugatedFacelets(state, orientation)
    }
  )
  let sorted = Belt.SortArray.stableSortBy(variants, (a, b) =>
    if a < b {
      -1
    } else if a > b {
      1
    } else {
      0
    }
  )
  sorted->Belt.Array.get(0)->Belt.Option.getWithDefault("")
}

let patternStateFromAlgorithm = (size: int, notation: string): StateTypes.cubeState =>
  applyAlg(solvedState(size), parseAlg(size, notation))

let inverseAlgorithm = (size: int, notation: string): string => {
  let alg = parseAlg(size, notation)
  MoveTransform.serialize(MoveTransform.invert(alg))
}

let algorithmSolvesState = (state: StateTypes.cubeState, notation: string): bool => {
  let candidate = applyAlg(state, parseAlg(state.size, notation))
  FaceletCodec.render(candidate) == FaceletCodec.render(solvedState(state.size))
}

let reframedAlgorithms = (alg: MoveTypes.alg): array<MoveTypes.alg> => {
  let found: array<MoveTypes.alg> = [alg]
  let seen = ref(Belt.Set.String.empty->Belt.Set.String.add(MoveTransform.serialize(alg)))
  let axes: array<MoveTypes.axis> = [X, Y, Z]

  let cursor = ref(0)
  while cursor.contents < found->Array.length && found->Array.length < 24 {
    let current = Belt.Array.getUnsafe(found, cursor.contents)
    axes->Array.forEach(axis => {
      let candidate = MoveTransform.rotate(current, ~axis, ~turns=1)
      let key = MoveTransform.serialize(candidate)
      if !(seen.contents->Belt.Set.String.has(key)) {
        seen := seen.contents->Belt.Set.String.add(key)
        found->Array.push(candidate)
      }
    })
    cursor := cursor.contents + 1
  }
  found
}

let solutionForPatternState = (state: StateTypes.cubeState, solution: string): option<string> => {
  let solutionAlg = parseAlg(state.size, solution)
  let solvedFacelets = FaceletCodec.render(solvedState(state.size))

  if state.size == 2 {
    let orientations = orientationAlgorithms(state.size)
    let found = ref(None)
    for index in 0 to orientations->Array.length - 1 {
      if found.contents == None {
        let orientation = Belt.Array.getUnsafe(orientations, index)
        let candidate = Array.concat(MoveTransform.invert(orientation.alg), solutionAlg)
        if FaceletCodec.render(applyAlg(state, candidate)) == solvedFacelets {
          found := Some(MoveTransform.serialize(candidate))
        }
      }
    }
    found.contents
  } else {
    let candidates = reframedAlgorithms(solutionAlg)
    let found = ref(None)
    for index in 0 to candidates->Array.length - 1 {
      if found.contents == None {
        let candidate = Belt.Array.getUnsafe(candidates, index)
        if FaceletCodec.render(applyAlg(state, candidate)) == solvedFacelets {
          found := Some(MoveTransform.serialize(candidate))
        }
      }
    }
    found.contents
  }
}
