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

Step 3 consumers should subscribe to normalized events rather than importing the vendor transport:

```ts
const cube = createSmartCubeManager();
cube.subscribeEvents((event) => {
  if (event.type === "move") viewport.animateTurn(event.move);
});
await cube.connect(); // call inside a click handler
```

Do not add independent AES, XOR, or packet parsing in UI code. Protocol generations are incompatible,
and encrypted devices require validated MAC-derived keys before their events are trusted.
