# Smart cube transport

`createSmartCubeManager()` is Cube Rosetta's Step 1–2 boundary for physical smart cubes. It wraps
the commit-pinned `smartcube-web-bluetooth` transport and exposes normalized Cube Rosetta events.

Supported protocol families:

- GAN Gen1–Gen4, including MAC-derived AES variants
- GiiKER / Mi Smart 20-byte cubie-state frames
- GoCube and Rubik's Connected Nordic UART frames
- MoYu MHC and MoYu32; AiCube models using GAN Gen2 framing are identified as MoYu

The manager must be connected from a user gesture because Web Bluetooth device selection cannot be
opened programmatically. It reports explicit `unavailable`, `connecting`, `connected`,
`disconnecting`, `disconnected`, and `error` phases. `reconnect()` intentionally opens the browser
chooser again; the transport does not retain a public `BluetoothDevice` handle.

Academy coaching adds a strict recovery stack above the transport. A wrong face turn is never
silently folded into the lesson: Cube Rosetta asks for its inverse, stacks any further slips in
last-in-first-out order, and resumes the original expected move only after the physical cube is
realigned. Visual feedback is always available; synthesized sound is user-controlled.

Hardware light feedback is capability-gated. The manager calls a transport-provided `flashLed`
writer when one exists, but the currently pinned `smartcube-web-bluetooth` GoCube connection does
not expose such a command. Cube Rosetta therefore does not send speculative raw GATT packets.

Step 3 consumers subscribe to normalized events rather than importing the vendor transport. The
viewport integration lazy-loads this module from the Connect button, records physical moves in the
algorithm editor, renders live facelets through every converter, tracks optional gyro orientation,
and advances Academy timelines only when the expected physical move matches.

Three-by-three slice, wide, and single-inner-layer lesson moves are matched through the outer-face
packets that the hardware can actually report (`M = x' R L'`, `Rw = x L`, and their axis variants).
Composite packets may arrive in either face order; half turns may arrive directly or as two quarter
turns in either direction. Their implicit physical reorientation is carried into later hints.
GoCube gyro samples are restored to wire axes at the transport boundary, then changed into viewport
axes only after relative-pose calibration so pitch, yaw, and roll cannot be cross-coupled.

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
