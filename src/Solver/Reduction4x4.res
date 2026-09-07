open StateTypes
open MoveTypes

type reduced4x4 = {
  state: cubeState,
  compact: string,
}

type reduction4x4Error = {message: string}

type reduction4x4Milestone = {
  face: string,
  edge?: string,
  colours?: (string, string),
  complete: bool,
}

type reduction4x4Inspection = {
  centres: array<reduction4x4Milestone>,
  wingRows: array<reduction4x4Milestone>,
  centreBlocksComplete: int,
  centreFrameValid: bool,
  wingRowsPaired: int,
  stage: string,
  nextGoal: string,
}

type wingPairGuide4x4 = {
  alg: alg,
  algorithm: string,
  before: int,
  after: int,
}

type wingStep = {alg: alg, state: cubeState}

type ollParityRepair4x4 = {
  alg: alg,
  algorithm: string,
}

type centreGuide4x4 = {
  alg: alg,
  algorithm: string,
  frameRepair: bool,
  beforeBlocks: int,
  afterBlocks: int,
  beforeScore: int,
  afterScore: int,
}

let faces = ["U", "R", "F", "D", "L", "B"]
let centreIndices = [5, 6, 9, 10]
let edgePairs = [
  (1, 2),   // top
  (7, 11),  // right
  (13, 14), // bottom
  (4, 8),   // left
]
let edgeNames = ["top", "right", "bottom", "left"]
let reducedFacelets = [0, 1, 3, 4, 5, 7, 12, 13, 15]

let dictValues: Dict.t<'v> => array<'v> = %raw("(d => Object.values(d))")
let mapValues: Map.t<'k, 'v> => array<'v> = %raw("(m => Array.from(m.values()))")

let get = (arr, i) => Belt.Array.getUnsafe(arr, i)
let set = (arr, i, v) => Belt.Array.setUnsafe(arr, i, v)

let isCubeState: 'a => bool = %raw(`function(value) {
  return typeof value === "object" && value !== null && typeof value.size === "number" && Array.isArray(value.facelets);
}`)

external unsafeAsCubeState: 'a => cubeState = "%identity"

let compactFacelets = (state: 'a): option<string> =>
  if !isCubeState(state) {
    None
  } else {
    let s = unsafeAsCubeState(state)
    if s.size != 4 {
      None
    } else {
      let compact: string = FaceletCodec.render(s)
      if String.length(compact) == 96 {
        Some(compact)
      } else {
        None
      }
    }
  }

let parseGuide = (notation: string): option<alg> =>
  switch MoveParser.parseWithOptions(~size=4, ~lowercaseMode=Wide, ~notationDialect=Modern, notation) {
  | Ok(alg) => Some(alg)
  | Error(_) => None
  }

let centreValues = (state: 'a): option<string> =>
  switch compactFacelets(state) {
  | None => None
  | Some(compact) =>
    let chars = []
    for faceIndex in 0 to 5 {
      for i in 0 to 3 {
        let idx = faceIndex * 16 + get(centreIndices, i)
        chars->Array.push(compact->String.slice(~start=idx, ~end=idx + 1))
      }
    }
    Some(chars->Array.join(""))
  }

let centreFrames: Set.t<string> = {
  let frames = Set.make()
  switch StateTypes.solved(4) {
  | Error(_) => frames
  | Ok(solved) =>
    for x in 0 to 3 {
      for y in 0 to 3 {
        for z in 0 to 3 {
          let xStr = String.repeat("x ", x)
          let yStr = String.repeat("y ", y)
          let zStr = String.repeat("z ", z)
          let rotAlg = parseGuide(String.trim(xStr ++ yStr ++ zStr))
          switch rotAlg {
          | None => ()
          | Some(alg) =>
            switch MoveExecutor.applyAlg(solved, alg) {
            | Error(_) => ()
            | Ok(rotated) =>
              switch centreValues(rotated) {
              | Some(frame) => frames->Set.add(frame)
              | None => ()
              }
            }
          }
        }
      }
    }
    frames
  }
}

let isCentreFrameValid = (state: 'a): bool =>
  switch centreValues(state) {
  | None => false
  | Some(values) => Set.has(centreFrames, values)
  }

let inspectReduction4x4 = (state: 'a): result<reduction4x4Inspection, reduction4x4Error> =>
  switch compactFacelets(state) {
  | None => Error({message: "The reduction solver supports only complete 4×4 states."})
  | Some(compact) =>
    let centres: array<reduction4x4Milestone> = []
    let wingRows: array<reduction4x4Milestone> = []
    for faceIndex in 0 to Array.length(faces) - 1 {
      let faceName = get(faces, faceIndex)
      let face = compact->String.slice(~start=faceIndex * 16, ~end=(faceIndex + 1) * 16)
      let c0 = face->String.slice(~start=get(centreIndices, 0), ~end=get(centreIndices, 0) + 1)
      let c1 = face->String.slice(~start=get(centreIndices, 1), ~end=get(centreIndices, 1) + 1)
      let c2 = face->String.slice(~start=get(centreIndices, 2), ~end=get(centreIndices, 2) + 1)
      let c3 = face->String.slice(~start=get(centreIndices, 3), ~end=get(centreIndices, 3) + 1)
      let centreComplete = c0 == c1 && c1 == c2 && c2 == c3
      centres->Array.push({face: faceName, complete: centreComplete})

      for edgeIndex in 0 to Array.length(edgePairs) - 1 {
        let (p0, p1) = get(edgePairs, edgeIndex)
        let edgeName = get(edgeNames, edgeIndex)
        let col0 = face->String.slice(~start=p0, ~end=p0 + 1)
        let col1 = face->String.slice(~start=p1, ~end=p1 + 1)
        wingRows->Array.push({
          face: faceName,
          edge: edgeName,
          colours: (col0, col1),
          complete: col0 == col1,
        })
      }
    }

    let centreBlocksComplete = centres->Array.filter(m => m.complete)->Array.length
    let wingRowsPaired = wingRows->Array.filter(m => m.complete)->Array.length
    let centreFrameValid = isCentreFrameValid(state)

    let stage =
      if centreBlocksComplete < Array.length(faces) || !centreFrameValid {
        "centres"
      } else if wingRowsPaired < Array.length(wingRows) {
        "wings"
      } else {
        "reduced"
      }

    let nextGoal =
      if !centreFrameValid && centreBlocksComplete == Array.length(faces) {
        "Reposition the completed centre blocks into a valid U/R/F colour frame before wing pairing."
      } else if stage == "centres" {
        `Build centre blocks (${Int.toString(centreBlocksComplete)}/6 complete).`
      } else if stage == "wings" {
        `Pair wing rows (${Int.toString(wingRowsPaired)}/24 matched).`
      } else {
        "Reduction complete — ready for the 3×3 finish."
      }

    Ok({
      centres,
      wingRows,
      centreBlocksComplete,
      centreFrameValid,
      wingRowsPaired,
      stage,
      nextGoal,
    })
  }

type centreProgress = {blocks: int, score: int, fixed: int}

let centreProgressFor = (values: string): centreProgress => {
  let blocks = ref(0)
  let score = ref(0)
  let fixed = ref(0)
  for faceIndex in 0 to Array.length(faces) - 1 {
    let faceName = get(faces, faceIndex)
    let c = [
      values->String.slice(~start=faceIndex * 4, ~end=faceIndex * 4 + 1),
      values->String.slice(~start=faceIndex * 4 + 1, ~end=faceIndex * 4 + 2),
      values->String.slice(~start=faceIndex * 4 + 2, ~end=faceIndex * 4 + 3),
      values->String.slice(~start=faceIndex * 4 + 3, ~end=faceIndex * 4 + 4),
    ]
    let counts = Dict.make()
    for i in 0 to 3 {
      let col = get(c, i)
      let cur = switch Dict.get(counts, col) {
      | Some(n) => n + 1
      | None => 1
      }
      Dict.set(counts, col, cur)
      if col == faceName {
        fixed := fixed.contents + 1
      }
    }
    let largestGroup = ref(0)
    dictValues(counts)->Array.forEach(cnt => {
      if cnt > largestGroup.contents {
        largestGroup := cnt
      }
    })
    score := score.contents + largestGroup.contents
    if largestGroup.contents == 4 {
      blocks := blocks.contents + 1
    }
  }
  {blocks: blocks.contents, score: score.contents, fixed: fixed.contents}
}

type centreMove = {
  notation: string,
  alg: alg,
  permutation: array<int>,
}

let centreMoveNotations: array<string> = {
  let arr = []
  faces->Array.forEach(face => {
    arr->Array.push(face)
    arr->Array.push(face ++ "'")
    arr->Array.push(face ++ "2")
    arr->Array.push("2" ++ face)
    arr->Array.push("2" ++ face ++ "'")
    arr->Array.push("2" ++ face ++ "2")
  })
  arr
}

let centreMoves: array<centreMove> = {
  let locations = []
  faces->Array.forEach(face => {
    let faceIdx = StateTypes.storageIndex(switch face {
    | "U" => U | "R" => R | "F" => F | "D" => D | "L" => L | _ => B
    })
    centreIndices->Array.forEach(idx => {
      locations->Array.push(faceIdx * 16 + idx)
    })
  })
  let locationToSlot = Map.make()
  locations->Array.forEachWithIndex((loc, slot) => {
    Map.set(locationToSlot, loc, slot)
  })

  let moves = []
  centreMoveNotations->Array.forEach(notation => {
    switch parseGuide(notation) {
    | None => ()
    | Some(alg) =>
      let rawReplay: 'a = %raw(`function(alg, storageOrder, centreIndices, locationToSlot, storageIndex) {
        var marker = {
          size: 4,
          facelets: storageOrder.map(function(_, faceIndex) {
            return Array.from({length: 16}, function(_, index) { return String(faceIndex * 16 + index); });
          })
        };
        var res = MoveExecutor.applyAlg(marker, alg);
        if (res.TAG === "Error") return null;
        var permutation = [];
        var faceNames = ["U", "R", "F", "D", "L", "B"];
        for (var f = 0; f < faceNames.length; f++) {
          var face = faceNames[f];
          var stIdx = storageIndex(face);
          for (var i = 0; i < centreIndices.length; i++) {
            var rawVal = Number(res._0.facelets[stIdx][centreIndices[i]]);
            var slot = locationToSlot.get(rawVal);
            if (slot === undefined) return null;
            permutation.push(slot);
          }
        }
        return permutation;
      }`)(alg, StateTypes.storageOrder, centreIndices, locationToSlot, StateTypes.storageIndex)
      switch Nullable.toOption(rawReplay) {
      | Some(perm) => moves->Array.push({notation, alg, permutation: perm})
      | None => ()
      }
    }
  })
  moves
}

let applyCentreMove = (values: string, move: centreMove): string => {
  let chars = []
  for i in 0 to Array.length(move.permutation) - 1 {
    let source = get(move.permutation, i)
    chars->Array.push(values->String.slice(~start=source, ~end=source + 1))
  }
  chars->Array.join("")
}

let centreSearchScore = (progress: centreProgress): int =>
  progress.blocks * 100 + progress.score

type centreCandidate = {
  values: string,
  alg: alg,
  lastFace: string,
  score: int,
  blocks: int,
  fixed: int,
}

let planNextCentreBlock4x4 = (state: 'a): result<centreGuide4x4, reduction4x4Error> =>
  switch centreValues(state) {
  | None => Error({message: "The centre guide supports only complete 4×4 states."})
  | Some(start) =>
    let initial = centreProgressFor(start)
    let repairFrame = initial.blocks == 6 && !isCentreFrameValid(state)
    if initial.blocks == 6 && !repairFrame {
      Error({message: "All six centre blocks are complete."})
    } else {
      let frontier: ref<array<centreCandidate>> = ref([{
        values: start,
        alg: [],
        lastFace: "",
        score: initial.score,
        blocks: initial.blocks,
        fixed: initial.fixed,
      }])
      let best: ref<option<centreCandidate>> = ref(None)

      for _depth in 0 to 9 {
        let next: array<centreCandidate> = []
        let seen = Set.make()
        frontier.contents->Array.forEach(candidate => {
          centreMoves->Array.forEach(move => {
            let facePrefix = if move.notation->String.slice(~start=0, ~end=1) == "2" {
              move.notation->String.slice(~start=1, ~end=2)
            } else {
              move.notation->String.slice(~start=0, ~end=1)
            }
            if facePrefix != candidate.lastFace {
              let values = applyCentreMove(candidate.values, move)
              if !Set.has(seen, values) {
                Set.add(seen, values)
                let progress = centreProgressFor(values)
                let expanded = {
                  values,
                  alg: Array.concat(candidate.alg, move.alg),
                  lastFace: facePrefix,
                  score: progress.score,
                  blocks: progress.blocks,
                  fixed: progress.fixed,
                }
                next->Array.push(expanded)
                let improves = if repairFrame {
                  progress.fixed > initial.fixed
                } else {
                  progress.blocks > initial.blocks || (progress.blocks == initial.blocks && progress.score > initial.score)
                }
                if improves {
                  switch best.contents {
                  | None => best := Some(expanded)
                  | Some(current) =>
                    let better = if repairFrame {
                      progress.fixed > current.fixed
                    } else if progress.blocks > current.blocks {
                      true
                    } else if progress.blocks == current.blocks && progress.score > current.score {
                      true
                    } else {
                      false
                    }
                    if better {
                      best := Some(expanded)
                    }
                  }
                }
              }
            }
          })
        })
        let ranked = next->Belt.SortArray.stableSortBy((left, right) => {
          let scoreDiff = if repairFrame {
            right.fixed - left.fixed
          } else {
            centreSearchScore({blocks: right.blocks, score: right.score, fixed: right.fixed}) -
            centreSearchScore({blocks: left.blocks, score: left.score, fixed: left.fixed})
          }
          if scoreDiff != 0 {
            scoreDiff
          } else {
            Array.length(left.alg) - Array.length(right.alg)
          }
        })
        frontier := ranked->Array.slice(~start=0, ~end=min(1600, Array.length(ranked)))
      }

      switch best.contents {
      | None =>
        Error({
          message: if repairFrame {
            "No centre-frame reordering sequence was found in the local search."
          } else {
            "No centre improvement was found in the local search. Make one centre setup move, then request the next guide."
          },
        })
      | Some(b) =>
        Ok({
          alg: b.alg,
          algorithm: MoveTransform.serialize(b.alg),
          frameRepair: repairFrame,
          beforeBlocks: initial.blocks,
          afterBlocks: b.blocks,
          beforeScore: initial.score,
          afterScore: b.score,
        })
      }
    }
  }

let pairingSeedNotations = [
  "2R U R' U' 2R'",
  "2R U R U' 2R'",
  "u' R U R' F R' F' R u",
]

let ollParityNotation = "r U2 x r U2 r U2 r' U2 l U2 r' U2 r U2 r' U2 r'"
let pllParityNotation = "2R2 U2 2R2 u2 2R2 u2"

let outerSetupNotations = [
  "",
  "U", "U'", "U2",
  "R", "R'", "R2",
  "F", "F'", "F2",
  "D", "D'", "D2",
  "L", "L'", "L2",
  "B", "B'", "B2",
]

let secondSetupNotations = ["", "U", "U'", "U2", "R", "R'", "R2", "F", "F'", "F2"]

let edgeFlipSlots = (error: 'a): option<array<int>> => {
  let raw: Nullable.t<array<int>> = %raw(`function(error) {
    if (typeof error !== "object" || error === null) return null;
    if (error.TAG !== "SolvabilityViolation" || typeof error._0 !== "object" || error._0 === null) return null;
    var violation = error._0;
    return violation.TAG === "EdgeFlip" && Array.isArray(violation.affectedSlots)
      ? violation.affectedSlots.filter(function(s) { return typeof s === "number"; })
      : null;
  }`)(error)
  Nullable.toOption(raw)
}

let hasPermutationParityMismatch = (error: 'a): bool =>
  %raw(`function(error) {
    if (typeof error !== "object" || error === null) return false;
    if (error.TAG !== "SolvabilityViolation") return false;
    return error._0 === "PermutationParityMismatch"
      || (typeof error._0 === "object" && error._0 !== null && error._0.TAG === "PermutationParityMismatch");
  }`)(error)

let planNextWingPair4x4 = (state: 'a): result<wingPairGuide4x4, reduction4x4Error> =>
  switch inspectReduction4x4(state) {
  | Error(e) => Error(e)
  | Ok(initial) if initial.centreBlocksComplete != 6 =>
    Error({message: "Complete all six centre blocks before requesting a wing-pair guide."})
  | Ok(initial) if initial.wingRowsPaired == 24 =>
    Error({message: "All visible wing rows are already paired."})
  | Ok(initial) => {
    let setups = []
    outerSetupNotations->Array.forEach(notation => {
      switch parseGuide(notation) {
      | Some(s) => setups->Array.push(s)
      | None => ()
      }
    })

    let rotatedSeeds = Map.make()
    pairingSeedNotations->Array.forEach(notation => {
      switch parseGuide(notation) {
      | None => ()
      | Some(seed) =>
        for x in 0 to 3 {
          for y in 0 to 3 {
            for z in 0 to 3 {
              let rotated = MoveTransform.rotate(
                MoveTransform.rotate(
                  MoveTransform.rotate(seed, ~axis=X, ~turns=x),
                  ~axis=Y,
                  ~turns=y,
                ),
                ~axis=Z,
                ~turns=z,
              )
              let serialized = MoveTransform.serialize(rotated)
              Map.set(rotatedSeeds, serialized, rotated)
            }
          }
        }
      }
    })

    let best: ref<option<wingPairGuide4x4>> = ref(None)

    let evaluate = (candidateSetups: array<alg>): unit => {
      candidateSetups->Array.forEach(setup => {
        mapValues(rotatedSeeds)->Array.forEach(seed => {
          let alg = Array.concat(Array.concat(setup, seed), MoveTransform.invert(setup))
          switch MoveExecutor.applyAlg(state, alg) {
          | Error(_) => ()
          | Ok(replay) =>
            switch inspectReduction4x4(replay) {
            | Error(_) => ()
            | Ok(after) if after.centreBlocksComplete == 6 && after.wingRowsPaired > initial.wingRowsPaired =>
              let guide = {
                alg,
                algorithm: MoveTransform.serialize(alg),
                before: initial.wingRowsPaired,
                after: after.wingRowsPaired,
              }
              switch best.contents {
              | None => best := Some(guide)
              | Some(current) =>
                if guide.after > current.after || (guide.after == current.after && String.length(guide.algorithm) < String.length(current.algorithm)) {
                  best := Some(guide)
                }
              }
            | _ => ()
            }
          }
        })
      })
    }

    evaluate(setups)

    if best.contents == None {
      let secondTurns = []
      secondSetupNotations->Array.forEach(notation => {
        switch parseGuide(notation) {
        | Some(s) => secondTurns->Array.push(s)
        | None => ()
        }
      })
      let twoPlySetups = []
      secondTurns->Array.forEach(first => {
        secondTurns->Array.forEach(second => {
          twoPlySetups->Array.push(Array.concat(first, second))
        })
      })
      evaluate(twoPlySetups)
    }

    if best.contents == None {
      let firstSteps: array<wingStep> = []
      mapValues(rotatedSeeds)->Array.forEach(first => {
        switch MoveExecutor.applyAlg(state, first) {
        | Error(_) => ()
        | Ok(replay) =>
          switch inspectReduction4x4(replay) {
          | Ok(after) if after.centreBlocksComplete == 6 && after.wingRowsPaired >= initial.wingRowsPaired - 4 =>
            firstSteps->Array.push({alg: first, state: replay})
          | _ => ()
          }
        }
      })

      let secondSteps = Map.make()
      setups->Array.forEach(setup => {
        mapValues(rotatedSeeds)->Array.forEach(seed => {
          let alg = Array.concat(Array.concat(setup, seed), MoveTransform.invert(setup))
          Map.set(secondSteps, MoveTransform.serialize(alg), alg)
        })
      })

      let finished = ref(false)
      for i in 0 to Array.length(firstSteps) - 1 {
        if !finished.contents {
          let first = get(firstSteps, i)
          let secVals = mapValues(secondSteps)
          for j in 0 to Array.length(secVals) - 1 {
            if !finished.contents {
              let second = get(secVals, j)
              switch MoveExecutor.applyAlg(first.state, second) {
              | Error(_) => ()
              | Ok(replay) =>
                switch inspectReduction4x4(replay) {
                | Ok(after) if after.centreBlocksComplete == 6 && after.wingRowsPaired > initial.wingRowsPaired =>
                  let alg = Array.concat(first.alg, second)
                  let guide = {
                    alg,
                    algorithm: MoveTransform.serialize(alg),
                    before: initial.wingRowsPaired,
                    after: after.wingRowsPaired,
                  }
                  switch best.contents {
                  | None => best := Some(guide)
                  | Some(current) =>
                    if guide.after > current.after || (guide.after == current.after && String.length(guide.algorithm) < String.length(current.algorithm)) {
                      best := Some(guide)
                    }
                  }
                  if guide.after == 24 {
                    finished := true
                  }
                | _ => ()
                }
              }
            }
          }
        }
      }
    }

    switch best.contents {
    | None =>
      Error({
        message: "No single improving wing-pair move was found; this position needs a setup or parity step before requesting the next guide.",
      })
    | Some(g) => Ok(g)
    }
  }
}

let reduce4x4 = (state: 'a): result<reduced4x4, reduction4x4Error> =>
  switch compactFacelets(state) {
  | None => Error({message: "The reduction solver supports only complete 4×4 states."})
  | Some(compact) =>
    switch inspectReduction4x4(state) {
    | Error(e) => Error(e)
    | Ok(inspection) if inspection.stage != "reduced" =>
      Error({message: inspection.nextGoal})
    | Ok(_) => {
      let reducedChars = []
      let earlyError: ref<option<string>> = ref(None)
      for faceIndex in 0 to Array.length(faces) - 1 {
        if earlyError.contents == None {
          let faceName = get(faces, faceIndex)
          let face = compact->String.slice(~start=faceIndex * 16, ~end=(faceIndex + 1) * 16)
          let c0 = face->String.slice(~start=get(centreIndices, 0), ~end=get(centreIndices, 0) + 1)
          let c1 = face->String.slice(~start=get(centreIndices, 1), ~end=get(centreIndices, 1) + 1)
          let c2 = face->String.slice(~start=get(centreIndices, 2), ~end=get(centreIndices, 2) + 1)
          let c3 = face->String.slice(~start=get(centreIndices, 3), ~end=get(centreIndices, 3) + 1)
          if c0 != c1 || c1 != c2 || c2 != c3 {
            earlyError := Some(`${faceName} centres are not reduced yet.`)
          } else {
            for edgeIndex in 0 to Array.length(edgePairs) - 1 {
              let (p0, p1) = get(edgePairs, edgeIndex)
              let e0 = face->String.slice(~start=p0, ~end=p0 + 1)
              let e1 = face->String.slice(~start=p1, ~end=p1 + 1)
              if e0 != e1 {
                earlyError := Some(`${faceName} ${get(edgeNames, edgeIndex)} wings are not paired yet.`)
              }
            }
            for i in 0 to Array.length(reducedFacelets) - 1 {
              let idx = get(reducedFacelets, i)
              reducedChars->Array.push(face->String.slice(~start=idx, ~end=idx + 1))
            }
          }
        }
      }

      switch earlyError.contents {
      | Some(msg) => Error({message: msg})
      | None =>
        let reducedCompact = reducedChars->Array.join("")
        switch FaceletCodec.parse(~size=3, reducedCompact) {
        | Error(_) => Error({message: "The reduced 3×3 facelets do not have one of each colour."})
        | Ok(parsed) =>
          switch PieceReducer.reduce(parsed) {
          | Error(piecesErr) =>
            switch edgeFlipSlots(piecesErr) {
            | Some(flipped) =>
              let count = Array.length(flipped)
              let verb = if count == 1 { " is" } else { "s are" }
              Error({
                message: `4×4 OLL parity detected: ${Int.toString(count)} reduced dedge orientation${verb} flipped. Apply the OLL-parity repair before the 3×3 finish.`,
              })
            | None =>
              if hasPermutationParityMismatch(piecesErr) {
                Error({
                  message: "4×4 PLL parity detected: one dedge pair is swapped in the reduced state. Apply the PLL-parity repair before the 3×3 finish.",
                })
              } else {
                Error({
                  message: `The reduced 3×3 state is not physically reachable: ${PieceReducer.describeError(piecesErr)}.`,
                })
              }
            }
          | Ok(_) => Ok({state: parsed, compact: reducedCompact})
          }
        }
      }
    }
  }
}

let planOLLParityRepair4x4 = (state: 'a): result<ollParityRepair4x4, reduction4x4Error> =>
  switch reduce4x4(state) {
  | Ok(_) => Error({message: "No OLL parity repair is needed."})
  | Error(e) =>
    if !String.startsWith(e.message, "4×4 OLL parity detected:") {
      Error(e)
    } else {
      switch parseGuide(ollParityNotation) {
      | None => Error({message: "The OLL-parity repair could not be parsed."})
      | Some(alg) =>
        switch MoveExecutor.applyAlg(state, alg) {
        | Error(_) => Error({message: "The OLL-parity repair did not produce a legal reduced 3×3 state."})
        | Ok(replay) =>
          switch reduce4x4(replay) {
          | Error(_) => Error({message: "The OLL-parity repair did not produce a legal reduced 3×3 state."})
          | Ok(_) => Ok({alg, algorithm: MoveTransform.serialize(alg)})
          }
        }
      }
    }
  }

let planPLLParityRepair4x4 = (state: 'a): result<ollParityRepair4x4, reduction4x4Error> =>
  switch reduce4x4(state) {
  | Ok(_) => Error({message: "No PLL parity repair is needed."})
  | Error(e) =>
    if !String.startsWith(e.message, "4×4 PLL parity detected:") {
      Error(e)
    } else {
      switch parseGuide(pllParityNotation) {
      | None => Error({message: "The PLL-parity repair could not be parsed."})
      | Some(alg) =>
        switch MoveExecutor.applyAlg(state, alg) {
        | Error(_) => Error({message: "The PLL-parity repair did not produce a legal reduced 3×3 state."})
        | Ok(replay) =>
          switch reduce4x4(replay) {
          | Error(_) => Error({message: "The PLL-parity repair did not produce a legal reduced 3×3 state."})
          | Ok(_) => Ok({alg, algorithm: MoveTransform.serialize(alg)})
          }
        }
      }
    }
  }

let isMonochromeSolved4x4 = (state: 'a): bool =>
  switch compactFacelets(state) {
  | None => false
  | Some(compact) => {
    let allMono = ref(true)
    for faceIndex in 0 to Array.length(faces) - 1 {
      let face = compact->String.slice(~start=faceIndex * 16, ~end=(faceIndex + 1) * 16)
      let firstChar = face->String.slice(~start=0, ~end=1)
      for i in 1 to 15 {
        if face->String.slice(~start=i, ~end=i + 1) != firstChar {
          allMono := false
        }
      }
    }
    allMono.contents
  }
  }
