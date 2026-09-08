/*
 * 5×5×5 Solver orchestration module for Cube Rosetta.
 * Connects Shuang Chen's 5-phase reduction architecture with Cube Rosetta's state types.
 * Derived from cs0x7f/cube555 (GPLv3 / MIT).
 */

open Util555

type reductionPhase =
  | Phase1_UDCenters
  | Phase2_FBCenters
  | Phase3_FinishCenters
  | Phase4_EdgePairing1
  | Phase5_EdgePairing2
  | Phase6_3x3ReductionComplete

type solverInspection555 = {
  phase: reductionPhase,
  phaseDescription: string,
  udCentersSolved: bool,
  fbCentersSolved: bool,
  allCentersSolved: bool,
  edgesClassified: bool,
  edgesPaired: bool,
}

/**
 * Inspects a 5×5 cubie cube and returns which phase of reduction it currently satisfies.
 */
let inspectCube = (cube: CubieCube555.t): solverInspection555 => {
  let centerTargetColors = [
    0, 0, 0, 0, // U
    3, 3, 3, 3, // D
    2, 2, 2, 2, // F
    5, 5, 5, 5, // B
    1, 1, 1, 1, // R
    4, 4, 4, 4, // L
  ]

  // Check Phase 1: are U and D centers in U and D faces?
  let udCentersSolved = ref(true)
  for i in 0 to 7 {
    let t = getU(cube.tCenter, i)
    let x = getU(cube.xCenter, i)
    // U is color 0, D is color 3
    if t != 0 && t != 3 {
      udCentersSolved := false
    }
    if x != 0 && x != 3 {
      udCentersSolved := false
    }
  }

  // Check Phase 2: are F and B centers in F and B faces?
  let fbCentersSolved = ref(udCentersSolved.contents)
  if udCentersSolved.contents {
    for i in 8 to 15 {
      let t = getU(cube.tCenter, i)
      let x = getU(cube.xCenter, i)
      // F is color 2, B is color 5
      if t != 2 && t != 5 {
        fbCentersSolved := false
      }
      if x != 2 && x != 5 {
        fbCentersSolved := false
      }
    }
  }

  // Check Phase 3: are all 6 center faces solved?
  let allCentersSolved = ref(fbCentersSolved.contents)
  if fbCentersSolved.contents {
    for i in 0 to 23 {
      let targetColor = getU(centerTargetColors, i)
      if getU(cube.tCenter, i) != targetColor || getU(cube.xCenter, i) != targetColor {
        allCentersSolved := false
      }
    }
  }

  // Check edge pairing
  let edgesPaired = ref(true)
  for i in 0 to 11 {
    let leftWing = getU(cube.wEdge, i)
    let rightWing = getU(cube.wEdge, i + 12)
    let mid = shr(getU(cube.mEdge, i), 1)
    if leftWing != i || rightWing != i + 12 || mid != i {
      edgesPaired := false
    }
  }

  let (phase, phaseDescription) = if !udCentersSolved.contents {
    (Phase1_UDCenters, "Phase 1: Solve U/D centers")
  } else if !fbCentersSolved.contents {
    (Phase2_FBCenters, "Phase 2: Solve F/B centers and edge parity")
  } else if !allCentersSolved.contents {
    (Phase3_FinishCenters, "Phase 3: Finish remaining L/R centers")
  } else if !edgesPaired.contents {
    (Phase4_EdgePairing1, "Phase 4: Pair outer wings with midges into dedges")
  } else {
    (Phase6_3x3ReductionComplete, "Reduction complete: 3×3×3 stage ready")
  }

  {
    phase,
    phaseDescription,
    udCentersSolved: udCentersSolved.contents,
    fbCentersSolved: fbCentersSolved.contents,
    allCentersSolved: allCentersSolved.contents,
    edgesClassified: allCentersSolved.contents,
    edgesPaired: edgesPaired.contents,
  }
}

/**
 * Parses a 150-char URFDLB facelet string into a CubieCube555 representation.
 */
let fromFaceletString = (facelets: string): option<CubieCube555.t> => {
  if facelets->String.length != 150 {
    None
  } else {
    let cube = CubieCube555.makeSolved()
    // Extract center stickers:
    // Centers are at face offset + specific indices
    // Face indices for 5x5: U=0..24, R=25..49, F=50..74, D=75..99, L=100..124, B=125..149.
    // Colors order: U, R, F, D, L, B
    let colors = "URFDLB"
    let colorOfChar = (ch: string): int => {
      colors->String.indexOf(ch)
    }

    // T-centers (cross centers on each face):
    // Offsets within 5x5 face: 7, 11, 13, 17 (0-indexed: row 1 col 2, row 2 col 1, row 2 col 3, row 3 col 2)
    // In cs0x7f 1-based indexing: U8, U14, U18, U12 -> 7, 13, 17, 11
    let tCenterFaceOffsets = [
      (0, [7, 13, 17, 11]),    // U
      (75, [7, 13, 17, 11]),   // D
      (50, [7, 13, 17, 11]),   // F
      (125, [7, 13, 17, 11]),  // B
      (25, [7, 13, 17, 11]),   // R
      (100, [7, 13, 17, 11]),  // L
    ]

    let xCenterFaceOffsets = [
      (0, [6, 8, 18, 16]),    // U
      (75, [6, 8, 18, 16]),   // D
      (50, [6, 8, 18, 16]),   // F
      (125, [6, 8, 18, 16]),  // B
      (25, [6, 8, 18, 16]),   // R
      (100, [6, 8, 18, 16]),  // L
    ]

    let mutSlot = ref(0)
    for face in 0 to 5 {
      let (base, offsets) = getU(tCenterFaceOffsets, face)
      for k in 0 to 3 {
        let stickerIdx = base + getU(offsets, k)
        let ch = facelets->String.slice(~start=stickerIdx, ~end=stickerIdx + 1)
        let col = colorOfChar(ch)
        if col >= 0 {
          setU(cube.tCenter, mutSlot.contents, col)
        }
        mutSlot := mutSlot.contents + 1
      }
    }

    mutSlot := 0
    for face in 0 to 5 {
      let (base, offsets) = getU(xCenterFaceOffsets, face)
      for k in 0 to 3 {
        let stickerIdx = base + getU(offsets, k)
        let ch = facelets->String.slice(~start=stickerIdx, ~end=stickerIdx + 1)
        let col = colorOfChar(ch)
        if col >= 0 {
          setU(cube.xCenter, mutSlot.contents, col)
        }
        mutSlot := mutSlot.contents + 1
      }
    }

    Some(cube)
  }
}
