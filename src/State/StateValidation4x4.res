open StateTypes

type vector = {x: int, y: int, z: int}
type sticker = {position: vector, normal: vector}
type wingSlot = {indices: (int, int)}
type axis = X | Y | Z
type generator = {axis: axis, direction: int, affected: vector => bool}

let size = 4
let last = size - 1
let faces = ["U", "R", "F", "D", "L", "B"]

let faceIndex = face =>
  switch face {
  | "U" => 0
  | "R" => 1
  | "F" => 2
  | "D" => 3
  | "L" => 4
  | "B" => 5
  | _ => -1
  }

let centreIndices = [5, 6, 9, 10]
let cornerLocalIndices = [0, 3, 12, 15]

let serialIndex = (face, row, column) =>
  faceIndex(face) * 16 + row * size + column

let stickerFor = (face, row, column) =>
  switch face {
  | "U" => {position: {x: column, y: last, z: row}, normal: {x: 0, y: 1, z: 0}}
  | "D" => {position: {x: column, y: 0, z: last - row}, normal: {x: 0, y: -1, z: 0}}
  | "F" => {position: {x: column, y: last - row, z: last}, normal: {x: 0, y: 0, z: 1}}
  | "B" => {position: {x: last - column, y: last - row, z: 0}, normal: {x: 0, y: 0, z: -1}}
  | "R" => {position: {x: last, y: last - row, z: last - column}, normal: {x: 1, y: 0, z: 0}}
  | _ => {position: {x: 0, y: last - row, z: column}, normal: {x: -1, y: 0, z: 0}}
  }

let faceletFor = sticker => {
  let {x, y, z} = sticker.position
  let normal = sticker.normal
  if normal.y == 1 {
    ("U", z, x)
  } else if normal.y == -1 {
    ("D", last - z, x)
  } else if normal.z == 1 {
    ("F", last - y, x)
  } else if normal.z == -1 {
    ("B", last - y, last - x)
  } else if normal.x == 1 {
    ("R", last - y, last - z)
  } else {
    ("L", last - y, z)
  }
}

let indexFor = sticker => {
  let (face, row, column) = faceletFor(sticker)
  serialIndex(face, row, column)
}

let positionKey = ({x, y, z}: vector) =>
  `${x->Int.toString}/${y->Int.toString}/${z->Int.toString}`

let rotate = (vector: vector, axis: axis, direction: int, coordinate: bool): vector => {
  let invert = value => coordinate ? last - value : -value
  switch axis {
  | X =>
    if direction == 1 {
      {x: vector.x, y: invert(vector.z), z: vector.y}
    } else {
      {x: vector.x, y: vector.z, z: invert(vector.y)}
    }
  | Y =>
    if direction == 1 {
      {x: vector.z, y: vector.y, z: invert(vector.x)}
    } else {
      {x: invert(vector.z), y: vector.y, z: vector.x}
    }
  | Z =>
    if direction == 1 {
      {x: invert(vector.y), y: vector.x, z: vector.z}
    } else {
      {x: vector.y, y: invert(vector.x), z: vector.z}
    }
  }
}

let applyGenerator = (sticker: sticker, generator: generator): sticker => {
  if !generator.affected(sticker.position) {
    sticker
  } else {
    {
      position: rotate(sticker.position, generator.axis, generator.direction, true),
      normal: rotate(sticker.normal, generator.axis, generator.direction, false),
    }
  }
}

let generators: array<generator> = [
  {axis: X, direction: -1, affected: ({x}) => x == last},
  {axis: X, direction: 1, affected: ({x}) => x == 0},
  {axis: Y, direction: -1, affected: ({y}) => y == last},
  {axis: Y, direction: 1, affected: ({y}) => y == 0},
  {axis: Z, direction: -1, affected: ({z}) => z == last},
  {axis: Z, direction: 1, affected: ({z}) => z == 0},
  {axis: X, direction: -1, affected: ({x}) => x == last - 1},
  {axis: X, direction: 1, affected: ({x}) => x == 1},
  {axis: Y, direction: -1, affected: ({y}) => y == last - 1},
  {axis: Y, direction: 1, affected: ({y}) => y == 1},
  {axis: Z, direction: -1, affected: ({z}) => z == last - 1},
  {axis: Z, direction: 1, affected: ({z}) => z == 1},
]

let wingSlots = (): array<wingSlot> => {
  let grouped = Dict.make()
  faces->Array.forEach(face => {
    for row in 0 to size - 1 {
      for column in 0 to size - 1 {
        let outer = row == 0 || row == last || column == 0 || column == last
        let corner = (row == 0 || row == last) && (column == 0 || column == last)
        if outer && !corner {
          let index = serialIndex(face, row, column)
          let key = positionKey(stickerFor(face, row, column).position)
          let existing = switch grouped->Dict.get(key) {
          | Some(arr) => arr
          | None => []
          }
          existing->Array.push(index)
          grouped->Dict.set(key, existing)
        }
      }
    }
  })
  let slots =
    grouped
    ->Dict.valuesToArray
    ->Array.map(indices => {
      let sorted = indices->Array.copy
      sorted->Array.sort((a, b) => Int.compare(a, b))
      sorted
    })
  slots->Array.sort((a, b) => {
    let a0 = Belt.Array.getUnsafe(a, 0)
    let b0 = Belt.Array.getUnsafe(b, 0)
    Int.compare(a0, b0)
  })
  slots->Array.map(indices => {
    indices: (Belt.Array.getUnsafe(indices, 0), Belt.Array.getUnsafe(indices, 1)),
  })
}

let allWingSlots = wingSlots()

let wingDestinations = (source: wingSlot): array<(int, int)> => {
  let (first, second) = source.indices
  let toSticker = index => {
    let face = Belt.Array.getUnsafe(faces, Math.Int.floor(index->Int.toFloat /. 16.0))
    let local = mod(index, 16)
    stickerFor(face, Math.Int.floor(local->Int.toFloat /. size->Int.toFloat), mod(local, size))
  }
  let initial = (toSticker(first), toSticker(second))
  let queue = [initial]
  let seen = Set.make()
  let destinations = []
  while queue->Array.length > 0 {
    let (left, right) = queue->Array.shift->Option.getUnsafe
    let leftIndex = indexFor(left)
    let rightIndex = indexFor(right)
    let key = `${leftIndex->Int.toString}/${rightIndex->Int.toString}`
    if !Set.has(seen, key) {
      seen->Set.add(key)
      destinations->Array.push((leftIndex, rightIndex))
      generators->Array.forEach(generator => {
        queue->Array.push((applyGenerator(left, generator), applyGenerator(right, generator)))
      })
    }
  }
  destinations
}

let allWingDestinations = allWingSlots->Array.map(wingDestinations)

type staticWingDest = {
  first: int,
  second: int,
  slot: int,
}

let staticWingSourceColours = allWingSlots->Array.map(({indices: (first, second)}) => {
  (
    Belt.Array.getUnsafe(faces, Math.Int.floor(first->Int.toFloat /. 16.0)),
    Belt.Array.getUnsafe(faces, Math.Int.floor(second->Int.toFloat /. 16.0)),
  )
})

let staticWingDestinations: array<array<staticWingDest>> = allWingDestinations->Array.map(destinations => {
  let result = []
  destinations->Array.forEach(((first, second)) => {
    let slot = allWingSlots->Array.findIndex(({indices: (idx0, idx1)}) =>
      (idx0 == first || idx1 == first) && (idx0 == second || idx1 == second)
    )
    if slot >= 0 {
      result->Array.push({first, second, slot})
    }
  })
  result
})

let canComplete4x4Wings = (compact: array<Nullable.t<string>>): bool => {
  if compact->Array.length != 96 {
    false
  } else {
    let edgeMasks = Array.make(~length=24, 0)
    let possible = ref(true)
    let source = ref(0)
    while possible.contents && source.contents < 24 {
      let s = source.contents
      let (firstColour, secondColour) = Belt.Array.getUnsafe(staticWingSourceColours, s)
      let destinations = Belt.Array.getUnsafe(staticWingDestinations, s)
      let mask = ref(0)
      for d in 0 to destinations->Array.length - 1 {
        let dest = Belt.Array.getUnsafe(destinations, d)
        let firstVal = Belt.Array.getUnsafe(compact, dest.first)->Nullable.toOption
        let secondVal = Belt.Array.getUnsafe(compact, dest.second)->Nullable.toOption
        let matchFirst = switch firstVal {
        | None => true
        | Some(c) => c == firstColour
        }
        let matchSecond = switch secondVal {
        | None => true
        | Some(c) => c == secondColour
        }
        if matchFirst && matchSecond {
          mask := Int.bitwiseOr(mask.contents, Int.shiftLeft(1, dest.slot))
        }
      }
      if mask.contents == 0 {
        possible := false
      } else {
        Belt.Array.setUnsafe(edgeMasks, s, mask.contents)
      }
      source := source.contents + 1
    }

    if !possible.contents {
      false
    } else {
      let matchedSourceForSlot = Array.make(~length=24, -1)
      let visitedMask = ref(0)

      let rec assign = source => {
        let mask = Belt.Array.getUnsafe(edgeMasks, source)
        let found = ref(false)
        let slot = ref(0)
        while !found.contents && slot.contents < 24 {
          let sl = slot.contents
          let bit = Int.shiftLeft(1, sl)
          if Int.bitwiseAnd(mask, bit) != 0 && Int.bitwiseAnd(visitedMask.contents, bit) == 0 {
            visitedMask := Int.bitwiseOr(visitedMask.contents, bit)
            let prevSource = Belt.Array.getUnsafe(matchedSourceForSlot, sl)
            if prevSource == -1 || assign(prevSource) {
              Belt.Array.setUnsafe(matchedSourceForSlot, sl, source)
              found := true
            }
          }
          slot := slot.contents + 1
        }
        found.contents
      }

      let allAssigned = ref(true)
      let src = ref(0)
      while allAssigned.contents && src.contents < 24 {
        visitedMask := 0
        if !assign(src.contents) {
          allAssigned := false
        }
        src := src.contents + 1
      }
      allAssigned.contents
    }
  }
}

let cornerState = (compact: string): result<unit, string> => {
  let reduced = ref("")
  faces->Array.forEach(face => {
    cornerLocalIndices->Array.forEach(index => {
      let row = Math.Int.floor(index->Int.toFloat /. 4.0)
      let col = mod(index, 4)
      let idx = serialIndex(face, row, col)
      reduced := reduced.contents ++ compact->String.slice(~start=idx, ~end=idx + 1)
    })
  })
  switch FaceletCodec.parse(~size=2, reduced.contents) {
  | Error(_) => Error("Invalid 2×2 corner facelets.")
  | Ok(parsed) =>
    switch PieceReducer.reduce(parsed) {
    | Ok(_) => Ok()
    | Error(err) => Error(PieceReducer.describeError(err))
    }
  }
}

let validate4x4 = (state: cubeState): Nullable.t<string> => {
  if state.size != 4 {
    Nullable.make("The 4×4 validator received a non-4×4 state.")
  } else {
    let compact = FaceletCodec.render(state)
    if compact->String.length != 96 {
      Nullable.make("A 4×4 state must contain 96 facelets.")
    } else {
      switch cornerState(compact) {
      | Error(err) =>
        Nullable.make(`Invalid 4×4 corners: ${err}.`)
      | Ok() => {
          let centreCounts = Dict.make()
          faces->Array.forEach(face => {
            centreIndices->Array.forEach(index => {
              let row = Math.Int.floor(index->Int.toFloat /. 4.0)
              let col = mod(index, 4)
              let idx = serialIndex(face, row, col)
              let colour = compact->String.slice(~start=idx, ~end=idx + 1)
              let count = switch centreCounts->Dict.get(colour) {
              | Some(n) => n
              | None => 0
              }
              centreCounts->Dict.set(colour, count + 1)
            })
          })
          let invalidCentres = faces->Array.some(face => {
            switch centreCounts->Dict.get(face) {
            | Some(4) => false
            | _ => true
            }
          })
          if invalidCentres {
            Nullable.make("Invalid 4×4 centres: each centre colour must occur exactly four times.")
          } else {
            let stickers = compact->String.split("")->Array.map(Nullable.make)
            if !canComplete4x4Wings(stickers) {
              Nullable.make("Invalid 4×4 wings: the stickers cannot form a legal permutation and orientation of the 24 wing pieces.")
            } else {
              Nullable.null
            }
          }
        }
      }
    }
  }
}
