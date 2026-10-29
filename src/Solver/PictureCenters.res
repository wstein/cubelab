/** Fixed-frame 3×3 center twists, clockwise quarter turns in U/L/F/R/B/D order.
 * Color facelets alone cannot recover these six physical orientations. */
open StateTypes
open MoveTypes

@scope("Number") external isInteger: int => bool = "isInteger"

// Visit every index explicitly: Array.every and reduce skip holes, so a sparse
// array such as [1, , 1, 0, 0, 0] or Array(6) must not validate as zeros.
let storageIndices = [0, 1, 2, 3, 4, 5]
let everyStored = (values, valid) =>
  Array.isArray(values) &&
  values->Array.length == 6 &&
  storageIndices->Array.every(index => valid(values->Array.getUnsafe(index)))

let validOrientations = values =>
  values->everyStored(value => isInteger(value) && value >= 0 && value < 4)

// Period 1 ignores orientation, 2 identifies a half turn, and 4 requires exact up.
let validSymmetry = values => values->everyStored(value => value == 1 || value == 2 || value == 4)

let factors = [1, 4, 16, 64, 256, 1024]
let encode = values =>
  values->Array.reduceWithIndex(0, (sum, value, index) =>
    sum + value * Belt.Array.getUnsafe(factors, index)
  )
let orientation = (coordinate, index) => coordinate / Belt.Array.getUnsafe(factors, index) % 4
let decode = coordinate => factors->Array.mapWithIndex((_, index) => orientation(coordinate, index))

let turn = (coordinate, face, turns) => {
  let index = storageIndex(face)
  let previous = orientation(coordinate, index)
  let next = (previous + turns % 4 + 4) % 4
  coordinate + (next - previous) * Belt.Array.getUnsafe(factors, index)
}

let move = (coordinate, moveIndex) => {
  let faces = [U, D, R, L, F, B]
  turn(
    coordinate,
    Belt.Array.getUnsafe(faces, moveIndex / 3),
    Belt.Array.getUnsafe([1, 2, -1], moveIndex % 3),
  )
}

let distance = (coordinate, symmetry) =>
  symmetry->Array.reduceWithIndex(0, (count, period, index) =>
    count + if orientation(coordinate, index) % period == 0 {
      0
    } else {
      1
    }
  )

// Phase two can only change a side center by a half turn.
let phase2Reachable = (coordinate, symmetry) =>
  [1, 2, 3, 4]->Array.every(index =>
    Belt.Array.getUnsafe(symmetry, index) == 1 || orientation(coordinate, index) % 2 == 0
  )

let apply = (values, alg) =>
  if !validOrientations(values) {
    Error("Six center orientations from 0 through 3 are required.")
  } else {
    switch MoveExecutor.expand(alg) {
    | Error(_) => Error("Could not expand center moves.")
    | Ok(steps) => {
        let coordinate = ref(encode(values))
        let valid = ref(true)
        steps->Array.forEach(step =>
          switch step.move {
          | FaceTurn(face, {from_: 1, to_: 1}) =>
            coordinate := turn(coordinate.contents, face, step.turns)
          | _ => valid := false
          }
        )
        if valid.contents {
          Ok(decode(coordinate.contents))
        } else {
          Error("Picture-center replay requires fixed-frame outer face turns.")
        }
      }
    }
  }

let reachable = (values, corners) =>
  validOrientations(values) &&
  values->Array.reduce(0, (sum, value) => sum + value) % 2 == StateParity.permutationParity(corners)
