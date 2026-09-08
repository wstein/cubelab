# Smart cube session replay

Manual QA of the smart-cube integration currently needs a physical Bluetooth cube
in hand: orientation tracking, regrip detection, gesture recenter, live-sync
mirroring, and Academy coaching can only be exercised by turning a real device.
That makes a reported bug hard to reproduce, hard to confirm fixed, and
impossible to guard against regression.

This document specifies **session replay**: a recorded tape of a real smart-cube
session that a live *replay manager* and the vitest suite both consume, so a
single capture serves three jobs:

1. deterministic reproduction of a reported bug;
2. validation that a fix actually resolves it;
3. a checked-in fixture that keeps it fixed.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | What is a tape for? | Deterministic reproduction, fix validation, and fixture source — one artifact, all three. |
| 2 | Playback model | Real-time playback **and** a paused time-slider with time-travel scrubbing plus single-step. |
| 3 | Tape storage & format | A `scratch/` drop zone; one JSON format read by both the replay manager and vitest. |
| 4 | Timing fidelity | Follows decision 2: real inter-packet delays during playback; the slider/step path is time-driven, and tests advance the clock synchronously. |
| 5 | Command round-trips | Capture `sendCommand` calls (LED, reset, facelet/hardware requests) for fidelity. |
| 6 | Privacy | A full tape is a solve recording (facelet states + hand motion). Full-profile capture is QA/dev-only, no upload path. Accepted. |
| 7 | Gating | Full capture is behind a separate `?dev` flag, never the Diagnostics opt-in. |
| 8 | Customer trace vs dev tape | **One schema, two profiles.** The Diagnostics button emits the same format as `?dev` capture, only redacted. Any diagnostic trace a customer sends is a valid (degraded) replay tape. |
| 9 | Contents | Not just raw API events + commands. The tape also records the **higher-level triggers CubeLab generated** — regrip x/y/z detection, gesture recenter, deviation recovery, live-sync decisions — as an expected-output baseline for error analysis and regression diffing. |

## One format, two profiles

There is a single schema, `cubelab-smart-cube-tape-v1`. Two producers write it:

| | `profile: "diagnostic"` | `profile: "full"` |
|---|---|---|
| Producer | Diagnostics dock button → "Copy cube trace" | **Capture session** control, `?dev` only |
| Audience | Customers, in bug reports | QA and developers |
| Gate | `localStorage` opt-in (`cubelab.smartCube.diagnostics`) | `?dev` flag |
| `facelets` event payload | redacted to `{ sha256, length }` | full sticker string |
| Buffer | last N minutes (ring buffer, larger than today's 500 entries) | unbounded for the session |
| Upload | never automatic; user pastes text | no network path at all |
| Replayable | yes — orientation / regrip / gesture flows; state-dependent flows degrade | yes — everything |

Both profiles carry the full `header`, the full `input` event stream (subject to
redaction/buffer above), all `command` entries, and **all `derived` trigger
entries** — the derived layer is the diagnostic value and is never redacted.

The replay manager and `replayTape` helper accept either profile. A
`diagnostic` tape with redacted facelets simply cannot drive `live-sync`,
`Sync state`, `Re-route`, or Academy mirroring; the replay UI flags those
panels as "unavailable — redacted capture" rather than failing.

## Tape format

One JSON document. Written to `scratch/tapes/<name>.json` (full profile) or
produced as clipboard text (diagnostic profile). Promoted by hand to
`test/fixtures/smart-cube/<name>.json` when it should become a permanent
regression fixture.

```jsonc
{
  "schema": "cubelab-smart-cube-tape-v1",
  "profile": "full",                     // or "diagnostic"
  "capturedAt": "2026-09-08T10:07:00.000Z",
  "note": "regrip lost after 720 spin on GoCube",

  // Everything needed to put CubeLab into the same starting state before the
  // first entry is replayed.
  "header": {
    "device": {
      "name": "GoCube_A1B2", "brand": "gocube", "brandName": "GoCube",
      "protocolId": "gocube", "protocolName": "GoCube / Rubik's Connected",
      "macAddress": null,
      "capabilities": { "orientation": true, "battery": true, "facelets": true,
                        "hardware": true, "reset": true, "led": false }
    },
    "syncMode": "PhysicalMirror",        // or "VirtualController"
    "orientationTracking": true,
    "recording": false,                  // algorithm-recording tape state
    "route": null,                       // Academy route / scramble loaded, if any
    "inputHash": "",                     // URL hash at capture time
    "settings": { "autoOrbit": false, "regripThresholdDegrees": 65 }
  },

  // One time-ordered timeline. Every entry has `offsetMs` (milliseconds from the
  // first entry — the single source of replay timing) and a `kind`:
  //
  //   "input"   normalized SmartCubeEvent from the transport. Fed to listeners
  //             on replay. THIS is what makes reproduction deterministic.
  //   "command" outbound sendCommand / flashLed / resetCubeState call. NOT fed
  //             back; replay asserts CubeLab re-issues an equivalent one.
  //   "derived" a higher-level trigger CubeLab generated from the inputs. NOT
  //             fed back; it is the expected-output baseline the replay diffs
  //             against for error analysis and regression detection.
  //
  // Original device timestamps stay inside `event` for fidelity but never
  // schedule playback.
  "timeline": [
    { "offsetMs": 0,   "kind": "input",   "event": { "type": "hardware", "timestamp": 1725787620000, "orientationSupported": true } },
    { "offsetMs": 5,   "kind": "command", "command": { "type": "REQUEST_HARDWARE", "timestamp": 1725787620005 } },
    { "offsetMs": 5,   "kind": "command", "command": { "type": "REQUEST_BATTERY",  "timestamp": 1725787620005 } },
    { "offsetMs": 20,  "kind": "input",   "event": { "type": "facelets", "timestamp": 1725787620020, "facelets": "UUUUUUUUURRR…" } },

    { "offsetMs": 340, "kind": "input",   "event": { "type": "orientation", "timestamp": 1725787620340,
                                                     "quaternion": { "x": 0, "y": 0, "z": 0, "w": 1 },
                                                     "coordinateFrame": "gocube-wire" } },
    // …several orientation packets as the hand rotates the cube…
    { "offsetMs": 690, "kind": "derived", "trigger": "virtual-regrip",
      "in":  { "coordinateFrame": "gocube-wire" },
      "out": { "notationTokens": ["y"], "sensorFrameTokens": ["y"] } },

    { "offsetMs": 512, "kind": "input",   "event": { "type": "move", "timestamp": 1725787620512,
                                                     "move": "R", "face": 1, "direction": 0,
                                                     "localTimestamp": 512, "cubeTimestamp": 512 } },
    { "offsetMs": 512, "kind": "derived", "trigger": "live-sync-move",
      "in":  { "physical": "R" },
      "out": { "expected": "R", "verdict": "accepted", "reduced": null } }
  ]
}
```

Format rules:

- `input.event` is exactly the normalized `SmartCubeEvent` union from
  `src/client/smart-cube/types.ts`. In `diagnostic` profile a `facelets` event's
  payload is `{ sha256, length }` instead of `facelets`; every other event type
  is carried verbatim.
- `offsetMs` is non-decreasing. It is the only clock the replay manager reads.
- `derived` entries record `{ trigger, in, out }` — the trigger name, the inputs
  CubeLab acted on, and the decision it produced. They are documentation of the
  past run, not instructions for the replay.
- The `header` is the contract for "same starting state".
- No wall-clock time inside the timeline drives anything. `capturedAt` is
  metadata.

### Derived trigger catalogue

A stable, extensible set of `trigger` names. Each maps to an existing decision
point in `src/client/converter.ts` / the smart-cube modules:

| `trigger` | Fires when | `out` payload |
|---|---|---|
| `virtual-regrip` | Orientation tracker confirms an x/y/z regrip | `notationTokens`, `sensorFrameTokens`, `coordinateFrame` |
| `gyro-recenter` | Gyro view recentered (button or R R′ flick gesture) | `source`, resulting base orientation |
| `gesture-recenter-trigger` | `GestureRecenterDetector` fires | `targetFace`, `intervalMs` |
| `orientation-snapshot` | Throttled HUD sample (~350 ms) | `eulerDegrees`, `viewportQuaternion`, `tracking` |
| `live-sync-move` | A physical move is assessed against the expected timeline | `expected`, `verdict` (`accepted` / `deviation` / `reduced`), `reduced` |
| `deviation-stack` | Academy deviation recovery stack pushes or pops | `op`, `stack` |
| `academy-advance` | Academy timeline advances a step | `stepIndex`, `move` |
| `recording-token` | A token is appended to the algorithm recording tape | `token`, `frameAxis` |
| `controller-state` | Controller-mode virtual state is (re)assigned | `source`, `stateSummary` |

Adding a trigger name is a minor, backward-compatible change: older replays just
have fewer `derived` entries to diff.

## Capture

### Diagnostic profile (existing button, extended)

The Diagnostics dock button (`converter.ts:7315`) keeps its behaviour — opt-in,
`localStorage`, cleared on toggle-off, nothing auto-uploaded. Changes:

- "Copy cube trace" emits `cubelab-smart-cube-tape-v1` with `profile:
  "diagnostic"` instead of the old `cubelab-smart-cube-diagnostic-v1` shape.
- The trace already records `virtual regrip`, `gyro orientation`, and
  `gyro view recentered`; those become `derived` entries under the names above,
  and the remaining triggers in the catalogue are added.
- `input` entries now cover the whole normalized stream (they largely do
  already, via `traceReceivedSmartCubeEvent`), with `facelets` redacted to a
  hash.
- `command` entries are added (currently only `sent command` text is logged).
- The ring buffer grows from 500 entries to a duration-based cap.

### Full profile (`?dev`)

When `?dev` is present the dock shows a **Capture session** control next to
Diagnostics, visually distinct (red record dot, not the neutral Diagnostics
styling).

- Start: snapshot `header` from live manager state, mode, route, prefs; record
  `performance.now()` as the clock origin.
- While recording: every normalized event, every command, and every derived
  trigger is appended with `offsetMs = round(performance.now() - origin)`. No
  buffer cap.
- Stop: download `scratch/tapes/<name>.json` and keep a copy in `localStorage`
  under `cubelab.smartCube.tape.<name>` for immediate `?replay=` use.
- Persistent indicator while recording; a toast with entry count and duration on
  stop.

Capture never uploads. There is no network path in this feature.

## Replay

### Live replay manager

`createReplaySmartCubeManager(tape)` in `src/client/smart-cube/replay.ts`,
implementing the full `SmartCubeManager` interface from `types.ts`:

- `connect()` resolves immediately with a `SmartCubeDevice` from
  `tape.header.device`; `getState()` reports `connected`.
- A scheduler walks the `input` entries, calling event listeners at each
  `offsetMs`. Playback state: `playing`, `paused`, `seek(offsetMs)`, `step()`,
  `rate` (0.25×–4×).
  - **Playing**: `setTimeout` chains on real `offsetMs` deltas ÷ `rate`.
  - **Paused + slider**: `seek(t)` replays deterministically. Downstream
    detectors are stateful, so a backward seek re-runs from `offsetMs = 0`
    through `t`; forward seek continues from the cursor. Same fold
    `gocube-replay.test.ts` already performs.
  - **Step**: emit exactly the next `input` entry, freeze the clock at its
    `offsetMs`.
- `command` and `derived` entries are not emitted to the app. Instead the
  manager exposes `expectedAt(offsetMs)` so the replay UI and tests can compare
  the tape's recorded decisions against what the live pipeline produces now.
- `sendCommand` / `flashLed` / `resetCubeState` record the call in memory for
  parity assertion; no I/O.
- `disconnect()` stops the scheduler and emits a synthetic `disconnected`.

Injection: `loadSmartCubeManager` (`converter.ts:5439`). With `?dev` and
`?replay=<name>`, resolve the tape (localStorage key or fetched `scratch/` URL)
and substitute the replay manager. Everything downstream runs unmodified.

### Regression diff

Because the tape carries the `derived` layer, replay is also a differential
test. As the live pipeline runs, each newly produced trigger is matched against
the tape's `derived` entry at the same `offsetMs` / trigger name:

- **match** — silent.
- **mismatch** — surfaced in the replay UI timeline and, in tests, a failed
  assertion showing recorded `out` vs live `out`.
- **missing / extra** — a trigger the tape had that the live run didn't produce
  (or vice versa) is flagged at its offset.

This is what "error analysis" needs: a customer's `diagnostic` tape shows a
`virtual-regrip` that fired with the wrong tokens; replaying it against a
candidate fix shows the trigger now producing the right tokens at that offset.

### Replay UI

Under `?replay`, the dock gains a transport strip: play/pause, a scrubber over
tape duration, step-forward, current `offsetMs` / entry index, rate selector,
and a diff panel listing derived-trigger mismatches. It reuses the algorithm
tape scrubber's visual language where practical.

## vitest usage

Same format, no live manager. A helper drives the tape synchronously:

```ts
import { replayTape } from "../../helpers/replay-tape";
import tape from "../../fixtures/smart-cube/regrip-lost-after-720.json";

test("regrip survives a 720° spin on GoCube", () => {
  const session = replayTape(tape);   // builds the real downstream chain
  session.runToEnd();                 // advances the mock clock entry by entry

  // Deterministic reproduction: raw outputs.
  expect(session.regripTokens).toEqual([ /* … */ ]);
  expect(session.issuedCommands).toMatchObject(tape.timeline
    .filter((e) => e.kind === "command").map((e) => e.command));

  // Regression diff against the recorded derived layer.
  expect(session.derivedDiff()).toEqual([]);   // no mismatches vs the tape
});
```

`replayTape` constructs the same tracker/detector wiring the app uses, feeds the
`input` entries in order with the clock at each `offsetMs`, and exposes both the
observable results and `derivedDiff()` against the tape's `derived` entries.
`runTo(offsetMs)` and `step()` mirror the live manager for time-travel
assertions. `test/fixtures/smart-cube/` is the promoted, permanent subset of
`scratch/tapes/`.

## Migration

- The contract test (`test/web-ui-contract.test.mjs:723`) asserts the string
  `cubelab-smart-cube-diagnostic-v1`; update it to
  `cubelab-smart-cube-tape-v1` and add a `profile` assertion.
- Old traces in the wild use the previous shape. A one-shot `upgradeTrace()`
  converts `cubelab-smart-cube-diagnostic-v1` → `…-tape-v1` (`events[]` →
  `timeline[]` with `kind` inferred, `at` ISO → `offsetMs` deltas). Kept until
  no un-upgraded traces are expected in support.

## Build sequence

1. `cubelab-smart-cube-tape-v1` type + validator + `upgradeTrace()`, in
   `src/client/smart-cube/`.
2. Derived-trigger emission: route the existing `traceSmartCubeStabilization`
   call sites (and the new ones from the catalogue) through a single
   `recordDerived(trigger, in, out)` sink.
3. `replayTape` test helper + first fixture (port `gocube-yxz.json`).
4. `createReplaySmartCubeManager` with play/pause/seek/step and `expectedAt`.
5. `?replay=` wiring in `loadSmartCubeManager` behind `?dev`.
6. Diagnostics button: emit the new schema (`profile: "diagnostic"`), grow the
   buffer.
7. **Capture session** control behind `?dev`, download + localStorage.
8. Replay transport + diff UI in the dock.
9. Contract-test updates for the `?dev` gating, schema string, and `profile`.

## Relationship to the diagnostic trace

The diagnostic trace is no longer a separate format — it is `profile:
"diagnostic"` of the replay tape. The customer-facing Diagnostics button, its
opt-in, and its "never auto-upload" guarantee are unchanged. What changes is
that the text a customer pastes into a bug report is now something QA can load
directly into the replay tooling and step through, with the cube's own recorded
x/y/z detections visible alongside the raw packets.
