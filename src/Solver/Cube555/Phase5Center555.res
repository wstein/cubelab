/*
 * Phase 5 Center representation for 5×5×5 solver.
 * Tracks remaining center orientations/alignments during final edge reduction.
 * Valid moves: 14 moves.
 * Derived from cs0x7f/cube555 (GPLv3 / MIT).
 */

open Util555

let validMoves = [
  0, 1, 2,  // Ux1, Ux2, Ux3
  4,        // Rx2
  7,        // Fx2
  9, 10, 11,// Dx1, Dx2, Dx3
  13,       // Lx2
  16,       // Bx2
  22,       // sliceRx2
  25,       // sliceFx2
  31,       // sliceLx2
  34,       // sliceBx2
]

type t = {
  tCenter: array<int>,
  xCenter: array<int>,
  rflbCenter: array<int>,
}

let make = (): t => {
  let tCenter = Array.make(~length=8, 0)
  let xCenter = Array.make(~length=8, 0)
  let rflbCenter = Array.make(~length=8, 0)
  setComb(tCenter, 0, 4, 8)->ignore
  setComb(xCenter, 0, 4, 8)->ignore
  let fbCenter = Array.make(~length=4, 0)
  let rlCenter = Array.make(~length=4, 0)
  setComb(fbCenter, 0, 2, 4)->ignore
  setComb(rlCenter, 0, 2, 4)->ignore
  for i in 0 to 3 {
    setU(rflbCenter, i, getU(fbCenter, i))
    setU(rflbCenter, i + 4, getU(rlCenter, i))
  }
  {tCenter, xCenter, rflbCenter}
}

let setRFLBCenter = (c: t, idx: int): unit => {
  let fbCenter = Array.make(~length=4, 0)
  let rlCenter = Array.make(~length=4, 0)
  setComb(fbCenter, mod(idx, 6), 2, 4)->ignore
  setComb(rlCenter, idx / 6, 2, 4)->ignore
  for i in 0 to 3 {
    setU(c.rflbCenter, i, getU(fbCenter, i))
    setU(c.rflbCenter, i + 4, getU(rlCenter, i))
  }
}

let getRFLBCenter = (c: t): int => {
  let fbCenter = Array.make(~length=4, 0)
  let rlCenter = Array.make(~length=4, 0)
  for i in 0 to 3 {
    setU(fbCenter, i, getU(c.rflbCenter, i))
    setU(rlCenter, i, getU(c.rflbCenter, i + 4))
  }
  getComb(rlCenter, 2, 4) * 6 + getComb(fbCenter, 2, 4)
}

let setXCenter = (c: t, idx: int): unit => {
  setComb(c.xCenter, idx, 4, 8)->ignore
}

let getXCenter = (c: t): int => {
  getComb(c.xCenter, 4, 8)
}

let setTCenter = (c: t, idx: int): unit => {
  setComb(c.tCenter, idx, 4, 8)->ignore
}

let getTCenter = (c: t): int => {
  getComb(c.tCenter, 4, 8)
}

let doMove = (c: t, moveIdx: int): unit => {
  let move = getU(validMoves, moveIdx)
  let pow = mod(move, 3)
  switch move {
  | 0 | 1 | 2 => { // Ux
      swap4NoFlip(c.tCenter, 0, 1, 2, 3, pow)
      swap4NoFlip(c.xCenter, 0, 1, 2, 3, pow)
    }
  | 22 => { // sliceRx2
      swap2(c.tCenter, 1, 5)
      swap2(c.xCenter, 1, 5)
      swap2(c.xCenter, 2, 6)
      swap2(c.rflbCenter, 0, 3)
    }
  | 4 => { // Rx2
      swap2(c.rflbCenter, 4, 5)
    }
  | 25 => { // sliceFx2
      swap2(c.tCenter, 2, 4)
      swap2(c.xCenter, 2, 4)
      swap2(c.xCenter, 3, 5)
      swap2(c.rflbCenter, 5, 6)
    }
  | 7 => { // Fx2
      swap2(c.rflbCenter, 0, 1)
    }
  | 9 | 10 | 11 => { // Dx
      swap4NoFlip(c.tCenter, 4, 5, 6, 7, pow)
      swap4NoFlip(c.xCenter, 4, 5, 6, 7, pow)
    }
  | 31 => { // sliceLx2
      swap2(c.tCenter, 3, 7)
      swap2(c.xCenter, 3, 7)
      swap2(c.xCenter, 0, 4)
      swap2(c.rflbCenter, 1, 2)
    }
  | 13 => { // Lx2
      swap2(c.rflbCenter, 6, 7)
    }
  | 34 => { // sliceBx2
      swap2(c.tCenter, 0, 6)
      swap2(c.xCenter, 0, 6)
      swap2(c.xCenter, 1, 7)
      swap2(c.rflbCenter, 4, 7)
    }
  | 16 => { // Bx2
      swap2(c.rflbCenter, 2, 3)
    }
  | _ => ()
  }
}
