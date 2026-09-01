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
  family ++ suffix(turns)
}

let rec serializeUnit = unit =>
  switch unit.desc {
  | Move(move, turns) => serializeMove(move, turns)
  | Pause => "."
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

let canonicalTurns = turns => {
  let normalized = (turns % 4 + 4) % 4
  switch normalized {
  | 0 => 0
  | 1 => 1
  | 2 => 2
  | _ => -1
  }
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
        switch (entry.step, entry.pause, entry.comment) {
        | (Some(step), _, _) => {
            let axis = moveAxis(step.move)
            if runAxis.contents != Some(axis) {
              flushRun(output, run)
              runAxis := Some(axis)
            }
            addToRun(run, step)
          }
        | (None, true, _) => {
            flushRun(output, run)
            runAxis := None
            output->Array.push(located(Pause))
          }
        | (None, false, Some(text)) => {
            flushRun(output, run)
            runAxis := None
            output->Array.push(located(BlockComment(text)))
          }
        | (None, false, None) => ()
        }
      )
      flushRun(output, run)
      Ok(output)
    }
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
