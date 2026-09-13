# CubeLab architecture

CubeLab is a static, browser-local application. Astro produces the page shell,
the Vanilla DOM controller owns interaction state, ReScript implements cube
models and solvers, and the native WebGL renderer draws the persistent cube
viewport. User input, cube state, Bluetooth packets, and replay data stay in the
browser; CubeLab has no application server or telemetry pipeline.

## Smart-cube boundary

The live smart-cube path has three owners:

1. `smartcube-web-bluetooth` owns Web Bluetooth discovery, GATT, MAC recovery,
   encryption, protocol packets, initial device requests, and vendor commands.
2. `@wstein/regrip-core` owns profiles, sensor-axis mapping, stabilization,
   drift compensation, virtual regrips, and solver-frame projection.
3. `src/client/smart-cube/regrip-core.ts` adapts normalized core events to the
   CubeLab UI. It must not decode packets or apply a displayed regrip to logical
   cube state a second time.

Both GAN and GoCube use this path. There is no legacy CubeLab protocol fallback.
Replay uses the same normalized event contract without requiring Bluetooth
hardware.

## Support and validation matrix

“Capture-tested” means recorded packets are exercised in automated transport
and CubeLab contract tests. It is not a substitute for a physical-device smoke
test, and firmware versions were not present in the current captures.

| Device family | Detection / protocol | Validated behavior | Status and limitations |
| --- | --- | --- | --- |
| GAN 12 ui Gen2 | `GAN12ui…`, GAN Gen2 | Capture-tested profile selection, decryption, moves, facelets, battery, and MAC-candidate recovery | Supported; the captured device reports no gyro. A MAC prompt may be required when browser advertisement data is unavailable. |
| GAN i4 Gen4 | `GANi4_…`, GAN Gen4 | Capture-tested MAC salt, decryption, packet validation, moves, facelets, gyro events, and Gen4 profile selection | Supported; physical firmware coverage is still pending. |
| Other GAN Gen1–Gen4 | `GAN…` / `MG…`; Gen1–Gen4 services | Protocol and profile paths have unit coverage | Code-supported but not capture-qualified for every model and firmware combination. |
| Classic GoCube | `GoCube` / `GoCube_…`, GoCube UART | Capture-tested connection readiness, initial state, moves, facelets, orientation, battery, replay, reset, and vendor command opcodes | Supported; LED feedback uses `FLASH_BACKLIGHT` and `SLOW_FLASH_BACKLIGHT`. |
| Rubik’s Connected | `Rubiks…`, GoCube UART | Capture-tested moves, facelets, battery, and replay | Supported without gyro or GoCube-only vendor commands. |
| GoCube X | `GoCubeX…`, GoCube UART | Protocol selection and non-gyro capability path | Code-supported; no capture-qualified hardware run yet. |

### Browser and hardware constraints

- Live connection requires Web Bluetooth in a secure context and must start
  from a user gesture. Current practical support is Chromium-family browsers.
- Browser Bluetooth APIs may omit GAN manufacturer data. The shared transport
  tries bounded MAC candidates and then exposes one common recovery prompt.
- Capability flags are authoritative. The UI must not assume gyro, battery,
  reset, or LED support from a brand name alone.
- A capture proves decoder compatibility for that recording, not every firmware
  revision. New firmware should be recorded, replay-tested, and added to this
  matrix before being called validated.
- The largest remaining release risk is physical-device behavior: chooser flow,
  reconnects, initial-state latency, sustained gyro/regrip tracking, and command
  acknowledgement still need a manual smoke matrix.

## Regrip core updates

CubeLab consumes a CI-built tarball rather than npm. The source submodule pins
the same tag commit for provenance and review.

1. Wait for the Regrip tag’s `release-core.yml` workflow to succeed.
2. Copy the artifact SHA-256 from that trusted workflow.
3. Run:

   ```sh
   npm run regrip-core:update -- --tag core-vX.Y.Z --sha256 <sha256>
   ```

4. Review the tarball, dependency, lockfile, and submodule changes.
5. Run `npm test` and `npm run build` before committing.

The updater resolves the tag to its exact commit, selects a successful workflow
for that commit, downloads the versioned artifact, verifies its checksum and
package manifest and refreshes `package-lock.json`.
checks the lockfile integrity value.

## Deployment gates

The Pages workflow performs a frozen dependency install, runs the complete unit
and integration suite, builds the static site, and only then allows deployment.
Browser hardware tests remain manual because hosted runners do not expose the
required Bluetooth devices.
