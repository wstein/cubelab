let normalizeCharacter = character =>
  switch character {
  | "’"
  | "‘"
  | "′"
  | "‵"
  | "`"
  | "´" => "'"
  | "–"
  | "—"
  | "−"
  | "‑" => "-"
  | "\u00a0"
  | "\u202f"
  | "\u2007"
  | "\t"
  | "\r" => " "
  | "（" => "("
  | "）" => ")"
  | "［" => "["
  | "］" => "]"
  | "｛" => "{"
  | "｝" => "}"
  | "＜" => "<"
  | "＞" => ">"
  | "，" => ","
  | "：" => ":"
  | _ => character
  }

let subscriptDigit = character =>
  switch character {
  | "₂" => Some("2")
  | "₃" => Some("3")
  | "₄" => Some("4")
  | "₅" => Some("5")
  | _ => None
  }

let isFace = character => "ULFRBD"->String.includes(character)

let normalize = input => {
  let output = Array.make(~length=input->String.length, "")
  for index in 0 to input->String.length - 1 {
    output[index] = input->String.get(index)->Belt.Option.getUnsafe->String.make->normalizeCharacter
  }
  for index in 0 to input->String.length - 2 {
    let character = input->String.get(index)->Belt.Option.getUnsafe->String.make
    let next = input->String.get(index + 1)->Belt.Option.getUnsafe->String.make
    switch subscriptDigit(next) {
    | Some(digit) if isFace(character) => {
        output[index] = digit
        output[index + 1] = character
      }
    | _ => ()
    }
  }
  output->Array.join("")
}
