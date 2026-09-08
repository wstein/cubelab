open StateTypes
open Petrus5x5Types

let parseAlg = (notation: string): option<MoveTypes.alg> =>
  switch MoveParser.parseWithOptions(~size=5, ~lowercaseMode=Wide, ~notationDialect=Modern, notation) {
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

let candidateBlockMoves = [
  "U", "U'", "U2", "R", "R'", "R2", "F", "F'", "F2",
  "2U", "2U'", "2U2", "2R", "2R'", "2R2", "2F", "2F'", "2F2",
  "R U R'", "R U' R'", "F' U F", "F' U' F", "U R U' R'", "U' F' U F"
]

let candidateEoTriggers = [
  "F R U R' F'",
  "F' U F",
  "F U F'",
  "B' U B",
  "B U' B'",
  "U F R U R' F'",
  "U' F R U R' F'",
  "U2 F R U R' F'"
]

let candidateL2EPairing = [
  "Rw' U2 Rw' U2 B2 Rw' B2 Rw' F2 Lw2 F2 Rw U2 Rw2",
  "Uw' R U R' F R' F' R Uw",
  "Dw' R U R' F R' F' R Dw",
  "2R U2 2R' U2 2R' U2 2R U2 2R'",
]

let candidateParityAlgs = [
  // 5x5 OLL Parity (midge flip):
  ("OLL Parity", "Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw'"),
  // 5x5 PLL Parity (midge swap):
  ("PLL Parity", "2R2 U2 2R2 u2 2R2 u2 U2"),
]

/**
 * Searches for a replay-verified block move that advances the 2×2×2 block.
 */
let findBlock222Guide = (state: cubeState, anchor: anchorCorner, initial: block222Progress): option<petrusGuide> => {
  let best = ref(None)
  let bestSolved = ref(initial.piecesSolved)

  candidateBlockMoves->Array.forEach(notation => {
    switch parseAlg(notation) {
    | None => ()
    | Some(alg) => {
        switch MoveExecutor.applyAlg(state, alg) {
        | Ok(replay) => {
            let progress = BlockDetector5x5.inspectBlock222(replay, anchor)
            if progress.piecesSolved > bestSolved.contents {
              bestSolved := progress.piecesSolved
              best := Some({
                phase: Phase1_Block222,
                title: "2×2×2 Block Building",
                instruction: `Execute ${notation} to assemble anchor ${BlockDetector5x5.anchorName(anchor)} (${progress.piecesSolved->Int.toString}/19 pieces).`,
                alg,
                algorithm: notation,
                anchor,
              })
            }
          }
        | Error(_) => ()
        }
      }
    }
  })

  best.contents
}

/**
 * Searches for an edge orientation trigger that reduces bad midge count.
 */
let findEOGuide = (state: cubeState, anchor: anchorCorner, initial: eoStatus): option<petrusGuide> => {
  let best = ref(None)
  let minBad = ref(initial.badCount)

  candidateEoTriggers->Array.forEach(notation => {
    switch parseAlg(notation) {
    | None => ()
    | Some(alg) => {
        switch MoveExecutor.applyAlg(state, alg) {
        | Ok(replay) => {
            let status = BlockDetector5x5.inspectEO(replay)
            if status.badCount < minBad.contents {
              minBad := status.badCount
              best := Some({
                phase: Phase3_EdgeOrientation,
                title: "Edge Orientation (EO)",
                instruction: `Execute EO trigger ${notation} to orient edges (bad edges remaining: ${status.badCount->Int.toString}).`,
                alg,
                algorithm: notation,
                anchor,
              })
            }
          }
        | Error(_) => ()
        }
      }
    }
  })

  best.contents
}

/**
 * Plans the next step for 5×5 Petrus method.
 */
let planPetrusStep5x5 = (state: cubeState): result<petrusGuide, string> => {
  switch BlockDetector5x5.inspectPetrus5x5(state) {
  | Error(msg) => Error(msg)
  | Ok(inspection) => {
      let anchor = inspection.bestAnchor
      switch inspection.currentPhase {
      | Phase1_Block222 => {
          switch findBlock222Guide(state, anchor, inspection.block222) {
          | Some(guide) => Ok(guide)
          | None => {
              // Fallback heuristic guide
              let notation = "U R U' R'"
              let alg = parseAlg(notation)->Option.getOr([])
              Ok({
                phase: Phase1_Block222,
                title: "2×2×2 Block Building",
                instruction: `Assemble the 19-piece corner block at ${BlockDetector5x5.anchorName(anchor)}. Slices 2U, 2R, 2F and faces U, R, F are free.`,
                alg,
                algorithm: notation,
                anchor,
              })
            }
          }
        }
      | Phase2_Block223 => {
          let notation = "U R U' R'"
          let alg = parseAlg(notation)->Option.getOr([])
          Ok({
            phase: Phase2_Block223,
            title: "2×2×3 Block Expansion",
            instruction: `Extend the block along the ${inspection.block223.axis == AxisX ? "X" : inspection.block223.axis == AxisY ? "Y" : "Z"} axis to 27 pieces.`,
            alg,
            algorithm: notation,
            anchor,
          })
        }
      | Phase3_EdgeOrientation => {
          switch findEOGuide(state, anchor, inspection.eo) {
          | Some(guide) => Ok(guide)
          | None => {
              let notation = "F R U R' F'"
              let alg = parseAlg(notation)->Option.getOr([])
              Ok({
                phase: Phase3_EdgeOrientation,
                title: "Edge Orientation (EO)",
                instruction: `Use the standard Petrus EO trigger ${notation} to orient bad midges (${inspection.eo.badCount->Int.toString} bad edges).`,
                alg,
                algorithm: notation,
                anchor,
              })
            }
          }
        }
      | Phase4_WingPairingF2L => {
          let notation = "Rw' U2 Rw' U2 B2 Rw' B2 Rw' F2 Lw2 F2 Rw U2 Rw2"
          let alg = parseAlg(notation)->Option.getOr([])
          Ok({
            phase: Phase4_WingPairingF2L,
            title: "Wing Pairing & F2L",
            instruction: `Pair remaining wing dedges using slice-and-replace (${inspection.wingsPaired->Int.toString}/24 wings paired).`,
            alg,
            algorithm: notation,
            anchor,
          })
        }
      | Phase5_LastLayer => {
          let notation = "R U R' U R U2 R'"
          let alg = parseAlg(notation)->Option.getOr([])
          Ok({
            phase: Phase5_LastLayer,
            title: "Last Layer Finish",
            instruction: "All edges are oriented! Finish the last layer using COLL and EPLL, and repair parity if needed.",
            alg,
            algorithm: notation,
            anchor,
          })
        }
      | PhaseSolved => {
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
    }
  }
}
