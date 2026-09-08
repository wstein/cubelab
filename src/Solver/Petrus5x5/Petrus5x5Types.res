type anchorCorner =
  | DBL
  | DFL
  | DFR
  | DBR
  | UBL
  | UFL
  | UFR
  | UBR

type expansionAxis =
  | AxisX
  | AxisY
  | AxisZ

type block222Progress = {
  anchor: anchorCorner,
  piecesSolved: int,
  totalPieces: int,
  faceletsSolved: int,
  isComplete: bool,
}

type block223Progress = {
  anchor: anchorCorner,
  axis: expansionAxis,
  piecesSolved: int,
  totalPieces: int,
  isComplete: bool,
}

type eoStatus = {
  orientedCount: int,
  badCount: int,
  badSlots: array<int>,
  isComplete: bool,
}

type petrusPhase =
  | Phase1_Block222
  | Phase2_Block223
  | Phase3_EdgeOrientation
  | Phase4_WingPairingF2L
  | Phase5_LastLayer
  | PhaseSolved

type gridPos = (int, int, int)

type petrusInspection5x5 = {
  bestAnchor: anchorCorner,
  block222: block222Progress,
  block223: block223Progress,
  eo: eoStatus,
  wingsPaired: int,
  currentPhase: petrusPhase,
  milestoneDescription: string,
  targetCubies: array<gridPos>,
}

type petrusGuide = {
  phase: petrusPhase,
  title: string,
  instruction: string,
  alg: MoveTypes.alg,
  algorithm: string,
  anchor: anchorCorner,
}
