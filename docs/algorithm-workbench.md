# Algorithm Workbench

<!-- markdownlint-disable MD013 -->

Research date: 2026-09-01

## Scope

`src/Move/MoveTransform.res` transforms the same located algorithm AST used by parsing,
execution, compatibility analysis, and playback. Generated nodes use synthetic source
locations because their text no longer occupies the original input span. Serialization
always emits explicit, modern notation: uppercase `Rw` wide moves, numbered inner
layers, `x/y/z` rotations, direct repetition suffixes, and one space between units.

The Setup panel keeps only its state and Moves inputs open by default. Its native
**Expand Setup options** disclosure reveals notes, solvers, transforms, compatibility,
and quick-load presets on demand; closing it never changes the current setup or moves.

## Transformations

### Invert

Inversion reverses the top-level sequence and inverts each unit. Atomic move amounts
change sign, while a structured unit keeps its body and negates its repetition amount.
For example, `[R, U]` becomes `[R, U]'` and `(R U)2` becomes `(R U)2'`. Pauses and block
comments are state-neutral leaves and move with their sequence position when reversed.

### Simplify

Simplification first performs the executor's bounded composite expansion. It then
collects consecutive moves around the same physical axis, combines identical layer
ranges modulo four, and removes identities. This permits exact commuting cancellations
such as `R L R'` to become `L`, while never commuting turns across a different axis.

The simplified result is intentionally flat. Pause and block-comment nodes are retained
as hard boundaries so a transform cannot move a turn across an editor annotation.
This is an exact cube-group rewrite, not a heuristic move-count optimizer: overlapping
but differently spelled layer ranges are not synthesized into new range expressions.

### Factor structure

**Factor structure** is available for every supported cube size. It recognizes contiguous
move runs of the forms `A B A' B'`, `A B A'`, and repeated `A` blocks, and writes them
as `[A, B]`, `[A: B]`, and `(A)n`, respectively. `A` and `B` can themselves contain
multiple moves. For example, `2L 2D' 2L' 2D x y` becomes `[2L, 2D'] x y`, while
`M E' M' E x y` becomes `[M, E'] x y` on a 3×3. Comments and pauses stay hard
boundaries, so factoring cannot silently move a turn through an annotation.

### Optimize regrips

**Optimize regrips** is an opt-in notation transform for every supported cube size. It
preserves the exact final cube state while applying local identities that exchange
opposite face turns for their size-aware complementary inner-layer range plus visible
`x/y/z` regrips. On a 3×3 that range is `M`, `E`, or `S`; on a 4×4 it is, for example,
`2-3Lw`. It is deliberately separate from **Try to shorten**: it does not expand that
bounded face-turn search and does not claim an HTM- or STM-minimal result.

For example, CubeLab rewrites:

```text
L' R B' F D' U L' R
```

as:

```text
M E' M' E x y
```

This is four non-rotation turns and two whole-cube regrips, not simply “four free
moves.” The transform keeps rotations explicit, moves them to the end of each
uninterrupted move run, and uses the canonical representative of the resulting cube
orientation. Pauses and comments remain boundaries.

### Expand regrips

**Expand regrips** is the outer-face companion to **Optimize regrips** for every
supported cube size. It accepts `M/E/S` or CubeLab's canonical unfolded `2L/2D/2F`
forms on 3×3, and the full `2…n−1` inner-layer ranges emitted for larger cubes, plus
visible whole-cube rotations. It rewrites them as an equivalent outer-face sequence;
it is a deterministic notation expansion, not a general solver.

### Mirror

Three involutive reflections are available:

| Plane | Face exchange | Examples |
| --- | --- | --- |
| Left/right (`LR`) | `R ↔ L` | `R → L'`, `U → U'`, `M → M` |
| Front/back (`FB`) | `F ↔ B` | `F → B'`, `R → R'`, `S → S` |
| Up/down (`UD`) | `U ↔ D` | `U → D'`, `F → F'`, `E → E` |

Reflections reverse chirality. Face turns therefore reverse direction after their face
mapping; slice and rotation directions follow the reflected axial vector. Applying the
same mirror twice returns the original canonical algorithm.

### Rotate notation

Coordinate-frame rotation relabels every nested move under `x`, `y`, or `z`. The UI's
positive `y` shift follows the common grip-oriented mapping `R → F → L → B → R`, so
`R U R'` becomes `F U F'`. In the fixed world-frame executor this relabeling is
equivalent to `y' A y`. Slice and whole-cube rotation axes are transposed with their
physical direction, rather than renamed by a face-only lookup table.

### Practice scramble

The generator produces a convenient practice setup for testing the converter and viewport.
For 2×2, it uniformly samples one of the 3,674,160 canonical states and renders a
replay-verified inverse scramble. Its drill selector can choose **Any**, exactly **3 HTM**,
exactly **4 HTM**, or **5+ HTM** optimal distance (the default). For 3×3 through 5×5 it
uses 25, 45, and 60 random turns respectively; larger sizes include supported wide layers.
Candidate selection excludes the previous axis, so same-axis redundancies cannot be
adjacent, and every generated string is accepted by the size-aware parser.

This is not an official or uniformly random-state scramble generator. WCA Regulation
4b requires competition sequences to be generated by a current official WCA scramble
program. Regulation 4b3 requires uniform random-state sampling for most events, with
listed exceptions; the WCA currently distributes TNoodle for that purpose:

- [WCA Regulations, Article 4](https://www.worldcubeassociation.org/regulations/#4b)
- [Official WCA scramble programs](https://www.worldcubeassociation.org/regulations/scrambles/)

The local generator uses `Math.random()` and is labeled **Practice scramble** throughout
the interface. It must not be used to prepare official competition scrambles.

Quick load always writes the generated algorithm into **Setup**, so the target remains
visible, editable, and shareable. Its presentation then depends on smart-cube mode:

- In normal **physical mirror** mode, CubeLab continues to show the actual physical cube.
  A smart cube cannot be scrambled remotely, so the dock instructs the user to turn it to
  match the Setup algorithm.
- With **Controller mode** active on a 3×3, the same target is assigned immediately to the
  virtual cube. The physical cube remains a turn and orientation controller, and its
  facelets cannot overwrite that virtual scramble.

## Tape playback and smart cubes

The Move tape's forward and reverse Play controls always animate the virtual tape; a
connected smart cube never changes their meaning. **Guide turns with smart cube** is a
separate, opt-in tape control. It pauses automatic playback, highlights the next tape
turn, and advances only when the connected cube reports the expected turn. Pause,
Escape, Record, disconnecting, or starting automatic playback exits guidance.

Guidance accepts move-reporting 2×2 and 3×3 tapes. It intentionally does not require
facelets: move-only devices are useful turn input, and the connected-device capability
badge states what the driver can verify. Recording remains a distinct 3×3 capture
feature that appends physical turns to **Moves**.

When gyro regrips are recorded, CubeLab retains the visible `x`, `y`, or `z` token and
projects later hardware face packets through the accumulated regrip frame before
appending them. Device face labels remain fixed to the hardware; tape face labels must
follow the virtual cube, so this projection keeps the recording and virtual state in
the same frame.

While a recording (or its final tape view) owns presentation, device-orientation camera
tracking is suspended. The tape rotation is therefore rendered once, rather than once
in cube state and again as a camera pose.

Recorded face turns and gyro regrips use the normal 120 ms tape-turn animation in their
arrival order. Capturing still appends the token to **Moves** immediately; animation
only controls the virtual presentation.

## Smart-cube diagnostics

The smart-cube dock has **Diagnostics off** by default. Turning it on records at most
500 local diagnostic records for the current browser session. This includes every
normalized received smart-cube event and each transport command CubeLab sends; the
ring buffer retains the newest records when a high-rate gyro stream exceeds its limit.
CubeLab never uploads them.

After a cube connects, CubeLab requests its hardware/status, battery, and facelet
state. Cubes with verified LED control also receive a short green connection flash;
all of these commands appear in the diagnostic trace when Diagnostics is enabled.
For GoCube and Rubik's Connected, that flash is the device's bare NUS `0x41` (`A`)
command, which performs its fixed three-flash effect (the protocol has no colour or
duration arguments).
**Copy cube trace** produces a small JSON report that a customer can paste into an issue
or support request. It contains the cube brand, orientation measurements, received-event
metadata, and sent commands, but not facelets, cube state, Bluetooth addresses, or the
device name.
Copy first uses the browser clipboard API and then falls back to a temporary selected
text field when that API is unavailable or permission is denied.
Turning Diagnostics off clears the captured trace immediately, providing an explicit
opt-out.

Gyro view does not mirror the cube's live orientation. Raw IMU orientation is noisy and
loose enough (real handling routinely shows 10–30° of sample-to-sample sensor jitter,
even mid-turn on a face that never left the hand) that continuously mirroring it made
the display feel drifty regardless of how aggressively later corrections tried to chase
it down — an entire ring-buffer/nearest-cardinal-snap correction system existed solely
to fight that drift, and still couldn't make continuous mirroring feel solid. The raw
stream supplies the virtual lock-in stabilizer rather than directly driving the cube.

### Current magnetic-detent gyro mode

The live cube mirrors its gyro orientation continuously with active magnetic lock-in and
slow drift compensation. The exact 24-pose cube rotation group is used to select the nearest
cardinal detent:
- Inside 35° of that pose, a strong continuous blend pulls the virtual cube toward the lock,
  snapping fully into exact cardinal alignment within the inner 4° core.
- Within the well, a persistent gyro drift offset continuously slews toward the magnets at ~2°/s,
  gradually absorbing IMU bias and hand deviations at rest so the resting cube lands cleanly at 0.0°.
- Outside the 35° well, motion remains strictly 1:1 with the sensor.
The detent and drift compensation run continuously whether or not the diagnostics HUD is enabled.

Regrip events use a separate 65° threshold from the last confirmed raw baseline. Crossing
it selects the nearest cardinal cube pose, emits clockwise `x/y/z` notation (the positive
sensor quaternion direction is counter-clockwise), and immediately rebases. There is no
capture-circle correction or lockout, so reversals and mixed-axis regrips remain valid.
The user-facing notation token is deliberately separate from the sensor/cardinal rotation
stored for physical-face remapping; deriving the latter from inverted notation reverses
later moves after a `y` regrip.

Diagnostics shows the adjusted orientation data in the dial graph (needle and center degree
readout indicating residual to the virtual lock), while the text below details the raw gyro
quaternion and degrees, accumulated drift offset degrees and quaternion, and instantaneous
magnetic detent pull.

Live regrip detection (`observeThresholdOrientation`) fires as soon as the cumulative
rotation from the last confirmed pose crosses `regripThresholdDegrees` (65° by default,
see the profile below) — no dwell, no tight alignment gate. Every pair of the cube's 24
legal poses is exactly 90° apart with a 45° Voronoi boundary between neighbours, so once
a delta is past 65° it is
already unambiguously closer to the correct neighbour than to any other pose, however
imprecisely the hand actually lands — precision only has to be good enough to tell two
90°-apart poses apart, not to hit one exactly. An earlier version required three
consecutive samples within 5° of a pose before confirming, which made real (if merely
imprecise) regrips go undetected or land only after a visible delay; a real GoCube
capture of three deliberate 720° single-axis spins (`test/fixtures/gocube-yxz.json`)
confirmed detection would silently miss or lag depending on exactly how the hand
settled. The threshold detector catches every ~90° of real travel in that capture
immediately, correctly grouped by axis in sequence, with no dwell latency. The trade:
since it fires on the crossing sample rather than waiting for stillness, the locked
pose can still be mid-settle if the hand keeps adjusting afterward, leaving a real
(bounded) residual until the next regrip corrects it — bounded settle-in error instead
of an unbounded chance of missing the regrip entirely.

`regripThresholdDegrees` (and the diagnostics gauge's drift rate, below) live in
`public/smart-cube/regrip-profile.v1.json`, keyed by brand the same way the removed
motion-profile registry was, and validated by
`src/client/smart-cube/regrip-profile.ts` (`parseRegripProfileRegistry`). It loads once
per connection and falls back to the built-in default (65°) if the fetch fails or the
file is malformed — a bad or missing profile degrades to the hardcoded value rather than
breaking detection. This is deliberately **not** the same tuning knob as the old deleted
ring-buffer motion profile: that one configured a continuous correction system that no
longer exists; this one only configures the threshold detector described above.

Important: the tracker's baseline rebases to the *raw triggering sample* on confirm, not
to the mathematically exact 90° cardinal step. That was tried and reverted — rebasing to
the exact step let leftover imprecision from an imprecise regrip get silently baked into
the reference frame forever, and replaying it against the real GoCube capture produced
spurious tokens on the wrong axis throughout both 720° spins. Snapping to the actual
measured sample is what stops small heading bias from accumulating across regrips (the
same reasoning the recording tracker already relied on), at the cost of the bounded
residual described above.

The **recording** tracker (`observeStableOrientation`, used only while capturing a
physical-mirror recording) keeps the original three-sample/5° confirm: a permanently
saved move list benefits more from precision than from instant reaction, and a
deliberate recording regrip is usually held still on purpose. Between confirmed live
regrips the displayed orientation does not move at all — this is the same model
tutorial mode already used for coached rotations (detect the expected regrip, animate
once, then hold), just generalized to whichever regrip actually happened rather than a
specific expected one.

When a regrip confirms, the viewport reconciles to the new cardinal target in one call —
`viewport.reconcileDeviceOrientation(quaternion, target, frame)` — which animates the
display correction to its new value over ~180ms rather than snapping instantly, so a
correctly identified regrip doesn't feel like a jump cut. Nothing else ever touches
device orientation while tracking is active, so the display rests exactly where that
call left it until the next confirmed regrip.

**Recenter gyro view** resets the discrete tracker fresh (baseline at the current
sample, running orientation at identity) and the viewport's device-orientation
base/correction to match, so nothing keeps showing a pre-recenter value. Toggling
orientation tracking off and back on recreates the discrete tracker the same way (fresh,
at identity) the next time an orientation sample arrives, for the same reason: the
tracker’s running orientation and the viewport’s displayed pose must never be able to
disagree about "where is the cube now," since there is exactly one of each and only
confirmed regrips ever change either one.

A rapid physical outer-face turn followed by its reversal (for example **R then R′**)
is a virtual-cube alignment gesture, not the same reset. It works on **U/R/F/D/L/B**.
It first rotates the flicked physical face into virtual **Right** by adjusting the
virtual offset. In a second step it applies the current raw gyro pose and its live drift
offset in that rotated frame, then snaps to the nearest legal cardinal pose to choose
**Up**. The result is stored as the new persistent virtual orientation; it is not treated
as the brief visual correction used by the ordinary Recenter button. This ordering
matters at a 45° boundary: the drift offset is part of the Up decision, rather than an
adjustment applied after a centre colour has already been chosen. Phase two measures
gyro movement from the last accepted virtual regrip, rather than the initial viewport
baseline, so that an already-recorded `y` regrip is not accidentally applied twice.
Each accepted regrip also rebases the viewport and live gauge to that same accumulated
virtual orientation. This keeps non-commuting sequences such as `z` then `y` in the
same order everywhere, rather than allowing the view and tracker to diverge.

For hardware diagnosis, turn **Diagnostics** on before reproducing a turn. Diagnostic
records are captured only while that control is on; turning it off immediately clears
the local trace and stops all further diagnostic logging.

While **Diagnostics** is on, a fixed 2D gauge in the viewport's corner shows the
virtual lock-in state: a hexagon with a spoke for each of the six quarter-turn directions
(`x`, `x'`, `y`, `y'`, `z`, `z'`), a dashed ring at the confirm threshold, and a needle
showing the signed residual from the drift-corrected orientation to its current cardinal
lock. This is deliberately a flat, screen-fixed HUD rather than a 3D arrow in the scene:
once the cube itself is rotating, a 3D debug vector competing for the same space is hard
to read at a glance, where a fixed gauge stays legible regardless of camera angle or cube
motion.

At rest, the residual is 0° with the needle at the centre. As the cube rotates toward a
new regrip, the needle extends toward the raw direction and the dashed ring marks the
confirm threshold (65°). Crossing it advances the lock-in by the full cardinal 90° step;
it does **not** reset the detector's raw sample into the gauge. Thus an `x` sample at 65°
immediately becomes an `x'` residual of 25° (`65° − 90°`). The virtual correction then
drifts that residual to zero at the 2°/s offset rate. The detector still rebases to
the raw triggering sample internally, solely to prevent repeated threshold events; that
rolling detector baseline is never used for the gauge.

The gauge and virtual correction consume the same raw IMU packet as the threshold
detector. They must not use a separately smoothed packet: smoothing introduces lag, which
can make an ordinary rotation appear more than 90° away from a lock that the detector has
already advanced.

The first smart-cube event prints `trace enabled`. If it does not, reload after setting
the key. A Vite `504 Outdated Optimize Dep` means the development client is stale: use
a hard reload or restart the development server before reproducing the issue.

## Browser integration

The action ribbon below the input exposes **Invert**, **Simplify**, **Factor structure**,
size-aware **Optimize regrips** and **Expand regrips**, all three mirror
planes (**L/R**, **F/B**, and **U/D**), all three coordinate rotations (**x**, **y**, and
**z**), and **Practice scramble**. Algebraic actions are enabled only when the
current input is a recognized algorithm; state codecs cannot accidentally be rewritten
as moves. Each click reparses the current textarea synchronously, applies the pure
transform, serializes the result, and switches to modern explicit notation before the
normal conversion/playback update. This avoids stale-frame transformations while typing
and prevents Ruwix post-face digits from changing the meaning of canonical `F2` output.

The practice action sits in the shared **Quick load** row and remains available for every
supported size; it is not grouped with algebraic transforms. Transform output is
bounded to 20,000 characters, matching the shareable-input import limit; oversized
results fail visibly without replacing the original source.
