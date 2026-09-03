# Settings

CubeLab intentionally has two persistence tiers.

- **Shareable workspace state** lives in `AppState` and the URL hash. It includes
  puzzle size, colour scheme, custom scheme, lowercase interpretation, notation
  dialect, cube style, turn guides, auto-orbit, workspace tab, and Academy method.
  A shared link therefore reproduces the relevant cube and presentation state.
- **Local device preferences** live in `cubelab-preferences-v1` in browser
  storage. Playback speed, inspection duration, and the reserved TNoodle server
  URL belong here: they are machine-specific defaults and must not leak into a
  shared link.

The Settings dialog is a discoverable second entry point for global workspace
controls and device-local defaults. Cube style and turn guides intentionally
remain beside the viewport, where their effects are immediately visible. The
inspection duration is stored in preparation for a configurable timer phase;
the current timer deliberately continues to enforce WCA's fixed 15-second
inspection. Timer sessions remain in their separate versioned local store
because they are user history, not settings.
