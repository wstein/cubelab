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

let normalize = input => {
  let output = Array.make(~length=input->String.length, "")
  for index in 0 to input->String.length - 1 {
    output[index] = input->String.get(index)->Belt.Option.getUnsafe->String.make->normalizeCharacter
  }
  output->Array.join("")
}
