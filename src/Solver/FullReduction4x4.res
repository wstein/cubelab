open StateTypes
open MoveTypes

type fullReduction4x4Solution = {
  alg: alg,
  algorithm: string,
  stm: int,
  obtm: int,
  centreSteps: int,
  wingSteps: int,
}

type fullReduction4x4Error = {
  message: string,
  stage: string,
}

type reduction4x4MoveMetrics = {
  stm: int,
  obtm: int,
}

let errorMessage = (error: 'a, fallback: string): string =>
  %raw(`function(error, fallback) {
    return typeof error === "object" && error !== null && typeof error.message === "string"
      ? error.message
      : fallback;
  }`)(error, fallback)

let apply = (state: 'a, alg: alg): result<cubeState, MoveExecutor.executionError> =>
  MoveExecutor.applyAlg(state, alg)

let normalizeFullReductionAlgorithm = (alg: alg): result<alg, MoveExecutor.executionError> =>
  MoveTransform.simplify(alg)

let measureReduction4x4Moves = (alg: alg): option<reduction4x4MoveMetrics> =>
  switch MoveExecutor.expand(alg) {
  | Error(_) => None
  | Ok(steps) => {
    let stm = ref(0)
    let obtm = ref(0)
    steps->Array.forEach(step => {
      switch step.move {
      | Rotation(_) => ()
      | FaceTurn(_face, range) =>
        stm := stm.contents + 1
        obtm := obtm.contents + (if range.from_ == 1 { 1 } else { 2 })
      | SliceTurn(_) =>
        stm := stm.contents + 1
        obtm := obtm.contents + 2
      }
    })
    Some({stm: stm.contents, obtm: obtm.contents})
  }
  }

let solveFullReduction4x4 = (input: 'a): result<fullReduction4x4Solution, fullReduction4x4Error> => {
  let state = ref(input)
  let alg: ref<alg> = ref([])
  let centreSteps = ref(0)
  let wingSteps = ref(0)

  let centreError: ref<option<fullReduction4x4Error>> = ref(None)

  while centreSteps.contents < 24 && centreError.contents == None {
    switch Reduction4x4.inspectReduction4x4(state.contents) {
    | Error(e) =>
      centreError := Some({stage: "centres", message: errorMessage(e, "Invalid 4×4 state.")})
    | Ok(insp) if insp.centreBlocksComplete == 6 && insp.centreFrameValid =>
      centreSteps := 25 // break
    | Ok(_) =>
      switch Reduction4x4.planNextCentreBlock4x4(state.contents) {
      | Error(e) =>
        centreError := Some({stage: "centres", message: errorMessage(e, "The centre search reached its bound.")})
      | Ok(next) =>
        switch apply(state.contents, next.alg) {
        | Error(_) =>
          centreError := Some({stage: "centres", message: "A centre candidate could not be replayed."})
        | Ok(replay) =>
          state := replay
          alg := Array.concat(alg.contents, next.alg)
          centreSteps := centreSteps.contents + 1
        }
      }
    }
  }

  let finalCentreSteps = if centreSteps.contents > 24 { centreSteps.contents - 1 } else { centreSteps.contents }

  switch centreError.contents {
  | Some(err) => Error(err)
  | None =>
    switch Reduction4x4.inspectReduction4x4(state.contents) {
    | Error(_) => Error({stage: "centres", message: "The bounded centre search did not complete a valid six-centre frame."})
    | Ok(afterCentres) if afterCentres.centreBlocksComplete != 6 || !afterCentres.centreFrameValid =>
      Error({stage: "centres", message: "The bounded centre search did not complete a valid six-centre frame."})
    | Ok(_) =>
      let wingError: ref<option<fullReduction4x4Error>> = ref(None)

      while wingSteps.contents < 24 && wingError.contents == None {
        switch Reduction4x4.inspectReduction4x4(state.contents) {
        | Error(e) =>
          wingError := Some({stage: "wings", message: errorMessage(e, "Invalid 4×4 state.")})
        | Ok(insp) if insp.wingRowsPaired == 24 =>
          wingSteps := 25 // break
        | Ok(_) =>
          switch Reduction4x4.planNextWingPair4x4(state.contents) {
          | Error(e) =>
            wingError := Some({stage: "wings", message: errorMessage(e, "The wing search reached its bound.")})
          | Ok(next) =>
            switch apply(state.contents, next.alg) {
            | Error(_) =>
              wingError := Some({stage: "wings", message: "A wing candidate could not be replayed."})
            | Ok(replay) =>
              state := replay
              alg := Array.concat(alg.contents, next.alg)
              wingSteps := wingSteps.contents + 1
            }
          }
        }
      }

      let finalWingSteps = if wingSteps.contents > 24 { wingSteps.contents - 1 } else { wingSteps.contents }

      switch wingError.contents {
      | Some(err) => Error(err)
      | None =>
        let parityError: ref<option<fullReduction4x4Error>> = ref(None)

        let projected = ref(Reduction4x4.reduce4x4(state.contents))
        switch projected.contents {
        | Error(e) if String.startsWith(e.message, "4×4 OLL parity detected:") =>
          switch Reduction4x4.planOLLParityRepair4x4(state.contents) {
          | Error(repairErr) =>
            parityError := Some({stage: "parity", message: errorMessage(repairErr, "OLL parity repair failed.")})
          | Ok(repair) =>
            switch apply(state.contents, repair.alg) {
            | Error(_) =>
              parityError := Some({stage: "parity", message: "OLL parity repair could not be replayed."})
            | Ok(replay) =>
              state := replay
              alg := Array.concat(alg.contents, repair.alg)
              projected := Reduction4x4.reduce4x4(state.contents)
            }
          }
        | _ => ()
        }

        if parityError.contents == None {
          switch projected.contents {
          | Error(e) if String.startsWith(e.message, "4×4 PLL parity detected:") =>
            switch Reduction4x4.planPLLParityRepair4x4(state.contents) {
            | Error(repairErr) =>
              parityError := Some({stage: "parity", message: errorMessage(repairErr, "PLL parity repair failed.")})
            | Ok(repair) =>
              switch apply(state.contents, repair.alg) {
              | Error(_) =>
                parityError := Some({stage: "parity", message: "PLL parity repair could not be replayed."})
              | Ok(replay) =>
                state := replay
                alg := Array.concat(alg.contents, repair.alg)
                projected := Reduction4x4.reduce4x4(state.contents)
              }
            }
          | _ => ()
          }
        }

        switch parityError.contents {
        | Some(err) => Error(err)
        | None =>
          switch projected.contents {
          | Error(e) => Error({stage: "finish", message: errorMessage(e, "The cube was not reduced.")})
          | Ok(reduced) =>
            TwoPhaseSolver.prepareTables()
            switch TwoPhaseSolver.solve(reduced.state) {
            | Error(_) => Error({stage: "finish", message: "The reduced 3×3 finish failed."})
            | Ok(finish) =>
              let fullAlg = Array.concat(alg.contents, finish.alg)
              switch normalizeFullReductionAlgorithm(fullAlg) {
              | Error(_) => Error({stage: "finish", message: "The full solution could not be normalized."})
              | Ok(solution) =>
                switch apply(input, solution) {
                | Error(_) =>
                  Error({stage: "finish", message: "The proposed full reduction did not replay to a solved 4×4."})
                | Ok(replay) =>
                  if !Reduction4x4.isMonochromeSolved4x4(replay) {
                    Error({stage: "finish", message: "The proposed full reduction did not replay to a solved 4×4."})
                  } else {
                    switch measureReduction4x4Moves(solution) {
                    | None => Error({stage: "finish", message: "The normalized solution could not be expanded."})
                    | Some(metrics) =>
                      Ok({
                        alg: solution,
                        algorithm: MoveTransform.serialize(solution),
                        stm: metrics.stm,
                        obtm: metrics.obtm,
                        centreSteps: finalCentreSteps,
                        wingSteps: finalWingSteps,
                      })
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
