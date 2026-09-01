type loc = {
  start: int,
  end_: int,
}

type axis =
  | X
  | Y
  | Z

type slice =
  | M
  | E
  | S

type lowercaseMode =
  | Wide
  | InnerSlice

type layerRange = {
  from_: int,
  to_: int,
}

type baseMove =
  | FaceTurn(StateTypes.face, layerRange)
  | SliceTurn(slice)
  | Rotation(axis)

type rec unitDesc =
  | Move(baseMove, int)
  | Group(array<locatedUnit>, int)
  | Commutator(array<locatedUnit>, array<locatedUnit>, int)
  | Conjugate(array<locatedUnit>, array<locatedUnit>, int)
and locatedUnit = {
  desc: unitDesc,
  loc: loc,
}

type alg = array<locatedUnit>

type parseError = {
  message: string,
  loc: loc,
}

let invertTurns = turns => -turns
