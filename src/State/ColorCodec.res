open StateTypes

type colorScheme =
  | Western
  | Japanese
  | Custom(string)

let faceOrder = [U, L, F, R, B, D]

let mapping = scheme =>
  switch scheme {
  | Western => "WOGRBY"
  | Japanese => "WOGRYB"
  | Custom(value) => value
  }

let validateScheme = scheme => {
  let value = mapping(scheme)
  if value->String.length != 6 {
    Error(InvalidColourScheme("A custom colour scheme must contain exactly six letters."))
  } else {
    let seen = ref("")
    let error = ref(None)
    for index in 0 to 5 {
      let character = value->String.get(index)->Belt.Option.getUnsafe->String.make
      let code = String.charCodeAtUnsafe(character, 0)
      if code < 65 || code > 90 {
        error := Some(InvalidColourScheme("Colour symbols must be uppercase ASCII letters."))
      } else if seen.contents->String.includes(character) {
        error := Some(InvalidColourScheme("A colour scheme must contain six distinct letters."))
      } else {
        seen := seen.contents ++ character
      }
    }
    switch error.contents {
    | Some(reason) => Error(reason)
    | None => Ok(value)
    }
  }
}

let faceToColour = (~mapping: string, face: face): string => {
  let index = switch face {
  | U => 0
  | L => 1
  | F => 2
  | R => 3
  | B => 4
  | D => 5
  }
  mapping->String.get(index)->Belt.Option.getUnsafe->String.make
}

let colourToFace = (~mapping: string, ~colour: string): option<face> => {
  let found = ref(None)
  for index in 0 to 5 {
    let candidate = mapping->String.get(index)->Belt.Option.getUnsafe->String.make
    if candidate == colour {
      found := Some(Belt.Array.getUnsafe(faceOrder, index))
    }
  }
  found.contents
}

let translateFromFaces = (~mapping: string, input: string): string => {
  let output = Array.make(~length=input->String.length, "")
  for index in 0 to input->String.length - 1 {
    let character = input->String.get(index)->Belt.Option.getUnsafe->String.make
    output[index] = switch charToFace(character) {
    | Some(face) => faceToColour(~mapping, face)
    | None => character
    }
  }
  output->Array.join("")
}

let translateToFaces = (~mapping: string, input: string): result<string, stateError> => {
  let output = Array.make(~length=input->String.length, "")
  let error = ref(None)
  for index in 0 to input->String.length - 1 {
    let character = input->String.get(index)->Belt.Option.getUnsafe->String.make
    if character == " " || character == "\t" || character == "\n" || character == "\r" {
      output[index] = character
    } else {
      switch colourToFace(~mapping, ~colour=character) {
      | Some(face) => output[index] = faceToChar(face)
      | None => error := Some(InvalidColour({index, character}))
      }
    }
  }
  switch error.contents {
  | Some(reason) => Error(reason)
  | None => Ok(output->Array.join(""))
  }
}

let renderCompact = (~scheme: colorScheme, state: cubeState): result<string, stateError> =>
  switch validateScheme(scheme) {
  | Error(reason) => Error(reason)
  | Ok(mapping) => Ok(FaceletCodec.render(state)->translateFromFaces(~mapping))
  }

let parseCompact = (~scheme: colorScheme, ~size: int, input: string): result<
  cubeState,
  stateError,
> =>
  switch validateScheme(scheme) {
  | Error(reason) => Error(reason)
  | Ok(mapping) =>
    switch translateToFaces(~mapping, input) {
    | Error(reason) => Error(reason)
    | Ok(facelets) => FaceletCodec.parse(~size, facelets)
    }
  }

let renderNet = (~scheme: colorScheme, state: cubeState): result<string, stateError> =>
  switch validateScheme(scheme) {
  | Error(reason) => Error(reason)
  | Ok(mapping) => Ok(NetCodec.render(state)->translateFromFaces(~mapping))
  }

let parseNet = (~scheme: colorScheme, ~size: int, input: string): result<cubeState, stateError> =>
  switch validateScheme(scheme) {
  | Error(reason) => Error(reason)
  | Ok(mapping) =>
    switch translateToFaces(~mapping, input) {
    | Error(reason) => Error(reason)
    | Ok(net) => NetCodec.parse(~size, net)
    }
  }
