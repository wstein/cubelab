# Smart cube session replay — the mock device

Manual QA of the smart-cube integration needs a physical Bluetooth cube in hand:
orientation tracking, regrip detection, gesture recenter, live-sync mirroring,
and Academy coaching can only be exercised by turning a real device. A reported
bug is then hard to reproduce, hard to confirm fixed, and impossible to guard
against regression.

The **mock device** removes the cube from that loop. It is a third
`SmartCubeManager` implementation whose "connect" opens a *tape picker* instead
of the Web Bluetooth chooser, then replays a recorded session as if a real cube
were streaming. Everything downstream — `handleSmartCubeEvent`, the orientation
tracker, regrip detection, live-sync, the viewport, Academy timelines — treats
the manager as an opaque event source and runs unmodified.

One recorded **tape** serves three jobs:

1. deterministic reproduction of a reported bug;
2. validation that a fix actually resolves it;
3. a checked-in fixture that keeps it fixed.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | What is a tape for? | Deterministic reproduction, fix validation, and fixture source — one artifact, all three. |
| 2 | Playback model | Real-time playback **and** a paused time-slider with time-travel scrubbing plus single-step. |
| 3 | Storage & format | Bundled tapes served from `public/smart-cube/tapes/`; `scratch/tapes/` is the staging dir. One JSON format read by the mock device and vitest. |
| 4 | Timing fidelity | Real inter-packet delays during playback; the slider/step path is time-driven; tests advance the clock synchronously. |
| 5 | Command round-trips | Capture `sendCommand` calls (LED, reset, facelet/hardware requests) for fidelity. |
| 6 | Privacy | A full tape is a solve recording (facelet states + hand motion). Full capture and the mock device are QA/dev-only; no upload path. |
| 7 | Gating | The mock device, full capture, and imported customer traces are all behind a separate `?dev` flag — never the Diagnostics opt-in. |
| 8 | Customer trace vs dev tape | **One schema, two profiles.** The Diagnostics button emits the same format as `?dev` capture, only redacted. Any diagnostic trace a customer sends is a valid (degraded) replay tape. |
| 9 | Contents | Not just raw API events + commands. The tape also records the **higher-level triggers CubeLab generated** — regrip x/y/z detection, gesture recenter, deviation recovery, live-sync decisions — as an expected-output baseline for error analysis and regression diffing. |
| 10 | Entry point | A dedicated **mock page** at `/dev/mock/`, built as a mode of `index.astro` (like `player.astro`). The route is the gate — no `?dev` checks scattered through the dock, and it is kept out of nav, the sitemap, and the service-worker precache. `?dev&replay=<name>` on the normal page stays as a one-off shortcut. |

## One format, two profiles

A single schema, `cubelab-smart-cube-tape-v1`, with a `profile` field. Two
producers write it:

| | `profile: "diagnostic"` | `profile: "full"` |
|---|---|---|
| Producer | Diagnostics dock button → "Copy cube trace" | **Capture session** control, `?dev` only |
| Audience | Customers, in bug reports | QA and developers |
| Gate | `localStorage` opt-in (`cubelab.smartCube.diagnostics`) | `?dev` flag |
| `facelets` event payload | redacted to `{ sha256, length }` | full sticker string |
| Buffer | last N minutes (ring buffer, larger than today's 500 entries) | unbounded for the session |
| Upload | never automatic; user pastes text | no network path at all |
| Replayable by the mock device | yes — orientation / regrip / gesture flows; state-dependent panels degrade | yes — everything |

Both profiles carry the full `header`, the full `input` event stream (subject to
redaction/buffer above), all `command` entries, and **all `derived` trigger
entries** — the derived layer is the diagnostic value and is never redacted.

A `diagnostic` tape with redacted facelets cannot drive `live-sync`,
`Sync state`, `Re-route`, or Academy mirroring; the transport UI marks those
panels "unavailable — redacted capture" rather than failing.

## Tape format

One JSON document. Bundled QA tapes live at `public/smart-cube/tapes/<name>.json`
and are indexed by `public/smart-cube/tapes/index.json`. Captures land in
`localStorage`. `scratch/tapes/` is a human staging dir; promotion to a permanent
fixture is a copy into `public/smart-cube/tapes/` and `test/fixtures/smart-cube/`.

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
    "inputHash": "",                     // URL hash at capture time (route + settings live here)
    "startState": null                   // facelets to seed the virtual cube; null = solved
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
  //   "state"   a mid-session change to a header field (mode, tracking,
  //             recording) so the replay does not diverge after a toggle.
  //
  // Original device timestamps stay inside `event` for fidelity but never
  // schedule playback.
  "timeline": [
    { "offsetMs": 0,   "kind": "input",   "event": { "type": "hardware", "timestamp": 1725787620000, "orientationSupported": true } },
    { "offsetMs": 5,   "kind": "command", "command": { "type": "REQUEST_HARDWARE", "timestamp": 1725787620005 } },
    { "offsetMs": 20,  "kind": "input",   "event": { "type": "facelets", "timestamp": 1725787620020, "facelets": "UUUUUUUUURRR…" } },

    { "offsetMs": 340, "kind": "input",   "event": { "type": "orientation", "timestamp": 1725787620340,
                                                     "quaternion": { "x": 0, "y": 0, "z": 0, "w": 1 },
                                                     "coordinateFrame": "gocube-wire" } },
    { "offsetMs": 690, "kind": "derived", "trigger": "virtual-regrip",
      "in":  { "coordinateFrame": "gocube-wire" },
      "out": { "notationTokens": ["y"], "sensorFrameTokens": ["y"] } },

    { "offsetMs": 512, "kind": "input",   "event": { "type": "move", "timestamp": 1725787620512,
                                                     "move": "R", "face": 1, "direction": 0,
                                                     "localTimestamp": 512, "cubeTimestamp": 512 } },
    { "offsetMs": 512, "kind": "derived", "trigger": "live-sync-move",
      "in":  { "physical": "R" },
      "out": { "expected": "R", "verdict": "accepted", "reduced": null } },

    { "offsetMs": 4200, "kind": "state", "field": "syncMode", "value": "VirtualController" }
  ]
}
```

Format rules:

- `input.event` is exactly the normalized `SmartCubeEvent` union from
  `src/client/smart-cube/types.ts`. In `diagnostic` profile a `facelets` event's
  payload is `{ sha256, length }`; every other event type is carried verbatim.
- `offsetMs` is non-decreasing. It is the only clock the mock device reads.
- `derived` entries record `{ trigger, in, out }` — the trigger name, the inputs
  CubeLab acted on, and the decision it produced. They document the past run;
  they are never fed back into the pipeline.
- `schema` and `profile` are required; unknown fields are ignored. The feature
  is unshipped, so there is no legacy tape shape to accept — `validateSmartCubeTape`
  rejects anything that is not `cubelab-smart-cube-tape-v1`.

### Derived trigger catalogue

A stable, extensible set of `trigger` names, each mapping to an existing decision
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

Adding a trigger name is a minor, backward-compatible change: older tapes just
have fewer `derived` entries to diff.

## Capture

All capture is local. There is no network path in this feature.

### Diagnostic profile — the Diagnostics button (existing, extended)

The Diagnostics dock button keeps its behaviour: opt-in, `localStorage`, cleared
on toggle-off, nothing auto-uploaded. Changes:

- "Copy cube trace" emits `cubelab-smart-cube-tape-v1` with `profile:
  "diagnostic"`. The old `cubelab-smart-cube-diagnostic-v1` shape is dropped
  outright — no migration, no dual read.
- The existing `virtual regrip`, `gyro orientation`, and `gyro view recentered`
  trace entries become `derived` entries under the catalogue names; the
  remaining triggers are added.
- `input` entries cover the whole normalized stream, with `facelets` redacted to
  a hash.
- `command` entries are added.
- The ring buffer grows from 500 entries to a duration-based cap.

### Full profile — the Capture session control (`?dev`)

When `?dev` is present the dock shows **● Capture session** next to Diagnostics,
visually distinct (record dot, not the neutral Diagnostics styling).

- Start: snapshot `header` from live manager state, mode, prefs, and the URL
  hash; record `performance.now()` as the clock origin.
- While recording: every normalized event, every command, every derived trigger,
  and every header-field change is appended with
  `offsetMs = round(performance.now() - origin)`. No buffer cap.
- Stop: prompt for a name, write `localStorage[cubelab.smartCube.tape.<name>]`,
  and download `<name>.json` for promotion to `scratch/tapes/`.
- Persistent indicator while recording; a toast with entry count and duration on
  stop.

## Mock device manager

`createMockDeviceManager({ catalogue, pickTape })` in
`src/client/smart-cube/replay.ts`, implementing the full `SmartCubeManager`
interface plus the replay transport surface:

```
connect()      → tape = await pickTape(catalogue)      // this is the "chooser"
               → inner = createReplaySmartCubeManager(tape)
               → forward inner state / events / commands to our listeners
               → publishState({ phase: "connected", device: tape.header.device })
disconnect()   → tear down inner, publish disconnected
reconnect()    → re-open the picker
refresh / resetCubeState / flashLed  → recorded on inner for parity assertion; no I/O
+ getReplayState / play / pause / seek / step / setRate  → delegate to inner
```

`createReplaySmartCubeManager(tape)` stays the pure engine (already implemented):
an in-memory `SmartCubeManager` with no I/O, driven by a validated tape, so its
event timing is reproducible in the app and under fake timers.

Injection: `loadSmartCubeManager` (`converter.ts`) reads a `data-mock` flag set
by the mock page. When present it builds `createMockDeviceManager`; the Web
Bluetooth path is never touched. On the normal page `?dev&replay=<name>` still
pre-selects a tape and skips the picker.

## The mock page

`/dev/mock/` → `src/pages/dev/mock.astro`, a thin wrapper:

```astro
---
import Index from "../index.astro";
---
<Index initialMock={true} initialPlayer={true}
       pageTitle="CubeLab Mock Device"
       metaDescription="QA-only smart-cube session replay stage." />
```

`index.astro` gains `initialMock?: boolean`, which renders a `<meta
name="robots" content="noindex">`, sets `data-mock` on the controller root, and
unhides the QA panel in `CubeViewport.astro`. The route is **not** added to the
nav, `public/sw.js` precache, or any sitemap.

Building on player mode gives a full-size viewport with no converter chrome.
Crucially it reuses the entire real downstream pipeline — `handleSmartCubeEvent`,
the orientation tracker, regrip detection, live-sync, Academy, the viewport
wiring — because that is exactly what a replay must exercise. No parallel
rendering or event-handling code.

### QA panel

Shown only in mock mode, beside the viewport:

- **Session** — loaded tape name, `full` / `diagnostic` badge, device, duration,
  event count; **Choose session…** / **Change session…** opens the picker.
- **Transport** — play/pause, scrubber over tape duration, step-forward, rate
  selector, `offsetMs` / entry index.
- **Event log** — a scrolling list of `timeline` entries as they fire,
  colour-coded by `kind` (`input` / `derived` / `state`), each row click-to-seek.
- **Derived diff** — live-vs-recorded trigger mismatches, updated as playback
  advances (see [Regression diff](#regression-diff)).

### Playback

- Playing: `setTimeout` chain on real `offsetMs` deltas ÷ `rate` (0.25×–4×).
- Paused + slider: `seek(t)` replays deterministically. Downstream detectors are
  stateful, so a **backward seek resets downstream state** — the mock device
  re-seeds the virtual cube from `header.startState` (or solved) and drains the
  move queue before re-emitting `input` entries from `offsetMs = 0` through `t`.
  Forward seek continues from the cursor. This is the fold
  `gocube-replay.test.ts` already performs, made safe for the app's non-idempotent
  move pipeline.
- Step: emit exactly the next `input` entry, freeze the clock at its `offsetMs`.
- `command` / `derived` / `state` entries are not emitted to the app. The
  manager exposes `expectedAt(offsetMs)` for the diff.

The existing `data-smart-cube-replay-*` dock controls (`e6289d9`) are folded
into the QA panel described above. The dock status line reads
`Mock · GoCube_A1B2 · Replay (diagnostic)`.

## Tape catalogue and picker

`pickTape` opens a `<dialog>` listing every known tape, grouped by source:

| Group | Source | Notes |
|---|---|---|
| **QA scenarios** | `public/smart-cube/tapes/*.json`, listed by `index.json` | Checked-in, curated. `index.json` rows: `{ name, note, brand, durationMs, eventCount, profile }` — enough to render without fetching each tape. |
| **My captures** | `localStorage` keys `cubelab.smartCube.tape.*` | Produced by **Capture session**. |
| **Imported customer traces** | Paste or file-drop of a "Copy cube trace" payload | Validated with `validateSmartCubeTape` (the Diagnostics button already emits the tape schema). Stored under `cubelab.smartCube.tape.imported.*` with a visible **Clear imported** action. |

Each row: note · brand · duration · event count · profile badge. Footer:
**Import file…** and **Paste trace…**. Selecting a row resolves `connect()`.

A `diagnostic` tape whose `facelets` are redacted is still listed; on selection
the transport UI disables the state-dependent panels with an inline reason.

## Regression diff

Because the tape carries the `derived` layer, replay is a differential test. As
the live pipeline runs, each newly produced trigger is matched against the
tape's `derived` entry at the same `offsetMs` / trigger name:

- **match** — silent.
- **mismatch** — shown in the transport diff panel; in tests, a failed
  assertion showing recorded `out` vs live `out`.
- **missing / extra** — a trigger the tape had that the live run did not produce
  (or vice versa), flagged at its offset.

This is what error analysis needs: a customer's `diagnostic` tape shows a
`virtual-regrip` that fired with the wrong tokens; replaying it against a
candidate fix shows the trigger now producing the right tokens at that offset.

## vitest usage

Same format, no mock manager. `test/helpers/replay-tape.ts` drives a tape
synchronously against the real downstream wiring:

```ts
import { replayTape } from "../../helpers/replay-tape";
import tape from "../../fixtures/smart-cube/regrip-lost-after-720.json";

test("regrip survives a 720° spin on GoCube", () => {
  const session = replayTape(tape);   // builds the real tracker/detector chain
  session.runToEnd();                 // advances the mock clock entry by entry

  expect(session.regripTokens).toEqual([ /* … */ ]);
  expect(session.issuedCommands).toMatchObject(
    tape.timeline.filter((e) => e.kind === "command").map((e) => e.command),
  );
  expect(session.derivedDiff()).toEqual([]);   // no mismatch vs the recorded baseline
});
```

`runTo(offsetMs)` and `step()` mirror the mock device for time-travel
assertions. `test/fixtures/smart-cube/` is the promoted, permanent subset of
`public/smart-cube/tapes/`.

## Privacy

- A `full` tape and any imported customer trace contain solve state and hand
  motion. The mock device, `Capture session`, and trace import are `?dev`-only.
- Nothing in this feature uploads. Capture writes `localStorage` and a local
  download; import reads a pasted string or a local file.
- Imported customer traces are namespaced (`…tape.imported.*`) and purgeable in
  one click.
- The customer-facing Diagnostics button, its opt-in, and its
  "never auto-upload" guarantee are unchanged.

## No migration

The feature is unshipped and traces already in the wild do not matter. There is
no `upgradeTrace()`, no dual-format read, no version negotiation. The diagnostic
writer is rewritten to emit `cubelab-smart-cube-tape-v1` directly, and the
contract test (`test/web-ui-contract.test.mjs`) is updated in the same change:
swap the `cubelab-smart-cube-diagnostic-v1` assertion for the new schema string
and add `profile` / `?dev`-gating assertions.

## Build sequence

1. **Serve path** — bundled tapes from `public/smart-cube/tapes/` + `index.json`;
   `loadReplayTape` fetches there, not `/scratch/`.
2. **Schema `profile`** — add the required field, extend `validateSmartCubeTape`
   (reject anything not `cubelab-smart-cube-tape-v1`), bound the entry count.
3. **Rewrite the diagnostic writer** — emit `cubelab-smart-cube-tape-v1` /
   `profile: "diagnostic"` directly; drop the old schema; grow the buffer.
4. **Derived sink** — one `recordDerived(trigger, in, out)` routed through the
   existing `traceSmartCubeStabilization` call sites; `timeline` gains `derived`
   and `state` entries; recorder writes one ordered `timeline[]`.
5. **The mock page** — `src/pages/dev/mock.astro`, `initialMock` prop on
   `index.astro`, `data-mock` root flag, `noindex`, kept out of nav / `sw.js`.
6. **`createMockDeviceManager`** wrapping `createReplaySmartCubeManager`, with
   `pickTape`, backward-seek downstream reset, and `expectedAt` / `derivedDiff`;
   `loadSmartCubeManager` selects it on `data-mock`.
7. **Catalogue + picker `<dialog>`** (grouped sources, Import file / Paste trace,
   Clear imported) and the **QA panel** (session info, transport, event log,
   diff); fold in the existing `data-smart-cube-replay-*` controls.
8. **Flagship test** — port `gocube-yxz.json` to the tape format, drive through
   `replayTape` against the real detectors, assert tokens + `derivedDiff() === []`;
   retire the bespoke fixture in `gocube-replay.test.ts`.
9. **Contract-test updates** for `?dev` gating, schema string, and `profile`.

## Current implementation status

Landed (`bf0bc3b`, `e6289d9`, `8fe23e6`):

- `createReplaySmartCubeManager` — the pure in-memory engine, with
  play/pause/seek/step/rate and `getIssuedCommands`. Solid.
- `createSmartCubeTapeRecorder` — monotonic `offsetMs`, no wall-clock event
  timestamps.
- `validateSmartCubeTape`, `loadReplayTape`, `replayTapeNameFromSearch`
  (`?dev`-gated, path-traversal guarded).
- `test/helpers/replay-tape.ts`, `test/fixtures/smart-cube/gocube-yxz-sample.json`.
- `?dev&replay=<name>` wiring and a raw `data-smart-cube-replay-*` transport
  strip; `● Capture session` button.

Not yet built (this document): the `profile` field and unified diagnostic
schema (steps 2–3), the `timeline[]` / `derived` / `state` model and its sink
(step 4), the `/dev/mock/` page (step 5), `createMockDeviceManager` (step 6),
the catalogue + picker + QA panel (step 7), and the flagship regression test
(step 8). Two defects in the landed code to fix along the way: `loadReplayTape`
fetches `/scratch/tapes/…` which Astro does not serve (step 1), and a backward
`seek` re-emits `move` events into the non-idempotent `smartCubeMoveQueue`
(step 6).
