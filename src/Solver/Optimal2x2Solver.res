let _moveParser = MoveParser.parse
let _moveExecutor = MoveExecutor.applyAlg

%%raw(`
let preparedTables = undefined;
let tablesPromise = undefined;
`)

type optimal2x2Solution = {
  alg: unknown,
  moveCount: int,
}

type random2x2StateScramble = {
  coordinate: int,
  state: unknown,
  scramble: unknown,
  moveCount: int,
}

type solutionMovesResult = {
  moves: array<int>,
  final: Canonical2x2.cubies,
}

let hasPreparedTables: unit => bool = %raw(`function() {
  return preparedTables !== undefined;
}`)

let prepareTables: unit => promise<Optimal2x2Table.optimal2x2Tables> = %raw(`function() {
  if (preparedTables) return Promise.resolve(preparedTables);
  if (!tablesPromise) {
    tablesPromise = fetch(Optimal2x2Table.optimal_2X2_TABLE_URL).then(async response => {
      if (!response.ok) throw new Error("The optimal 2×2 solver table could not be downloaded.");
      preparedTables = Optimal2x2Table.decodeOptimal2x2Tables(await response.arrayBuffer());
      return preparedTables;
    }).catch(error => {
      tablesPromise = undefined;
      throw error;
    });
  }
  return tablesPromise;
}`)

let getCubeStateSize: unknown => int = %raw(`state => state && typeof state === 'object' ? state.size : undefined`)

external toCubeState: unknown => StateTypes.cubeState = "%identity"

let cubies = (state: unknown): Canonical2x2.cubies => {
  if getCubeStateSize(state) != 2 {
    failwith("The optimal solver supports only 2×2 cubes.")
  }
  switch PieceReducer.reduce(toCubeState(state)) {
  | Ok(reduced) => {cp: reduced.cp, co: reduced.co}
  | Error(err) => failwith(PieceReducer.describeError(err))
  }
}

let reconstruct = (pieces: Canonical2x2.cubies): StateTypes.cubeState => {
  let pieceState: PieceReducer.pieceState = {
    size: 2,
    cp: pieces.cp,
    co: pieces.co,
    ep: [],
    eo: [],
  }
  switch PieceReducer.reconstruct(pieceState) {
  | Ok(st) => st
  | Error(err) => failwith(PieceReducer.describeError(err))
  }
}

let solutionMoves = (tables: Optimal2x2Table.optimal2x2Tables, initial: Canonical2x2.cubies): solutionMovesResult => {
  let current = ref(initial)
  let distance = ref(Optimal2x2Table.packedDistance(tables.distance, Canonical2x2.coordinateForCubies(current.contents)))
  let moves = []
  let transforms = Canonical2x2.transformations()
  while distance.contents > 0 {
    let found = ref(false)
    let move = ref(0)
    while move.contents < 18 && !found.contents {
      let m = move.contents
      let trans = transforms[m]->Option.getOr(Canonical2x2.identity())
      let next = Canonical2x2.applyTransform(current.contents, trans)
      let nextCoord = Canonical2x2.coordinateForCubies(next)
      if Optimal2x2Table.packedDistance(tables.distance, nextCoord) == distance.contents - 1 {
        current := next
        let _ = Array.push(moves, m)
        distance := distance.contents - 1
        found := true
      }
      move := move.contents + 1
    }
    if !found.contents {
      failwith("The exact optimal 2×2 table could not reconstruct a solution.")
    }
  }
  {moves, final: current.contents}
}

type drillCoordinates = {three: array<int>, four: array<int>}

let getExactCoordinates: Optimal2x2Table.optimal2x2Tables => drillCoordinates = %raw(`
(() => {
  const cache = new WeakMap();
  return function(tables) {
    const existing = cache.get(tables);
    if (existing) return existing;
    const indexed = {three: [], four: []};
    for (let coordinate = 0; coordinate < 3674160; coordinate += 1) {
      const distance = Optimal2x2Table.packedDistance(tables.distance, coordinate);
      if (distance === 3) indexed.three.push(coordinate);
      else if (distance === 4) indexed.four.push(coordinate);
    }
    cache.set(tables, indexed);
    return indexed;
  };
})()
`)

let randomCanonicalCoordinate: option<unit => float> => int = %raw(`function(random) {
  const fn = typeof random === 'function' ? random : Math.random;
  const value = fn();
  const bounded = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.999999999999) : 0;
  return Math.floor(bounded * 3674160);
}`)

let randomStateScrambleFromTables: (
  Optimal2x2Table.optimal2x2Tables,
  option<unit => float>,
  option<string>,
) => random2x2StateScramble = %raw(`function(tables, random, difficulty) {
  const rand = typeof random === 'function' ? random : Math.random;
  const diff = typeof difficulty === 'string' ? difficulty : "5+";

  let coordinate;
  if (diff === "any") {
    coordinate = randomCanonicalCoordinate(rand);
  } else if (diff === "3" || diff === "4") {
    const coordinates = getExactCoordinates(tables);
    const list = diff === "3" ? coordinates.three : coordinates.four;
    const value = rand();
    const bounded = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.999999999999) : 0;
    coordinate = list[Math.floor(bounded * list.length)];
  } else {
    coordinate = randomCanonicalCoordinate(rand);
    while (Optimal2x2Table.packedDistance(tables.distance, coordinate) < 5) {
      coordinate = randomCanonicalCoordinate(rand);
    }
  }

  const pieces = Canonical2x2.cubiesForCoordinate(coordinate);
  const state = reconstruct(pieces);
  const solution = solutionMoves(tables, pieces);
  const solveTokens = [
    ...solution.moves.map(m => Canonical2x2.moveTokens[m]),
    ...Canonical2x2.rotationTokensToIdentity(solution.final)
  ];
  const scrambleTokens = solveTokens.slice().reverse().map(token => {
    if (token.endsWith("2")) return token;
    const base = token.endsWith("'") ? token.slice(0, -1) : token;
    return token.endsWith("'") ? base : base + "'";
  });
  const parsed = MoveParser.parse(2, scrambleTokens.join(" "));
  if (parsed.TAG !== "Ok") throw new Error("The random 2×2 scramble could not be encoded.");
  const replay = MoveExecutor.applyAlg(
    reconstruct({cp: Array.from({length: 8}, (_, index) => index), co: Array(8).fill(0)}),
    parsed._0
  );
  if (replay.TAG !== "Ok" || Canonical2x2.coordinateForCubies(cubies(replay._0)) !== coordinate) {
    throw new Error("The random 2×2 scramble did not replay to the sampled state.");
  }
  return {coordinate, state, scramble: parsed._0, moveCount: solution.moves.length};
}`)

let randomStateScramble: (
  option<unit => float>,
  option<string>,
) => promise<random2x2StateScramble> = %raw(`async function(random, difficulty) {
  const tables = await prepareTables();
  return randomStateScrambleFromTables(tables, random, difficulty);
}`)

let solve: unknown => promise<optimal2x2Solution> = %raw(`async function(state) {
  const tables = await prepareTables();
  const pieces = cubies(state);
  const solution = solutionMoves(tables, pieces);
  const moves = solution.moves;
  const parsed = MoveParser.parse(2, moves.map(m => Canonical2x2.moveTokens[m]).join(" "));
  if (parsed.TAG !== "Ok") throw new Error("The optimal 2×2 solution could not be encoded.");
  const replay = MoveExecutor.applyAlg(state, parsed._0);
  const final = replay.TAG === "Ok" ? cubies(replay._0) : null;
  if (!final || Canonical2x2.coordinateForCubies(final) !== 0) {
    throw new Error("The optimal 2×2 solution failed verification.");
  }
  return {alg: parsed._0, moveCount: moves.length};
}`)
