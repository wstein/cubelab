/*
 * Pruning Table Engine for 5×5×5 reduction solver.
 * Memory-efficient flat Uint8Array (nibble-packed, 4 bits per state, 2 distances per byte).
 * Derived from cs0x7f/cube555 (GPLv3 / MIT).
 */

open Util555

type t = {
  nState: int,
  data: array<int>, // Uint8Array or Int32Array backing
}

let makeNibbleTable: int => array<int> = %raw(`
function(nState) {
  const byteLen = (nState + 1) >> 1;
  const arr = new Uint8Array(byteLen);
  arr.fill(0xff);
  return arr;
}
`)

let getDistance: (array<int>, int) => int = %raw(`
function(table, idx) {
  const byte = table[idx >>> 1];
  return (byte >>> ((idx & 1) << 2)) & 0x0f;
}
`)

let setDistance: (array<int>, int, int) => unit = %raw(`
function(table, idx, val) {
  const byteIdx = idx >>> 1;
  const shift = (idx & 1) << 2;
  table[byteIdx] = (table[byteIdx] & ~(0x0f << shift)) | ((val & 0x0f) << shift);
}
`)

/**
 * Fast breadth-first search pruning table generator.
 * moveTable: moveTable[state][moveIdx] -> nextState
 * solvedStates: array of target states at distance 0
 * maxDepth: maximum depth to compute (default 15)
 */
let buildBfsPruningTable = (
  nState: int,
  moveTable: array<array<int>>,
  solvedStates: array<int>,
  maxDepth: int,
): array<int> => {
  let table = makeNibbleTable(nState)
  let nMoves = if moveTable->Array.length > 0 {
    getU(moveTable, 0)->Array.length
  } else {
    0
  }

  for i in 0 to solvedStates->Array.length - 1 {
    let s = getU(solvedStates, i)
    setDistance(table, s, 0)
  }

  let depth = ref(0)
  let done = ref(solvedStates->Array.length)

  while done.contents > 0 && depth.contents < maxDepth {
    let targetDist = depth.contents
    let nextDist = targetDist + 1
    let newlyReached = ref(0)

    for state in 0 to nState - 1 {
      if getDistance(table, state) == targetDist {
        for m in 0 to nMoves - 1 {
          let nextState = getU2(moveTable, state, m)
          if nextState >= 0 && nextState < nState {
            if getDistance(table, nextState) == 0x0f {
              setDistance(table, nextState, nextDist)
              newlyReached := newlyReached.contents + 1
            }
          }
        }
      }
    }

    done := newlyReached.contents
    depth := depth.contents + 1
  }

  table
}
