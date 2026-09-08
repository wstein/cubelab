open StateTypes
open Petrus5x5Types

let parseAlg = (notation: string): option<MoveTypes.alg> =>
  switch MoveParser.parseWithOptions(
    ~size=5,
    ~lowercaseMode=Wide,
    ~notationDialect=Modern,
    notation,
  ) {
  | Ok(alg) => Some(alg)
  | Error(_) => None
  }

let phaseToName = (phase: petrusPhase): string =>
  switch phase {
  | Phase1_Block222 => "Phase 1: 2×2×2 Corner Block"
  | Phase2_Block223 => "Phase 2: 2×2×3 Expansion"
  | Phase3_EdgeOrientation => "Phase 3: Edge Orientation (EO)"
  | Phase4_WingPairingF2L => "Phase 4: Wing Pairing & F2L"
  | Phase5_LastLayer => "Phase 5: Last Layer Finish"
  | PhaseSolved => "Solved"
  }

let candidateBlockTurns = [
  "U",
  "U'",
  "U2",
  "R",
  "R'",
  "R2",
  "F",
  "F'",
  "F2",
  "2U",
  "2U'",
  "2U2",
  "2R",
  "2R'",
  "2R2",
  "2F",
  "2F'",
  "2F2",
  "D",
  "D'",
  "D2",
  "L",
  "L'",
  "L2",
  "B",
  "B'",
  "B2",
  "2D",
  "2D'",
  "2D2",
  "2L",
  "2L'",
  "2L2",
  "2B",
  "2B'",
  "2B2",
]

let candidateBlockMoves =
  candidateBlockTurns->Array.concat([
    "R U R'",
    "R U' R'",
    "F' U F",
    "F' U' F",
    "U R U' R'",
    "U' F' U F",
  ])

let candidateEoTriggers = [
  "F R U R' F'",
  "F' U F",
  "F U F'",
  "B' U B",
  "B U' B'",
  "U F R U R' F'",
  "U' F R U R' F'",
  "U2 F R U R' F'",
]

// Parse fixed candidates once. Cached ASTs never escape through returned guides.
let findImprovingCandidate = {
  let compile = notations => notations->Array.map(notation => (notation, parseAlg(notation)))
  let blockCandidates = compile(candidateBlockMoves)
  let eoCandidates = compile(candidateEoTriggers)
  let setupCandidates =
    blockCandidates->Array.slice(~start=0, ~end=candidateBlockTurns->Array.length)
  (
    state: cubeState,
    ~edgeOrientation: bool,
    ~initialScore: int,
    ~scoreReplay: cubeState => int,
  ) => {
    let best = ref(None)
    let bestScore = ref(initialScore)
    let candidates = if edgeOrientation {
      eoCandidates
    } else {
      blockCandidates
    }
    candidates->Array.forEach(((notation, parsed)) => {
      switch parsed {
      | None => ()
      | Some(alg) =>
        switch MoveExecutor.applyAlg(state, alg) {
        | Ok(replay) => {
            let score = scoreReplay(replay)
            if score > bestScore.contents {
              bestScore := score
              best := Some((notation, score))
            }
          }
        | Error(_) => ()
        }
      }
    })

    // Only search setups at a local maximum. Stream one setup state and one
    // replay at a time: no frontier, transposition table, or retained states.
    // At most 42 direct + 36 setup + 1296 pair replays per block request.
    if !edgeOrientation && best.contents == None {
      setupCandidates->Array.forEach(((setupNotation, setupAlg)) => {
        switch setupAlg {
        | None => ()
        | Some(alg) =>
          switch MoveExecutor.applyAlg(state, alg) {
          | Error(_) => ()
          | Ok(setup) =>
            setupCandidates->Array.forEach(((notation, parsed)) => {
              switch parsed {
              | None => ()
              | Some(alg) =>
                switch MoveExecutor.applyAlg(setup, alg) {
                | Error(_) => ()
                | Ok(replay) => {
                    let score = scoreReplay(replay)
                    if score > bestScore.contents {
                      bestScore := score
                      best := Some((`${setupNotation} ${notation}`, score))
                    }
                  }
                }
              }
            })
          }
        }
      })
    }
    best.contents
  }
}

/** Searches for a replay-verified move advancing the selected block. */
let findBlock222Guide = (state: cubeState, anchor: anchorCorner, initial: block222Progress): option<
  petrusGuide,
> =>
  findImprovingCandidate(
    state,
    ~edgeOrientation=false,
    ~initialScore=initial.piecesSolved,
    ~scoreReplay=replay => BlockDetector5x5.inspectBlock222(replay, anchor).piecesSolved,
  )->Option.map(((notation, solved)) => {
    phase: Phase1_Block222,
    title: "2×2×2 Block Building",
    instruction: `Execute ${notation} to assemble anchor ${BlockDetector5x5.anchorName(
        anchor,
      )} (${solved->Int.toString}/19 pieces).`,
    alg: parseAlg(notation)->Option.getOr([]),
    algorithm: notation,
    anchor,
  })

/**
 * Searches for an edge orientation trigger that reduces bad midge count.
 */
let findEOGuide = (state: cubeState, anchor: anchorCorner, initial: eoStatus): option<
  petrusGuide,
> =>
  findImprovingCandidate(
    state,
    ~edgeOrientation=true,
    ~initialScore=-initial.badCount,
    ~scoreReplay=replay =>
      if (
        BlockDetector5x5.inspectBlock222(replay, anchor).isComplete &&
        BlockDetector5x5.inspectBlock223(replay, anchor).isComplete
      ) {
        -BlockDetector5x5.inspectEO(replay).badCount
      } else {
        -12
      },
  )->Option.map(((notation, score)) => {
    phase: Phase3_EdgeOrientation,
    title: "Edge Orientation (EO)",
    instruction: `Execute EO trigger ${notation} to orient edges (bad edges remaining: ${-score->Int.toString}).`,
    alg: parseAlg(notation)->Option.getOr([]),
    algorithm: notation,
    anchor,
  })

type evaluation = {inspection: petrusInspection5x5, guide: petrusGuide}

let unavailableGuide = (phase, title, anchor): petrusGuide => {
  phase,
  title,
  instruction: "No verified improving guide is available for this state. Continue manually or use the reduction solver; no automatic move will be applied.",
  alg: [],
  algorithm: "",
  anchor,
}

let findBlock223Guide = (state, anchor, initial: block223Progress) =>
  findImprovingCandidate(
    state,
    ~edgeOrientation=false,
    ~initialScore=initial.piecesSolved,
    ~scoreReplay=replay =>
      if BlockDetector5x5.inspectBlock222(replay, anchor).isComplete {
        BlockDetector5x5.inspectBlock223(replay, anchor).piecesSolved
      } else {
        -1
      },
  )->Option.map(((notation, solved)) => {
    phase: Phase2_Block223,
    title: "2×2×3 Block Expansion",
    instruction: `Execute ${notation} to expand anchor ${BlockDetector5x5.anchorName(
        anchor,
      )} (${solved->Int.toString}/${initial.totalPieces->Int.toString} pieces), preserving the completed corner block.`,
    alg: parseAlg(notation)->Option.getOr([]),
    algorithm: notation,
    anchor,
  })

/** Inspects and plans together so callers can render exactly the state evaluated. */
let evaluatePetrusStep5x5 = {
  // Keep this private: callers cannot pair an arbitrary stale inspection with a state.
  let planFromInspection = (state: cubeState, inspection: petrusInspection5x5): result<
    petrusGuide,
    string,
  > => {
    let anchor = inspection.bestAnchor
    switch inspection.currentPhase {
    | Phase1_Block222 =>
      switch findBlock222Guide(state, anchor, inspection.block222) {
      | Some(guide) => Ok(guide)
      | None => Ok(unavailableGuide(Phase1_Block222, "2×2×2 Block Building", anchor))
      }
    | Phase2_Block223 =>
      switch findBlock223Guide(state, anchor, inspection.block223) {
      | Some(guide) => Ok(guide)
      | None => Ok(unavailableGuide(Phase2_Block223, "2×2×3 Block Expansion", anchor))
      }
    | Phase3_EdgeOrientation =>
      switch findEOGuide(state, anchor, inspection.eo) {
      | Some(guide) => Ok(guide)
      | None => Ok(unavailableGuide(Phase3_EdgeOrientation, "Edge Orientation (EO)", anchor))
      }
    | Phase4_WingPairingF2L =>
      Ok(unavailableGuide(Phase4_WingPairingF2L, "Wing Pairing & F2L", anchor))
    | Phase5_LastLayer => Ok(unavailableGuide(Phase5_LastLayer, "Last Layer Finish", anchor))
    | PhaseSolved =>
      Ok({
        phase: PhaseSolved,
        title: "Cube Solved",
        instruction: "All pieces are solved!",
        alg: [],
        algorithm: "",
        anchor,
      })
    }
  }
  (state: cubeState): result<evaluation, string> =>
    switch BlockDetector5x5.inspectPetrus5x5(state) {
    | Error(msg) => Error(msg)
    | Ok(inspection) =>
      switch planFromInspection(state, inspection) {
      | Error(msg) => Error(msg)
      | Ok(guide) => Ok({inspection, guide})
      }
    }
}

/** Compatibility entry point for consumers that only need a guide. */
let planPetrusStep5x5 = (state: cubeState): result<petrusGuide, string> =>
  switch evaluatePetrusStep5x5(state) {
  | Error(msg) => Error(msg)
  | Ok(evaluation) => Ok(evaluation.guide)
  }
