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
type guide = {alg: alg, algorithm: string, before: int, after: int, kind: string, barsBefore: int, barsAfter: int, completedBefore: int, completedAfter: int}
type reduced = {state: cubeState, compact: string}
type progress = {x: int, plus: int, faces: int, wings: int, score: int}
type centreCandidate = {state: cubeState, alg: alg, lastFace: string, score: int}

let xCentres = [6, 8, 16, 18]
let plusCentres = [7, 11, 13, 17]
let wingPairs = [(1, 3), (9, 19), (21, 23), (5, 15)]
let middleEdges = [2, 14, 22, 10]
let reducedIndices = [0, 2, 4, 10, 12, 14, 20, 22, 24]
let centreMoves = ["2U", "2U'", "2U2", "2R", "2R'", "2R2", "2F", "2F'", "2F2", "2D", "2D'", "2D2", "2L", "2L'", "2L2", "2B", "2B'", "2B2"]
let centreSearchMoves = ["U", "U'", "U2", "R", "R'", "R2", "F", "F'", "F2", "D", "D'", "D2", "L", "L'", "L2", "B", "B'", "B2", ...centreMoves]
let wingCycleNotations = ["2R U R' U' 2R'", "2R U2 2R'"]

let charAt = (value, index) => value->String.slice(~start=index, ~end=index + 1)
let faceAt = (value, index) => value->String.slice(~start=index * 25, ~end=index * 25 + 25)

let compactFacelets = (state: cubeState): option<string> => {
  let compact = FaceletCodec.render(state)
  if state.size == 5 && compact->String.length == 150 {Some(compact)} else {None}
}

let centreScore = (face, indices, core) =>
  indices->Array.reduce(0, (score, index) => score + (if charAt(face, index) == core {1} else {0}))

/** Counts core-aligned 1×3 centre bars. A bar setup may deliberately trade a
 * few placed stickers for a row or column that can be joined next. */
let centreBarScore = (state: cubeState): option<int> =>
  switch compactFacelets(state) {
  | None => None
  | Some(compact) => {
    let bars = ref(0)
    for faceIndex in 0 to 5 {
      let face = faceAt(compact, faceIndex)
      let core = charAt(face, 12)
      [[6, 7, 8], [11, 12, 13], [16, 17, 18], [6, 11, 16], [7, 12, 17], [8, 13, 18]]
      ->Array.forEach(line => {
        if line->Array.every(index => charAt(face, index) == core) {bars := bars.contents + 1}
      })
    }
    Some(bars.contents)
  }
  }

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

/** Runs only in the solver worker. The diagonal X-centres are isomorphic to
 * the 24 centres of a 4×4, so the exact three-phase coordinate can supply a
 * replay-verified 5×5 centre cycle. */
let solveXCentreCycle5x5 = (state: cubeState): result<guide, reductionError> =>
  switch progressFor(state) {
  | None => Error({message: "The 5×5 centre-cycle solver requires a complete state."})
  | Some(initial) => {
    let compact = FaceletCodec.render(state)
    let output = ref([])
    [0, 3, 2, 5, 1, 4]->Array.forEach(faceIndex => {
      let face = faceAt(compact, faceIndex)
      [6, 8, 18, 16]->Array.forEach(index => output := Array.concat(output.contents, [charAt(face, index)]))
    })
    let centres = output.contents->Array.join("")
    switch ThreePhase4x4.solveCentreReduction(centres, 10, 14, 48) {
    | Error(_) => Error({message: "The exact X-centre cycle search did not find a bounded reduction."})
    | Ok(solution) => {
      let notation = Array.concat(solution.phase1Notations, solution.phase2Notations)->Array.join(" ")
      switch parse(notation) {
      | None => Error({message: "The X-centre solver generated invalid 5×5 notation."})
      | Some(alg) => switch MoveExecutor.applyAlg(state, alg) {
        | Error(_) => Error({message: "The X-centre cycle could not be replayed on the 5×5 state."})
        | Ok(replay) => switch progressFor(replay) {
          | Some(after) if after.x > initial.x => Ok({alg, algorithm: MoveTransform.serialize(alg), before: initial.score, after: after.score, kind: "cycle", barsBefore: 0, barsAfter: 0, completedBefore: initial.x + initial.plus, completedAfter: after.x + after.plus})
          | _ => Error({message: "The mapped X-centre cycle did not improve the 5×5 X-centre orbit."})
          }
        }
      }
    }
    }
  }
  }

/** When individual sticker placement is locally flat, prefer completing one
 * whole X- or +-centre orbit. This keeps the tutorial moving through its
 * actual milestone, instead of requiring an arbitrary manual setup. */
let planNextCentreOrbit = (state: cubeState, initial: progress): option<guide> => {
  let completedBefore = initial.x + initial.plus
  let best = ref(None)
  let frontier: ref<array<centreCandidate>> = ref([{state, alg: [], lastFace: "", score: initial.score + completedBefore * 100}])
  for _ in 0 to 2 {
    let next = ref([])
    frontier.contents->Array.forEach(candidate => centreSearchMoves->Array.forEach(notation => {
      let face = if notation->String.slice(~start=0, ~end=1) == "2" {notation->String.slice(~start=1, ~end=2)} else {notation->String.slice(~start=0, ~end=1)}
      if face != candidate.lastFace {
        switch parse(notation) {
        | None => ()
        | Some(move) => switch MoveExecutor.applyAlg(candidate.state, move) {
          | Error(_) => ()
          | Ok(nextState) => switch progressFor(nextState) {
            | None => ()
            | Some(after) => {
              let completedAfter = after.x + after.plus
              let quality = after.score + completedAfter * 100 + after.faces * 1000
              let expanded = {state: nextState, alg: Array.concat(candidate.alg, move), lastFace: face, score: quality}
              next := [expanded, ...next.contents]
              if completedAfter > completedBefore {
                let guide = {alg: expanded.alg, algorithm: MoveTransform.serialize(expanded.alg), before: initial.score, after: after.score, kind: "orbit", barsBefore: 0, barsAfter: 0, completedBefore, completedAfter}
                switch best.contents { | None => best := Some(guide) | Some(current) if guide.completedAfter > current.completedAfter || (guide.completedAfter == current.completedAfter && guide.after > current.after) => best := Some(guide) | Some(_) => () }
              }
            }
            }
          }
        }
      }
    }))
    let ranked = next.contents->Belt.SortArray.stableSortBy((left, right) => right.score - left.score)
    frontier := ranked->Array.slice(~start=0, ~end=min(900, ranked->Array.length))
  }
  best.contents
}

let planNextCentre5x5 = (state: cubeState): result<guide, reductionError> =>
  switch progressFor(state) {
  | None => Error({message: "The 5×5 centre guide requires a complete state."})
  | Some(initial) if initial.faces == 6 => Error({message: "All six 3×3 centre faces are complete."})
  | Some(initial) => {
    let best = ref(None)
    let initialBars = switch centreBarScore(state) { | Some(value) => value | None => 0 }
    let bestBar = ref(None)
    let frontier: ref<array<centreCandidate>> = ref([{state, alg: [], lastFace: "", score: initial.score}])
    for _ in 0 to 2 {
      let next = ref([])
      frontier.contents->Array.forEach(candidate => centreSearchMoves->Array.forEach(notation => {
        let face = if notation->String.slice(~start=0, ~end=1) == "2" {notation->String.slice(~start=1, ~end=2)} else {notation->String.slice(~start=0, ~end=1)}
        if face != candidate.lastFace {
          switch parse(notation) {
          | None => ()
          | Some(move) => switch MoveExecutor.applyAlg(candidate.state, move) {
            | Error(_) => ()
            | Ok(nextState) => switch progressFor(nextState) {
              | None => ()
              | Some(after) => {
                let expanded = {state: nextState, alg: Array.concat(candidate.alg, move), lastFace: face, score: after.score}
                next := [expanded, ...next.contents]
                if after.score > initial.score {
                  let guide = {alg: expanded.alg, algorithm: MoveTransform.serialize(expanded.alg), before: initial.score, after: after.score, kind: "improvement", barsBefore: initialBars, barsAfter: initialBars, completedBefore: initial.x + initial.plus, completedAfter: initial.x + initial.plus}
                  switch best.contents { | None => best := Some(guide) | Some(current) if guide.after > current.after => best := Some(guide) | Some(_) => () }
                } else if after.score >= initial.score - 3 {
                  switch centreBarScore(nextState) {
                  | Some(barsAfter) if barsAfter > initialBars => {
                    let guide = {alg: expanded.alg, algorithm: MoveTransform.serialize(expanded.alg), before: initial.score, after: after.score, kind: "bar", barsBefore: initialBars, barsAfter, completedBefore: initial.x + initial.plus, completedAfter: initial.x + initial.plus}
                    switch bestBar.contents { | None => bestBar := Some(guide) | Some(current) if guide.barsAfter > current.barsAfter || (guide.barsAfter == current.barsAfter && guide.after > current.after) => bestBar := Some(guide) | Some(_) => () }
                    }
                  | _ => ()
                  }
                }
              }
              }
            }
          }
        }
      }))
      let ranked = next.contents->Belt.SortArray.stableSortBy((left, right) => right.score - left.score)
      frontier := ranked->Array.slice(~start=0, ~end=min(900, ranked->Array.length))
    }
    switch best.contents { | Some(guide) => Ok(guide) | None => switch bestBar.contents { | Some(guide) => Ok(guide) | None => switch planNextCentreOrbit(state, initial) { | Some(guide) => Ok(guide) | None => Error({message: "No bounded centre improvement, bar setup, or orbit completion is available. The full centre-cycle solver runs separately from the page."}) } } }
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
      | Some(seed) => {
        let variants = ref([])
        for xTurns in 0 to 3 {
          for yTurns in 0 to 3 {
            for zTurns in 0 to 3 {
              let rotated = seed
                ->MoveTransform.rotate(~axis=X, ~turns=xTurns)
                ->MoveTransform.rotate(~axis=Y, ~turns=yTurns)
                ->MoveTransform.rotate(~axis=Z, ~turns=zTurns)
              variants := [rotated, MoveTransform.invert(rotated), ...variants.contents]
            }
          }
        }
        variants.contents->Array.forEach(alg => {
        switch MoveExecutor.applyAlg(state, alg) {
        | Ok(replay) => switch progressFor(replay) {
          | Some(after) if after.faces == 6 && after.wings > initial.wings =>
            let candidate = {alg, algorithm: MoveTransform.serialize(alg), before: initial.wings, after: after.wings, kind: "wing", barsBefore: 0, barsAfter: 0, completedBefore: 0, completedAfter: 0}
            switch best.contents { | None => best := Some(candidate) | Some(current) if candidate.after > current.after => best := Some(candidate) | Some(_) => () }
          | _ => ()
          }
        | Error(_) => ()
        }
        })
      }
      }
    })
    switch best.contents { | Some(guide) => Ok(guide) | None => Error({message: "No centre-preserving wing improvement is available. Make a pairing setup, then request the next guide."}) }
  }
  }

/**
 * Projects only a genuinely reduced 5×5. The fixed middle edges supply the
 * reduced 3×3 edge stickers, but both surrounding wings must agree with that
 * middle-edge colour first. PieceReducer then supplies the parity/physical
 * reachability diagnostic for the projected odd-cube state.
 */
let reduce5x5 = (state: cubeState): result<reduced, reductionError> =>
  switch compactFacelets(state) {
  | None => Error({message: "The 5×5 reduction handoff requires a complete 5×5 state."})
  | Some(compact) => switch progressFor(state) {
    | None => Error({message: "The 5×5 reduction handoff could not inspect this state."})
    | Some(progress) if progress.faces != 6 => Error({message: "Complete all six fixed-core 3×3 centres before the 3×3 handoff."})
    | Some(progress) if progress.wings != 24 => Error({message: `Pair all 24 wing rows before the 3×3 handoff (${progress.wings->Int.toString}/24 matched).`})
    | Some(_) => {
      let valid = ref(true)
      for faceIndex in 0 to 5 {
        let face = faceAt(compact, faceIndex)
        let core = charAt(face, 12)
        if centreScore(face, xCentres, core) + centreScore(face, plusCentres, core) != 8 {valid := false}
        for edgeIndex in 0 to 3 {
          let (left, right) = Belt.Array.getUnsafe(wingPairs, edgeIndex)
          let middle = Belt.Array.getUnsafe(middleEdges, edgeIndex)
          if charAt(face, left) != charAt(face, middle) || charAt(face, right) != charAt(face, middle) {valid := false}
        }
      }
      if !valid.contents {
        Error({message: "The wing rows are matched but do not yet agree with their fixed middle edges; continue pairing before handoff."})
      } else {
        let reducedCompact = ref("")
        for faceIndex in 0 to 5 {
          let face = faceAt(compact, faceIndex)
          reducedCompact := reducedCompact.contents ++ reducedIndices->Array.map(index => charAt(face, index))->Array.join("")
        }
        switch FaceletCodec.parse(~size=3, reducedCompact.contents) {
        | Error(_) => Error({message: "The projected 3×3 does not have the required colour inventory."})
        | Ok(reduced) => switch PieceReducer.reduce(reduced) {
          | Ok(_) => Ok({state: reduced, compact: reducedCompact.contents})
          | Error(error) => Error({message: `5×5 reduced-state parity/solvability diagnostic: ${PieceReducer.describeError(error)}`})
          }
        }
      }
    }
    }
  }
