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

let stride = 10
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

let pushVertex = (data, position, normal, colour) => {
  data->Array.push(position.x)->ignore
  data->Array.push(position.y)->ignore
  data->Array.push(position.z)->ignore
  data->Array.push(normal.x)->ignore
  data->Array.push(normal.y)->ignore
  data->Array.push(normal.z)->ignore
  data->Array.push(colour.r)->ignore
  data->Array.push(colour.g)->ignore
  data->Array.push(colour.b)->ignore
  data->Array.push(colour.a)->ignore
}

let emitTriangle = (data, a, b, c, na, nb, nc, colour, wanted) => {
  let facing = cross(sub(b, a), sub(c, a))
  if dot(facing, wanted) >= 0.0 {
    pushVertex(data, a, na, colour)
    pushVertex(data, b, nb, colour)
    pushVertex(data, c, nc, colour)
  } else {
    pushVertex(data, a, na, colour)
    pushVertex(data, c, nc, colour)
    pushVertex(data, b, nb, colour)
  }
}

let emitQuad = (data, a, b, c, d, na, nb, nc, nd, colour, wanted) => {
  emitTriangle(data, a, b, c, na, nb, nc, colour, wanted)
  emitTriangle(data, a, c, d, na, nc, nd, colour, wanted)
}

let faceCentre = (centre, face, out) => add(centre, scale(faceNormal(face), out))

let emitFace = (data, centre, face, out, side, colour) => {
  let half = side /. 2.0
  let normal = faceNormal(face)
  let row = scale(rowAxis(face), half)
  let col = scale(colAxis(face), half)
  let middle = faceCentre(centre, face, out)
  let a = sub(sub(middle, row), col)
  let b = sub(add(middle, row), col)
  let c = add(add(middle, row), col)
  let d = add(sub(middle, row), col)
  emitQuad(data, a, b, c, d, normal, normal, normal, normal, colour, normal)
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

let emitFlatBevels = (data, centre, half, flat, colour) => {
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
    emitQuad(data, a, b, c, d, na, na, nb, nb, colour, wanted)
  }
}

let emitFlatCorners = (data, centre, half, flat, colour) => {
  for index in 0 to corners->Array.length - 1 {
    let (faceA, faceB, faceC) = Belt.Array.getUnsafe(corners, index)
    let na = faceNormal(faceA)
    let nb = faceNormal(faceB)
    let nc = faceNormal(faceC)
    let a = add(centre, add(scale(na, half), add(scale(nb, flat), scale(nc, flat))))
    let b = add(centre, add(scale(nb, half), add(scale(nc, flat), scale(na, flat))))
    let c = add(centre, add(scale(nc, half), add(scale(na, flat), scale(nb, flat))))
    emitTriangle(data, a, b, c, na, nb, nc, colour, normalize(add(na, add(nb, nc))))
  }
}

let paintFor = (state: StateTypes.cubeState, ~style, ~palette, ~last, ~gx, ~gy, ~gz, face) =>
  if isExposed(~last, ~gx, ~gy, ~gz, face) {
    colourOf(~style, ~palette, faceletAt(state, ~gx, ~gy, ~gz, face))
  } else {
    body
  }

let emitStandardCubie = (data, state: StateTypes.cubeState, ~palette, ~gx, ~gy, ~gz) => {
  let size = state.size
  let cell = 2.0 *. halfExtent /. Float.fromInt(size)
  let centre = cubieCentre(~size, ~gx, ~gy, ~gz)
  let half = 0.999 *. cell /. 2.0
  let bevel = 0.03 *. cell
  let flat = half -. bevel
  StateTypes.storageOrder->Array.forEach(face =>
    emitFace(data, centre, face, half, 2.0 *. flat, body)
  )
  emitFlatBevels(data, centre, half, flat, body)
  emitFlatCorners(data, centre, half, flat, body)

  let last = size - 1
  StateTypes.storageOrder->Array.forEach(face =>
    if isExposed(~last, ~gx, ~gy, ~gz, face) {
      let colour = colourOf(~style=Standard, ~palette, faceletAt(state, ~gx, ~gy, ~gz, face))
      emitFace(data, centre, face, half +. 0.005 *. cell, 0.80 *. cell, colour)
    }
  )
}

let emitRolledEdges = (
  data,
  state: StateTypes.cubeState,
  centre,
  flat,
  bevel,
  ~palette,
  ~gx,
  ~gy,
  ~gz,
) => {
  let last = state.size - 1
  let steps = 3
  for index in 0 to edges->Array.length - 1 {
    let (faceA, faceB) = Belt.Array.getUnsafe(edges, index)
    let na = faceNormal(faceA)
    let nb = faceNormal(faceB)
    let along = cross(nb, na)
    let hub = add(centre, add(scale(na, flat), scale(nb, flat)))
    for step in 0 to steps - 1 {
      let one = Float.fromInt(step) /. Float.fromInt(steps) *. Math.Constants.pi /. 2.0
      let two = Float.fromInt(step + 1) /. Float.fromInt(steps) *. Math.Constants.pi /. 2.0
      let n1 = normalize(add(scale(na, Math.cos(one)), scale(nb, Math.sin(one))))
      let n2 = normalize(add(scale(na, Math.cos(two)), scale(nb, Math.sin(two))))
      let a = add(add(hub, scale(along, -flat)), scale(n1, bevel))
      let b = add(add(hub, scale(along, flat)), scale(n1, bevel))
      let c = add(add(hub, scale(along, flat)), scale(n2, bevel))
      let d = add(add(hub, scale(along, -flat)), scale(n2, bevel))
      let ownFace = if step * 2 < steps {
        faceA
      } else {
        faceB
      }
      let colour = paintFor(state, ~style=Speed, ~palette, ~last, ~gx, ~gy, ~gz, ownFace)
      emitQuad(data, a, b, c, d, n1, n1, n2, n2, colour, normalize(add(n1, n2)))
    }
  }
}

let emitRoundedCorners = (
  data,
  state: StateTypes.cubeState,
  centre,
  half,
  flat,
  bevel,
  ~palette,
  ~gx,
  ~gy,
  ~gz,
) => {
  let last = state.size - 1
  for index in 0 to corners->Array.length - 1 {
    let (faceA, faceB, faceC) = Belt.Array.getUnsafe(corners, index)
    let na = faceNormal(faceA)
    let nb = faceNormal(faceB)
    let nc = faceNormal(faceC)
    let a = add(centre, add(scale(na, half), add(scale(nb, flat), scale(nc, flat))))
    let b = add(centre, add(scale(nb, half), add(scale(nc, flat), scale(na, flat))))
    let c = add(centre, add(scale(nc, half), add(scale(na, flat), scale(nb, flat))))
    let facing = normalize(add(na, add(nb, nc)))
    let hub = add(centre, add(scale(add(na, add(nb, nc)), flat), scale(facing, bevel)))
    let ab = normalize(add(na, nb))
    let bc = normalize(add(nb, nc))
    let ca = normalize(add(nc, na))
    let middleA = scale(add(a, b), 0.5)
    let middleB = scale(add(b, c), 0.5)
    let middleC = scale(add(c, a), 0.5)
    emitTriangle(
      data,
      a,
      middleA,
      hub,
      na,
      ab,
      facing,
      paintFor(state, ~style=Speed, ~palette, ~last, ~gx, ~gy, ~gz, faceA),
      facing,
    )
    emitTriangle(
      data,
      b,
      middleB,
      hub,
      nb,
      bc,
      facing,
      paintFor(state, ~style=Speed, ~palette, ~last, ~gx, ~gy, ~gz, faceB),
      facing,
    )
    emitTriangle(
      data,
      c,
      middleC,
      hub,
      nc,
      ca,
      facing,
      paintFor(state, ~style=Speed, ~palette, ~last, ~gx, ~gy, ~gz, faceC),
      facing,
    )
  }
}

let emitSpeedCubie = (data, state: StateTypes.cubeState, ~palette, ~gx, ~gy, ~gz) => {
  let size = state.size
  let last = size - 1
  let cell = 2.0 *. halfExtent /. Float.fromInt(size)
  let centre = cubieCentre(~size, ~gx, ~gy, ~gz)
  let half = 0.999 *. cell /. 2.0
  let bevel = 0.06 *. cell
  let flat = half -. bevel
  StateTypes.storageOrder->Array.forEach(face =>
    emitFace(
      data,
      centre,
      face,
      half,
      2.0 *. flat,
      paintFor(state, ~style=Speed, ~palette, ~last, ~gx, ~gy, ~gz, face),
    )
  )
  emitRolledEdges(data, state, centre, flat, bevel, ~palette, ~gx, ~gy, ~gz)
  emitRoundedCorners(data, state, centre, half, flat, bevel, ~palette, ~gx, ~gy, ~gz)
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
