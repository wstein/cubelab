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

## Manual workspace

The **Timer** workspace exposes the manual engine through Space and touch
controls. The first press starts inspection; the next press must be held for
300 ms before release starts the solve; a subsequent press stops and records
it. The workspace supplies 20-move practice scrambles and provides local `+2`,
`DNF`, and delete controls. It can also use an enabled, locally running TNoodle
server for validated, prefetched 3×3 batches. If that server is unavailable or
returns an invalid response, the next scramble transparently uses the local
practice generator instead.

## Smart Controller mode

**Controller mode** is an explicit smart-cube dock toggle for high-repetition
screen-based drills. It keeps the physical and virtual states separate. A new
Timer scramble or Academy instant drill assigns the virtual state immediately;
each face packet is projected through accumulated gyro regrips and applied to
that state. Facelet reports never overwrite it.

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
