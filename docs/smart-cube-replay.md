# Smart cube session replay

Manual QA of the smart-cube integration currently needs a physical Bluetooth cube
in hand: orientation tracking, regrip detection, gesture recenter, live-sync
mirroring, and Academy coaching can only be exercised by turning a real device.
That makes a reported bug hard to reproduce, hard to confirm fixed, and
impossible to guard against regression.

This document specifies **session replay**: a recorded tape of a real smart-cube
session that both a live *replay manager* and the vitest suite consume, so a
single capture serves three jobs:

1. deterministic reproduction of a reported bug;
2. validation that a fix actually resolves it;
3. a checked-in fixture that keeps it fixed.

The existing **Diagnostics** dock button is unchanged and unrelated — it stays a
lightweight, privacy-safe trace a customer can paste into a bug report (see
[Relationship to the diagnostic trace](#relationship-to-the-diagnostic-trace)).

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | What is a tape for? | Deterministic reproduction, fix validation, and fixture source — one artifact, all three. |
| 2 | Playback model | Real-time playback **and** a paused time-slider with time-travel scrubbing plus single-step. |
| 3 | Tape storage & format | A `scratch/` drop zone; one JSON format read by both the replay manager and vitest. |
| 4 | Timing fidelity | Follows decision 2: real inter-packet delays during playback; the slider/step path is time-driven, and tests advance the clock synchronously. |
| 5 | Command round-trips | Capture `sendCommand` calls (LED, reset, facelet/hardware requests) for fidelity. |
| 6 | Privacy | A full tape is a solve recording (facelet states + hand motion). QA/dev-only, no upload path, visually distinct from the support trace. Accepted. |
| 7 | Gating | A separate `?dev` flag, never the Diagnostics opt-in. Diagnostics stays the customer-facing tracing button. |

## Tape format

One JSON document, schema `cubelab-smart-cube-tape-v1`. Written to
`scratch/tapes/<name>.json` by the capture path; promoted by hand to
`test/fixtures/smart-cube/<name>.json` when it should become a permanent
regression fixture.

```jsonc
{
  "schema": "cubelab-smart-cube-tape-v1",
  "capturedAt": "2026-09-08T10:07:00.000Z",
  "note": "regrip lost after 720 spin on GoCube",

  // Everything needed to put CubeLab into the same starting state before the
  // first event is replayed.
  "header": {
    "device": {
      "name": "GoCube_A1B2",
      "brand": "gocube",
      "brandName": "GoCube",
      "protocolId": "gocube",
      "protocolName": "GoCube / Rubik's Connected",
      "macAddress": null,
      "capabilities": { "orientation": true, "battery": true, "facelets": true,
                        "hardware": true, "reset": true, "led": false }
    },
    "syncMode": "PhysicalMirror",        // or "VirtualController"
    "orientationTracking": true,
    "recording": false,                  // algorithm-recording tape state
    "route": null,                       // Academy route / scramble loaded, if any
    "inputHash": "",                     // URL hash at capture time
    "settings": {                        // only replay-relevant prefs
      "autoOrbit": false,
      "regripThresholdDegrees": 65
    }
  },

  // The normalized SmartCubeEvent stream, verbatim, plus a monotonic relative
  // clock. `offsetMs` is milliseconds from the first entry; it is the single
  // source of replay timing. Original device timestamps are preserved inside
  // `event` for fidelity but are never used to schedule playback.
  "events": [
    { "offsetMs": 0,     "event": { "type": "hardware", "timestamp": 1725787620000, "orientationSupported": true } },
    { "offsetMs": 12,    "event": { "type": "battery",  "timestamp": 1725787620012, "level": 87 } },
    { "offsetMs": 20,    "event": { "type": "facelets", "timestamp": 1725787620020, "facelets": "UUUUUUUUURRR…" } },
    { "offsetMs": 340,   "event": { "type": "orientation", "timestamp": 1725787620340,
                                    "quaternion": { "x": 0, "y": 0, "z": 0, "w": 1 },
                                    "coordinateFrame": "gocube-wire" } },
    { "offsetMs": 512,   "event": { "type": "move", "timestamp": 1725787620512,
                                    "move": "R", "face": 1, "direction": 0,
                                    "localTimestamp": 512, "cubeTimestamp": 512 } }
  ],

  // Outbound commands CubeLab issued during capture, on the same clock. Replay
  // asserts the app re-issues an equivalent command at roughly the same offset;
  // it does not feed them back into the app.
  "commands": [
    { "offsetMs": 5,   "command": { "type": "REQUEST_HARDWARE", "timestamp": 1725787620005 } },
    { "offsetMs": 5,   "command": { "type": "REQUEST_BATTERY",  "timestamp": 1725787620005 } },
    { "offsetMs": 5,   "command": { "type": "REQUEST_FACELETS", "timestamp": 1725787620005 } }
  ]
}
```

Format rules:

- `event` objects are exactly the normalized `SmartCubeEvent` union from
  `src/client/smart-cube/types.ts` — no redaction. Facelet strings are stored in
  full; a tape is only ever produced under `?dev`.
- `offsetMs` is non-decreasing. It is the only clock the replay manager reads.
- The `header` is the contract for "same starting state". Adding a field is a
  minor version bump only if replay can safely default it; otherwise bump the
  schema.
- No wall-clock time inside `events` drives anything. `capturedAt` is metadata.

## Capture

Gated behind `?dev`. When the flag is present the dock shows a **Capture
session** control next to Diagnostics (visually distinct — a red record dot, not
the neutral Diagnostics styling).

- Start: snapshot the `header` from live manager state, mode, route, and prefs;
  record `performance.now()` as the clock origin.
- While recording: every normalized event from `manager.subscribeEvents` and
  every command from `manager.subscribeCommands` is appended with
  `offsetMs = round(performance.now() - origin)`. **No ring buffer** — a QA
  scenario runs minutes, not the ~10 s the 500-entry diagnostic buffer holds.
- Stop: serialize and trigger a download to `scratch/tapes/<name>.json`, and
  keep a copy in `localStorage` under `cubelab.smartCube.tape.<name>` for
  immediate `?replay=` use.
- A visible, persistent indicator while recording; a short toast naming the
  event count and duration on stop.

Capture never uploads. There is no network path in this feature at all.

## Replay

### Live replay manager

`createReplaySmartCubeManager(tape)` in
`src/client/smart-cube/replay.ts`, implementing the full `SmartCubeManager`
interface from `types.ts`:

- `connect()` resolves immediately with a `SmartCubeDevice` built from
  `tape.header.device`; `getState()` reports `connected`.
- A scheduler walks `tape.events`, calling the event listeners at each
  `offsetMs`. Playback state: `playing`, `paused`, `seek(offsetMs)`,
  `step()` (advance to the next event), `rate` (0.25×–4×).
  - **Playing**: `setTimeout` chains on real `offsetMs` deltas divided by
    `rate`.
  - **Paused + slider**: `seek(t)` replays deterministically from the last
    keyframe. Because downstream detectors (orientation tracker, regrip,
    live-sync) are stateful, seeking *backwards* re-runs from `offsetMs = 0`
    through `t`; seeking forward continues from the current cursor. This is the
    same fold `gocube-replay.test.ts` already performs.
  - **Step**: emit exactly the next event, freeze the clock at its `offsetMs`.
- `sendCommand` / `flashLed` / `resetCubeState` record the call against an
  in-memory list so a test can assert parity with `tape.commands`; they perform
  no I/O.
- `disconnect()` stops the scheduler and emits a synthetic `disconnected`.

Injection point: `loadSmartCubeManager` in `src/client/converter.ts`
(currently `converter.ts:5439`). When `?replay=<name>` is present (and `?dev`),
resolve the tape (localStorage key or fetched `scratch/` URL) and substitute the
replay manager for `createSmartCubeManager`. Everything downstream — the
orientation tracker, regrip detection, gesture recenter, live-sync mirror,
viewport, Academy timeline — runs unmodified against real events.

### Replay UI

Under `?replay`, the dock gains a transport strip: play/pause, a scrubber over
total tape duration, step-forward, current `offsetMs` / event index, and a
rate selector. It reuses the visual language of the existing algorithm tape
scrubber where practical.

## vitest usage

Same format, no live manager. A helper drives the tape synchronously:

```ts
import { replayTape } from "../../helpers/replay-tape";
import tape from "../../fixtures/smart-cube/regrip-lost-after-720.json";

test("regrip survives a 720° spin on GoCube", () => {
  const session = replayTape(tape);        // builds the real downstream chain
  session.runToEnd();                      // advances the mock clock event by event
  expect(session.regripTokens).toEqual([ /* … */ ]);
  expect(session.issuedCommands).toMatchObject(tape.commands.map((c) => c.command));
});
```

`replayTape` constructs the same tracker/detector wiring the app uses, feeds
`tape.events` in order with the clock set to each `offsetMs`, and exposes the
observable results (regrip tokens, rendered orientation, live-sync state,
issued commands). `runTo(offsetMs)` and `step()` mirror the live manager for
time-travel assertions. Fixtures under `test/fixtures/smart-cube/` are the
promoted, permanent subset of `scratch/tapes/`.

## Relationship to the diagnostic trace

| | Diagnostics / "Copy cube trace" | Session replay |
|---|---|---|
| Audience | Customers, in bug reports | QA and developers |
| Gate | `localStorage` opt-in, always available | `?dev` flag only |
| Contents | Redacted — `faceletCount` only, derived entries, 500-entry ring buffer | Full normalized stream incl. facelets, no cap |
| Timing | Wall-clock ISO per entry | Monotonic `offsetMs` |
| Purpose | Describe what happened | Re-run what happened |
| Upload | Never automatic; user pastes text | No network path at all |

The diagnostic trace stays exactly as it is. Replay is a separate capture path
with its own format and its own gate. A future convenience — importing a
diagnostic trace as a degraded, orientation-only tape — is possible but out of
scope here.

## Build sequence

1. `cubelab-smart-cube-tape-v1` type + a validator, in `src/client/smart-cube/`.
2. `replayTape` test helper + first hand-authored fixture (port
   `gocube-yxz.json` to the new format as the proof).
3. `createReplaySmartCubeManager` with play/pause/seek/step.
4. `?replay=` wiring in `loadSmartCubeManager` behind `?dev`.
5. **Capture session** control behind `?dev`, download + localStorage.
6. Replay transport UI in the dock.
7. Contract-test assertions (`test/web-ui-contract.test.mjs`) for the `?dev`
   gating and the schema string.
