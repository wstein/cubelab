// Verbatim compatibility vectors from flix-orbit64/FORMAT.md.  Keep wire
// literals here—not beside encoder logic—so tests cannot accidentally derive
// their expectations from Cube Rosetta's own rank/frame implementation.

export const publishedStateVectors = [
  [2, "EJ6kr", "LFLD BLRD BLBU RFRR UUDU DFFB"],
  [3, "AAAAAAAACC-Y", "UUUUURUUU RURBRLRDR FFFLFRFFF DDDLDRDDD LLLFLFLDL BBBBBRBBB"],
  [4, "BJStkD4cayBhsWj6eHgDZLTP1th", "DLLDLLDLBFLFLRBR DRDLFBRLUURUUDDU FUUFLDFDRBUFURRL LBDFFFDFFFBRFBFR RDDDBLUUBURBRULB BFBBUDRURBLLBRDU"],
  [5, "AQshP-X3WpOUAtv878ZKcZyT5P3So75Lb-WOh2gDJ2w", "DBRFRFUBLDDBUFFURBDDFUUDL BLDBFULULLLRRUURRDFDRLLFD LFLRURFURRFFFFBUBLUFRLUBU BDBRFDFRUULRDFDULLDDRBRFL LDBFUUFDUFRLLURBRDDBBRFRD DLDUFBBBBLFRBDUBDLBLBLBRU"],
];

// FORMAT.md: frame rank is the least-significant factor. For the solved 3×3
// coordinate rank is zero, so these are the normative 24 frame ranks 0..23.
export const solved3x3FrameTokens = [
  "AAAAAAAAAAAA", "AAAAAAAAAAAB", "AAAAAAAAAAAC", "AAAAAAAAAAAD",
  "AAAAAAAAAAAE", "AAAAAAAAAAAF", "AAAAAAAAAAAG", "AAAAAAAAAAAH",
  "AAAAAAAAAAAI", "AAAAAAAAAAAJ", "AAAAAAAAAAAK", "AAAAAAAAAAAL",
  "AAAAAAAAAAAM", "AAAAAAAAAAAN", "AAAAAAAAAAAO", "AAAAAAAAAAAP",
  "AAAAAAAAAAAQ", "AAAAAAAAAAAR", "AAAAAAAAAAAS", "AAAAAAAAAAAT",
  "AAAAAAAAAAAU", "AAAAAAAAAAAV", "AAAAAAAAAAAW", "AAAAAAAAAAAX",
];

export const normative3x3Tokens = [
  "AAAAAAAAAAAA", // solved
  "AAAAAAAAAAAE", // solved after x (frame 4)
  "AAAAAAAAAL_o", // superflip
  "FRot3QyvoAAA", // U
];
