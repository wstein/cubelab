open MoveTypes
open StateTypes

type mirrorPlane =
  | LR
  | FB
  | UD

let generatedLoc = {start: 0, end_: 0}
let located = desc => {desc, loc: generatedLoc}

let faceName = face =>
  switch face {
  | U => "U"
  | L => "L"
  | F => "F"
  | R => "R"
  | B => "B"
  | D => "D"
  }

let sliceName = slice =>
  switch slice {
  | M => "M"
  | E => "E"
  | S => "S"
  }

let axisName = axis =>
  switch axis {
  | X => "x"
  | Y => "y"
  | Z => "z"
  }

let suffix = turns => {
  if turns == 1 {
    ""
  } else if turns == -1 {
    "'"
  } else if turns < 0 {
    -turns->Int.toString ++ "'"
  } else {
    turns->Int.toString
  }
}

let canonicalTurns = turns => {
  let normalized = (turns % 4 + 4) % 4
  switch normalized {
  | 0 => 0
  | 1 => 1
  | 2 => 2
  | _ => -1
  }
}

let serializeMove = (move, turns) => {
  let family = switch move {
  | FaceTurn(face, range) => {
      let name = faceName(face)
      if range.from_ == 1 && range.to_ == 1 {
        name
      } else if range.from_ == 1 && range.to_ == 2 {
        name ++ "w"
      } else if range.from_ == 1 {
        range.to_->Int.toString ++ name ++ "w"
      } else if range.from_ == range.to_ {
        range.from_->Int.toString ++ name
      } else {
        range.from_->Int.toString ++ "-" ++ range.to_->Int.toString ++ name ++ "w"
      }
    }
  | SliceTurn(slice) => sliceName(slice)
  | Rotation(axis) => axisName(axis)
  }
  family ++ suffix(canonicalTurns(turns))
}

let rec serializeUnit = unit =>
  switch unit.desc {
  | Move(move, turns) => serializeMove(move, turns)
  | Pause => "."
  | TimedPause(seconds) => "@" ++ seconds->Float.toString ++ "s"
  | BlockComment(text) => "/*" ++ text ++ "*/"
  | Group(units, repeat) => "(" ++ serialize(units) ++ ")" ++ suffix(repeat)
  | Commutator(left, right, repeat) =>
    "[" ++ serialize(left) ++ ", " ++ serialize(right) ++ "]" ++ suffix(repeat)
  | Conjugate(left, right, repeat) =>
    "[" ++ serialize(left) ++ ": " ++ serialize(right) ++ "]" ++ suffix(repeat)
  }

and serialize = (alg: alg) => alg->Array.map(serializeUnit)->Array.join(" ")

let invertUnit = unit => {
  let desc = switch unit.desc {
  | Move(move, turns) => Move(move, -turns)
  | Pause => Pause
  | TimedPause(seconds) => TimedPause(seconds)
  | BlockComment(text) => BlockComment(text)
  | Group(units, repeat) => Group(units, -repeat)
  | Commutator(left, right, repeat) => Commutator(left, right, -repeat)
  | Conjugate(left, right, repeat) => Conjugate(left, right, -repeat)
  }
  located(desc)
}

let invert = (alg: alg): alg => {
  let output = []
  for offset in 0 to alg->Array.length - 1 {
    output->Array.push(invertUnit(Belt.Array.getUnsafe(alg, alg->Array.length - 1 - offset)))
  }
  output
}

/**
 * Replace M/E/S by the exact single inner-layer turn used by this cube size.
 *
 * For example on 5×5, M is 3L: it turns only the middle layer, unlike an
 * outer-turn plus whole-cube-rotation identity which also turns both adjacent
 * inner layers. Structure and repeat counts stay intact.
 */
let sliceAsInnerFace = (size, slice) => {
  let depth = size / 2 + 1
  let face = switch slice {
  | M => L
  | E => D
  | S => F
  }
  FaceTurn(face, {from_: depth, to_: depth})
}

let rec unfoldSlicesUnit = (unit, size) => {
  let desc = switch unit.desc {
  | Move(SliceTurn(slice), turns) => Move(sliceAsInnerFace(size, slice), turns)
  | Move(move, turns) => Move(move, turns)
  | Pause => Pause
  | TimedPause(seconds) => TimedPause(seconds)
  | BlockComment(text) => BlockComment(text)
  | Group(units, repeat) => Group(unfoldSlices(units, size), repeat)
  | Commutator(left, right, repeat) =>
    Commutator(unfoldSlices(left, size), unfoldSlices(right, size), repeat)
  | Conjugate(left, right, repeat) =>
    Conjugate(unfoldSlices(left, size), unfoldSlices(right, size), repeat)
  }
  located(desc)
}

and unfoldSlices = (alg: alg, size: int): alg =>
  alg->Array.map(unit => unfoldSlicesUnit(unit, size))

let moveAxis = move =>
  switch move {
  | FaceTurn(face, _) =>
    switch face {
    | R | L => X
    | U | D => Y
    | F | B => Z
    }
  | SliceTurn(slice) =>
    switch slice {
    | M => X
    | E => Y
    | S => Z
    }
  | Rotation(axis) => axis
  }

let flushRun = (output: array<locatedUnit>, run: array<MoveExecutor.step>) => {
  run->Array.forEach(step => {
    let turns = canonicalTurns(step.turns)
    if turns != 0 {
      output->Array.push(located(Move(step.move, turns)))
    }
  })
  run->Array.splice(~start=0, ~remove=run->Array.length, ~insert=[])
}

let addToRun = (run: array<MoveExecutor.step>, step: MoveExecutor.step) => {
  let index = run->Array.findIndex(existing => existing.move == step.move)
  if index == -1 {
    run->Array.push(step)
  } else {
    let existing = Belt.Array.getUnsafe(run, index)
    run[index] = {...existing, turns: existing.turns + step.turns}
  }
}

let simplify = (alg: alg): result<alg, MoveExecutor.executionError> =>
  switch MoveExecutor.expandTimeline(alg) {
  | Error(error) => Error(error)
  | Ok(entries) => {
      let output = []
      let run = []
      let runAxis = ref(None)
      entries->Array.forEach(entry =>
        switch (entry.step, entry.pause, entry.durationMs, entry.comment) {
        | (Some(step), _, _, _) => {
            let axis = moveAxis(step.move)
            if runAxis.contents != Some(axis) {
              flushRun(output, run)
              runAxis := Some(axis)
            }
            addToRun(run, step)
          }
        | (None, true, durationMs, _) => {
            flushRun(output, run)
            runAxis := None
            output->Array.push(
              located(
                switch durationMs {
                | Some(milliseconds) => TimedPause(milliseconds->Int.toFloat /. 1000.0)
                | None => Pause
                },
              ),
            )
          }
        | (None, false, _, Some(text)) => {
            flushRun(output, run)
            runAxis := None
            output->Array.push(located(BlockComment(text)))
          }
        | (None, false, _, None) => ()
        }
      )
      flushRun(output, run)
      Ok(output)
    }
  }

let moveUnit = (move, turns) => located(Move(move, turns))

let outerFace = unit =>
  switch unit.desc {
  | Move(FaceTurn(face, {from_: 1, to_: 1}), turns) => Some((face, turns))
  | _ => None
  }

/* On a 3×3, a pair of opposite outer turns can be expressed as one slice
 * and one whole-cube regrip. The caller later moves those regrips rightward
 * through the sequence, changing subsequent move names by conjugation. */
let sliceRegripPair = (left, right) =>
  switch (outerFace(left), outerFace(right)) {
  | (Some((L, leftTurns)), Some((R, rightTurns)))
  | (Some((R, rightTurns)), Some((L, leftTurns))) if leftTurns == -rightTurns =>
    Some([moveUnit(SliceTurn(M), rightTurns), moveUnit(Rotation(X), rightTurns)])
  | (Some((D, downTurns)), Some((U, upTurns)))
  | (Some((U, upTurns)), Some((D, downTurns))) if downTurns == -upTurns =>
    Some([moveUnit(SliceTurn(E), upTurns), moveUnit(Rotation(Y), upTurns)])
  | (Some((B, backTurns)), Some((F, frontTurns)))
  | (Some((F, frontTurns)), Some((B, backTurns))) if backTurns == -frontTurns =>
    Some([moveUnit(SliceTurn(S), -frontTurns), moveUnit(Rotation(Z), frontTurns)])
  | _ => None
  }

let widePair = (left, right) => {
  let matchPair = (face, faceTurns, slice, sliceTurns) =>
    switch (face, slice) {
    | (R, M) if sliceTurns == -faceTurns =>
      Some(moveUnit(FaceTurn(R, {from_: 1, to_: 2}), faceTurns))
    | (L, M) if sliceTurns == faceTurns =>
      Some(moveUnit(FaceTurn(L, {from_: 1, to_: 2}), faceTurns))
    | (U, E) if sliceTurns == -faceTurns =>
      Some(moveUnit(FaceTurn(U, {from_: 1, to_: 2}), faceTurns))
    | (D, E) if sliceTurns == faceTurns =>
      Some(moveUnit(FaceTurn(D, {from_: 1, to_: 2}), faceTurns))
    | (F, S) if sliceTurns == faceTurns =>
      Some(moveUnit(FaceTurn(F, {from_: 1, to_: 2}), faceTurns))
    | (B, S) if sliceTurns == -faceTurns =>
      Some(moveUnit(FaceTurn(B, {from_: 1, to_: 2}), faceTurns))
    | _ => None
    }
  switch (left.desc, right.desc) {
  | (Move(FaceTurn(face, {from_: 1, to_: 1}), faceTurns), Move(SliceTurn(slice), sliceTurns)) =>
    matchPair(face, faceTurns, slice, sliceTurns)
  | (Move(SliceTurn(slice), sliceTurns), Move(FaceTurn(face, {from_: 1, to_: 1}), faceTurns)) =>
    matchPair(face, faceTurns, slice, sliceTurns)
  | _ => None
  }
}

let rec rewritePairs = (units, index, output) =>
  if index >= units->Array.length {
    output
  } else if index + 1 < units->Array.length {
    let left = Belt.Array.getUnsafe(units, index)
    let right = Belt.Array.getUnsafe(units, index + 1)
    switch sliceRegripPair(left, right) {
    | Some(replacement) => rewritePairs(units, index + 2, output->Array.concat(replacement))
    | None =>
      switch widePair(left, right) {
      | Some(replacement) => rewritePairs(units, index + 2, output->Array.concat([replacement]))
      | None => rewritePairs(units, index + 1, output->Array.concat([left]))
      }
    }
  } else {
    output->Array.concat([Belt.Array.getUnsafe(units, index)])
  }

let mirrorFace = (plane, face) =>
  switch (plane, face) {
  | (LR, R) => L
  | (LR, L) => R
  | (FB, F) => B
  | (FB, B) => F
  | (UD, U) => D
  | (UD, D) => U
  | _ => face
  }

let mirrorAxisFactor = (plane, axis) =>
  switch (plane, axis) {
  | (LR, X) | (FB, Z) | (UD, Y) => 1
  | _ => -1
  }

let rec mirrorUnit = (unit, plane) => {
  let desc = switch unit.desc {
  | Move(FaceTurn(face, range), turns) => Move(FaceTurn(mirrorFace(plane, face), range), -turns)
  | Move(SliceTurn(slice), turns) => {
      let axis = moveAxis(SliceTurn(slice))
      Move(SliceTurn(slice), turns * mirrorAxisFactor(plane, axis))
    }
  | Move(Rotation(axis), turns) => Move(Rotation(axis), turns * mirrorAxisFactor(plane, axis))
  | Pause => Pause
  | TimedPause(seconds) => TimedPause(seconds)
  | BlockComment(text) => BlockComment(text)
  | Group(units, repeat) => Group(mirror(units, plane), repeat)
  | Commutator(left, right, repeat) => Commutator(mirror(left, plane), mirror(right, plane), repeat)
  | Conjugate(left, right, repeat) => Conjugate(mirror(left, plane), mirror(right, plane), repeat)
  }
  located(desc)
}

and mirror = (alg: alg, plane: mirrorPlane): alg => alg->Array.map(unit => mirrorUnit(unit, plane))

let rotateAxisOnce = (by, axis) =>
  switch (by, axis) {
  | (X, X) => (X, 1)
  | (X, Y) => (Z, -1)
  | (X, Z) => (Y, 1)
  | (Y, X) => (Z, 1)
  | (Y, Y) => (Y, 1)
  | (Y, Z) => (X, -1)
  | (Z, X) => (Y, -1)
  | (Z, Y) => (X, 1)
  | (Z, Z) => (Z, 1)
  }

let rotateFaceOnce = (by, face) =>
  switch (by, face) {
  | (X, U) => B
  | (X, B) => D
  | (X, D) => F
  | (X, F) => U
  | (Y, R) => F
  | (Y, F) => L
  | (Y, L) => B
  | (Y, B) => R
  | (Z, U) => R
  | (Z, R) => D
  | (Z, D) => L
  | (Z, L) => U
  | _ => face
  }

let sliceForAxis = axis =>
  switch axis {
  | X => (M, 1)
  | Y => (E, 1)
  | Z => (S, -1)
  }

let rotationBaseDirection = _axis => -1

let rotateBaseMoveOnce = (move, turns, by) =>
  switch move {
  | FaceTurn(face, range) => (FaceTurn(rotateFaceOnce(by, face), range), turns)
  | SliceTurn(slice) => {
      let sourceAxis = moveAxis(move)
      let sourceDirection = switch slice {
      | M | E => 1
      | S => -1
      }
      let (targetAxis, axisFactor) = rotateAxisOnce(by, sourceAxis)
      let (targetSlice, targetDirection) = sliceForAxis(targetAxis)
      (SliceTurn(targetSlice), turns * sourceDirection * axisFactor * targetDirection)
    }
  | Rotation(axis) => {
      let (targetAxis, axisFactor) = rotateAxisOnce(by, axis)
      (
        Rotation(targetAxis),
        turns * rotationBaseDirection(axis) * axisFactor * rotationBaseDirection(targetAxis),
      )
    }
  }

let rec rotateUnitOnce = (unit, by) => {
  let desc = switch unit.desc {
  | Move(move, turns) => {
      let (move, turns) = rotateBaseMoveOnce(move, turns, by)
      Move(move, turns)
    }
  | Pause => Pause
  | TimedPause(seconds) => TimedPause(seconds)
  | BlockComment(text) => BlockComment(text)
  | Group(units, repeat) => Group(rotateOnce(units, by), repeat)
  | Commutator(left, right, repeat) =>
    Commutator(rotateOnce(left, by), rotateOnce(right, by), repeat)
  | Conjugate(left, right, repeat) => Conjugate(rotateOnce(left, by), rotateOnce(right, by), repeat)
  }
  located(desc)
}

and rotateOnce = (alg: alg, by: axis): alg => alg->Array.map(unit => rotateUnitOnce(unit, by))

let rotate = (alg: alg, ~axis: axis, ~turns: int): alg => {
  let output = ref(alg)
  let repetitions = (turns % 4 + 4) % 4
  for _ in 1 to repetitions {
    output := rotateOnce(output.contents, axis)
  }
  output.contents
}

let rec rotationCandidates = (remaining, prefix, output) =>
  if remaining == 0 {
    output->Array.push(prefix)
  } else {
    [(X, 1), (X, -1), (X, 2), (Y, 1), (Y, -1), (Y, 2), (Z, 1), (Z, -1), (Z, 2)]->Array.forEach(((
      axis,
      turns,
    )) =>
      rotationCandidates(
        remaining - 1,
        prefix->Array.concat([moveUnit(Rotation(axis), turns)]),
        output,
      )
    )
  }

let equivalentRotation = (left, right) =>
  switch StateTypes.solved(3) {
  | Error(_) => false
  | Ok(solved) =>
    switch (MoveExecutor.applyAlg(solved, left), MoveExecutor.applyAlg(solved, right)) {
    | (Ok(leftState), Ok(rightState)) => leftState == rightState
    | _ => false
    }
  }

/* The 24 whole-cube orientations all have a representation of at most three
 * x/y/z tokens when quarter, inverse-quarter, and half turns are available. */
let canonicalRotations = rotations => {
  let found = ref(None)
  let length = ref(0)
  while found.contents == None && length.contents <= 3 {
    let candidates = []
    rotationCandidates(length.contents, [], candidates)
    let index = ref(0)
    while found.contents == None && index.contents < candidates->Array.length {
      let candidate = Belt.Array.getUnsafe(candidates, index.contents)
      if equivalentRotation(rotations, candidate) {
        found := Some(candidate)
      }
      index := index.contents + 1
    }
    length := length.contents + 1
  }
  switch found.contents {
  | Some(candidate) => candidate
  | None => rotations
  }
}

/* Move whole-cube rotations to the end of a contiguous move run. For r A,
 * the exact rewrite is rotate(A, r^-1) r in the fixed-world executor. This keeps rotations as visible
 * regrips while allowing slice pairs found earlier to compose cleanly. */
let pushRotationsRight = units => {
  let output = ref([])
  let pending = ref([])
  let flushPending = () => {
    output := output.contents->Array.concat(canonicalRotations(pending.contents))
    pending := []
  }
  units->Array.forEach(unit =>
    switch unit.desc {
    | Move(Rotation(_), _) => pending := pending.contents->Array.concat([unit])
    | Move(_, _) => {
        let moved = ref([unit])
        for index in pending.contents->Array.length - 1 downto 0 {
          switch Belt.Array.getUnsafe(pending.contents, index).desc {
          | Move(Rotation(axis), turns) => moved := rotate(moved.contents, ~axis, ~turns=-turns)
          | _ => ()
          }
        }
        output := output.contents->Array.concat(moved.contents)
      }
    | _ => {
        flushPending()
        output := output.contents->Array.concat([unit])
      }
    }
  )
  flushPending()
  output.contents
}

/** A deterministic 3×3 notation compactor for M/E/S, wide turns, and regrips.
 * It only uses local exact identities; unlike AlgorithmOptimizer it makes no
 * claim to find a globally shortest algorithm. */
let optimizeRegrips = (alg: alg): alg =>
  switch simplify(alg) {
  | Error(_) => alg
  | Ok(flat) => flat->rewritePairs(0, [])->pushRotationsRight
  }

let practiceLength = size =>
  switch size {
  | 2 => 11
  | 3 => 25
  | 4 => 45
  | 5 => 60
  | _ => 0
  }

let practiceFamilies = size => {
  let outer = [("U", Y), ("R", X), ("F", Z), ("D", Y), ("L", X), ("B", Z)]
  if size == 2 {
    [("U", Y), ("R", X), ("F", Z)]
  } else if size == 3 {
    outer
  } else if size == 4 {
    outer->Array.concat([("Uw", Y), ("Rw", X), ("Fw", Z)])
  } else {
    outer->Array.concat([("Uw", Y), ("Rw", X), ("Fw", Z), ("3Uw", Y), ("3Rw", X), ("3Fw", Z)])
  }
}

let randomIndex = (random, length) => {
  let value = random()
  let bounded = if value < 0.0 {
    0.0
  } else if value >= 1.0 {
    0.999999999999
  } else {
    value
  }
  (bounded *. length->Int.toFloat)->Math.Int.floor
}

let practiceScrambleWithRandom = (~size: int, ~random: unit => float): result<string, string> => {
  if !StateTypes.isSupportedSize(size) {
    Error("Cube size must be between 2 and 5.")
  } else {
    let families = practiceFamilies(size)
    let suffixes = ["", "'", "2"]
    let moves = []
    let previousAxis = ref(None)
    while moves->Array.length < practiceLength(size) {
      let eligible = families->Array.filter(((_, axis)) => previousAxis.contents != Some(axis))
      let (family, axis) = Belt.Array.getUnsafe(
        eligible,
        randomIndex(random, eligible->Array.length),
      )
      let turnSuffix = Belt.Array.getUnsafe(suffixes, randomIndex(random, suffixes->Array.length))
      moves->Array.push(family ++ turnSuffix)
      previousAxis := Some(axis)
    }
    Ok(moves->Array.join(" "))
  }
}

let practiceScramble = (~size: int): result<string, string> =>
  practiceScrambleWithRandom(~size, ~random=() => Math.random())
