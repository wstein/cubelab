type style =
  | Standard
  | Speed

type palette =
  | Western
  | Japanese

type vec3 = {
  x: float,
  y: float,
  z: float,
}

type colour = {
  r: float,
  g: float,
  b: float,
  a: float,
}

type mesh = {
  data: array<float>,
  vertexCount: int,
  stride: int,
}

type emitter = {
  data: array<float>,
  cubie: vec3,
}

type rimPoint = {
  u: float,
  v: float,
  nu: float,
  nv: float,
}

let stride = 14
let halfExtent = 1.5
let body = {r: 0.13, g: 0.14, b: 0.17, a: 1.0}

let vec = (x, y, z) => {x, y, z}
let add = (a, b) => vec(a.x +. b.x, a.y +. b.y, a.z +. b.z)
let sub = (a, b) => vec(a.x -. b.x, a.y -. b.y, a.z -. b.z)
let scale = (value, amount) => vec(value.x *. amount, value.y *. amount, value.z *. amount)
let dot = (a, b) => a.x *. b.x +. a.y *. b.y +. a.z *. b.z

let cross = (a, b) =>
  vec(a.y *. b.z -. a.z *. b.y, a.z *. b.x -. a.x *. b.z, a.x *. b.y -. a.y *. b.x)

let normalize = value => {
  let length = Math.sqrt(dot(value, value))
  if length < 0.000000001 {
    vec(0.0, 0.0, 0.0)
  } else {
    scale(value, 1.0 /. length)
  }
}

let faceNormal = face =>
  switch face {
  | StateTypes.U => vec(0.0, 1.0, 0.0)
  | D => vec(0.0, -1.0, 0.0)
  | F => vec(0.0, 0.0, 1.0)
  | B => vec(0.0, 0.0, -1.0)
  | R => vec(1.0, 0.0, 0.0)
  | L => vec(-1.0, 0.0, 0.0)
  }

let rowAxis = face =>
  switch face {
  | StateTypes.U => vec(0.0, 0.0, 1.0)
  | D => vec(0.0, 0.0, -1.0)
  | F | R | B | L => vec(0.0, -1.0, 0.0)
  }

let colAxis = face =>
  switch face {
  | StateTypes.U | D | F => vec(1.0, 0.0, 0.0)
  | B => vec(-1.0, 0.0, 0.0)
  | R => vec(0.0, 0.0, -1.0)
  | L => vec(0.0, 0.0, 1.0)
  }

let westernColour = face =>
  switch face {
  | StateTypes.U => {r: 0.95, g: 0.95, b: 0.95, a: 1.0}
  | R => {r: 0.77, g: 0.21, b: 0.18, a: 1.0}
  | F => {r: 0.13, g: 0.55, b: 0.29, a: 1.0}
  | D => {r: 0.96, g: 0.80, b: 0.20, a: 1.0}
  | L => {r: 0.94, g: 0.47, b: 0.13, a: 1.0}
  | B => {r: 0.16, g: 0.35, b: 0.66, a: 1.0}
  }

let speedColour = face =>
  switch face {
  | StateTypes.U => {r: 0.96, g: 0.96, b: 0.95, a: 1.0}
  | R => {r: 0.92, g: 0.30, b: 0.29, a: 1.0}
  | F => {r: 0.40, g: 0.80, b: 0.34, a: 1.0}
  | D => {r: 0.98, g: 0.80, b: 0.18, a: 1.0}
  | L => {r: 0.96, g: 0.55, b: 0.15, a: 1.0}
  | B => {r: 0.28, g: 0.62, b: 0.94, a: 1.0}
  }

let colourOf = (~style, ~palette, face) => {
  let mapped = switch (palette, face) {
  | (Japanese, StateTypes.F) => StateTypes.B
  | (Japanese, B) => F
  | _ => face
  }
  switch style {
  | Standard => westernColour(mapped)
  | Speed => speedColour(mapped)
  }
}

let pushVertex = (emitter, position, normal, colour, sheen) => {
  emitter.data->Array.push(position.x)->ignore
  emitter.data->Array.push(position.y)->ignore
  emitter.data->Array.push(position.z)->ignore
  emitter.data->Array.push(normal.x)->ignore
  emitter.data->Array.push(normal.y)->ignore
  emitter.data->Array.push(normal.z)->ignore
  emitter.data->Array.push(colour.r)->ignore
  emitter.data->Array.push(colour.g)->ignore
  emitter.data->Array.push(colour.b)->ignore
  emitter.data->Array.push(colour.a)->ignore
  emitter.data->Array.push(emitter.cubie.x)->ignore
  emitter.data->Array.push(emitter.cubie.y)->ignore
  emitter.data->Array.push(emitter.cubie.z)->ignore
  emitter.data->Array.push(sheen)->ignore
}

let emitTriangle = (emitter, a, b, c, na, nb, nc, colour, wanted, ~sheen=0.0) => {
  let facing = cross(sub(b, a), sub(c, a))
  if dot(facing, wanted) >= 0.0 {
    pushVertex(emitter, a, na, colour, sheen)
    pushVertex(emitter, b, nb, colour, sheen)
    pushVertex(emitter, c, nc, colour, sheen)
  } else {
    pushVertex(emitter, a, na, colour, sheen)
    pushVertex(emitter, c, nc, colour, sheen)
    pushVertex(emitter, b, nb, colour, sheen)
  }
}

let emitQuad = (emitter, a, b, c, d, na, nb, nc, nd, colour, wanted, ~sheen=0.0) => {
  emitTriangle(emitter, a, b, c, na, nb, nc, colour, wanted, ~sheen)
  emitTriangle(emitter, a, c, d, na, nc, nd, colour, wanted, ~sheen)
}

let faceCentre = (centre, face, out) => add(centre, scale(faceNormal(face), out))

let emitFace = (emitter, centre, face, out, side, colour) => {
  let half = side /. 2.0
  let normal = faceNormal(face)
  let row = scale(rowAxis(face), half)
  let col = scale(colAxis(face), half)
  let middle = faceCentre(centre, face, out)
  let a = sub(sub(middle, row), col)
  let b = sub(add(middle, row), col)
  let c = add(add(middle, row), col)
  let d = add(sub(middle, row), col)
  emitQuad(emitter, a, b, c, d, normal, normal, normal, normal, colour, normal)
}

let edges: array<(StateTypes.face, StateTypes.face)> = [
  (U, R),
  (U, F),
  (U, L),
  (U, B),
  (D, R),
  (D, F),
  (D, L),
  (D, B),
  (R, F),
  (F, L),
  (L, B),
  (B, R),
]

let corners: array<(StateTypes.face, StateTypes.face, StateTypes.face)> = [
  (U, R, F),
  (U, F, L),
  (U, L, B),
  (U, B, R),
  (D, F, R),
  (D, L, F),
  (D, B, L),
  (D, R, B),
]

let isExposed = (~last, ~gx, ~gy, ~gz, face) =>
  switch face {
  | StateTypes.U => gy == last
  | D => gy == 0
  | F => gz == last
  | B => gz == 0
  | R => gx == last
  | L => gx == 0
  }

let faceletAt = (state: StateTypes.cubeState, ~gx, ~gy, ~gz, face) => {
  let last = state.size - 1
  let (row, col) = switch face {
  | StateTypes.U => (gz, gx)
  | D => (last - gz, gx)
  | F => (last - gy, gx)
  | B => (last - gy, last - gx)
  | R => (last - gy, last - gz)
  | L => (last - gy, gz)
  }
  let values = Belt.Array.getUnsafe(state.facelets, StateTypes.storageIndex(face))
  Belt.Array.getUnsafe(values, row * state.size + col)
}

let cubieCentre = (~size, ~gx, ~gy, ~gz) => {
  let cell = 2.0 *. halfExtent /. Float.fromInt(size)
  let offset = Float.fromInt(size - 1) /. 2.0
  vec(
    (Float.fromInt(gx) -. offset) *. cell,
    (Float.fromInt(gy) -. offset) *. cell,
    (Float.fromInt(gz) -. offset) *. cell,
  )
}

let emitFlatBevels = (emitter, centre, half, flat, colour) => {
  for index in 0 to edges->Array.length - 1 {
    let (faceA, faceB) = Belt.Array.getUnsafe(edges, index)
    let na = faceNormal(faceA)
    let nb = faceNormal(faceB)
    let along = cross(nb, na)
    let onA = add(scale(na, half), scale(nb, flat))
    let onB = add(scale(nb, half), scale(na, flat))
    let a = add(centre, add(onA, scale(along, -flat)))
    let b = add(centre, add(onA, scale(along, flat)))
    let c = add(centre, add(onB, scale(along, flat)))
    let d = add(centre, add(onB, scale(along, -flat)))
    let wanted = normalize(add(na, nb))
    emitQuad(emitter, a, b, c, d, na, na, nb, nb, colour, wanted)
  }
}

let emitFlatCorners = (emitter, centre, half, flat, colour) => {
  for index in 0 to corners->Array.length - 1 {
    let (faceA, faceB, faceC) = Belt.Array.getUnsafe(corners, index)
    let na = faceNormal(faceA)
    let nb = faceNormal(faceB)
    let nc = faceNormal(faceC)
    let a = add(centre, add(scale(na, half), add(scale(nb, flat), scale(nc, flat))))
    let b = add(centre, add(scale(nb, half), add(scale(nc, flat), scale(na, flat))))
    let c = add(centre, add(scale(nc, half), add(scale(na, flat), scale(nb, flat))))
    emitTriangle(emitter, a, b, c, na, nb, nc, colour, normalize(add(na, add(nb, nc))))
  }
}

let paintFor = (state: StateTypes.cubeState, ~style, ~palette, ~last, ~gx, ~gy, ~gz, face) =>
  if isExposed(~last, ~gx, ~gy, ~gz, face) {
    colourOf(~style, ~palette, faceletAt(state, ~gx, ~gy, ~gz, face))
  } else {
    body
  }

let faceForNormal = normal =>
  if normal.y > 0.5 {
    StateTypes.U
  } else if normal.y < -0.5 {
    D
  } else if normal.z > 0.5 {
    F
  } else if normal.z < -0.5 {
    B
  } else if normal.x > 0.5 {
    R
  } else {
    L
  }

let isOuterEdge = (~last, ~gx, ~gy, ~gz, faceA, faceB) =>
  isExposed(~last, ~gx, ~gy, ~gz, faceA) && isExposed(~last, ~gx, ~gy, ~gz, faceB)

let bevelForEdge = (~last, ~gx, ~gy, ~gz, ~cell, faceA, faceB) =>
  if isOuterEdge(~last, ~gx, ~gy, ~gz, faceA, faceB) {
    0.065 *. cell
  } else {
    0.03 *. cell
  }

type stickerBounds = {
  maxU: float,
  minU: float,
  maxV: float,
  minV: float,
  r0: float,
  r1: float,
  r2: float,
  r3: float,
}

let stickerBoundsForFace = (~last, ~gx, ~gy, ~gz, ~cell, face) => {
  let col = colAxis(face)
  let row = rowAxis(face)
  let fColPlus = faceForNormal(col)
  let fColMinus = faceForNormal(scale(col, -1.0))
  let fRowPlus = faceForNormal(row)
  let fRowMinus = faceForNormal(scale(row, -1.0))

  let isOuterColPlus = isOuterEdge(~last, ~gx, ~gy, ~gz, face, fColPlus)
  let isOuterColMinus = isOuterEdge(~last, ~gx, ~gy, ~gz, face, fColMinus)
  let isOuterRowPlus = isOuterEdge(~last, ~gx, ~gy, ~gz, face, fRowPlus)
  let isOuterRowMinus = isOuterEdge(~last, ~gx, ~gy, ~gz, face, fRowMinus)

  let innerHalf = 0.420 *. cell
  let outerHalf = 0.380 *. cell

  let maxU = if isOuterColPlus {
    outerHalf
  } else {
    innerHalf
  }
  let minU = if isOuterColMinus {
    -.outerHalf
  } else {
    -.innerHalf
  }
  let maxV = if isOuterRowPlus {
    outerHalf
  } else {
    innerHalf
  }
  let minV = if isOuterRowMinus {
    -.outerHalf
  } else {
    -.innerHalf
  }

  let innerR = 0.065 *. cell
  let hybridR = 0.078 *. cell
  let outerR = 0.100 *. cell

  let cornerRadius = (outerA, outerB) =>
    switch (outerA, outerB) {
    | (true, true) => outerR
    | (true, false) | (false, true) => hybridR
    | (false, false) => innerR
    }

  let r0 = cornerRadius(isOuterColPlus, isOuterRowPlus)
  let r1 = cornerRadius(isOuterColMinus, isOuterRowPlus)
  let r2 = cornerRadius(isOuterColMinus, isOuterRowMinus)
  let r3 = cornerRadius(isOuterColPlus, isOuterRowMinus)

  {maxU, minU, maxV, minV, r0, r1, r2, r3}
}

let stickerRim = (b: stickerBounds, ~steps=4): array<rimPoint> => {
  let points = []
  let hubU0 = b.maxU -. b.r0
  let hubV0 = b.maxV -. b.r0
  for step in 0 to steps - 1 {
    let angle = Float.fromInt(step) /. Float.fromInt(steps) *. Math.Constants.pi /. 2.0
    let nu = Math.cos(angle)
    let nv = Math.sin(angle)
    points->Array.push({u: hubU0 +. b.r0 *. nu, v: hubV0 +. b.r0 *. nv, nu, nv})
  }
  let hubU1 = b.minU +. b.r1
  let hubV1 = b.maxV -. b.r1
  for step in 0 to steps - 1 {
    let angle = (1.0 +. Float.fromInt(step) /. Float.fromInt(steps)) *. Math.Constants.pi /. 2.0
    let nu = Math.cos(angle)
    let nv = Math.sin(angle)
    points->Array.push({u: hubU1 +. b.r1 *. nu, v: hubV1 +. b.r1 *. nv, nu, nv})
  }
  let hubU2 = b.minU +. b.r2
  let hubV2 = b.minV +. b.r2
  for step in 0 to steps - 1 {
    let angle = (2.0 +. Float.fromInt(step) /. Float.fromInt(steps)) *. Math.Constants.pi /. 2.0
    let nu = Math.cos(angle)
    let nv = Math.sin(angle)
    points->Array.push({u: hubU2 +. b.r2 *. nu, v: hubV2 +. b.r2 *. nv, nu, nv})
  }
  let hubU3 = b.maxU -. b.r3
  let hubV3 = b.minV +. b.r3
  for step in 0 to steps - 1 {
    let angle = (3.0 +. Float.fromInt(step) /. Float.fromInt(steps)) *. Math.Constants.pi /. 2.0
    let nu = Math.cos(angle)
    let nv = Math.sin(angle)
    points->Array.push({u: hubU3 +. b.r3 *. nu, v: hubV3 +. b.r3 *. nv, nu, nv})
  }
  points
}

let pointOnFace = (centre, face, out, point) =>
  add(
    faceCentre(centre, face, out),
    add(scale(colAxis(face), point.u), scale(rowAxis(face), point.v)),
  )

let emitRoundedFace = (emitter, centre, face, out, bounds, colour) => {
  let normal = faceNormal(face)
  let middleU = (bounds.maxU +. bounds.minU) /. 2.0
  let middleV = (bounds.maxV +. bounds.minV) /. 2.0
  let middle = add(
    faceCentre(centre, face, out),
    add(scale(colAxis(face), middleU), scale(rowAxis(face), middleV)),
  )
  let rim = stickerRim(bounds, ~steps=4)
  for index in 0 to rim->Array.length - 1 {
    let next = (index + 1) % rim->Array.length
    emitTriangle(
      emitter,
      middle,
      pointOnFace(centre, face, out, Belt.Array.getUnsafe(rim, index)),
      pointOnFace(centre, face, out, Belt.Array.getUnsafe(rim, next)),
      normal,
      normal,
      normal,
      colour,
      normal,
    )
  }
}

let emitStandardFace = (emitter, centre, face, half, colour, ~bevelFor) => {
  let normal = faceNormal(face)
  let row = rowAxis(face)
  let col = colAxis(face)
  let middle = faceCentre(centre, face, half)
  let fColPlus = faceForNormal(col)
  let fColMinus = faceForNormal(scale(col, -1.0))
  let fRowPlus = faceForNormal(row)
  let fRowMinus = faceForNormal(scale(row, -1.0))
  let flatColPlus = half -. bevelFor(face, fColPlus)
  let flatColMinus = half -. bevelFor(face, fColMinus)
  let flatRowPlus = half -. bevelFor(face, fRowPlus)
  let flatRowMinus = half -. bevelFor(face, fRowMinus)
  let a = sub(sub(middle, scale(row, flatRowMinus)), scale(col, flatColMinus))
  let b = sub(add(middle, scale(row, flatRowPlus)), scale(col, flatColMinus))
  let c = add(add(middle, scale(row, flatRowPlus)), scale(col, flatColPlus))
  let d = add(sub(middle, scale(row, flatRowMinus)), scale(col, flatColPlus))
  emitQuad(emitter, a, b, c, d, normal, normal, normal, normal, colour, normal)
}

let emitStandardBevels = (emitter, centre, half, colour, ~bevelFor) => {
  for index in 0 to edges->Array.length - 1 {
    let (faceA, faceB) = Belt.Array.getUnsafe(edges, index)
    let na = faceNormal(faceA)
    let nb = faceNormal(faceB)
    let along = cross(nb, na)
    let faceMinus = faceForNormal(scale(along, -1.0))
    let facePlus = faceForNormal(along)
    let bevelAB = bevelFor(faceA, faceB)
    let flatAB = half -. bevelAB
    let flatMinusA = half -. bevelFor(faceA, faceMinus)
    let flatPlusA = half -. bevelFor(faceA, facePlus)
    let flatMinusB = half -. bevelFor(faceB, faceMinus)
    let flatPlusB = half -. bevelFor(faceB, facePlus)

    let onA = add(scale(na, half), scale(nb, flatAB))
    let onB = add(scale(nb, half), scale(na, flatAB))
    let a = add(centre, add(onA, scale(along, -.flatMinusA)))
    let b = add(centre, add(onA, scale(along, flatPlusA)))
    let c = add(centre, add(onB, scale(along, flatPlusB)))
    let d = add(centre, add(onB, scale(along, -.flatMinusB)))
    let wanted = normalize(add(na, nb))
    emitQuad(emitter, a, b, c, d, na, na, nb, nb, colour, wanted)
  }
}

let emitStandardCorners = (emitter, centre, half, colour, ~bevelFor) => {
  for index in 0 to corners->Array.length - 1 {
    let (faceA, faceB, faceC) = Belt.Array.getUnsafe(corners, index)
    let na = faceNormal(faceA)
    let nb = faceNormal(faceB)
    let nc = faceNormal(faceC)
    let flatAB = half -. bevelFor(faceA, faceB)
    let flatAC = half -. bevelFor(faceA, faceC)
    let flatBC = half -. bevelFor(faceB, faceC)
    let a = add(centre, add(scale(na, half), add(scale(nb, flatAB), scale(nc, flatAC))))
    let b = add(centre, add(scale(nb, half), add(scale(nc, flatBC), scale(na, flatAB))))
    let c = add(centre, add(scale(nc, half), add(scale(na, flatAC), scale(nb, flatBC))))
    emitTriangle(emitter, a, b, c, na, nb, nc, colour, normalize(add(na, add(nb, nc))))
  }
}

let emitStandardCubie = (data, state: StateTypes.cubeState, ~palette, ~gx, ~gy, ~gz) => {
  let size = state.size
  let last = size - 1
  let cell = 2.0 *. halfExtent /. Float.fromInt(size)
  let centre = cubieCentre(~size, ~gx, ~gy, ~gz)
  let emitter = {data, cubie: centre}
  let half = 0.999 *. cell /. 2.0
  let bevelFor = (fA, fB) => bevelForEdge(~last, ~gx, ~gy, ~gz, ~cell, fA, fB)

  StateTypes.storageOrder->Array.forEach(face =>
    emitStandardFace(emitter, centre, face, half, body, ~bevelFor)
  )
  emitStandardBevels(emitter, centre, half, body, ~bevelFor)
  emitStandardCorners(emitter, centre, half, body, ~bevelFor)

  StateTypes.storageOrder->Array.forEach(face =>
    if isExposed(~last, ~gx, ~gy, ~gz, face) {
      let colour = colourOf(~style=Standard, ~palette, faceletAt(state, ~gx, ~gy, ~gz, face))
      let bounds = stickerBoundsForFace(~last, ~gx, ~gy, ~gz, ~cell, face)
      emitRoundedFace(emitter, centre, face, half +. 0.005 *. cell, bounds, colour)
    }
  )
}

let emitSpeedCubie = (data, state: StateTypes.cubeState, ~palette, ~gx, ~gy, ~gz) => {
  let size = state.size
  let last = size - 1
  let cell = 2.0 *. halfExtent /. Float.fromInt(size)
  let centre = cubieCentre(~size, ~gx, ~gy, ~gz)
  let emitter = {data, cubie: centre}
  let half = 0.999 *. cell /. 2.0
  let bevel = 0.06 *. cell
  let flat = half -. bevel

  // 1. Caps (6 flat square faces)
  StateTypes.storageOrder->Array.forEach(face => {
    let colour = paintFor(state, ~style=Speed, ~palette, ~last, ~gx, ~gy, ~gz, face)
    emitFace(emitter, centre, face, half, 2.0 *. flat, colour)
  })

  // 2. Bands (12 edge chamfers, split into two colored halves meeting at the 45° miter)
  for index in 0 to edges->Array.length - 1 {
    let (faceA, faceB) = Belt.Array.getUnsafe(edges, index)
    let na = faceNormal(faceA)
    let nb = faceNormal(faceB)
    let along = cross(nb, na)
    let facing = normalize(add(na, nb))
    let onA = add(scale(na, half), scale(nb, flat))
    let onB = add(scale(nb, half), scale(na, flat))
    let middle = scale(add(onA, onB), 0.5)
    let corner = (way, out) => add(centre, add(scale(along, way *. flat), out))
    let colorA = paintFor(state, ~style=Speed, ~palette, ~last, ~gx, ~gy, ~gz, faceA)
    let colorB = paintFor(state, ~style=Speed, ~palette, ~last, ~gx, ~gy, ~gz, faceB)
    emitQuad(
      emitter,
      corner(-1.0, onA),
      corner(1.0, onA),
      corner(1.0, middle),
      corner(-1.0, middle),
      na,
      na,
      facing,
      facing,
      colorA,
      facing,
      ~sheen=0.22,
    )
    emitQuad(
      emitter,
      corner(-1.0, middle),
      corner(1.0, middle),
      corner(1.0, onB),
      corner(-1.0, onB),
      facing,
      facing,
      nb,
      nb,
      colorB,
      facing,
      ~sheen=0.22,
    )
  }

  // 3. Corners (8 corner chamfers, split into three colored thirds meeting at the 3-way miter)
  let mitre = (x, y) => normalize(add(x, y))
  let between = (p1, p2) => scale(add(p1, p2), 0.5)
  for index in 0 to corners->Array.length - 1 {
    let (one, two, three) = Belt.Array.getUnsafe(corners, index)
    let n1 = faceNormal(one)
    let n2 = faceNormal(two)
    let n3 = faceNormal(three)
    let turned = dot(cross(n1, n2), n3)
    let (faceA, faceB, faceC) = if turned > 0.0 {
      (one, two, three)
    } else {
      (one, three, two)
    }
    let na = faceNormal(faceA)
    let nb = faceNormal(faceB)
    let nc = faceNormal(faceC)
    let facing = normalize(add(na, add(nb, nc)))
    let onCap = (out, first, second) =>
      add(centre, add(scale(out, half), add(scale(first, flat), scale(second, flat))))
    let pa = onCap(na, nb, nc)
    let pb = onCap(nb, nc, na)
    let pc = onCap(nc, na, nb)
    let mid = scale(add(pa, add(pb, pc)), 1.0 /. 3.0)
    let colorA = paintFor(state, ~style=Speed, ~palette, ~last, ~gx, ~gy, ~gz, faceA)
    let colorB = paintFor(state, ~style=Speed, ~palette, ~last, ~gx, ~gy, ~gz, faceB)
    let colorC = paintFor(state, ~style=Speed, ~palette, ~last, ~gx, ~gy, ~gz, faceC)

    emitQuad(
      emitter,
      pa,
      between(pa, pb),
      mid,
      between(pc, pa),
      na,
      mitre(na, nb),
      facing,
      mitre(nc, na),
      colorA,
      facing,
      ~sheen=0.22,
    )
    emitQuad(
      emitter,
      pb,
      between(pb, pc),
      mid,
      between(pa, pb),
      nb,
      mitre(nb, nc),
      facing,
      mitre(na, nb),
      colorB,
      facing,
      ~sheen=0.22,
    )
    emitQuad(
      emitter,
      pc,
      between(pc, pa),
      mid,
      between(pb, pc),
      nc,
      mitre(nc, na),
      facing,
      mitre(nb, nc),
      colorC,
      facing,
      ~sheen=0.22,
    )
  }
}

let validate = (state: StateTypes.cubeState) => {
  if !StateTypes.isSupportedSize(state.size) {
    Error("Cube size must be between 2 and 5.")
  } else if state.facelets->Array.length != 6 {
    Error("A cube state must contain six faces.")
  } else if state.facelets->Array.some(values => values->Array.length != state.size * state.size) {
    Error("Every face must contain size² stickers.")
  } else {
    Ok()
  }
}

let generate = (state: StateTypes.cubeState, style: style, palette: palette): result<
  mesh,
  string,
> =>
  switch validate(state) {
  | Error(message) => Error(message)
  | Ok() => {
      let data = []
      let last = state.size - 1
      for gx in 0 to last {
        for gy in 0 to last {
          for gz in 0 to last {
            if gx == 0 || gx == last || gy == 0 || gy == last || gz == 0 || gz == last {
              switch style {
              | Standard => emitStandardCubie(data, state, ~palette, ~gx, ~gy, ~gz)
              | Speed => emitSpeedCubie(data, state, ~palette, ~gx, ~gy, ~gz)
              }
            }
          }
        }
      }
      Ok({data, vertexCount: data->Array.length / stride, stride})
    }
  }
