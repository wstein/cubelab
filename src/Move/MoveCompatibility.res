open MoveTypes

type assessment = {
  compatible: bool,
  reasons: array<string>,
}

type compatibility = {
  wca: assessment,
  signLgn: assessment,
  cubingJs: assessment,
  speedsolving: assessment,
  ruwix: assessment,
}

type sourceFeatures = {
  mutable adjacentUnits: bool,
  mutable blockComment: bool,
  mutable informalRotation: bool,
  mutable lowercaseFace: bool,
  mutable pause: bool,
  mutable ruwixSubscript: bool,
  mutable ruwixPlaintext: bool,
}

let addReason = (reasons, reason) => {
  if !(reasons->Array.includes(reason)) {
    reasons->Array.push(reason)
  }
}

let containsAny = (value, characters) => {
  let found = ref(false)
  for index in 0 to value->String.length - 1 {
    switch value->String.get(index)->Option.map(String.make) {
    | Some(character) if characters->String.includes(character) => found := true
    | _ => ()
    }
  }
  found.contents
}

let sourceFor = (input, unit: locatedUnit) =>
  input->String.slice(~start=unit.loc.start, ~end=unit.loc.end_)

let startsWithDelimiter = source =>
  switch source->String.get(0)->Option.map(String.make) {
  | Some("(" | "[" | "{" | "<") => true
  | _ => false
  }

let hasPostFaceDigit = source => {
  let found = ref(false)
  for index in 0 to source->String.length - 2 {
    let character = source->String.get(index)->Option.map(String.make)
    let next = source->String.get(index + 1)->Option.map(String.make)
    switch (character, next) {
    | (Some("U" | "L" | "F" | "R" | "B" | "D"), Some(next)) if next >= "2" && next <= "5" =>
      found := true
    | _ => ()
    }
  }
  found.contents
}

let hasExplicitMultiplier = input => {
  let found = ref(input->String.includes("*") || input->String.includes("^"))
  for index in 0 to input->String.length - 2 {
    if input->String.get(index)->Option.map(String.make) == Some("x") {
      let cursor = ref(index + 1)
      while (
        cursor.contents < input->String.length &&
          input->String.get(cursor.contents)->Option.map(String.make) == Some(" ")
      ) {
        cursor := cursor.contents + 1
      }
      if cursor.contents > index + 1 && cursor.contents < input->String.length {
        switch input->String.get(cursor.contents)->Option.map(String.make) {
        | Some(character) if character >= "0" && character <= "9" => found := true
        | _ => ()
        }
      }
    }
  }
  found.contents
}

let rec inspectSequence = (
  input,
  units: array<locatedUnit>,
  features,
  wcaReasons,
  ruwixReasons,
) => {
  for index in 0 to units->Array.length - 1 {
    let unit = Belt.Array.getUnsafe(units, index)
    if index > 0 {
      let previous = Belt.Array.getUnsafe(units, index - 1)
      if previous.loc.end_ == unit.loc.start {
        features.adjacentUnits = true
      }
    }
    inspectUnit(input, unit, features, wcaReasons, ruwixReasons)
  }
}

and inspectUnit = (input, unit: locatedUnit, features, wcaReasons, ruwixReasons) => {
  let source = sourceFor(input, unit)
  switch unit.desc {
  | Move(move, turns) => {
      if containsAny(source, "rludfb") {
        features.lowercaseFace = true
      }
      if containsAny(source, "₂₃₄₅") {
        features.ruwixSubscript = true
      }
      if startsWithDelimiter(source) {
        features.informalRotation = true
      }
      switch move {
      | FaceTurn(_, range) => {
          if range.from_ > 1 {
            addReason(wcaReasons, "Inner-layer moves are outside the Article 12 token subset.")
          }
          if hasPostFaceDigit(source) && range.from_ == 1 && range.to_ > 1 {
            features.ruwixPlaintext = true
          }
          if range.from_ > 1 && range.to_ > range.from_ {
            addReason(
              ruwixReasons,
              "Ranged inner-layer syntax is not documented by Ruwix Advanced.",
            )
          }
        }
      | SliceTurn(_) => addReason(wcaReasons, "M, E, and S are not Article 12 NxNxN move tokens.")
      | Rotation(_) => ()
      }
      if turns != 1 && turns != -1 && turns != 2 {
        addReason(
          wcaReasons,
          "Article 12 source turns use only quarter, inverse, or 180-degree suffixes.",
        )
      }
    }
  | Pause => features.pause = true
  | BlockComment(_) => features.blockComment = true
  | Group(units, _) => {
      addReason(wcaReasons, "Groups are outside the Article 12 token subset.")
      inspectSequence(input, units, features, wcaReasons, ruwixReasons)
    }
  | Commutator(left, right, _) => {
      addReason(wcaReasons, "Commutators are outside the Article 12 token subset.")
      addReason(ruwixReasons, "Ruwix Advanced does not define bracket commutator syntax.")
      inspectSequence(input, left, features, wcaReasons, ruwixReasons)
      inspectSequence(input, right, features, wcaReasons, ruwixReasons)
    }
  | Conjugate(left, right, _) => {
      addReason(wcaReasons, "Conjugates are outside the Article 12 token subset.")
      addReason(ruwixReasons, "Ruwix Advanced does not define bracket conjugate syntax.")
      inspectSequence(input, left, features, wcaReasons, ruwixReasons)
      inspectSequence(input, right, features, wcaReasons, ruwixReasons)
    }
  }
}

let assessment = reasons => {compatible: reasons->Array.length == 0, reasons}

let evaluate = (
  ~input: string,
  ~lowercaseMode: lowercaseMode,
  ~notationDialect: notationDialect,
  alg: alg,
): compatibility => {
  let wcaReasons = []
  let signReasons = []
  let cubingReasons = []
  let speedsolvingReasons = []
  let ruwixReasons = []
  let features = {
    adjacentUnits: false,
    blockComment: false,
    informalRotation: false,
    lowercaseFace: false,
    pause: false,
    ruwixSubscript: false,
    ruwixPlaintext: false,
  }
  inspectSequence(input, alg, features, wcaReasons, ruwixReasons)

  let usesRuwixSource =
    features.ruwixSubscript || (notationDialect == Ruwix && features.ruwixPlaintext)

  let normalized = MoveNormalizer.normalize(input)
  if normalized != input {
    addReason(
      wcaReasons,
      "The source uses Unicode or whitespace aliases outside exact Article 12 spelling.",
    )
    addReason(signReasons, "The source relies on Cube Rosetta Unicode normalization.")
    addReason(cubingReasons, "The source relies on Cube Rosetta Unicode normalization.")
  }
  if features.lowercaseFace {
    addReason(wcaReasons, "Lowercase face tokens are not Article 12 spelling.")
  }
  if features.informalRotation {
    addReason(
      wcaReasons,
      "Informal bracket rotations are not current Article 12 spelling; use x, y, or z.",
    )
    addReason(signReasons, "Informal bracket rotations are a Cube Rosetta extension.")
    addReason(cubingReasons, "Informal bracket rotations are not portable cubing.js source.")
  }
  if usesRuwixSource {
    addReason(wcaReasons, "Ruwix post-face widths are outside Article 12 spelling.")
    addReason(signReasons, "Ruwix post-face widths must be rewritten as nFw for SiGN/LGN.")
    addReason(cubingReasons, "Ruwix post-face widths must be rewritten as nFw for cubing.js.")
    addReason(
      speedsolvingReasons,
      "Ruwix post-face widths are not a general SpeedSolving Wiki convention.",
    )
  }
  if lowercaseMode == InnerSlice && features.lowercaseFace {
    addReason(signReasons, "Legacy lowercase inner-slice semantics conflict with modern SiGN.")
    addReason(cubingReasons, "cubing.js interprets lowercase cube moves as modern wide turns.")
    addReason(ruwixReasons, "Current Ruwix Advanced uses lowercase face letters for wide turns.")
  }
  if features.adjacentUnits {
    addReason(signReasons, "LGN separates adjacent repeated units with whitespace.")
    addReason(cubingReasons, "Add whitespace between units for portable cubing.js source.")
  }
  if features.pause {
    addReason(wcaReasons, "Pause nodes are outside Article 12 move tokens.")
    addReason(signReasons, "Pause nodes are a cubing.js editor extension.")
    addReason(speedsolvingReasons, "Pause nodes are outside the documented Wiki subset.")
    addReason(ruwixReasons, "Ruwix Advanced does not document pause nodes.")
  }
  if features.blockComment {
    addReason(wcaReasons, "Block comments are outside Article 12 move tokens.")
    addReason(signReasons, "Block comments are a Cube Rosetta editor extension.")
    addReason(cubingReasons, "The current cubing.js parser does not accept block comments.")
    addReason(speedsolvingReasons, "Block comments are outside the documented Wiki subset.")
    addReason(ruwixReasons, "Ruwix Advanced does not document block comments.")
  }
  if hasExplicitMultiplier(input) {
    addReason(wcaReasons, "Explicit multiplier symbols are outside Article 12 move tokens.")
    addReason(signReasons, "SiGN/LGN uses a direct numeric repetition suffix.")
    addReason(cubingReasons, "cubing.js uses a direct numeric repetition suffix.")
    addReason(speedsolvingReasons, "Explicit multiplier symbols are not a documented Wiki grammar.")
    addReason(ruwixReasons, "Ruwix Advanced does not document explicit multiplier symbols.")
  }
  if input->String.includes("#") {
    addReason(wcaReasons, "Hash comments are outside Article 12 move tokens.")
    addReason(signReasons, "Hash comments are a Cube Rosetta extension.")
    addReason(cubingReasons, "cubing.js does not document hash comments.")
    addReason(speedsolvingReasons, "Hash comments are a log-file convenience, not Wiki notation.")
    addReason(ruwixReasons, "Ruwix Advanced does not document hash comments.")
  }
  if input->String.includes("//") || input->String.includes("@") {
    addReason(wcaReasons, "Comments and timestamps are outside Article 12 move tokens.")
    addReason(
      signReasons,
      "Comments and timestamps are extensions, not the normative SiGN/LGN grammar.",
    )
    addReason(
      speedsolvingReasons,
      "Parser annotations are outside the documented Wiki notation subset.",
    )
    addReason(ruwixReasons, "Ruwix Advanced does not document parser annotations.")
  }
  let trimmed = input->String.trim
  if trimmed->String.endsWith(";") {
    addReason(wcaReasons, "Terminal semicolon stripping is a Cube Rosetta convenience.")
    addReason(signReasons, "Terminal semicolon stripping is a Cube Rosetta convenience.")
    addReason(cubingReasons, "Terminal semicolon stripping is not cubing.js notation.")
    addReason(speedsolvingReasons, "Terminal semicolon stripping is not documented Wiki notation.")
    addReason(ruwixReasons, "Terminal semicolon stripping is not Ruwix notation.")
  }
  if trimmed->String.endsWith(".") && !features.pause {
    addReason(wcaReasons, "A terminal period is outside Article 12 move tokens.")
    addReason(signReasons, "SiGN/LGN does not define pause punctuation.")
    addReason(
      cubingReasons,
      "cubing.js requires whitespace around a pause; this period is sentence punctuation.",
    )
    addReason(speedsolvingReasons, "Pause punctuation is outside the documented Wiki subset.")
    addReason(ruwixReasons, "Ruwix Advanced does not document pause punctuation.")
  }

  {
    wca: assessment(wcaReasons),
    signLgn: assessment(signReasons),
    cubingJs: assessment(cubingReasons),
    speedsolving: assessment(speedsolvingReasons),
    ruwix: assessment(ruwixReasons),
  }
}
