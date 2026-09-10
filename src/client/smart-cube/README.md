# Smart-cube integration

CubeLab is a UI consumer of two shared layers:

- `smartcube-web-bluetooth` owns Web Bluetooth selection, advertisement and
  MAC recovery, protocol selection, packet decoding, standard commands, and
  supported vendor commands.
- `@wstein/regrip-core` owns device profiles, sensor-to-body mapping,
  calibration, stabilization, drift compensation, virtual regrips, and
  solver-frame moves and facelets.

`createRegripCoreManager()` adapts that session to CubeLab's UI manager
contract. It does not parse Bluetooth packets, perform direct GATT operations,
or make an orientation decision.

Core `REGRIP` events are view-frame metadata. The core applies them before
projecting subsequent `MOVE` and `FACELETS` packets into the solver frame, so
CubeLab must not apply the displayed `x`/`y`/`z` token to its logical cube or
recording state a second time. It may display the token and animate the view.

GAN and GoCube are the current live migration targets. The browser chooser must
still be opened from a user gesture. A GAN MAC fallback prompt is provided by
`smartcube-web-bluetooth`, so every host follows the same recovery path.

```ts
const cube = createRegripCoreManager();
cube.subscribeEvents((event) => {
  if (event.type === "move") viewport.animateTurn(event.solverMove ?? event.move);
});
await cube.connect(); // call inside a click handler
```

Do not add vendor BLE parsing, AES/MAC recovery, fast connection paths, or
orientation filters to CubeLab. Those changes belong in the transport library
or Regrip core, respectively.
