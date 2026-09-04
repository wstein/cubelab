# Smart cube transport

`createSmartCubeManager()` is CubeLab's Step 1–2 boundary for physical smart cubes. It wraps
the commit-pinned `smartcube-web-bluetooth` transport and exposes normalized smart cube events.

Supported protocol families:

- GAN Gen1–Gen4, including MAC-derived AES variants
- GiiKER / Mi Smart 20-byte cubie-state frames
- GoCube and Rubik's Connected Nordic UART frames
- MoYu MHC and MoYu32; AiCube models using GAN Gen2 framing are identified as MoYu

The manager must be connected from a user gesture because Web Bluetooth device selection cannot be
opened programmatically. It reports explicit `unavailable`, `connecting`, `connected`,
`disconnecting`, `disconnected`, and `error` phases. `reconnect()` intentionally opens the browser
chooser again; the transport does not retain a public `BluetoothDevice` handle.

## Connection latency

GoCube and Rubik's Connected names use CubeLab's direct Nordic-UART path. It reports
**connected** as soon as GATT notifications are subscribed; facelets, hardware details, and
battery are requested asynchronously afterward. The browser console logs chooser, GATT, service,
notification, and first-valid-packet timings, while the dock reports the notification-ready time.

Normal connections deliberately disable MAC/address probing. That recovery is necessary only for
some encrypted cubes and can add many seconds of advertisement and proof waits. If an encrypted
device cannot establish its MAC normally, the dock offers **Encrypted-cube recovery**, an explicit
retry that may request a MAC address. It is never part of the normal GoCube path.

Academy coaching adds a strict recovery stack above the transport. A wrong face turn is never
silently folded into the lesson: CubeLab asks for its inverse, stacks any further slips in
last-in-first-out order, and resumes the original expected move only after the physical cube is
realigned. Pure move inversion, canonical reductions, and LIFO deviation recovery are implemented
in ReScript (`src/SmartCube/SmartCubeDeviation.res`). Visual feedback is always available;
synthesized sound is user-controlled.

The move tape shows this stack as a temporary red sequence block. Deviations appear to the left
of a bright physical-cube cursor and their required inverses appear to the right. Each correct undo
removes its deviation/inverse pair; adjacent turns are reduced canonically (`R R` → `R2`,
`U U'` → nothing). The verified lesson timeline itself is never rewritten.

Hardware light feedback is capability-gated. The manager calls a transport-provided `flashLed`
writer when one exists, but the currently pinned `smartcube-web-bluetooth` GoCube connection does
not expose such a command. CubeLab therefore does not send speculative raw GATT packets.

Step 3 consumers subscribe to normalized events rather than importing the vendor transport. The
viewport integration lazy-loads this module from the Connect button, records physical moves in the
algorithm editor, renders live facelets through every converter, and advances Academy timelines
only when the expected physical move matches. Gyro orientation tracking activates automatically on
connect whenever the device reports the capability; the orientation button in the dock remains
available to opt back out.

The optional **Controller mode** deliberately does not mirror facelets. It treats the device as
a turn encoder and gyro: virtual state is assigned by a Practice or Timer scramble, or an Academy drill,
hardware face turns apply directly via their fixed face indices, the gyro drives 3D viewport orientation,
and physical facelet events are ignored until the user returns to physical mirroring. A controller state
has rendering precedence even while a normal workspace update is pending, so a stale physical report
cannot repaint an instant virtual scramble. In contrast, physical-mirror practice scrambles only set the
Setup target; the user must turn the real cube to match it. This keeps high-repetition screen drills from
corrupting normal live state tracking.

Three-by-three slice, wide, and single-inner-layer lesson moves are matched through the outer-face
packets that the hardware can actually report (`M = x' R L'`, `Rw = x L`, and their axis variants).
Composite packets may arrive in either face order; half turns may arrive directly or as two quarter
turns in either direction. After the first quarter packet, the viewport holds that intermediate
state, the tape expands `R2` to `R R` (or `R' R'`), and the guide shows only the remaining quarter.
Their implicit physical reorientation is carried into later hints.
Vendor gyro samples are tagged by hardware frame (e.g. GoCube wire and GAN wire where `+X=Red, +Y=Blue, +Z=White`).
Relative orientation tracking follows a verified 3-step pipeline:
1. **World delta convention:** Computes the relative orientation delta in raw $\mathrm{SO}(3)$ (`current * base.conjugate()`) rather than applying coordinate reflections to raw quaternions, preventing axis cross-coupling and gimbal distortion across non-identity zeroed poses.
2. **Direction alignment:** Inverts rotation direction for sensors that rotate in reverse relative to the hand.
3. **Change of basis:** Re-expresses the calibrated rotation in canonical viewport axes (e.g. `basis = -x, +y, -z` 180° $Y$-yaw mounting transformation for GoCube).
This ensures pitch, yaw, and roll map 1:1 to Red ($+X$), White ($+Y$), and Green ($+Z$) without skew or drift across 0°, 90°, 180°, and 270° regrips.

Whole-cube `x`, `y`, and `z` rotations remain first-class lesson steps. They animate all cubies in
the viewport and count in ETM, but not HTM. With orientation tracking active, coaching measures the
requested axis and direction from the IMU sample captured when the hint appears; half turns are
accepted in either direction. Without an active gyro, the regrip is demonstrated automatically at
half the selected move speed; `x2`, `y2`, and `z2` are visibly staged as two quarter regrips. With
gyro feedback, crossing the first quarter similarly changes the hint to the remaining quarter.
Later face packets are interpreted in the resulting fixed physical
frame while the viewport remains in the rotation-aware lesson frame. Reported face moves are
translated back into that lesson frame before animation and recovery rendering, so neither a
matched move nor a slip can visually undo an earlier regrip.

The public boundary remains small:

```ts
const cube = createSmartCubeManager();
cube.subscribeEvents((event) => {
  if (event.type === "move") viewport.animateTurn(event.move);
});
await cube.connect(); // call inside a click handler
```

Do not add independent AES, XOR, or packet parsing in UI code. Protocol generations are incompatible,
and encrypted devices require validated MAC-derived keys before their events are trusted.
