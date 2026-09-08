/*
 * Phase 4 Center representation for 5×5×5 solver.
 * Tracks U/D and R/L center alignments during edge pairing stage 1.
 * Valid moves: 16 moves.
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
  19,       // sliceUx2
  22,       // sliceRx2
  25,       // sliceFx2
  28,       // sliceDx2
  31,       // sliceLx2
  34,       // sliceBx2
]

type t = {
  udtCenter: array<int>,
  udxCenter: array<int>,
  rltCenter: array<int>,
  rlxCenter: array<int>,
}

let make = (): t => {
  let udtCenter = Array.make(~length=8, 0)
  let udxCenter = Array.make(~length=8, 0)
  let rltCenter = Array.make(~length=8, 0)
  let rlxCenter = Array.make(~length=8, 0)
  setComb(udxCenter, 0, 4, 8)->ignore
  setComb(udtCenter, 0, 4, 8)->ignore
  setComb(rlxCenter, 0, 4, 8)->ignore
  setComb(rltCenter, 0, 4, 8)->ignore
  {udtCenter, udxCenter, rltCenter, rlxCenter}
}

let setUDCenter = (c: t, idx: int): unit => {
  setComb(c.udxCenter, idx / 70, 4, 8)->ignore
  setComb(c.udtCenter, mod(idx, 70), 4, 8)->ignore
}

let getUDCenter = (c: t): int => {
  getComb(c.udxCenter, 4, 8) * 70 + getComb(c.udtCenter, 4, 8)
}

let setRLCenter = (c: t, idx: int): unit => {
  setComb(c.rlxCenter, idx / 70, 4, 8)->ignore
  setComb(c.rltCenter, mod(idx, 70), 4, 8)->ignore
}

let getRLCenter = (c: t): int => {
  if getU(c.rlxCenter, 7) != -1 {
    for i in 0 to 7 {
      setU(c.rlxCenter, i, -1 - getU(c.rlxCenter, i))
    }
    for i in 0 to 3 {
      let k = bitOr(shl(i, 1), 1)
      setU(c.rltCenter, k, -1 - getU(c.rltCenter, k))
    }
  }
  getComb(c.rlxCenter, 4, 8) * 70 + getComb(c.rltCenter, 4, 8)
}

let doMove = (c: t, moveIdx: int): unit => {
  let move = getU(validMoves, moveIdx)
  let pow = mod(move, 3)
  switch move {
  | 19 => { // sliceUx2
      swap2(c.rltCenter, 3, 7)
      swap2(c.rlxCenter, 3, 7)
      swap2(c.rlxCenter, 0, 4)
      swap4NoFlip(c.udtCenter, 0, 1, 2, 3, pow)
      swap4NoFlip(c.udxCenter, 0, 1, 2, 3, pow)
    }
  | 0 | 1 | 2 => { // Ux
      swap4NoFlip(c.udtCenter, 0, 1, 2, 3, pow)
      swap4NoFlip(c.udxCenter, 0, 1, 2, 3, pow)
    }
  | 22 => { // sliceRx2
      swap2(c.udtCenter, 1, 5)
      swap2(c.udxCenter, 1, 5)
      swap2(c.udxCenter, 2, 6)
    }
  | 4 => { // Rx2
      swap4NoFlip(c.rltCenter, 0, 1, 2, 3, pow)
      swap4NoFlip(c.rlxCenter, 0, 1, 2, 3, pow)
    }
  | 25 => { // sliceFx2
      swap2(c.udtCenter, 2, 4)
      swap2(c.udxCenter, 2, 4)
      swap2(c.udxCenter, 3, 5)
      swap2(c.rltCenter, 2, 4)
      swap2(c.rlxCenter, 2, 4)
      swap2(c.rlxCenter, 3, 5)
    }
  | 7 => () // Fx2
  | 28 => { // sliceDx2
      swap2(c.rltCenter, 1, 5)
      swap2(c.rlxCenter, 1, 5)
      swap2(c.rlxCenter, 2, 6)
      swap4NoFlip(c.udtCenter, 4, 5, 6, 7, pow)
      swap4NoFlip(c.udxCenter, 4, 5, 6, 7, pow)
    }
  | 9 | 10 | 11 => { // Dx
      swap4NoFlip(c.udtCenter, 4, 5, 6, 7, pow)
      swap4NoFlip(c.udxCenter, 4, 5, 6, 7, pow)
    }
  | 31 => { // sliceLx2
      swap2(c.udtCenter, 3, 7)
      swap2(c.udxCenter, 3, 7)
      swap2(c.udxCenter, 0, 4)
    }
  | 13 => { // Lx2
      swap4NoFlip(c.rltCenter, 4, 5, 6, 7, pow)
      swap4NoFlip(c.rlxCenter, 4, 5, 6, 7, pow)
    }
  | 34 => { // sliceBx2
      swap2(c.udtCenter, 0, 6)
      swap2(c.udxCenter, 0, 6)
      swap2(c.udxCenter, 1, 7)
      swap2(c.rltCenter, 0, 6)
      swap2(c.rlxCenter, 0, 6)
      swap2(c.rlxCenter, 1, 7)
    }
  | 16 => () // Bx2
  | _ => ()
  }
}
