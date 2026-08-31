open StateTypes

let render = (state: cubeState): string =>
  serializationOrder
  ->Array.map(face => {
    let stickers = Belt.Array.getUnsafe(state.facelets, storageIndex(face))
    stickers->Array.map(faceToChar)->Array.join("")
  })
  ->Array.join("")

let parse = (~size: int, input: string): result<cubeState, stateError> =>
  if !isSupportedSize(size) {
    Error(InvalidSize("Cube size must be between 2 and 5."))
  } else {
    let compact = input->String.trim
    let expected = 6 * size * size
    if compact->String.length != expected {
      Error(InvalidLength({expected, actual: compact->String.length}))
    } else {
      let counts = Array.make(~length=6, 0)
      let parsed = Array.make(~length=expected, U)
      let error = ref(None)
      for index in 0 to expected - 1 {
        let character = compact->String.get(index)->Belt.Option.getUnsafe->String.make
        switch charToFace(character) {
        | Some(face) => {
            parsed[index] = face
            let countIndex = storageIndex(face)
            counts[countIndex] = Belt.Array.getUnsafe(counts, countIndex) + 1
          }
        | None => error := Some(InvalidFacelet({index, character}))
        }
      }
      switch error.contents {
      | Some(reason) => Error(reason)
      | None => {
          let stickersPerFace = size * size
          let countError = ref(None)
          for index in 0 to 5 {
            if Belt.Array.getUnsafe(counts, index) != stickersPerFace {
              countError :=
                Some(
                  InvalidColourCount({
                    face: Belt.Array.getUnsafe(storageOrder, index),
                    expected: stickersPerFace,
                    actual: Belt.Array.getUnsafe(counts, index),
                  }),
                )
            }
          }
          switch countError.contents {
          | Some(reason) => Error(reason)
          | None => {
              let facelets = storageOrder->Array.map(_ => Array.make(~length=stickersPerFace, U))
              for serialFaceIndex in 0 to 5 {
                let targetFace = Belt.Array.getUnsafe(serializationOrder, serialFaceIndex)
                let target = Belt.Array.getUnsafe(facelets, storageIndex(targetFace))
                for stickerIndex in 0 to stickersPerFace - 1 {
                  target[stickerIndex] = Belt.Array.getUnsafe(
                    parsed,
                    serialFaceIndex * stickersPerFace + stickerIndex,
                  )
                }
              }
              Ok({size, facelets})
            }
          }
        }
      }
    }
  }
