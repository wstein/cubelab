# Timer architecture

The CubeLab timer is built around a pure client-side state machine. Keyboard,
touch, and smart-cube inputs feed the same engine, so timing rules remain
independent of the viewport and Bluetooth transport.

The manual state flow is `idle → inspection → holding → ready → running →
stopped`. A hold must last 300 ms before release starts the solve. Inspection
penalties are assigned at solve start: more than 15 seconds produces `+2` and
more than 17 seconds produces `DNF`.

Completed records retain raw duration, penalty, completion time, and scramble.
Session summaries calculate best, mean, population standard deviation, and
WCA-style trimmed Ao5/Ao12 values. Timer sessions are versioned JSON records in
browser storage; invalid or unavailable storage is treated as an empty session,
never as a timer failure.
