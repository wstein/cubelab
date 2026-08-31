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
let epRadix = 479001600
let eoRadix = 2048

let describeError = error =>
  switch error {
  | UnsupportedSize(size) => {
      let label = size->Int.toString
      `Orbit64 v1 supports 3×3×3 states, not ${label}×${label}×${label}.`
    }
  | InvalidCoordinates(error) => PieceReducer.describeError(error)
  | InvalidTokenLength({expected, actual}) =>
    `Orbit64 tokens must contain exactly ${expected->Int.toString} characters; received ${actual->Int.toString}.`
  | InvalidTokenCharacter({index, character}) =>
    `Invalid Orbit64 character '${character}' at position ${index->Int.toString}.`
  | InvalidHeader(header) =>
    `Unsupported Orbit64 version/size header ${header->Int.toString}; v1 3×3×3 requires header 0.`
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

let pack = (~cpRank, ~coRank, ~epRank, ~eoRank) => {
  let value = ref(0n)
  value := BigInt.add(BigInt.mul(value.contents, BigInt.fromInt(cpRadix)), BigInt.fromInt(cpRank))
  value := BigInt.add(BigInt.mul(value.contents, BigInt.fromInt(coRadix)), BigInt.fromInt(coRank))
  value := BigInt.add(BigInt.mul(value.contents, BigInt.fromInt(epRadix)), BigInt.fromInt(epRank))
  value := BigInt.add(BigInt.mul(value.contents, BigInt.fromInt(eoRadix)), BigInt.fromInt(eoRank))
  let bytes = Array.make(~length=9, 0)
  for offset in 0 to 8 {
    let index = 8 - offset
    bytes[index] = BigInt.mod(value.contents, 256n)->BigInt.toInt
    value := BigInt.div(value.contents, 256n)
  }
  encodeBytes(bytes)
}

let encode = (pieces: PieceReducer.pieceState): result<string, orbitError> => {
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
          ~epRank=rankPermutation(pieces.ep),
          ~eoRank=rankOrientations(pieces.eo, 11, 2),
        ),
      )
    }
  }
}

let takeRadix = (value, radix) => {
  let divisor = BigInt.fromInt(radix)
  (BigInt.div(value, divisor), BigInt.mod(value, divisor)->BigInt.toInt)
}

let decode = (input: string): result<PieceReducer.pieceState, orbitError> => {
  try {
    let token = input->String.trim
    let bytes = decodeBytes(token)
    let packed = ref(0n)
    bytes->Array.forEach(byte => {
      packed := BigInt.add(BigInt.mul(packed.contents, 256n), BigInt.fromInt(byte))
    })
    let (withoutEo, eoRank) = takeRadix(packed.contents, eoRadix)
    let (withoutEp, epRank) = takeRadix(withoutEo, epRadix)
    let (withoutCo, coRank) = takeRadix(withoutEp, coRadix)
    let (headerValue, cpRank) = takeRadix(withoutCo, cpRadix)
    let header = BigInt.toInt(headerValue)
    if header != 0 {
      throw(OrbitFailure(InvalidHeader(header)))
    }
    let pieces = {
      PieceReducer.size: 3,
      cp: unrankPermutation(8, cpRank),
      co: unrankOrientations(coRank, 7, 3),
      ep: unrankPermutation(12, epRank),
      eo: unrankOrientations(eoRank, 11, 2),
    }
    switch PieceReducer.validate(pieces) {
    | Ok() => Ok(pieces)
    | Error(error) => Error(InvalidCoordinates(error))
    }
  } catch {
  | OrbitFailure(error) => Error(error)
  }
}

let encodeState = state =>
  switch PieceReducer.reduce(state) {
  | Error(error) => Error(InvalidCoordinates(error))
  | Ok(pieces) => encode(pieces)
  }

let decodeState = token =>
  switch decode(token) {
  | Error(error) => Error(error)
  | Ok(pieces) =>
    switch PieceReducer.reconstruct(pieces) {
    | Ok(state) => Ok(state)
    | Error(error) => Error(InvalidCoordinates(error))
    }
  }
