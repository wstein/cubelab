/**
 * Orbit64 state tokens.
 *
 * A token is an Orbit64 V2 color entry for a cube this studio can show
 * (2×2 through 5×5). Writing always uses the color framed entry. A
 * 43-character class-00 token is refused: that width is the retired V1 5×5.
 */
open StateTypes

let widths: Dict.t<int> = %raw(`{2: 5, 3: 12, 4: 27, 5: 42}`)

let describeError = Orbit64Codec.describeError

let framedColor = n =>
  Orbit64V2.registry->Array.find(entry =>
    entry.n == n && entry.model == Orbit64V2.Color && entry.pose == Orbit64V2.Framed
  )

let inAlphabet = token => {
  let bad = ref(false)
  for i in 0 to String.length(token) - 1 {
    let ch = token->String.slice(~start=i, ~end=i + 1)
    if Orbit64Codec.alphabet->String.indexOf(ch) < 0 {
      bad := true
    }
  }
  !bad.contents
}

let encodeState = (state: cubeState): result<string, Orbit64Codec.orbitError> =>
  if !Orbit64Codec.isCubeState(state) {
    Orbit64Codec.fail("InvalidState", "Orbit64 state input must contain six facelet arrays.")
  } else {
    switch Dict.get(widths, Int.toString(state.size)) {
    | None => Orbit64Codec.fail("UnsupportedSize", "Orbit64 supports 2×2×2 through 5×5×5.")
    | Some(_) =>
      let n = state.size
      let bad = state.facelets->Array.some(face => Array.length(face) != n * n)
      if bad {
        Orbit64Codec.fail("InvalidState", "Each face must contain exactly size × size facelets.")
      } else {
        switch framedColor(n) {
        | None => Orbit64Codec.fail("UnsupportedSize", "Orbit64 supports 2×2×2 through 5×5×5.")
        | Some(entry) => Orbit64V2Facelets.encode(entry.id, FaceletCodec.render(state))
        }
      }
    }
  }

let decodeState = (input: string): result<cubeState, Orbit64Codec.orbitError> => {
  let token = String.trim(input)
  if String.length(token) == 43 && inAlphabet(token) {
    Orbit64Codec.fail("RetiredV1", "Orbit64 V1 is no longer supported")
  } else {
    switch Orbit64V2Facelets.decode(token) {
    | Error(error) => Error(error)
    | Ok(entry, facelets) =>
      if entry.model != Orbit64V2.Color || entry.n < 2 || entry.n > 5 {
        Orbit64Codec.fail("UnsupportedSize", "Orbit64 supports 2×2×2 through 5×5×5.")
      } else {
        switch FaceletCodec.parse(~size=entry.n, facelets) {
        | Ok(state) => Ok(state)
        | Error(_) => Orbit64Codec.fail("InvalidState", "Decoded Orbit64 facelets are invalid.")
        }
      }
    }
  }
}
