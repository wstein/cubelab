open StateTypes
open MoveTypes

type orbitError =
  | UnsupportedSize(int)
  | InvalidCoordinates(PieceReducer.pieceError)
  | InvalidTokenLength({expected: int, actual: int})
  | InvalidTokenCharacter({index: int, character: string})
  | InvalidHeader(int)

exception OrbitFailure(orbitError)

let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

let cpRadix = 40320
let coRadix = 2187
let epParityRadix = 239500800
let eoRadix = 2048
let frameRadix = 24
let payloadLimit = 1180591620717411303424n

let describeError = error =>
  switch error {
  | UnsupportedSize(size) => {
      let label = size->Int.toString
      `Orbit64 supports 3×3×3 states, not ${label}×${label}×${label}.`
    }
  | InvalidCoordinates(error) => PieceReducer.describeError(error)
  | InvalidTokenLength({expected, actual}) =>
    `Orbit64 tokens must contain exactly ${expected->Int.toString} characters; received ${actual->Int.toString}.`
  | InvalidTokenCharacter({index, character}) =>
    `Invalid Orbit64 character '${character}' at position ${index->Int.toString}.`
  | InvalidHeader(header) =>
    `Orbit64 reserves its two leading bits; received reserved value ${header->Int.toString}.`
  }

let factorial = value => {
  let result = ref(1)
  if value >= 2 {
    for factor in 2 to value {
      result := result.contents * factor
    }
  }
  result.contents
}

let rankPermutation = permutation => {
  let rank = ref(0)
  let length = permutation->Array.length
  for index in 0 to length - 1 {
    let smaller = ref(0)
    for right in index + 1 to length - 1 {
      if Belt.Array.getUnsafe(permutation, right) < Belt.Array.getUnsafe(permutation, index) {
        smaller := smaller.contents + 1
      }
    }
    rank := rank.contents * (length - index) + smaller.contents
  }
  rank.contents
}

let unrankPermutation = (length, initialRank) => {
  let available = ref(Belt.Array.makeBy(length, index => index))
  let permutation = Array.make(~length, 0)
  let rank = ref(initialRank)
  for index in 0 to length - 1 {
    let placeValue = factorial(length - index - 1)
    let digit = rank.contents / placeValue
    rank := rank.contents % placeValue
    permutation[index] = Belt.Array.getUnsafe(available.contents, digit)
    available := available.contents->Array.filterWithIndex((_, candidate) => candidate != digit)
  }
  permutation
}

let parity = permutation => {
  let result = ref(0)
  for left in 0 to permutation->Array.length - 1 {
    for right in left + 1 to permutation->Array.length - 1 {
      if Belt.Array.getUnsafe(permutation, right) < Belt.Array.getUnsafe(permutation, left) {
        result := (result.contents + 1) % 2
      }
    }
  }
  result.contents
}

let paritySuffixCount = (length, requiredParity) =>
  if length <= 1 {
    if requiredParity == 0 {
      1
    } else {
      0
    }
  } else {
    factorial(length) / 2
  }

let requiredSuffixParity = (target, prefix, digit) => {
  let remainder = (target - prefix - digit) % 2
  if remainder < 0 {
    remainder + 2
  } else {
    remainder
  }
}

/** Rank one of the n!/2 permutations with the requested inversion parity. */
let rankPermutationWithParity = (permutation, targetParity) => {
  let rank = ref(0)
  let prefixParity = ref(0)
  let available = ref(Belt.Array.makeBy(permutation->Array.length, index => index))
  for index in 0 to permutation->Array.length - 1 {
    let digit = ref(-1)
    for candidate in 0 to available.contents->Array.length - 1 {
      if (
        Belt.Array.getUnsafe(available.contents, candidate) ==
          Belt.Array.getUnsafe(permutation, index)
      ) {
        digit := candidate
      }
    }
    for candidate in 0 to digit.contents - 1 {
      rank :=
        rank.contents +
        paritySuffixCount(
          permutation->Array.length - index - 1,
          requiredSuffixParity(targetParity, prefixParity.contents, candidate),
        )
    }
    prefixParity := (prefixParity.contents + digit.contents) % 2
    available :=
      available.contents->Array.filterWithIndex((_, candidate) => candidate != digit.contents)
  }
  rank.contents
}

/** Inverse of rankPermutationWithParity for a known permutation parity. */
let unrankPermutationWithParity = (length, initialRank, targetParity) => {
  let permutation = Array.make(~length, 0)
  let rank = ref(initialRank)
  let prefixParity = ref(0)
  let available = ref(Belt.Array.makeBy(length, index => index))
  for index in 0 to length - 1 {
    let digit = ref(-1)
    for candidate in 0 to available.contents->Array.length - 1 {
      if digit.contents == -1 {
        let count = paritySuffixCount(
          length - index - 1,
          requiredSuffixParity(targetParity, prefixParity.contents, candidate),
        )
        if rank.contents >= count {
          rank := rank.contents - count
        } else {
          digit := candidate
        }
      }
    }
    permutation[index] = Belt.Array.getUnsafe(available.contents, digit.contents)
    prefixParity := (prefixParity.contents + digit.contents) % 2
    available :=
      available.contents->Array.filterWithIndex((_, candidate) => candidate != digit.contents)
  }
  permutation
}

let rankOrientations = (orientations, count, radix) => {
  let rank = ref(0)
  let placeValue = ref(1)
  for index in 0 to count - 1 {
    rank := rank.contents + Belt.Array.getUnsafe(orientations, index) * placeValue.contents
    placeValue := placeValue.contents * radix
  }
  rank.contents
}

let unrankOrientations = (rankValue, count, radix) => {
  let orientations = Array.make(~length=count + 1, 0)
  let rank = ref(rankValue)
  let sum = ref(0)
  for index in 0 to count - 1 {
    let orientation = rank.contents % radix
    rank := rank.contents / radix
    orientations[index] = orientation
    sum := sum.contents + orientation
  }
  orientations[count] = (radix - sum.contents % radix) % radix
  orientations
}

let appendBase64Character = (output, index) => {
  output->Array.push(alphabet->String.charAt(index))
}

let encodeBytes = bytes => {
  let output = []
  for offset in 0 to 2 {
    let index = offset * 3
    let first = Belt.Array.getUnsafe(bytes, index)
    let second = Belt.Array.getUnsafe(bytes, index + 1)
    let third = Belt.Array.getUnsafe(bytes, index + 2)
    appendBase64Character(output, first / 4)
    appendBase64Character(output, first % 4 * 16 + second / 16)
    appendBase64Character(output, second % 16 * 4 + third / 64)
    appendBase64Character(output, third % 64)
  }
  output->Array.join("")
}

let decodeBytes = token => {
  if token->String.length != 12 {
    throw(OrbitFailure(InvalidTokenLength({expected: 12, actual: token->String.length})))
  }
  let sextets = Array.make(~length=12, 0)
  for index in 0 to 11 {
    let character = token->String.charAt(index)
    let value = alphabet->String.indexOf(character)
    if value == -1 {
      throw(OrbitFailure(InvalidTokenCharacter({index, character})))
    }
    sextets[index] = value
  }
  let bytes = Array.make(~length=9, 0)
  for group in 0 to 2 {
    let input = group * 4
    let output = group * 3
    let first = Belt.Array.getUnsafe(sextets, input)
    let second = Belt.Array.getUnsafe(sextets, input + 1)
    let third = Belt.Array.getUnsafe(sextets, input + 2)
    let fourth = Belt.Array.getUnsafe(sextets, input + 3)
    bytes[output] = first * 4 + second / 16
    bytes[output + 1] = second % 16 * 16 + third / 4
    bytes[output + 2] = third % 4 * 64 + fourth
  }
  bytes
}

let pack = (~cpRank, ~coRank, ~epRank, ~eoRank, ~frame) => {
  let value = ref(0n)
  value := BigInt.add(BigInt.mul(value.contents, BigInt.fromInt(cpRadix)), BigInt.fromInt(cpRank))
  value := BigInt.add(BigInt.mul(value.contents, BigInt.fromInt(coRadix)), BigInt.fromInt(coRank))
  value :=
    BigInt.add(BigInt.mul(value.contents, BigInt.fromInt(epParityRadix)), BigInt.fromInt(epRank))
  value := BigInt.add(BigInt.mul(value.contents, BigInt.fromInt(eoRadix)), BigInt.fromInt(eoRank))
  value := BigInt.add(BigInt.mul(value.contents, BigInt.fromInt(frameRadix)), BigInt.fromInt(frame))
  let bytes = Array.make(~length=9, 0)
  for offset in 0 to 8 {
    let index = 8 - offset
    bytes[index] = BigInt.mod(value.contents, 256n)->BigInt.toInt
    value := BigInt.div(value.contents, 256n)
  }
  encodeBytes(bytes)
}

let encodeWithFrame = (pieces: PieceReducer.pieceState, frame): result<string, orbitError> => {
  if pieces.size != 3 {
    Error(UnsupportedSize(pieces.size))
  } else {
    switch PieceReducer.validate(pieces) {
    | Error(error) => Error(InvalidCoordinates(error))
    | Ok() =>
      Ok(
        pack(
          ~cpRank=rankPermutation(pieces.cp),
          ~coRank=rankOrientations(pieces.co, 7, 3),
          ~epRank=rankPermutationWithParity(pieces.ep, parity(pieces.cp)),
          ~eoRank=rankOrientations(pieces.eo, 11, 2),
          ~frame,
        ),
      )
    }
  }
}

let encode = pieces => encodeWithFrame(pieces, 0)

let takeRadix = (value, radix) => {
  let divisor = BigInt.fromInt(radix)
  (BigInt.div(value, divisor), BigInt.mod(value, divisor)->BigInt.toInt)
}

type decodedPayload = {pieces: PieceReducer.pieceState, frame: int}

let decodePayload = (input: string): result<decodedPayload, orbitError> => {
  try {
    let token = input->String.trim
    let bytes = decodeBytes(token)
    let packed = ref(0n)
    bytes->Array.forEach(byte => {
      packed := BigInt.add(BigInt.mul(packed.contents, 256n), BigInt.fromInt(byte))
    })
    let reserved = BigInt.div(packed.contents, payloadLimit)->BigInt.toInt
    if reserved != 0 {
      throw(OrbitFailure(InvalidHeader(reserved)))
    }
    let (withoutFrame, frame) = takeRadix(packed.contents, frameRadix)
    let (withoutEo, eoRank) = takeRadix(withoutFrame, eoRadix)
    let (withoutEp, epRank) = takeRadix(withoutEo, epParityRadix)
    let (withoutCo, coRank) = takeRadix(withoutEp, coRadix)
    let (overflow, cpRank) = takeRadix(withoutCo, cpRadix)
    if overflow != 0n {
      throw(OrbitFailure(InvalidHeader(BigInt.toInt(overflow))))
    }
    let pieces = {
      PieceReducer.size: 3,
      cp: unrankPermutation(8, cpRank),
      co: unrankOrientations(coRank, 7, 3),
      ep: [],
      eo: unrankOrientations(eoRank, 11, 2),
    }
    let ep = unrankPermutationWithParity(12, epRank, parity(pieces.cp))
    let pieces = {...pieces, ep}
    switch PieceReducer.validate(pieces) {
    | Ok() => Ok({pieces, frame})
    | Error(error) => Error(InvalidCoordinates(error))
    }
  } catch {
  | OrbitFailure(error) => Error(error)
  }
}

let decode = input =>
  switch decodePayload(input) {
  | Ok(payload) => Ok(payload.pieces)
  | Error(error) => Error(error)
  }

type frameTransform = {xTurns: int, zTurns: int, yTurns: int}

let frameTransforms = [
  {xTurns: 0, zTurns: 0, yTurns: 0},
  {xTurns: 0, zTurns: 0, yTurns: 1},
  {xTurns: 0, zTurns: 0, yTurns: 2},
  {xTurns: 0, zTurns: 0, yTurns: 3},
  {xTurns: 1, zTurns: 0, yTurns: 0},
  {xTurns: 1, zTurns: 0, yTurns: 1},
  {xTurns: 1, zTurns: 0, yTurns: 2},
  {xTurns: 1, zTurns: 0, yTurns: 3},
  {xTurns: 2, zTurns: 0, yTurns: 0},
  {xTurns: 2, zTurns: 0, yTurns: 1},
  {xTurns: 2, zTurns: 0, yTurns: 2},
  {xTurns: 2, zTurns: 0, yTurns: 3},
  {xTurns: 3, zTurns: 0, yTurns: 0},
  {xTurns: 3, zTurns: 0, yTurns: 1},
  {xTurns: 3, zTurns: 0, yTurns: 2},
  {xTurns: 3, zTurns: 0, yTurns: 3},
  {xTurns: 0, zTurns: 1, yTurns: 0},
  {xTurns: 0, zTurns: 1, yTurns: 1},
  {xTurns: 0, zTurns: 1, yTurns: 2},
  {xTurns: 0, zTurns: 1, yTurns: 3},
  {xTurns: 0, zTurns: 3, yTurns: 0},
  {xTurns: 0, zTurns: 3, yTurns: 1},
  {xTurns: 0, zTurns: 3, yTurns: 2},
  {xTurns: 0, zTurns: 3, yTurns: 3},
]

let rotateTimes = (state, move, turns) => {
  let result = ref(state)
  for _ in 1 to turns {
    result := MoveExecutor.applyQuarter(result.contents, move, ~direction=1)
  }
  result.contents
}

let applyFrame = (state, frame) => {
  let afterX = rotateTimes(state, Rotation(X), frame.xTurns)
  let afterZ = rotateTimes(afterX, Rotation(Z), frame.zTurns)
  rotateTimes(afterZ, Rotation(Y), frame.yTurns)
}

let sameCentres = (left, right) => {
  let centre = left.size * left.size / 2
  storageOrder->Array.every(face =>
    Belt.Array.getUnsafe(left.facelets, storageIndex(face))->Belt.Array.getUnsafe(centre) ==
      Belt.Array.getUnsafe(right.facelets, storageIndex(face))->Belt.Array.getUnsafe(centre)
  )
}

let frameForState = (state, canonical) => {
  let found = ref(None)
  for index in 0 to frameTransforms->Array.length - 1 {
    let candidate = applyFrame(canonical, Belt.Array.getUnsafe(frameTransforms, index))
    if found.contents == None && sameCentres(candidate, state) {
      found := Some(index)
    }
  }
  found.contents
}

let encodeState = state =>
  switch PieceReducer.reduce(state) {
  | Error(error) => Error(InvalidCoordinates(error))
  | Ok(pieces) =>
    switch PieceReducer.reconstruct(pieces) {
    | Error(error) => Error(InvalidCoordinates(error))
    | Ok(canonical) =>
      switch frameForState(state, canonical) {
      | Some(frame) => encodeWithFrame(pieces, frame)
      | None =>
        Error(
          InvalidCoordinates(
            PieceReducer.InvalidCenters("The centre frame is not a whole-cube rotation."),
          ),
        )
      }
    }
  }

let decodeState = token =>
  switch decodePayload(token) {
  | Error(error) => Error(error)
  | Ok(payload) =>
    switch PieceReducer.reconstruct(payload.pieces) {
    | Ok(state) => Ok(applyFrame(state, Belt.Array.getUnsafe(frameTransforms, payload.frame)))
    | Error(error) => Error(InvalidCoordinates(error))
    }
  }
