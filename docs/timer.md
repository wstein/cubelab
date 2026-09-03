# Timer architecture

The CubeLab timer is built around a pure client-side state machine. Keyboard
and touch inputs feed that engine, so timing rules remain independent of the
viewport. An opt-in smart-controller adapter uses that same boundary: the
physical cube supplies turn packets and gyro pose while its stickers and
facelets are ignored by the virtual cube.

The manual state flow is `idle → inspection → holding → ready → running →
stopped`. Virtual Controller timing adds a deliberate `covered` gate:
`idle → covered → inspection → running → stopped`. A hold must last 300 ms before release starts the solve. Inspection
penalties are assigned at solve start: more than 15 seconds produces `+2` and
more than 17 seconds produces `DNF`.

Completed records retain raw duration, penalty, completion time, and scramble.
Session summaries calculate best, mean, population standard deviation, and
WCA-style trimmed Ao5/Ao12 values. Timer sessions are versioned JSON records in
browser storage; invalid or unavailable storage is treated as an empty session,
never as a timer failure.

The Timer workspace can download its current 3×3 session as csTimer-compatible JSON,
or append a `session1` from a csTimer export. Both directions preserve scrambles, elapsed
milliseconds, `+2`, DNF, and completion ordering; export also preserves the current
CubeLab session name. Smart-cube reconstructions use csTimer's native
`move@milliseconds` solve field: CubeLab records controller-mode turns there, imports
them, and exposes **Replay** on imported/recorded solves. Controller, viewport, and
other local preferences remain local.

## Manual workspace

The **Timer** workspace exposes the manual engine through Space and touch
controls. The first press starts inspection; the next press must be held for
300 ms before release starts the solve; a subsequent press stops and records
it. The workspace supplies separate **CubeLab scramble** and **TNoodle
scramble** actions, plus local `+2`, `DNF`, and delete controls. A selected scramble is
recorded in **Setup**. In physical mirror mode a connected cube remains the displayed
physical state and must be turned manually to match; in Controller mode the requested
virtual state loads immediately and later face packets solve it. TNoodle stays disabled until the
current local URL and event have passed a successful probe in Settings. If it
becomes unavailable later or returns an invalid response, that request falls
back to the CubeLab practice generator.

### csTimer interchange

Use **Export csTimer** to download the current CubeLab session as a JSON file that
csTimer's native importer accepts. The action is disabled until the session contains a
solve. The exported session is always 3×3 (`scrType: "333"`) and includes the standard
csTimer solve tuple: penalty (`0`, `2000`, or `-1`), raw milliseconds, scramble, empty
comment, and Unix completion time.

Use **Import csTimer** to select a csTimer JSON export. CubeLab reads valid `session1`
3×3 solve entries and appends them to the current local session; it does not overwrite
that session or import csTimer settings, other sessions, comments, or non-3×3 events.
Malformed entries are ignored, and the import reports an error when no valid solve
remains.

csTimer stores a smart-cube reconstruction as the optional fifth solve item
`["R@0 U2@123 …", "333"]`. CubeLab reads and writes that form. When a solve has a
reconstruction, **Replay** loads its scramble and turn sequence into Setup and Moves so
the normal move tape can play it. Each elapsed timestamp becomes a timed pause before the
next recorded turn, so playback at **1×** preserves the recorded inter-turn delays; the
ordinary tape speed controls intentionally scale those delays. CubeLab's own
virtual-controller timer records every projected face turn with its elapsed solve timestamp
before exporting it in this field. Invalid or non-monotonic reconstruction timestamps are
rejected rather than silently replayed out of order.

## Smart Controller mode

**Controller mode** is an explicit smart-cube dock toggle for high-repetition
screen-based drills. It keeps the physical and virtual states separate. Timer
scramble selection writes the requested source into Setup and assigns its resolved state
to the virtual cube immediately. Each face packet is projected through accumulated gyro
regrips and applied to that state. Facelet reports never overwrite the controller render
or its virtual state.

During timer inspection, gyro pose continues to drive the viewport while the
first complete face packet starts the timer and is applied as the first solve
turn. Solving the virtual state records the result automatically. Leaving the
mode restores physical mirroring and clearly asks the user to sync physical
state before relying on it again.

## Timer theater

**Open arena** reuses the existing in-place full-size player layout with a
timer HUD instead of the move tape—there is no route change, renderer reset, or
Bluetooth reconnect. A covered scramble is obscured by an opaque glass mask.
Pressing Space, the normal **Inspect** button, or tapping that mask reveals the
cube and starts inspection at once. The HUD flashes and plays brief 8- and
12-second warnings; the first complete controller turn starts the solve. Academy remains
untimed by default, with its optional **WCA drill** toggle enabling the same
cover-and-inspection flow.
