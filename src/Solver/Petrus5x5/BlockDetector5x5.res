open StateTypes
open Petrus5x5Types

let anchorCoords = (anchor: anchorCorner): (int, int, int) =>
  switch anchor {
  | DBL => (0, 0, 0)
  | DFL => (0, 0, 4)
  | DFR => (4, 0, 4)
  | DBR => (4, 0, 0)
  | UBL => (0, 4, 0)
  | UFL => (0, 4, 4)
  | UFR => (4, 4, 4)
  | UBR => (4, 4, 0)
  }

let allAnchors = [DBL, DFL, DFR, DBR, UBL, UFL, UFR, UBR]

let anchorName = (anchor: anchorCorner): string =>
  switch anchor {
  | DBL => "DBL (Down-Back-Left)"
  | DFL => "DFL (Down-Front-Left)"
  | DFR => "DFR (Down-Front-Right)"
  | DBR => "DBR (Down-Back-Right)"
  | UBL => "UBL (Up-Back-Left)"
  | UFL => "UFL (Up-Front-Left)"
  | UFR => "UFR (Up-Front-Right)"
  | UBR => "UBR (Up-Back-Right)"
  }

let anchorFaces = (anchor: anchorCorner): (face, face, face) =>
  switch anchor {
  | DBL => (D, B, L)
  | DFL => (D, F, L)
  | DFR => (D, F, R)
  | DBR => (D, B, R)
  | UBL => (U, B, L)
  | UFL => (U, F, L)
  | UFR => (U, F, R)
  | UBR => (U, B, R)
  }

let axisRange = (coord: int): array<int> =>
  if coord == 0 {
    [0, 1, 2]
  } else {
    [4, 3, 2]
  }

/**
 * Returns the 19 visible cubie coordinates (x, y, z) for a 2×2×2 block
 * anchored at the specified corner.
 */
let cubiesFor222 = (anchor: anchorCorner): array<gridPos> => {
  let (xc, yc, zc) = anchorCoords(anchor)
  let rx = axisRange(xc)
  let ry = axisRange(yc)
  let rz = axisRange(zc)
  let list = []
  rx->Array.forEach(x => {
    ry->Array.forEach(y => {
      rz->Array.forEach(z => {
        // Interior cubies not touching the outer shell are excluded
        if x == xc || y == yc || z == zc {
          list->Array.push((x, y, z))
        }
      })
    })
  })
  list
}

/**
 * Maps a 3D grid coordinate (x, y, z) on a 5×5 and a face to (row, col) on that face.
 */
let gridToFacelet = (face: face, x: int, y: int, z: int): (int, int) =>
  switch face {
  | U => (z, x)
  | D => (4 - z, x)
  | F => (4 - y, x)
  | B => (4 - y, 4 - x)
  | R => (4 - y, 4 - z)
  | L => (4 - y, z)
  }

let getSticker = (state: cubeState, face: face, row: int, col: int): face => {
  let values = Belt.Array.getUnsafe(state.facelets, storageIndex(face))
  Belt.Array.getUnsafe(values, row * 5 + col)
}

/**
 * Tests whether a cubie at (x, y, z) has all of its exterior stickers matching
 * the expected reference colors for the faces meeting at the corner.
 */
let isCubieSolved = (state: cubeState, anchor: anchorCorner, x: int, y: int, z: int): (bool, int) => {
  let (xc, yc, zc) = anchorCoords(anchor)
  let (fx, fy, fz) = anchorFaces(anchor)
  let solved = ref(true)
  let faceletsCount = ref(0)

  if x == xc {
    let (row, col) = gridToFacelet(fx, x, y, z)
    let sticker = getSticker(state, fx, row, col)
    if sticker != fx {
      solved := false
    }
    faceletsCount := faceletsCount.contents + 1
  }
  if y == yc {
    let (row, col) = gridToFacelet(fy, x, y, z)
    let sticker = getSticker(state, fy, row, col)
    if sticker != fy {
      solved := false
    }
    faceletsCount := faceletsCount.contents + 1
  }
  if z == zc {
    let (row, col) = gridToFacelet(fz, x, y, z)
    let sticker = getSticker(state, fz, row, col)
    if sticker != fz {
      solved := false
    }
    faceletsCount := faceletsCount.contents + 1
  }

  (solved.contents, faceletsCount.contents)
}

/**
 * Evaluates the 2×2×2 block progress for a given anchor corner.
 */
let inspectBlock222 = (state: cubeState, anchor: anchorCorner): block222Progress => {
  let cubies = cubiesFor222(anchor)
  let solvedPieces = ref(0)
  let solvedFacelets = ref(0)

  cubies->Array.forEach(((x, y, z)) => {
    let (isSolved, count) = isCubieSolved(state, anchor, x, y, z)
    if isSolved {
      solvedPieces := solvedPieces.contents + 1
      solvedFacelets := solvedFacelets.contents + count
    }
  })

  {
    anchor,
    piecesSolved: solvedPieces.contents,
    totalPieces: 19,
    faceletsSolved: solvedFacelets.contents,
    isComplete: solvedPieces.contents == 19,
  }
}

/**
 * Finds the anchor corner with the greatest number of pre-assembled pieces.
 */
let bestAnchor222 = (state: cubeState): (anchorCorner, block222Progress) => {
  let best = ref(DBL)
  let bestProgress = ref(inspectBlock222(state, DBL))

  allAnchors->Array.forEach(anchor => {
    let progress = inspectBlock222(state, anchor)
    if progress.piecesSolved > bestProgress.contents.piecesSolved {
      best := anchor
      bestProgress := progress
    }
  })

  (best.contents, bestProgress.contents)
}

/**
 * Generates the 27 cubie coordinates for a 2×2×3 block expansion along an axis.
 */
let cubiesFor223 = (anchor: anchorCorner, axis: expansionAxis): array<gridPos> => {
  let (xc, yc, zc) = anchorCoords(anchor)
  let rx = switch axis {
  | AxisX => if xc == 0 { [0, 1, 2, 3] } else { [4, 3, 2, 1] }
  | _ => axisRange(xc)
  }
  let ry = switch axis {
  | AxisY => if yc == 0 { [0, 1, 2, 3] } else { [4, 3, 2, 1] }
  | _ => axisRange(yc)
  }
  let rz = switch axis {
  | AxisZ => if zc == 0 { [0, 1, 2, 3] } else { [4, 3, 2, 1] }
  | _ => axisRange(zc)
  }

  let list = []
  rx->Array.forEach(x => {
    ry->Array.forEach(y => {
      rz->Array.forEach(z => {
        if x == xc || y == yc || z == zc {
          list->Array.push((x, y, z))
        }
      })
    })
  })
  list
}

/**
 * Inspects 2×2×3 expansion progress for an anchor corner across all 3 axes.
 */
let inspectBlock223 = (state: cubeState, anchor: anchorCorner): block223Progress => {
  let axes = [AxisX, AxisY, AxisZ]
  let bestAxis = ref(AxisX)
  let bestSolved = ref(0)

  axes->Array.forEach(axis => {
    let cubies = cubiesFor223(anchor, axis)
    let count = ref(0)
    cubies->Array.forEach(((x, y, z)) => {
      let (isSolved, _) = isCubieSolved(state, anchor, x, y, z)
      if isSolved {
        count := count.contents + 1
      }
    })
    if count.contents > bestSolved.contents {
      bestSolved := count.contents
      bestAxis := axis
    }
  })

  let total = cubiesFor223(anchor, bestAxis.contents)->Array.length
  {
    anchor,
    axis: bestAxis.contents,
    piecesSolved: bestSolved.contents,
    totalPieces: total,
    isComplete: bestSolved.contents >= total,
  }
}

/**
 * Extracts a virtual 3×3 cube state from the 5×5's corners, midges, and centres.
 */
let extractOuter3x3 = (state: cubeState): cubeState => {
  let indices3x3 = [0, 2, 4, 10, 12, 14, 20, 22, 24]
  let facelets = storageOrder->Array.map(face => {
    let values = Belt.Array.getUnsafe(state.facelets, storageIndex(face))
    indices3x3->Array.map(idx => Belt.Array.getUnsafe(values, idx))
  })
  {size: 3, facelets}
}

/**
 * Inspects outer midge edge orientation (EO) using PieceReducer on the outer 3×3 shell.
 */
let inspectEO = (state: cubeState): eoStatus => {
  let outer = extractOuter3x3(state)
  switch PieceReducer.reduce(outer) {
  | Ok(pieces) => {
      let badSlots = []
      let orientedCount = ref(0)
      pieces.eo->Array.forEachWithIndex((val, idx) => {
        if val == 0 {
          orientedCount := orientedCount.contents + 1
        } else {
          badSlots->Array.push(idx)
        }
      })
      {
        orientedCount: orientedCount.contents,
        badCount: badSlots->Array.length,
        badSlots,
        isComplete: badSlots->Array.length == 0,
      }
    }
  | Error(_) => {
      orientedCount: 0,
      badCount: 12,
      badSlots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      isComplete: false,
    }
  }
}

/**
 * Evaluates the number of correctly paired wings (out of 24) on the 5×5 cube.
 */
let countPairedWings = (state: cubeState): int => {
  // The 12 midge edge locations on a 5×5: (face1, row1, col1, face2, row2, col2)
  // along with their flanking wing coordinate offsets
  let edges = [
    // UR: U(2, 4) & R(0, 2)
    (U, 2, 4, R, 0, 2, [(U, 1, 4, R, 0, 1), (U, 3, 4, R, 0, 3)]),
    // UF: U(4, 2) & F(0, 2)
    (U, 4, 2, F, 0, 2, [(U, 4, 1, F, 0, 1), (U, 4, 3, F, 0, 3)]),
    // UL: U(2, 0) & L(0, 2)
    (U, 2, 0, L, 0, 2, [(U, 1, 0, L, 0, 3), (U, 3, 0, L, 0, 1)]),
    // UB: U(0, 2) & B(0, 2)
    (U, 0, 2, B, 0, 2, [(U, 0, 1, B, 0, 3), (U, 0, 3, B, 0, 1)]),
    // DR: D(2, 4) & R(4, 2)
    (D, 2, 4, R, 4, 2, [(D, 1, 4, R, 4, 3), (D, 3, 4, R, 4, 1)]),
    // DF: D(0, 2) & F(4, 2)
    (D, 0, 2, F, 4, 2, [(D, 0, 1, F, 4, 1), (D, 0, 3, F, 4, 3)]),
    // DL: D(2, 0) & L(4, 2)
    (D, 2, 0, L, 4, 2, [(D, 1, 0, L, 4, 1), (D, 3, 0, L, 4, 3)]),
    // DB: D(4, 2) & B(4, 2)
    (D, 4, 2, B, 4, 2, [(D, 4, 1, B, 4, 3), (D, 4, 3, B, 4, 1)]),
    // FR: F(2, 4) & R(2, 0)
    (F, 2, 4, R, 2, 0, [(F, 1, 4, R, 1, 0), (F, 3, 4, R, 3, 0)]),
    // FL: F(2, 0) & L(2, 4)
    (F, 2, 0, L, 2, 4, [(F, 1, 0, L, 1, 4), (F, 3, 0, L, 3, 4)]),
    // BL: B(2, 4) & L(2, 0)
    (B, 2, 4, L, 2, 0, [(B, 1, 4, L, 1, 0), (B, 3, 4, L, 3, 0)]),
    // BR: B(2, 0) & R(2, 4)
    (B, 2, 0, R, 2, 4, [(B, 1, 0, R, 1, 4), (B, 3, 0, R, 3, 4)]),
  ]

  let pairedCount = ref(0)
  edges->Array.forEach(((f1, r1, c1, f2, r2, c2, wings)) => {
    let m1 = getSticker(state, f1, r1, c1)
    let m2 = getSticker(state, f2, r2, c2)
    wings->Array.forEach(((wf1, wr1, wc1, wf2, wr2, wc2)) => {
      let w1 = getSticker(state, wf1, wr1, wc1)
      let w2 = getSticker(state, wf2, wr2, wc2)
      if w1 == m1 && w2 == m2 {
        pairedCount := pairedCount.contents + 1
      }
    })
  })
  pairedCount.contents
}

/**
 * Full top-level 5×5 Petrus inspection.
 */
let inspectPetrus5x5 = (state: cubeState): result<petrusInspection5x5, string> => {
  if state.size != 5 {
    Error("5×5 Petrus inspection requires a 5×5×5 cube.")
  } else {
    let (bestAnchor, block222) = bestAnchor222(state)
    let block223 = inspectBlock223(state, bestAnchor)
    let eo = inspectEO(state)
    let wingsPaired = countPairedWings(state)

    let (currentPhase, desc, targetCubies) = if !block222.isComplete {
      (
        Phase1_Block222,
        `Build the 19-piece 2×2×2 block at anchor ${anchorName(bestAnchor)} (${block222.piecesSolved->Int.toString}/19 pieces placed).`,
        cubiesFor222(bestAnchor),
      )
    } else if !block223.isComplete {
      (
        Phase2_Block223,
        `Expand to a 2×2×3 block along the slab (${block223.piecesSolved->Int.toString}/27 pieces locked).`,
        cubiesFor223(bestAnchor, block223.axis),
      )
    } else if !eo.isComplete {
      (
        Phase3_EdgeOrientation,
        `Orient remaining outer midges (${eo.badCount->Int.toString} bad edges detected).`,
        [],
      )
    } else if wingsPaired < 24 {
      (
        Phase4_WingPairingF2L,
        `Pair remaining wings and complete F2L slots (${wingsPaired->Int.toString}/24 wings paired).`,
        [],
      )
    } else {
      let outer = extractOuter3x3(state)
      let isSolved = outer.facelets->Array.everyWithIndex((facelets, fIdx) => {
        let expected = Belt.Array.getUnsafe(storageOrder, fIdx)
        facelets->Array.every(c => c == expected)
      })
      if isSolved {
        (PhaseSolved, "The 5×5×5 cube is completely solved!", [])
      } else {
        (Phase5_LastLayer, "Finish the last layer with COLL/EPLL and resolve any parity.", [])
      }
    }

    Ok({
      bestAnchor,
      block222,
      block223,
      eo,
      wingsPaired,
      currentPhase,
      milestoneDescription: desc,
      targetCubies,
    })
  }
}
