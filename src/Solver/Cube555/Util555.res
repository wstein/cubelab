/*
 * Utilities and combinatorial primitives for Shuang Chen's 5×5×5 reduction solver.
 * Derived from cs0x7f/cube555 (GPLv3 / MIT).
 */

/* Fast bitwise operations */
let bitAnd: (int, int) => int = %raw("(a, b) => (a & b)")
let bitOr: (int, int) => int = %raw("(a, b) => (a | b)")
let bitXor: (int, int) => int = %raw("(a, b) => (a ^ b)")
let bitNot: int => int = %raw("a => (~a)")
let shl: (int, int) => int = %raw("(a, b) => (a << b)")
let shr: (int, int) => int = %raw("(a, b) => (a >> b)")
let shru: (int, int) => int = %raw("(a, b) => (a >>> b)")

let bitCount: int => int = %raw(`
function(n) {
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
}
`)

/* Unsafe fast array access for performance-critical permutation tables */
let getU: (array<'a>, int) => 'a = %raw("(arr, idx) => arr[idx]")
let setU: (array<'a>, int, 'a) => unit = %raw("(arr, idx, val) => { arr[idx] = val; }")
let getU2: (array<array<'a>>, int, int) => 'a = %raw("(arr, i, j) => arr[i][j]")
let setU2: (array<array<'a>>, int, int, 'a) => unit = %raw("(arr, i, j, val) => { arr[i][j] = val; }")

let ux1 = 0
let ux2 = 1
let ux3 = 2
let rx1 = 3
let rx2 = 4
let rx3 = 5
let fx1 = 6
let fx2 = 7
let fx3 = 8
let dx1 = 9
let dx2 = 10
let dx3 = 11
let lx1 = 12
let lx2 = 13
let lx3 = 14
let bx1 = 15
let bx2 = 16
let bx3 = 17

let sliceUx1 = 18
let sliceUx2 = 19
let sliceUx3 = 20
let sliceRx1 = 21
let sliceRx2 = 22
let sliceRx3 = 23
let sliceFx1 = 24
let sliceFx2 = 25
let sliceFx3 = 26
let sliceDx1 = 27
let sliceDx2 = 28
let sliceDx3 = 29
let sliceLx1 = 30
let sliceLx2 = 31
let sliceLx3 = 32
let sliceBx1 = 33
let sliceBx2 = 34
let sliceBx3 = 35

let move2str = [
  "U", "U2", "U'", "R", "R2", "R'", "F", "F2", "F'",
  "D", "D2", "D'", "L", "L2", "L'", "B", "B2", "B'",
  "2U", "2U2", "2U'", "2R", "2R2", "2R'", "2F", "2F2", "2F'",
  "2D", "2D2", "2D'", "2L", "2L2", "2L'", "2B", "2B2", "2B'",
]

let cnk = {
  let table: array<array<int>> = %raw("Array.from({ length: 25 }, () => new Int32Array(25))")
  for i in 0 to 24 {
    setU2(table, i, i, 1)
    setU2(table, i, 0, 1)
  }
  for i in 1 to 24 {
    for j in 1 to i {
      setU2(table, i, j, getU2(table, i - 1, j) + getU2(table, i - 1, j - 1))
    }
  }
  table
}

let fact = {
  let table = Array.make(~length=13, 1)
  for i in 1 to 12 {
    setU(table, i, getU(table, i - 1) * i)
  }
  table
}

let swap2 = (arr: array<int>, a: int, b: int) => {
  let temp = getU(arr, a)
  setU(arr, a, getU(arr, b))
  setU(arr, b, temp)
}

let swap4 = (arr: array<int>, a: int, b: int, c: int, d: int, pow: int, flip: bool) => {
  let xorVal = if flip { 1 } else { 0 }
  switch pow {
  | 0 => {
      let temp = bitXor(getU(arr, d), xorVal)
      setU(arr, d, bitXor(getU(arr, c), xorVal))
      setU(arr, c, bitXor(getU(arr, b), xorVal))
      setU(arr, b, bitXor(getU(arr, a), xorVal))
      setU(arr, a, temp)
    }
  | 1 => {
      let temp = getU(arr, a)
      setU(arr, a, getU(arr, c))
      setU(arr, c, temp)
      let temp2 = getU(arr, b)
      setU(arr, b, getU(arr, d))
      setU(arr, d, temp2)
    }
  | _ => {
      let temp = bitXor(getU(arr, a), xorVal)
      setU(arr, a, bitXor(getU(arr, b), xorVal))
      setU(arr, b, bitXor(getU(arr, c), xorVal))
      setU(arr, c, bitXor(getU(arr, d), xorVal))
      setU(arr, d, temp)
    }
  }
}

let swap4NoFlip = (arr: array<int>, a: int, b: int, c: int, d: int, pow: int) =>
  swap4(arr, a, b, c, d, pow, false)

let getComb = (arr: array<int>, r0: int, n: int) => {
  let idx = ref(0)
  let r = ref(r0)
  for i in n - 1 downto 0 {
    if getU(arr, i) != -1 {
      idx := idx.contents + getU2(cnk, i, r.contents)
      r := r.contents - 1
    }
  }
  idx.contents
}

let getSComb = (arr: array<int>, n: int) => {
  let idx = ref(0)
  let r = ref(n / 2)
  let lastVal = getU(arr, n - 1)
  for i in n - 1 downto 0 {
    if getU(arr, i) != lastVal {
      idx := idx.contents + getU2(cnk, i, r.contents)
      r := r.contents - 1
    }
  }
  idx.contents
}

let setComb = (arr: array<int>, idx0: int, r0: int, n: int) => {
  let idx = ref(idx0)
  let r = ref(r0)
  for i in n - 1 downto 0 {
    let c = getU2(cnk, i, r.contents)
    if idx.contents >= c {
      idx := idx.contents - c
      r := r.contents - 1
      setU(arr, i, 0)
    } else {
      setU(arr, i, -1)
    }
  }
  arr
}

let getParity = (arr: array<int>) => {
  let parity = ref(0)
  let len = arr->Array.length
  for i in 0 to len - 2 {
    for j in i + 1 to len - 1 {
      if getU(arr, i) > getU(arr, j) {
        parity := bitXor(parity.contents, 1)
      }
    }
  }
  parity.contents
}

let genSkipMoves = (validMoves: array<int>): array<int> => {
  let len = validMoves->Array.length
  let ret = Array.make(~length=len + 1, 0)
  for last in 0 to len - 1 {
    let mask = ref(0)
    let la = getU(validMoves, last) / 3
    for move in 0 to len - 1 {
      let axis = getU(validMoves, move) / 3
      if axis == la || (mod(axis, 3) == mod(la, 3) && axis >= la) {
        mask := bitOr(mask.contents, shl(1, move))
      }
    }
    setU(ret, last, mask.contents)
  }
  ret
}

let genNextAxis = (validMoves: array<int>): int => {
  let ret = ref(0)
  for i in 0 to validMoves->Array.length - 1 {
    if mod(getU(validMoves, i), 3) == 0 {
      ret := bitOr(ret.contents, shl(1, i + 1))
    }
  }
  ret.contents
}

/* Nibble-packed array access: 4 bits per entry (2 entries per byte) */
let getPrunNibble = (table: array<int>, idx: int): int => {
  let intIdx = shr(idx, 3)
  let shift = shl(bitAnd(idx, 7), 2)
  bitAnd(shr(getU(table, intIdx), shift), 0xf)
}

let setPrunNibble = (table: array<int>, idx: int, value: int): unit => {
  let intIdx = shr(idx, 3)
  let shift = shl(bitAnd(idx, 7), 2)
  let mask = bitNot(shl(0xf, shift))
  setU(table, intIdx, bitOr(bitAnd(getU(table, intIdx), mask), shl(bitAnd(value, 0xf), shift)))
}
