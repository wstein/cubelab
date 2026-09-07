type cubies = {
  cp: array<int>,
  co: array<int>,
}
type transform = cubies

let moveTokens = [
  "U", "U2", "U'", "D", "D2", "D'",
  "R", "R2", "R'", "L", "L2", "L'",
  "F", "F2", "F'", "B", "B2", "B'",
]

let identity = (): cubies => {
  cp: [0, 1, 2, 3, 4, 5, 6, 7],
  co: [0, 0, 0, 0, 0, 0, 0, 0],
}

let stateKey: cubies => string = %raw("(state) => state.cp.join(',') + '/' + state.co.join(',')")

let applyTransform = (state: cubies, transform: transform): cubies => {
  let len = Array.length(transform.cp)
  let cp = Array.fromInitializer(~length=len, i => {
    let source = transform.cp[i]->Option.getOr(0)
    state.cp[source]->Option.getOr(0)
  })
  let co = Array.fromInitializer(~length=len, i => {
    let source = transform.cp[i]->Option.getOr(0)
    let sCo = state.co[source]->Option.getOr(0)
    let tCo = transform.co[i]->Option.getOr(0)
    mod(sCo + tCo, 3)
  })
  {cp, co}
}

let compose = (left: transform, right: transform): transform => applyTransform(right, left)

let transformFor = (token: string): transform => {
  switch (MoveParser.parse(~size=2, token), StateTypes.solved(2)) {
  | (Ok(parsed), Ok(solved)) =>
    switch MoveExecutor.applyAlg(solved, parsed) {
    | Ok(moved) =>
      switch PieceReducer.reduce(moved) {
      | Ok(reduced) => {cp: reduced.cp, co: reduced.co}
      | Error(_) => failwith("Could not reduce " ++ token ++ ".")
      }
    | Error(_) => failwith("Could not apply " ++ token ++ ".")
    }
  | _ => failwith("Could not prepare " ++ token ++ ".")
  }
}

let moveTransforms = moveTokens->Array.map(transformFor)
let wholeRotationTokens = ["x", "x'", "y", "y'", "z", "z'"]
let wholeRotationTransforms = wholeRotationTokens->Array.map(transformFor)

let rotations = {
  let generators = [transformFor("x"), transformFor("y"), transformFor("z")]
  let values = [identity()]
  let seen = Set.fromArray([stateKey(values[0]->Option.getOr(identity()))])
  let index = ref(0)
  while index.contents < Array.length(values) {
    let current = values[index.contents]->Option.getOr(identity())
    index := index.contents + 1
    for gIdx in 0 to Array.length(generators) - 1 {
      let generator = generators[gIdx]->Option.getOr(identity())
      let next = compose(generator, current)
      let key = stateKey(next)
      if !Set.has(seen, key) {
        Set.add(seen, key)
        let _ = Array.push(values, next)
      }
    }
  }
  if Array.length(values) != 24 {
    failwith("Could not generate the 24 cube orientations.")
  }
  values
}

let anchor = {
  let lookup = Array.fromInitializer(~length=24, _ => -1)
  rotations->Array.forEachWithIndex((rotation, index) => {
    let cp0 = rotation.cp[0]->Option.getOr(0)
    let co0 = rotation.co[0]->Option.getOr(0)
    let pos = cp0 * 3 + mod(3 - co0, 3)
    lookup[pos] = index
  })
  if lookup->Array.some(value => value < 0) {
    failwith("Could not anchor 2×2 orientations.")
  }
  lookup
}

let rank = (values: array<int>): int => {
  let output = ref(0)
  let len = Array.length(values)
  for left in 0 to len - 2 {
    let smaller = ref(0)
    let valLeft = values[left]->Option.getOr(0)
    for right in left + 1 to len - 1 {
      if values[right]->Option.getOr(0) < valLeft {
        smaller := smaller.contents + 1
      }
    }
    output := output.contents * (len - left) + smaller.contents
  }
  output.contents
}

let unrank = (coordinate: int): array<int> => {
  let available = [1, 2, 3, 4, 5, 6, 7]
  let output = [0]
  let remaining = ref(coordinate)
  for slot in 0 to 6 {
    let factorial = ref(1)
    for i in 2 to 7 - slot - 1 {
      factorial := factorial.contents * i
    }
    let fact = factorial.contents
    let selected = if fact == 0 { 0 } else { remaining.contents / fact }
    let spliceHelper: (array<int>, int) => int = %raw("(arr, idx) => arr.splice(idx, 1)[0]")
    let removed = spliceHelper(available, selected)
    let _ = Array.push(output, removed)
    remaining := if fact == 0 { 0 } else { mod(remaining.contents, fact) }
  }
  output
}

let orientationRank = (co: array<int>): int => {
  let rankVal = ref(0)
  for slot in 1 to 6 {
    rankVal := rankVal.contents * 3 + co[slot]->Option.getOr(0)
  }
  rankVal.contents
}

let orientationUnrank = (coordinate: int): array<int> => {
  let co = Array.fromInitializer(~length=8, _ => 0)
  let remaining = ref(coordinate)
  let sum = ref(0)
  let slot = ref(6)
  while slot.contents >= 1 {
    let digit = mod(remaining.contents, 3)
    co[slot.contents] = digit
    sum := sum.contents + digit
    remaining := remaining.contents / 3
    slot := slot.contents - 1
  }
  co[7] = mod(3 - mod(sum.contents, 3), 3)
  co
}

let canonical = (state: cubies): cubies => {
  let slot = state.cp->Array.indexOf(0)
  if slot < 0 {
    failwith("The 2×2 corner permutation is invalid.")
  }
  let coSlot = state.co[slot]->Option.getOr(0)
  let anchorIdx = anchor[slot * 3 + coSlot]->Option.getOr(0)
  let rot = rotations[anchorIdx]->Option.getOr(identity())
  applyTransform(state, rot)
}

let coordinateForCubies = (state: cubies): int => {
  let value = canonical(state)
  let perm = value.cp->Array.slice(~start=1)->Array.map(piece => piece - 1)
  let coordinate = rank(perm) * 729 + orientationRank(value.co)
  if coordinate < 0 || coordinate >= Optimal2x2Table.optimal_2X2_STATES {
    failwith("The canonical 2×2 coordinate is invalid.")
  }
  coordinate
}

let cubiesForCoordinate = (coordinate: int): cubies => {
  {
    cp: unrank(coordinate / 729),
    co: orientationUnrank(mod(coordinate, 729)),
  }
}

let transitionCoordinate = (coordinate: int, move: int): int => {
  let moveTrans = moveTransforms[move]->Option.getOr(identity())
  coordinateForCubies(applyTransform(cubiesForCoordinate(coordinate), moveTrans))
}

let transformations = () => moveTransforms

type queueItem = {
  state: cubies,
  tokens: array<string>,
}

let rotationTokensToIdentity = (state: cubies): array<string> => {
  let idKey = stateKey(identity())
  let initialKey = stateKey(state)
  let queue = [{state, tokens: []}]
  let seen = Set.fromArray([initialKey])
  let index = ref(0)
  let foundTokens = ref(None)
  while index.contents < Array.length(queue) && Option.isNone(foundTokens.contents) {
    let candidate = queue[index.contents]->Option.getOr({state: identity(), tokens: []})
    index := index.contents + 1
    if stateKey(candidate.state) == idKey {
      foundTokens := Some(candidate.tokens)
    } else {
      wholeRotationTransforms->Array.forEachWithIndex((transform, transformIndex) => {
        let next = applyTransform(candidate.state, transform)
        let nextKey = stateKey(next)
        if !Set.has(seen, nextKey) {
          Set.add(seen, nextKey)
          let token = wholeRotationTokens[transformIndex]->Option.getOr("")
          let nextTokens = Array.concat(candidate.tokens, [token])
          let _ = Array.push(queue, {state: next, tokens: nextTokens})
        }
      })
    }
  }
  switch foundTokens.contents {
  | Some(tokens) => tokens
  | None => failwith("The solved-equivalent 2×2 orientation could not be restored.")
  }
}
