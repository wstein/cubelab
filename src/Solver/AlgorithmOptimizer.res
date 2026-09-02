open StateTypes
open MoveTypes

// Bounded IDA* over all eighteen face-turn atomic actions, looking for any
// algorithm strictly shorter than the one supplied that reaches the exact
// same resulting state from solved. This is NOT an optimal solver: general
// optimal solving needs precomputed pattern databases spanning tens of
// millions of states that this app does not ship. The admissible heuristic
// here is the maximum of twenty independent single-piece BFS distance
// tables (reused from BeginnerSolver's block-building infrastructure) —
// weaker than the paired pattern databases those solvers use for small
// piece subsets, so this search realistically only succeeds for short
// sequences within its node budget. When the budget runs out before either
// exhausting the depth bound or finding a match, that is reported
// explicitly rather than silently claiming the input was already minimal.

type shortenOutcome =
  | Shortened({alg: alg, moveCount: int})
  | NoShorterFound
  | SearchTooExpensive

let allCorners = [0, 1, 2, 3, 4, 5, 6, 7]
let allEdges = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

let defaultMaxNodes = 1500000
let defaultMaxDepth = 10

let shorten = (
  ~solved: cubeState,
  ~target: PieceReducer.pieceState,
  ~currentMoveCount: int,
  ~maxNodes: int=defaultMaxNodes,
  ~maxDepth: int=defaultMaxDepth,
): result<shortenOutcome, PieceReducer.pieceError> =>
  if currentMoveCount <= 1 {
    Ok(NoShorterFound)
  } else {
    switch PieceReducer.reduce(solved) {
    | Error(error) => Error(error)
    | Ok(solvedPieces) => {
        let actions = BeginnerSolver.atomicActions(solved)
        let (cornerTables, edgeTables) = BeginnerSolver.atomicDistanceTables(
          ~corners=allCorners,
          ~edges=allEdges,
          ~actions,
        )
        let heuristic = state =>
          BeginnerSolver.atomicDistanceLowerBound(state, cornerTables, edgeTables)
        // The distance tables above measure distance-to-SOLVED, since that
        // is the fixed goal every piece's BFS was built against. Searching
        // forward from solved toward an arbitrary target would make that
        // heuristic inadmissible (it has no relationship to the target).
        // Searching backward from target to solved keeps it valid; the
        // found path is then reversed and inverted to run solved -> target.
        let solvedKey = BeginnerSolver.fullKey(solvedPieces)
        let searchDepth = currentMoveCount - 1 < maxDepth ? currentMoveCount - 1 : maxDepth
        if BeginnerSolver.fullKey(target) == solvedKey {
          Ok(Shortened({alg: [], moveCount: 0}))
        } else {
          let nodes = ref(0)
          let exceeded = ref(false)
          let rec dfs = (current, remaining, previousFace, previousAxis, path, seen) =>
            if exceeded.contents {
              None
            } else {
              nodes := nodes.contents + 1
              if nodes.contents > maxNodes {
                exceeded := true
                None
              } else if heuristic(current) > remaining {
                None
              } else if remaining == 0 {
                if BeginnerSolver.fullKey(current) == solvedKey {
                  Some(path->Array.map(value => value))
                } else {
                  None
                }
              } else {
                let key =
                  BeginnerSolver.fullKey(current) ++
                  "|" ++
                  previousFace->Int.toString ++
                  ":" ++
                  previousAxis->Int.toString
                let alreadySeen = switch Dict.get(seen, key) {
                | Some(depth) => depth >= remaining
                | None => false
                }
                if alreadySeen {
                  None
                } else {
                  Dict.set(seen, key, remaining)
                  let found = ref(None)
                  for index in 0 to actions->Array.length - 1 {
                    let action = Belt.Array.getUnsafe(actions, index)
                    let sameFace = action.faceIndex == previousFace
                    let reorderedOpposite =
                      action.axisIndex == previousAxis && action.faceIndex < previousFace
                    if found.contents == None && !sameFace && !reorderedOpposite {
                      path->Array.push(action)
                      found :=
                        dfs(
                          BeginnerSolver.applyCubie(current, action.transition),
                          remaining - 1,
                          action.faceIndex,
                          action.axisIndex,
                          path,
                          seen,
                        )
                      path->Array.pop->ignore
                    }
                  }
                  found.contents
                }
              }
            }
          let found = ref(None)
          let depth = ref(1)
          while found.contents == None && depth.contents <= searchDepth && !exceeded.contents {
            found := dfs(target, depth.contents, -1, -1, [], Dict.make())
            depth := depth.contents + 1
          }
          switch found.contents {
          | Some(path) =>
            let alg = ref([])
            for index in path->Array.length - 1 downto 0 {
              let action = Belt.Array.getUnsafe(path, index)
              alg := alg.contents->Array.concat(MoveTransform.invert(action.alg))
            }
            Ok(Shortened({alg: alg.contents, moveCount: path->Array.length}))
          | None => Ok(exceeded.contents ? SearchTooExpensive : NoShorterFound)
          }
        }
      }
    }
  }
