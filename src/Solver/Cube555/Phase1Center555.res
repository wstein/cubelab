/*
 * Phase 1 Center representation for 5×5×5 solver.
 * Solves U/D X-centers and +-centers into U and D faces.
 * Derived from cs0x7f/cube555 (GPLv3 / MIT).
 */

open Util555

type t = {
  tCenter: array<int>,
  xCenter: array<int>,
}

let make = (): t => {
  let tCenter = Array.make(~length=24, -1)
  let xCenter = Array.make(~length=24, -1)
  setComb(tCenter, 735470, 8, 24)->ignore
  setComb(xCenter, 735470, 8, 24)->ignore
  {tCenter, xCenter}
}

let setTCenter = (c: t, idx: int): unit => {
  setComb(c.tCenter, 735470 - idx, 8, 24)->ignore
}

let getTCenter = (c: t): int => {
  735470 - getComb(c.tCenter, 8, 24)
}

let setXCenter = (c: t, idx: int): unit => {
  setComb(c.xCenter, 735470 - idx, 8, 24)->ignore
}

let getXCenter = (c: t): int => {
  735470 - getComb(c.xCenter, 8, 24)
}

let doMove = (c: t, move: int): unit => {
  let pow = mod(move, 3)
  switch move {
  | 18 | 19 | 20 => { // ux
      swap4NoFlip(c.xCenter, 8, 20, 12, 16, pow)
      swap4NoFlip(c.xCenter, 9, 21, 13, 17, pow)
      swap4NoFlip(c.tCenter, 8, 20, 12, 16, pow)
      swap4NoFlip(c.xCenter, 0, 1, 2, 3, pow)
      swap4NoFlip(c.tCenter, 0, 1, 2, 3, pow)
    }
  | 0 | 1 | 2 => { // Ux
      swap4NoFlip(c.xCenter, 0, 1, 2, 3, pow)
      swap4NoFlip(c.tCenter, 0, 1, 2, 3, pow)
    }
  | 21 | 22 | 23 => { // rx
      swap4NoFlip(c.xCenter, 1, 15, 5, 9, pow)
      swap4NoFlip(c.xCenter, 2, 12, 6, 10, pow)
      swap4NoFlip(c.tCenter, 1, 15, 5, 9, pow)
      swap4NoFlip(c.xCenter, 16, 17, 18, 19, pow)
      swap4NoFlip(c.tCenter, 16, 17, 18, 19, pow)
    }
  | 3 | 4 | 5 => { // Rx
      swap4NoFlip(c.xCenter, 16, 17, 18, 19, pow)
      swap4NoFlip(c.tCenter, 16, 17, 18, 19, pow)
    }
  | 24 | 25 | 26 => { // fx
      swap4NoFlip(c.xCenter, 2, 19, 4, 21, pow)
      swap4NoFlip(c.xCenter, 3, 16, 5, 22, pow)
      swap4NoFlip(c.tCenter, 2, 19, 4, 21, pow)
      swap4NoFlip(c.xCenter, 8, 9, 10, 11, pow)
      swap4NoFlip(c.tCenter, 8, 9, 10, 11, pow)
    }
  | 6 | 7 | 8 => { // Fx
      swap4NoFlip(c.xCenter, 8, 9, 10, 11, pow)
      swap4NoFlip(c.tCenter, 8, 9, 10, 11, pow)
    }
  | 27 | 28 | 29 => { // dx
      swap4NoFlip(c.xCenter, 10, 18, 14, 22, pow)
      swap4NoFlip(c.xCenter, 11, 19, 15, 23, pow)
      swap4NoFlip(c.tCenter, 10, 18, 14, 22, pow)
      swap4NoFlip(c.xCenter, 4, 5, 6, 7, pow)
      swap4NoFlip(c.tCenter, 4, 5, 6, 7, pow)
    }
  | 9 | 10 | 11 => { // Dx
      swap4NoFlip(c.xCenter, 4, 5, 6, 7, pow)
      swap4NoFlip(c.tCenter, 4, 5, 6, 7, pow)
    }
  | 30 | 31 | 32 => { // lx
      swap4NoFlip(c.xCenter, 0, 8, 4, 14, pow)
      swap4NoFlip(c.xCenter, 3, 11, 7, 13, pow)
      swap4NoFlip(c.tCenter, 3, 11, 7, 13, pow)
      swap4NoFlip(c.xCenter, 20, 21, 22, 23, pow)
      swap4NoFlip(c.tCenter, 20, 21, 22, 23, pow)
    }
  | 12 | 13 | 14 => { // Lx
      swap4NoFlip(c.xCenter, 20, 21, 22, 23, pow)
      swap4NoFlip(c.tCenter, 20, 21, 22, 23, pow)
    }
  | 33 | 34 | 35 => { // bx
      swap4NoFlip(c.xCenter, 1, 20, 7, 18, pow)
      swap4NoFlip(c.xCenter, 0, 23, 6, 17, pow)
      swap4NoFlip(c.tCenter, 0, 23, 6, 17, pow)
      swap4NoFlip(c.xCenter, 12, 13, 14, 15, pow)
      swap4NoFlip(c.tCenter, 12, 13, 14, 15, pow)
    }
  | 15 | 16 | 17 => { // Bx
      swap4NoFlip(c.xCenter, 12, 13, 14, 15, pow)
      swap4NoFlip(c.tCenter, 12, 13, 14, 15, pow)
    }
  | _ => ()
  }
}

let doConj = (c: t, conj: int): unit => {
  switch conj {
  | 0 => { // x rotation
      doMove(c, rx1)
      doMove(c, lx3)
      swap4NoFlip(c.tCenter, 0, 14, 4, 8, 0)
      swap4NoFlip(c.tCenter, 2, 12, 6, 10, 0)
    }
  | 1 => { // y2 rotation
      doMove(c, sliceUx2)
      doMove(c, sliceDx2)
      swap4NoFlip(c.tCenter, 9, 21, 13, 17, 1)
      swap4NoFlip(c.tCenter, 11, 23, 15, 19, 1)
    }
  | 2 => { // lr mirror reflection
      swap2(c.tCenter, 1, 3)
      swap2(c.tCenter, 5, 7)
      swap2(c.tCenter, 9, 11)
      swap2(c.tCenter, 13, 15)
      swap2(c.tCenter, 16, 20)
      swap2(c.tCenter, 17, 23)
      swap2(c.tCenter, 18, 22)
      swap2(c.tCenter, 19, 21)
      swap2(c.xCenter, 0, 1)
      swap2(c.xCenter, 2, 3)
      swap2(c.xCenter, 4, 5)
      swap2(c.xCenter, 6, 7)
      swap2(c.xCenter, 8, 9)
      swap2(c.xCenter, 10, 11)
      swap2(c.xCenter, 12, 13)
      swap2(c.xCenter, 14, 15)
      swap2(c.xCenter, 16, 21)
      swap2(c.xCenter, 17, 20)
      swap2(c.xCenter, 18, 23)
      swap2(c.xCenter, 19, 22)
    }
  | _ => ()
  }
}
