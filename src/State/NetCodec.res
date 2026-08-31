open StateTypes

let row = (stickers: array<face>, ~start: int, ~size: int): string => {
  let values = Array.make(~length=size, "")
  for index in 0 to size - 1 {
    values[index] = faceToChar(Belt.Array.getUnsafe(stickers, start + index))
  }
  values->Array.join(" ")
}

let render = (state: cubeState): string => {
  let size = state.size
  let indent = Array.make(~length=size * 2, " ")->Array.join("")
  let u = Belt.Array.getUnsafe(state.facelets, storageIndex(U))
  let l = Belt.Array.getUnsafe(state.facelets, storageIndex(L))
  let f = Belt.Array.getUnsafe(state.facelets, storageIndex(F))
  let r = Belt.Array.getUnsafe(state.facelets, storageIndex(R))
  let b = Belt.Array.getUnsafe(state.facelets, storageIndex(B))
  let d = Belt.Array.getUnsafe(state.facelets, storageIndex(D))
  let lines = Array.make(~length=size * 3, "")

  for line in 0 to size - 1 {
    lines[line] = indent ++ row(u, ~start=line * size, ~size)
    lines[
      size + line
    ] =
      [
        row(l, ~start=line * size, ~size),
        row(f, ~start=line * size, ~size),
        row(r, ~start=line * size, ~size),
        row(b, ~start=line * size, ~size),
      ]->Array.join(" ")
    lines[size * 2 + line] = indent ++ row(d, ~start=line * size, ~size)
  }
  lines->Array.join("\n")
}

let parseRow = (~line: string, ~offset: int, ~size: int): result<string, stateError> => {
  let expectedLength = size * 2 - 1
  if line->String.length < offset + expectedLength {
    Error(InvalidNet("A net row is shorter than required."))
  } else {
    let output = Array.make(~length=size, "")
    let error = ref(None)
    for index in 0 to expectedLength - 1 {
      let character = line->String.get(offset + index)->Belt.Option.getUnsafe->String.make
      if index % 2 == 0 {
        switch charToFace(character) {
        | Some(_) => output[index / 2] = character
        | None => error := Some(InvalidNet("Net rows may contain only URFDLB stickers."))
        }
      } else if character != " " {
        error := Some(InvalidNet("Net stickers must be separated by one ASCII space."))
      }
    }
    switch error.contents {
    | Some(reason) => Error(reason)
    | None => Ok(output->Array.join(""))
    }
  }
}

let parse = (~size: int, input: string): result<cubeState, stateError> => {
  if !isSupportedSize(size) {
    Error(InvalidSize("Cube size must be between 2 and 5."))
  } else {
    let lines = input->String.split("\n")
    if lines->Array.length != size * 3 {
      Error(InvalidNet("A net must contain exactly 3 × size lines."))
    } else {
      let indent = size * 2
      let upper = Array.make(~length=size, "")
      let middle = Array.make(~length=size, "")
      let lower = Array.make(~length=size, "")
      let error = ref(None)
      for lineIndex in 0 to size - 1 {
        let topLine = Belt.Array.getUnsafe(lines, lineIndex)
        let bottomLine = Belt.Array.getUnsafe(lines, size * 2 + lineIndex)
        if (
          topLine->String.length != indent + size * 2 - 1 ||
            bottomLine->String.length != indent + size * 2 - 1
        ) {
          error := Some(InvalidNet("Top and bottom rows must use the canonical indentation."))
        } else {
          for prefixIndex in 0 to indent - 1 {
            if (
              topLine->String.get(prefixIndex)->Belt.Option.getUnsafe->String.make != " " ||
                bottomLine->String.get(prefixIndex)->Belt.Option.getUnsafe->String.make != " "
            ) {
              error := Some(InvalidNet("Top and bottom rows must use ASCII-space indentation."))
            }
          }
          switch parseRow(~line=topLine, ~offset=indent, ~size) {
          | Ok(value) => upper[lineIndex] = value
          | Error(reason) => error := Some(reason)
          }
          switch parseRow(~line=bottomLine, ~offset=indent, ~size) {
          | Ok(value) => lower[lineIndex] = value
          | Error(reason) => error := Some(reason)
          }
        }

        let middleLine = Belt.Array.getUnsafe(lines, size + lineIndex)
        if middleLine->String.length != size * 8 - 1 {
          error := Some(InvalidNet("Middle rows must contain four adjacent face rows."))
        } else {
          let values = Array.make(~length=4, "")
          for faceIndex in 0 to 3 {
            switch parseRow(~line=middleLine, ~offset=faceIndex * size * 2, ~size) {
            | Ok(value) => values[faceIndex] = value
            | Error(reason) => error := Some(reason)
            }
          }
          middle[lineIndex] = values->Array.join("")
        }
      }
      switch error.contents {
      | Some(reason) => Error(reason)
      | None => {
          let serial = [
            upper->Array.join(""),
            middle
            ->Array.map(line => line->String.slice(~start=2 * size, ~end=3 * size))
            ->Array.join(""),
            middle
            ->Array.map(line => line->String.slice(~start=size, ~end=2 * size))
            ->Array.join(""),
            lower->Array.join(""),
            middle->Array.map(line => line->String.slice(~start=0, ~end=size))->Array.join(""),
            middle
            ->Array.map(line => line->String.slice(~start=3 * size, ~end=4 * size))
            ->Array.join(""),
          ]->Array.join("")
          FaceletCodec.parse(~size, serial)
        }
      }
    }
  }
}
