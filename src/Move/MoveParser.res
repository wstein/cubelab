open MoveTypes

type parser = {
  input: string,
  size: int,
  lowercaseMode: lowercaseMode,
  mutable cursor: int,
  mutable depth: int,
}

exception ParseFailure(parseError)

let fail = (parser, message, ~start=?, ~end_=?) => {
  let start = start->Option.getOr(parser.cursor)
  let defaultEnd = if parser.cursor < parser.input->String.length {
    parser.cursor + 1
  } else {
    parser.cursor
  }
  let end_ = end_->Option.getOr(defaultEnd)
  throw(ParseFailure({message, loc: {start, end_}}))
}

let peek = parser => parser.input->String.get(parser.cursor)->Option.map(String.make)

let consume = parser => {
  let character = peek(parser)
  switch character {
  | Some(_) => parser.cursor = parser.cursor + 1
  | None => ()
  }
  character
}

let isDigit = character => character >= "0" && character <= "9"

let skipTrivia = parser => {
  let consumed = ref(false)
  let continuing = ref(true)
  while continuing.contents {
    switch peek(parser) {
    | Some(" " | "\n") => {
        consumed := true
        parser.cursor = parser.cursor + 1
      }
    | Some("/") if parser.input->String.startsWithFrom("//", parser.cursor) => {
        consumed := true
        while parser.cursor < parser.input->String.length && peek(parser) != Some("\n") {
          parser.cursor = parser.cursor + 1
        }
      }
    | Some("@") => {
        consumed := true
        let scanning = ref(true)
        while parser.cursor < parser.input->String.length && scanning.contents {
          switch peek(parser) {
          | Some(" " | "\n") => scanning := false
          | _ => parser.cursor = parser.cursor + 1
          }
        }
      }
    | _ => continuing := false
    }
  }
  consumed.contents
}

let parsePositiveInt = parser => {
  let start = parser.cursor
  let value = ref(0)
  let scanning = ref(true)
  while parser.cursor < parser.input->String.length && scanning.contents {
    switch peek(parser) {
    | Some(character) if isDigit(character) => {
        value := value.contents * 10 + String.charCodeAtUnsafe(character, 0) - 48
        if value.contents > 100000 {
          fail(parser, "Numeric suffixes and layer indices may not exceed 100000.", ~start)
        }
        parser.cursor = parser.cursor + 1
      }
    | _ => scanning := false
    }
  }
  if parser.cursor == start {
    None
  } else {
    Some(value.contents)
  }
}

let parseSuffix = (parser, ~allowZero: bool) => {
  let suffixStart = parser.cursor
  switch parsePositiveInt(parser) {
  | Some(0) if !allowZero =>
    fail(parser, "Composite units cannot use a zero repetition.", ~start=suffixStart)
  | Some(value) => {
      let primed = peek(parser) == Some("'")
      if primed {
        parser.cursor = parser.cursor + 1
      }
      if primed {
        -value
      } else {
        value
      }
    }
  | None =>
    if peek(parser) == Some("'") {
      parser.cursor = parser.cursor + 1
      -1
    } else {
      1
    }
  }
}

let faceFromCharacter = character =>
  switch character {
  | "U" | "u" => Some(StateTypes.U)
  | "L" | "l" => Some(StateTypes.L)
  | "F" | "f" => Some(StateTypes.F)
  | "R" | "r" => Some(StateTypes.R)
  | "B" | "b" => Some(StateTypes.B)
  | "D" | "d" => Some(StateTypes.D)
  | _ => None
  }

let validateRange = (parser, range, ~wide: bool, ~explicitRange: bool, ~start: int) => {
  if range.from_ < 1 || range.to_ < range.from_ || range.to_ > parser.size {
    fail(parser, "Layer range is outside the selected cube.", ~start, ~end_=parser.cursor)
  }
  if wide && (range.from_ < 1 || range.to_ < 2 || range.to_ >= parser.size) {
    fail(parser, "Wide moves must turn between 2 and N-1 layers.", ~start, ~end_=parser.cursor)
  }
  if explicitRange && range.from_ < 2 {
    fail(
      parser,
      "Explicit ranged moves must start at layer 2 or deeper.",
      ~start,
      ~end_=parser.cursor,
    )
  }
}

let parseBaseMove = parser => {
  let start = parser.cursor
  let first = parsePositiveInt(parser)
  let rangeEnd = if first != None && peek(parser) == Some("-") {
    parser.cursor = parser.cursor + 1
    switch parsePositiveInt(parser) {
    | Some(value) => Some(value)
    | None => fail(parser, "A ranged move requires a layer number after '-'.", ~start)
    }
  } else {
    None
  }

  let family = switch consume(parser) {
  | Some(character) => character
  | None => fail(parser, "Expected a move.", ~start)
  }

  switch family {
  | "x" | "y" | "z" => {
      if first != None || rangeEnd != None {
        fail(parser, "Rotations cannot have a layer prefix.", ~start, ~end_=parser.cursor)
      }
      let axis = switch family {
      | "x" => X
      | "y" => Y
      | _ => Z
      }
      Rotation(axis)
    }
  | "M" | "m" | "E" | "e" | "S" | "s" => {
      if first != None || rangeEnd != None {
        fail(parser, "Slice moves cannot have a layer prefix.", ~start, ~end_=parser.cursor)
      }
      if parser.size != 3 {
        fail(parser, "M, E, and S are supported only on 3×3×3.", ~start, ~end_=parser.cursor)
      }
      let slice = switch family {
      | "M" | "m" => M
      | "E" | "e" => E
      | _ => S
      }
      SliceTurn(slice)
    }
  | _ =>
    switch faceFromCharacter(family) {
    | None => fail(parser, "Unknown move family '" ++ family ++ "'.", ~start, ~end_=parser.cursor)
    | Some(face) => {
        let lowercase = family >= "a" && family <= "z"
        let explicitWide = peek(parser) == Some("w")
        if explicitWide {
          parser.cursor = parser.cursor + 1
        }
        let lowercaseIsInner = lowercase && parser.size >= 4 && parser.lowercaseMode == InnerSlice
        if lowercaseIsInner && (first != None || rangeEnd != None || explicitWide) {
          fail(
            parser,
            "Legacy lowercase inner-slice moves cannot have a layer prefix or 'w'; use explicit uppercase notation.",
            ~start,
            ~end_=parser.cursor,
          )
        }
        let wide = (lowercase && !lowercaseIsInner) || explicitWide || rangeEnd != None
        let range = switch (first, rangeEnd, wide, lowercaseIsInner) {
        | (None, None, false, true) => {from_: 2, to_: 2}
        | (Some(from_), Some(to_), true, false) => {from_, to_}
        | (Some(to_), None, true, false) => {from_: 1, to_}
        | (None, None, true, false) => {from_: 1, to_: 2}
        | (Some(layer), None, false, false) => {from_: layer, to_: layer}
        | (None, None, false, false) => {from_: 1, to_: 1}
        | _ => fail(parser, "Invalid layer-range move.", ~start, ~end_=parser.cursor)
        }
        validateRange(parser, range, ~wide, ~explicitRange=rangeEnd != None, ~start)
        FaceTurn(face, range)
      }
    }
  }
}

let rotationForFamily = family =>
  switch family {
  | "r" => Some((X, 1))
  | "l" => Some((X, -1))
  | "u" => Some((Y, 1))
  | "d" => Some((Y, -1))
  | "f" => Some((Z, 1))
  | "b" => Some((Z, -1))
  | _ => None
  }

let tryInformalRotation = (parser, open_, close_) => {
  let start = parser.cursor
  if peek(parser) != Some(open_) {
    None
  } else {
    parser.cursor = parser.cursor + 1
    let result = switch consume(parser) {
    | Some(family) => rotationForFamily(family)
    | None => None
    }
    let innerPrime = peek(parser) == Some("'")
    if innerPrime {
      parser.cursor = parser.cursor + 1
    }
    if result == None || peek(parser) != Some(close_) {
      parser.cursor = start
      None
    } else {
      parser.cursor = parser.cursor + 1
      let (axis, direction) = result->Option.getOrThrow
      let suffix = parseSuffix(parser, ~allowZero=true)
      Some({
        desc: Move(
          Rotation(axis),
          direction * if innerPrime {
            -suffix
          } else {
            suffix
          },
        ),
        loc: {start, end_: parser.cursor},
      })
    }
  }
}

let rec parseSequence = (parser, ~stops: string): array<locatedUnit> => {
  let items = []
  let first = ref(true)
  let done_ = ref(false)
  while !done_.contents {
    let separated = skipTrivia(parser)
    switch peek(parser) {
    | None => done_ := true
    | Some(character) if stops->String.includes(character) => done_ := true
    | Some(_) => {
        if !first.contents && !separated {
          fail(parser, "Moves in a sequence must be separated by whitespace.")
        }
        items->Array.push(parseUnit(parser))
        first := false
      }
    }
  }
  items
}

and parseNested = (parser, start, close_, makeDesc) => {
  parser.depth = parser.depth + 1
  if parser.depth > 64 {
    fail(parser, "Algorithm nesting may not exceed 64 levels.", ~start)
  }
  parser.cursor = parser.cursor + 1
  let body = parseSequence(parser, ~stops=close_)
  if peek(parser) != Some(close_) {
    fail(parser, "Unclosed grouped algorithm.", ~start, ~end_=parser.cursor)
  }
  parser.cursor = parser.cursor + 1
  parser.depth = parser.depth - 1
  let repeat = parseSuffix(parser, ~allowZero=false)
  {desc: makeDesc(body, repeat), loc: {start, end_: parser.cursor}}
}

and parseBracket = (parser, start) => {
  parser.depth = parser.depth + 1
  if parser.depth > 64 {
    fail(parser, "Algorithm nesting may not exceed 64 levels.", ~start)
  }
  parser.cursor = parser.cursor + 1
  let left = parseSequence(parser, ~stops=",:]")
  let separator = switch consume(parser) {
  | Some(",") => ","
  | Some(":") => ":"
  | _ => fail(parser, "A bracket expression requires ',' or ':'.", ~start, ~end_=parser.cursor)
  }
  let right = parseSequence(parser, ~stops="]")
  if peek(parser) != Some("]") {
    fail(parser, "Unclosed bracket expression.", ~start, ~end_=parser.cursor)
  }
  parser.cursor = parser.cursor + 1
  parser.depth = parser.depth - 1
  let repeat = parseSuffix(parser, ~allowZero=false)
  let desc = if separator == "," {
    Commutator(left, right, repeat)
  } else {
    Conjugate(left, right, repeat)
  }
  {desc, loc: {start, end_: parser.cursor}}
}

and parseUnit = parser => {
  let start = parser.cursor
  switch peek(parser) {
  | Some("(") => parseNested(parser, start, ")", (body, repeat) => Group(body, repeat))
  | Some("[") =>
    switch tryInformalRotation(parser, "[", "]") {
    | Some(unit) => unit
    | None => parseBracket(parser, start)
    }
  | Some("{") =>
    switch tryInformalRotation(parser, "{", "}") {
    | Some(unit) => unit
    | None => fail(parser, "Only a single informal rotation is allowed in braces.", ~start)
    }
  | Some("<") =>
    switch tryInformalRotation(parser, "<", ">") {
    | Some(unit) => unit
    | None => fail(parser, "Only a single informal rotation is allowed in angle brackets.", ~start)
    }
  | Some(_) => {
      let move = parseBaseMove(parser)
      let turns = parseSuffix(parser, ~allowZero=true)
      {desc: Move(move, turns), loc: {start, end_: parser.cursor}}
    }
  | None => fail(parser, "Expected an algorithm unit.", ~start)
  }
}

let parseWithLowercaseMode = (~size: int, ~lowercaseMode: lowercaseMode, input: string): result<
  alg,
  parseError,
> => {
  if size < 2 || size > 5 {
    Error({message: "Cube size must be between 2 and 5.", loc: {start: 0, end_: 0}})
  } else {
    let parser = {input: MoveNormalizer.normalize(input), size, lowercaseMode, cursor: 0, depth: 0}
    try {
      let units = parseSequence(parser, ~stops="")
      skipTrivia(parser)->ignore
      if parser.cursor != parser.input->String.length {
        fail(parser, "Unexpected trailing input.")
      }
      Ok(units)
    } catch {
    | ParseFailure(error) => Error(error)
    }
  }
}

let parse = (~size: int, input: string): result<alg, parseError> =>
  parseWithLowercaseMode(~size, ~lowercaseMode=Wide, input)
