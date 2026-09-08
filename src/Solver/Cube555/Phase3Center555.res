/*
 * Phase 3 Center representation for 5×5×5 solver.
 * Finishes all remaining centers (L and R faces).
 * Valid moves: 24 moves preserving U/D and F/B centers.
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

let solvedXCenter = [0, 9, 14, 23, 27, 28]
let solvedTCenter = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 18, 23, 25, 27, 28, 30, 32, 34]

let solvedCenter = {
  let table = Array.make(~length=108, 0)
  for i in 0 to 5 {
    for j in 0 to 17 {
      setU(table, i * 18 + j, getU(solvedXCenter, i) * 35 + getU(solvedTCenter, j))
    }
  }
  table
}

type t = {
  tCenter: array<int>,
  xCenter: array<int>,
}

let make = (): t => {
  let tCenter = Array.make(~length=8, 0)
  let xCenter = Array.make(~length=8, 0)
  setComb(xCenter, 0, 4, 8)->ignore
  setComb(tCenter, 0, 4, 8)->ignore
  {tCenter, xCenter}
}

let setCenter = (c: t, idx: int): unit => {
  setComb(c.xCenter, idx / 35, 4, 8)->ignore
  setComb(c.tCenter, mod(idx, 35), 4, 8)->ignore
}

let getCenter = (c: t): int => {
  getSComb(c.xCenter, 8) * 35 + getSComb(c.tCenter, 8)
}

let doMove = (c: t, moveIdx: int): unit => {
  let move = getU(validMoves, moveIdx)
  let pow = mod(move, 3)
  switch move {
  | 19 => { // sliceUx2
      swap2(c.tCenter, 3, 7)
      swap2(c.xCenter, 3, 7)
      swap2(c.xCenter, 0, 4)
    }
  | 0 | 1 | 2 => () // Ux
  | 22 | 3 | 4 | 5 => { // sliceRx2 or Rx
      swap4NoFlip(c.tCenter, 0, 1, 2, 3, pow)
      swap4NoFlip(c.xCenter, 0, 1, 2, 3, pow)
    }
  | 25 => { // sliceFx2
      swap2(c.tCenter, 2, 4)
      swap2(c.xCenter, 2, 4)
      swap2(c.xCenter, 3, 5)
    }
  | 6 | 7 | 8 => () // Fx
  | 28 => { // sliceDx2
      swap2(c.tCenter, 1, 5)
      swap2(c.xCenter, 1, 5)
      swap2(c.xCenter, 2, 6)
    }
  | 9 | 10 | 11 => () // Dx
  | 31 | 12 | 13 | 14 => { // sliceLx2 or Lx
      swap4NoFlip(c.tCenter, 4, 5, 6, 7, pow)
      swap4NoFlip(c.xCenter, 4, 5, 6, 7, pow)
    }
  | 34 => { // sliceBx2
      swap2(c.tCenter, 0, 6)
      swap2(c.xCenter, 0, 6)
      swap2(c.xCenter, 1, 7)
    }
  | 15 | 16 | 17 => () // Bx
  | _ => ()
  }
}
