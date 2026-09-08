/*
 * Phase 3 Edge representation for 5×5×5 solver.
 * Separates edges into proper orbits during phase 3.
 * Moves allowed: 24 moves.
 * Derived from cs0x7f/cube555 (GPLv3 / MIT).
 */

open Util555

let validMoves = [
  0, 1, 2,     // Ux1, Ux2, Ux3
  3, 4, 5,     // Rx1, Rx2, Rx3
  6, 7, 8,     // Fx1, Fx2, Fx3
  9, 10, 11,   // Dx1, Dx2, Dx3
  12, 13, 14,  // Lx1, Lx2, Lx3
  15, 16, 17,  // Bx1, Bx2, Bx3
  19,          // sliceUx2
  22,          // sliceRx2
  25,          // sliceFx2
  28,          // sliceDx2
  31,          // sliceLx2
  34,          // sliceBx2
]

type t = {
  mEdge: array<int>,
  wEdge: array<int>,
}

let make = (): t => {
  let mEdge = Array.make(~length=12, 0)
  let wEdge = Array.make(~length=24, 0)
  for i in 0 to 11 {
    setU(wEdge, i, 0)
    setU(wEdge, i + 12, -1)
  }
  {mEdge, wEdge}
}

let setMEdge = (e: t, idx0: int): unit => {
  let idx = ref(idx0)
  let parity = ref(0)
  for i in 0 to 10 {
    setU(e.mEdge, i, bitAnd(idx.contents, 1))
    idx := shr(idx.contents, 1)
    parity := bitXor(parity.contents, getU(e.mEdge, i))
  }
  setU(e.mEdge, 11, parity.contents)
}

let getMEdge = (e: t): int => {
  let idx = ref(0)
  for i in 0 to 10 {
    idx := bitOr(idx.contents, shl(getU(e.mEdge, i), i))
  }
  idx.contents
}

let setWEdge = (e: t, idx: int): unit => {
  setComb(e.wEdge, idx, 12, 24)->ignore
}

let getWEdge = (e: t): int => {
  getComb(e.wEdge, 12, 24)
}

let doMove = (e: t, moveIdx: int): unit => {
  let move = getU(validMoves, moveIdx)
  let pow = mod(move, 3)
  switch move {
  | 19 => { // sliceUx2
      swap4NoFlip(e.wEdge, 9, 22, 11, 20, pow)
      swap4(e.mEdge, 0, 4, 1, 5, pow, false)
      swap4NoFlip(e.wEdge, 0, 4, 1, 5, pow)
      swap4NoFlip(e.wEdge, 12, 16, 13, 17, pow)
    }
  | 0 | 1 | 2 => { // Ux
      swap4(e.mEdge, 0, 4, 1, 5, pow, false)
      swap4NoFlip(e.wEdge, 0, 4, 1, 5, pow)
      swap4NoFlip(e.wEdge, 12, 16, 13, 17, pow)
    }
  | 22 => { // sliceRx2
      swap4NoFlip(e.wEdge, 1, 14, 3, 12, pow)
      swap4(e.mEdge, 5, 10, 6, 11, pow, true)
      swap4NoFlip(e.wEdge, 5, 22, 6, 23, pow)
      swap4NoFlip(e.wEdge, 17, 10, 18, 11, pow)
    }
  | 3 | 4 | 5 => { // Rx
      swap4(e.mEdge, 5, 10, 6, 11, pow, true)
      swap4NoFlip(e.wEdge, 5, 22, 6, 23, pow)
      swap4NoFlip(e.wEdge, 17, 10, 18, 11, pow)
    }
  | 25 => { // sliceFx2
      swap4NoFlip(e.wEdge, 5, 18, 7, 16, pow)
      swap4(e.mEdge, 0, 11, 3, 8, pow, false)
      swap4NoFlip(e.wEdge, 0, 11, 3, 8, pow)
      swap4NoFlip(e.wEdge, 12, 23, 15, 20, pow)
    }
  | 6 | 7 | 8 => { // Fx
      swap4(e.mEdge, 0, 11, 3, 8, pow, false)
      swap4NoFlip(e.wEdge, 0, 11, 3, 8, pow)
      swap4NoFlip(e.wEdge, 12, 23, 15, 20, pow)
    }
  | 28 => { // sliceDx2
      swap4NoFlip(e.wEdge, 8, 23, 10, 21, pow)
      swap4(e.mEdge, 2, 7, 3, 6, pow, false)
      swap4NoFlip(e.wEdge, 2, 7, 3, 6, pow)
      swap4NoFlip(e.wEdge, 14, 19, 15, 18, pow)
    }
  | 9 | 10 | 11 => { // Dx
      swap4(e.mEdge, 2, 7, 3, 6, pow, false)
      swap4NoFlip(e.wEdge, 2, 7, 3, 6, pow)
      swap4NoFlip(e.wEdge, 14, 19, 15, 18, pow)
    }
  | 31 => { // sliceLx2
      swap4NoFlip(e.wEdge, 0, 15, 2, 13, pow)
      swap4(e.mEdge, 4, 8, 7, 9, pow, true)
      swap4NoFlip(e.wEdge, 4, 20, 7, 21, pow)
      swap4NoFlip(e.wEdge, 16, 8, 19, 9, pow)
    }
  | 12 | 13 | 14 => { // Lx
      swap4(e.mEdge, 4, 8, 7, 9, pow, true)
      swap4NoFlip(e.wEdge, 4, 20, 7, 21, pow)
      swap4NoFlip(e.wEdge, 16, 8, 19, 9, pow)
    }
  | 34 => { // sliceBx2
      swap4NoFlip(e.wEdge, 4, 19, 6, 17, pow)
      swap4(e.mEdge, 1, 9, 2, 10, pow, false)
      swap4NoFlip(e.wEdge, 1, 9, 2, 10, pow)
      swap4NoFlip(e.wEdge, 13, 21, 14, 22, pow)
    }
  | 15 | 16 | 17 => { // Bx
      swap4(e.mEdge, 1, 9, 2, 10, pow, false)
      swap4NoFlip(e.wEdge, 1, 9, 2, 10, pow)
      swap4NoFlip(e.wEdge, 13, 21, 14, 22, pow)
    }
  | _ => ()
  }
}
