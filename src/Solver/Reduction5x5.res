open StateTypes
open MoveTypes

type reductionError = {message: string}
type inspection = {
  xCentresComplete: int,
  plusCentresComplete: int,
  centreFacesComplete: int,
  wingPairsMatched: int,
  stage: string,
  nextGoal: string,
}
type guide = {alg: alg, algorithm: string, before: int, after: int}
type progress = {x: int, plus: int, faces: int, wings: int, score: int}

let xCentres = [6, 8, 16, 18]
let plusCentres = [7, 11, 13, 17]
let wingPairs = [(1, 3), (9, 19), (21, 23), (5, 15)]
let centreMoves = ["2U", "2U'", "2U2", "2R", "2R'", "2R2", "2F", "2F'", "2F2", "2D", "2D'", "2D2", "2L", "2L'", "2L2", "2B", "2B'", "2B2"]
let wingCycleNotations = ["2R U R' U' 2R'", "2R U2 2R'"]

let charAt = (value, index) => value->String.slice(~start=index, ~end=index + 1)
let faceAt = (value, index) => value->String.slice(~start=index * 25, ~end=index * 25 + 25)

let compactFacelets = (state: cubeState): option<string> => {
  let compact = FaceletCodec.render(state)
  if state.size == 5 && compact->String.length == 150 {Some(compact)} else {None}
}

let centreScore = (face, indices, core) =>
  indices->Array.reduce(0, (score, index) => score + (if charAt(face, index) == core {1} else {0}))

let progressFor = (state: cubeState): option<progress> =>
  switch compactFacelets(state) {
  | None => None
  | Some(compact) => {
    let x = ref(0)
    let plus = ref(0)
    let faces = ref(0)
    let wings = ref(0)
    let score = ref(0)
    for faceIndex in 0 to 5 {
      let face = faceAt(compact, faceIndex)
      let core = charAt(face, 12)
      let xScore = centreScore(face, xCentres, core)
      let plusScore = centreScore(face, plusCentres, core)
      if xScore == 4 {x := x.contents + 1}
      if plusScore == 4 {plus := plus.contents + 1}
      if xScore + plusScore == 8 {faces := faces.contents + 1}
      score := score.contents + xScore + plusScore
      wingPairs->Array.forEach(((left, right)) => if charAt(face, left) == charAt(face, right) {wings := wings.contents + 1})
    }
    Some({x: x.contents, plus: plus.contents, faces: faces.contents, wings: wings.contents, score: score.contents})
  }
  }

let inspectReduction5x5 = (state: cubeState): result<inspection, reductionError> =>
  switch progressFor(state) {
  | None => Error({message: "The 5×5 Academy requires a complete 5×5 state."})
  | Some(progress) => {
    let stage = if progress.faces < 6 {"centres"} else if progress.wings < 24 {"wings"} else {"handoff"}
    let nextGoal = if stage == "centres" {
      `Build the 3×3 centres around their fixed cores (${progress.faces->Int.toString}/6 complete).`
    } else if stage == "wings" {
      `Pair both wings around each fixed middle edge (${progress.wings->Int.toString}/24 matched).`
    } else {
      "Centre and wing milestones are complete. A 5×5 reduced-state finisher is the next Academy increment."
    }
    Ok({xCentresComplete: progress.x, plusCentresComplete: progress.plus, centreFacesComplete: progress.faces, wingPairsMatched: progress.wings, stage, nextGoal})
  }
  }

let parse = notation =>
  switch MoveParser.parseWithOptions(~size=5, ~lowercaseMode=Wide, ~notationDialect=Modern, notation) {
  | Ok(alg) => Some(alg)
  | Error(_) => None
  }

let planNextCentre5x5 = (state: cubeState): result<guide, reductionError> =>
  switch progressFor(state) {
  | None => Error({message: "The 5×5 centre guide requires a complete state."})
  | Some(initial) if initial.faces == 6 => Error({message: "All six 3×3 centre faces are complete."})
  | Some(initial) => {
    let best = ref(None)
    centreMoves->Array.forEach(notation =>
      switch parse(notation) {
      | None => ()
      | Some(alg) => switch MoveExecutor.applyAlg(state, alg) {
        | Ok(replay) => switch progressFor(replay) {
          | Some(after) if after.score > initial.score =>
            let candidate = {alg, algorithm: MoveTransform.serialize(alg), before: initial.score, after: after.score}
            switch best.contents { | None => best := Some(candidate) | Some(current) if candidate.after > current.after => best := Some(candidate) | Some(_) => () }
          | _ => ()
          }
        | Error(_) => ()
        }
      })
    switch best.contents { | Some(guide) => Ok(guide) | None => Error({message: "No one-turn centre improvement is available. Make a bar setup, then request the next guide."}) }
  }
  }

let planNextWingPair5x5 = (state: cubeState): result<guide, reductionError> =>
  switch progressFor(state) {
  | None => Error({message: "The 5×5 wing guide requires a complete state."})
  | Some(initial) if initial.faces != 6 => Error({message: "Complete all six 3×3 centres before requesting a wing guide."})
  | Some(initial) if initial.wings == 24 => Error({message: "All 24 visible wing pairs are already matched."})
  | Some(initial) => {
    let best = ref(None)
    wingCycleNotations->Array.forEach(notation => {
      switch parse(notation) {
      | None => ()
      | Some(seed) => [seed, MoveTransform.invert(seed)]->Array.forEach(alg => {
        switch MoveExecutor.applyAlg(state, alg) {
        | Ok(replay) => switch progressFor(replay) {
          | Some(after) if after.faces == 6 && after.wings > initial.wings =>
            let candidate = {alg, algorithm: MoveTransform.serialize(alg), before: initial.wings, after: after.wings}
            switch best.contents { | None => best := Some(candidate) | Some(current) if candidate.after > current.after => best := Some(candidate) | Some(_) => () }
          | _ => ()
          }
        | Error(_) => ()
        }
      })
      }
    })
    switch best.contents { | Some(guide) => Ok(guide) | None => Error({message: "No centre-preserving wing improvement is available. Make a pairing setup, then request the next guide."}) }
  }
  }
