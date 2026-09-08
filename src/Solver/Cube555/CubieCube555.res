/*
 * Cubie-level representation for 5×5×5 Rubik's Cube.
 * Derived from cs0x7f/cube555 (GPLv3 / MIT).
 */

open Util555

type t = {
  tCenter: array<int>,
  xCenter: array<int>,
  mEdge: array<int>,
  wEdge: array<int>,
  cp: array<int>,
  co: array<int>,
}

let makeSolved = (): t => {
  let tCenter = Array.make(~length=24, 0)
  let xCenter = Array.make(~length=24, 0)
  let mEdge = Array.make(~length=12, 0)
  let wEdge = Array.make(~length=24, 0)
  let cp = Array.make(~length=8, 0)
  let co = Array.make(~length=8, 0)

  // Faces: U=0, R=1, F=2, D=3, L=4, B=5
  // Slot order: U (0..3), D (4..7), F (8..11), B (12..15), R (16..19), L (20..23)
  let centerColors = [
    0, 0, 0, 0, // U
    3, 3, 3, 3, // D
    2, 2, 2, 2, // F
    5, 5, 5, 5, // B
    1, 1, 1, 1, // R
    4, 4, 4, 4, // L
  ]
  for i in 0 to 23 {
    setU(tCenter, i, getU(centerColors, i))
    setU(xCenter, i, getU(centerColors, i))
    setU(wEdge, i, i)
  }
  for i in 0 to 11 {
    setU(mEdge, i, shl(i, 1))
  }
  for i in 0 to 7 {
    setU(cp, i, i)
    setU(co, i, 0)
  }
  {tCenter, xCenter, mEdge, wEdge, cp, co}
}

let clone = (c: t): t => {
  {
    tCenter: c.tCenter->Array.copy,
    xCenter: c.xCenter->Array.copy,
    mEdge: c.mEdge->Array.copy,
    wEdge: c.wEdge->Array.copy,
    cp: c.cp->Array.copy,
    co: c.co->Array.copy,
  }
}

let copyInto = (src: t, dst: t): unit => {
  for i in 0 to 23 {
    setU(dst.tCenter, i, getU(src.tCenter, i))
    setU(dst.xCenter, i, getU(src.xCenter, i))
    setU(dst.wEdge, i, getU(src.wEdge, i))
  }
  for i in 0 to 11 {
    setU(dst.mEdge, i, getU(src.mEdge, i))
  }
  for i in 0 to 7 {
    setU(dst.cp, i, getU(src.cp, i))
    setU(dst.co, i, getU(src.co, i))
  }
}

/* 36 moves applied to cubie state */
let doMove = (c: t, move: int): unit => {
  let pow = mod(move, 3)
  switch move {
  | 18 | 19 | 20 => { // ux
      swap4NoFlip(c.xCenter, 8, 20, 12, 16, pow)
      swap4NoFlip(c.xCenter, 9, 21, 13, 17, pow)
      swap4NoFlip(c.tCenter, 8, 20, 12, 16, pow)
      swap4NoFlip(c.wEdge, 9, 22, 11, 20, pow)
      swap4NoFlip(c.xCenter, 0, 1, 2, 3, pow)
      swap4NoFlip(c.tCenter, 0, 1, 2, 3, pow)
      swap4(c.mEdge, 0, 4, 1, 5, pow, false)
      swap4NoFlip(c.wEdge, 0, 4, 1, 5, pow)
      swap4NoFlip(c.wEdge, 12, 16, 13, 17, pow)
    }
  | 0 | 1 | 2 => { // Ux
      swap4NoFlip(c.xCenter, 0, 1, 2, 3, pow)
      swap4NoFlip(c.tCenter, 0, 1, 2, 3, pow)
      swap4(c.mEdge, 0, 4, 1, 5, pow, false)
      swap4NoFlip(c.wEdge, 0, 4, 1, 5, pow)
      swap4NoFlip(c.wEdge, 12, 16, 13, 17, pow)
    }
  | 21 | 22 | 23 => { // rx
      swap4NoFlip(c.xCenter, 1, 15, 5, 9, pow)
      swap4NoFlip(c.xCenter, 2, 12, 6, 10, pow)
      swap4NoFlip(c.tCenter, 1, 15, 5, 9, pow)
      swap4NoFlip(c.wEdge, 1, 14, 3, 12, pow)
      swap4NoFlip(c.xCenter, 16, 17, 18, 19, pow)
      swap4NoFlip(c.tCenter, 16, 17, 18, 19, pow)
      swap4(c.mEdge, 5, 10, 6, 11, pow, true)
      swap4NoFlip(c.wEdge, 5, 22, 6, 23, pow)
      swap4NoFlip(c.wEdge, 17, 10, 18, 11, pow)
    }
  | 3 | 4 | 5 => { // Rx
      swap4NoFlip(c.xCenter, 16, 17, 18, 19, pow)
      swap4NoFlip(c.tCenter, 16, 17, 18, 19, pow)
      swap4(c.mEdge, 5, 10, 6, 11, pow, true)
      swap4NoFlip(c.wEdge, 5, 22, 6, 23, pow)
      swap4NoFlip(c.wEdge, 17, 10, 18, 11, pow)
    }
  | 24 | 25 | 26 => { // fx
      swap4NoFlip(c.xCenter, 2, 19, 4, 21, pow)
      swap4NoFlip(c.xCenter, 3, 16, 5, 22, pow)
      swap4NoFlip(c.tCenter, 2, 19, 4, 21, pow)
      swap4NoFlip(c.wEdge, 5, 18, 7, 16, pow)
      swap4NoFlip(c.xCenter, 8, 9, 10, 11, pow)
      swap4NoFlip(c.tCenter, 8, 9, 10, 11, pow)
      swap4(c.mEdge, 0, 11, 3, 8, pow, false)
      swap4NoFlip(c.wEdge, 0, 11, 3, 8, pow)
      swap4NoFlip(c.wEdge, 12, 23, 15, 20, pow)
    }
  | 6 | 7 | 8 => { // Fx
      swap4NoFlip(c.xCenter, 8, 9, 10, 11, pow)
      swap4NoFlip(c.tCenter, 8, 9, 10, 11, pow)
      swap4(c.mEdge, 0, 11, 3, 8, pow, false)
      swap4NoFlip(c.wEdge, 0, 11, 3, 8, pow)
      swap4NoFlip(c.wEdge, 12, 23, 15, 20, pow)
    }
  | 27 | 28 | 29 => { // dx
      swap4NoFlip(c.xCenter, 10, 18, 14, 22, pow)
      swap4NoFlip(c.xCenter, 11, 19, 15, 23, pow)
      swap4NoFlip(c.tCenter, 10, 18, 14, 22, pow)
      swap4NoFlip(c.wEdge, 8, 23, 10, 21, pow)
      swap4NoFlip(c.xCenter, 4, 5, 6, 7, pow)
      swap4NoFlip(c.tCenter, 4, 5, 6, 7, pow)
      swap4(c.mEdge, 2, 7, 3, 6, pow, false)
      swap4NoFlip(c.wEdge, 2, 7, 3, 6, pow)
      swap4NoFlip(c.wEdge, 14, 19, 15, 18, pow)
    }
  | 9 | 10 | 11 => { // Dx
      swap4NoFlip(c.xCenter, 4, 5, 6, 7, pow)
      swap4NoFlip(c.tCenter, 4, 5, 6, 7, pow)
      swap4(c.mEdge, 2, 7, 3, 6, pow, false)
      swap4NoFlip(c.wEdge, 2, 7, 3, 6, pow)
      swap4NoFlip(c.wEdge, 14, 19, 15, 18, pow)
    }
  | 30 | 31 | 32 => { // lx
      swap4NoFlip(c.xCenter, 0, 8, 4, 14, pow)
      swap4NoFlip(c.xCenter, 3, 11, 7, 13, pow)
      swap4NoFlip(c.tCenter, 3, 11, 7, 13, pow)
      swap4NoFlip(c.wEdge, 0, 15, 2, 13, pow)
      swap4NoFlip(c.xCenter, 20, 21, 22, 23, pow)
      swap4NoFlip(c.tCenter, 20, 21, 22, 23, pow)
      swap4(c.mEdge, 4, 8, 7, 9, pow, true)
      swap4NoFlip(c.wEdge, 4, 20, 7, 21, pow)
      swap4NoFlip(c.wEdge, 16, 8, 19, 9, pow)
    }
  | 12 | 13 | 14 => { // Lx
      swap4NoFlip(c.xCenter, 20, 21, 22, 23, pow)
      swap4NoFlip(c.tCenter, 20, 21, 22, 23, pow)
      swap4(c.mEdge, 4, 8, 7, 9, pow, true)
      swap4NoFlip(c.wEdge, 4, 20, 7, 21, pow)
      swap4NoFlip(c.wEdge, 16, 8, 19, 9, pow)
    }
  | 33 | 34 | 35 => { // bx
      swap4NoFlip(c.xCenter, 1, 20, 7, 18, pow)
      swap4NoFlip(c.xCenter, 0, 23, 6, 17, pow)
      swap4NoFlip(c.tCenter, 0, 23, 6, 17, pow)
      swap4NoFlip(c.wEdge, 4, 19, 6, 17, pow)
      swap4NoFlip(c.xCenter, 12, 13, 14, 15, pow)
      swap4NoFlip(c.tCenter, 12, 13, 14, 15, pow)
      swap4(c.mEdge, 1, 9, 2, 10, pow, false)
      swap4NoFlip(c.wEdge, 1, 9, 2, 10, pow)
      swap4NoFlip(c.wEdge, 13, 21, 14, 22, pow)
    }
  | 15 | 16 | 17 => { // Bx
      swap4NoFlip(c.xCenter, 12, 13, 14, 15, pow)
      swap4NoFlip(c.tCenter, 12, 13, 14, 15, pow)
      swap4(c.mEdge, 1, 9, 2, 10, pow, false)
      swap4NoFlip(c.wEdge, 1, 9, 2, 10, pow)
      swap4NoFlip(c.wEdge, 13, 21, 14, 22, pow)
    }
  | _ => ()
  }
}
