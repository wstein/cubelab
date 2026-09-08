/*
 * Phase 2 Center representation for 5×5×5 solver.
 * Solves F/B X-centers and +-centers into F and B faces, while tracking edge parity.
 * Moves allowed: 22 moves preserving U/D centers.
 * Derived from cs0x7f/cube555 (GPLv3 / MIT).
 */

open Util555

let validMoves = [
  0, 1, 2,      // Ux1, Ux2, Ux3
  6, 7, 8,      // Fx1, Fx2, Fx3
  9, 10, 11,    // Dx1, Dx2, Dx3
  15, 16, 17,   // Bx1, Bx2, Bx3
  19,           // sliceUx2
  21, 22, 23,   // sliceRx1, sliceRx2, sliceRx3
  25,           // sliceFx2
  28,           // sliceDx2
  30, 31, 32,   // sliceLx1, sliceLx2, sliceLx3
  34,           // sliceBx2
]

let eParityDiff = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 1, 0, 1, 0, 0, 1, 0, 1, 0
]

type t = {
  tCenter: array<int>,
  xCenter: array<int>,
  mutable eParity: int,
}

let make = (): t => {
  let tCenter = Array.make(~length=16, -1)
  let xCenter = Array.make(~length=16, -1)
  setComb(tCenter, 0, 8, 16)->ignore
  setComb(xCenter, 0, 8, 16)->ignore
  {tCenter, xCenter, eParity: 0}
}

let setTCenter = (c: t, idx: int): unit => {
  setComb(c.tCenter, idx, 8, 16)->ignore
}

let getTCenter = (c: t): int => {
  getComb(c.tCenter, 8, 16)
}

let setXCenter = (c: t, idx: int): unit => {
  setComb(c.xCenter, idx, 8, 16)->ignore
}

let getXCenter = (c: t): int => {
  getComb(c.xCenter, 8, 16)
}

let doMove = (c: t, moveIdx: int): unit => {
  c.eParity = bitXor(c.eParity, getU(eParityDiff, moveIdx))
  let move = getU(validMoves, moveIdx)
  let axis = move / 3
  let pow = mod(move, 3)
  switch axis {
  | 6 => { // sliceUx2
      swap2(c.xCenter, 8, 12)
      swap2(c.xCenter, 9, 13)
      swap2(c.tCenter, 8, 12)
      swap4NoFlip(c.xCenter, 0, 1, 2, 3, pow)
      swap4NoFlip(c.tCenter, 0, 1, 2, 3, pow)
    }
  | 0 => { // Ux
      swap4NoFlip(c.xCenter, 0, 1, 2, 3, pow)
      swap4NoFlip(c.tCenter, 0, 1, 2, 3, pow)
    }
  | 7 => { // sliceRx
      swap4NoFlip(c.xCenter, 1, 15, 5, 9, pow)
      swap4NoFlip(c.xCenter, 2, 12, 6, 10, pow)
      swap4NoFlip(c.tCenter, 1, 15, 5, 9, pow)
    }
  | 1 => () // Rx (not in validMoves)
  | 8 => { // sliceFx2
      swap2(c.xCenter, 2, 4)
      swap2(c.xCenter, 3, 5)
      swap2(c.tCenter, 2, 4)
      swap4NoFlip(c.xCenter, 8, 9, 10, 11, pow)
      swap4NoFlip(c.tCenter, 8, 9, 10, 11, pow)
    }
  | 2 => { // Fx
      swap4NoFlip(c.xCenter, 8, 9, 10, 11, pow)
      swap4NoFlip(c.tCenter, 8, 9, 10, 11, pow)
    }
  | 9 => { // sliceDx2
      swap2(c.xCenter, 10, 14)
      swap2(c.xCenter, 11, 15)
      swap2(c.tCenter, 10, 14)
      swap4NoFlip(c.xCenter, 4, 5, 6, 7, pow)
      swap4NoFlip(c.tCenter, 4, 5, 6, 7, pow)
    }
  | 3 => { // Dx
      swap4NoFlip(c.xCenter, 4, 5, 6, 7, pow)
      swap4NoFlip(c.tCenter, 4, 5, 6, 7, pow)
    }
  | 10 => { // sliceLx
      swap4NoFlip(c.xCenter, 0, 8, 4, 14, pow)
      swap4NoFlip(c.xCenter, 3, 11, 7, 13, pow)
      swap4NoFlip(c.tCenter, 3, 11, 7, 13, pow)
    }
  | 4 => () // Lx (not in validMoves)
  | 11 => { // sliceBx2
      swap2(c.xCenter, 1, 7)
      swap2(c.xCenter, 0, 6)
      swap2(c.tCenter, 0, 6)
      swap4NoFlip(c.xCenter, 12, 13, 14, 15, pow)
      swap4NoFlip(c.tCenter, 12, 13, 14, 15, pow)
    }
  | 5 => { // Bx
      swap4NoFlip(c.xCenter, 12, 13, 14, 15, pow)
      swap4NoFlip(c.tCenter, 12, 13, 14, 15, pow)
    }
  | _ => ()
  }
}
