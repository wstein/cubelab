import {expect, test} from "@playwright/test";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../src/Move/MoveParser.res.mjs";
import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";

const algorithmFacelets = (algorithm) => {
  const parsed = MoveParser.parse(3, algorithm);
  if (parsed.TAG !== "Ok") throw new Error(`Test algorithm did not parse: ${algorithm}`);
  const applied = MoveExecutor.applyAlg(StateTypes.solved(3)._0, parsed._0);
  if (applied.TAG !== "Ok") throw new Error(`Test algorithm did not execute: ${algorithm}`);
  return FaceletCodec.render(applied._0);
};

test("converts algorithms and Orbit64 while switching size-aware cards", async ({page}) => {
  const pageErrors = [];
  const bluetoothWarnings = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.text().includes("Bluetooth permission has been blocked")) {
      bluetoothWarnings.push(message.text());
    }
  });

  await page.goto("/");

  const piecesCard = page.locator('[data-output-card="pieces"]');
  const orbitCard = page.locator('[data-output-card="orbit64"]');
  const input = page.locator("[data-input]");

  await expect(page.locator("[data-status]")).toHaveText("Solved default");
  await expect(page.locator('[data-output="orbit64"]')).toHaveText("AAAAAAAAAAAA");
  const quickOrbitCopy = page.locator("[data-copy-orbit64]");
  await expect(quickOrbitCopy).toBeVisible();
  await quickOrbitCopy.click();
  await expect(quickOrbitCopy).toHaveText("Copied");
  await expect(piecesCard).toBeVisible();
  await expect(orbitCard).toBeVisible();
  await expect(page.locator("[data-cube-canvas]")).toHaveAttribute("data-webgl", "ready");
  await expect(page.locator("[data-smart-cube-connect]")).toBeVisible();
  await expect(page.locator("[data-smart-cube-dock]")).toBeHidden();
  await expect(page.locator("[data-smart-cube-sync]")).toBeHidden();
  await expect(page.locator("[data-smart-cube-reset-state]")).toBeHidden();
  const smartCubeSound = page.locator("[data-smart-cube-sound]");
  await expect(smartCubeSound).toHaveText("Sound on");
  await smartCubeSound.click();
  await expect(smartCubeSound).toHaveText("Sound off");
  await page.reload();
  await expect(smartCubeSound).toHaveText("Sound off");
  await smartCubeSound.click();
  await expect(smartCubeSound).toHaveText("Sound on");
  expect(bluetoothWarnings).toEqual([]);
  const autoOrbit = page.locator("[data-auto-orbit]");
  const turnGuides = page.locator("[data-turn-guides]");
  await expect(turnGuides).toHaveAttribute("aria-pressed", "true");
  await turnGuides.click();
  await expect(turnGuides).toHaveAttribute("aria-pressed", "false");
  await expect(page).toHaveURL(/guides=off/);
  await turnGuides.click();
  await expect(turnGuides).toHaveAttribute("aria-pressed", "true");
  await expect(autoOrbit).toHaveAttribute("aria-pressed", "false");
  await autoOrbit.click();
  await expect(autoOrbit).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-cube-canvas]")).toHaveAttribute("data-auto-orbit-state", "on");
  await page.getByRole("button", {name: "Reset view"}).click();
  await expect(autoOrbit).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("[data-cube-canvas]")).toHaveAttribute("data-auto-orbit-state", "off");

  await input.fill("AAAAAAAAAAAA");
  await expect(page.locator("[data-status]")).toHaveText("Orbit64");
  await expect(page.locator("[data-compatibility]")).toBeHidden();
  await expect(page.locator('[data-output="facelets"]')).toHaveText(
    "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB",
  );

  await input.fill(
    [
      "      W W W",
      "      W W W",
      "      W W W",
      "O O O G G G R R R B B B",
      "O O O G G G R R R B B B",
      "O O O G G G R R R B B B",
      "      Y Y Y",
      "      Y Y Y",
      "      Y Y Y",
    ].join("\n"),
  );
  await expect(page.locator("[data-status]")).toHaveText("Colour net");
  await expect(page.locator('[data-output="orbit64"]')).toHaveText("AAAAAAAAAAAA");

  await input.fill(
    "cp: 0 1 2 3 4 5 6 7; co: 0 0 0 0 0 0 0 0; " +
      "ep: 0 1 2 3 4 5 6 7 8 9 10 11; eo: 0 0 0 0 0 0 0 0 0 0 0 0",
  );
  await expect(page.locator("[data-status]")).toHaveText("Cubie coordinates");
  await expect(page.locator('[data-output="orbit64"]')).toHaveText("AAAAAAAAAAAA");

  await page.locator('[data-size="2"]').click();
  await expect(quickOrbitCopy).toBeHidden();
  await expect(page.locator('[data-title="pieces"]')).toHaveText("2×2 CP / CO");
  await expect(page.locator('[data-output="pieces"]')).not.toContainText("ep:");
  await expect(orbitCard).toBeHidden();

  await page.locator('[data-size="4"]').click();
  await expect(piecesCard).toBeHidden();
  await expect(orbitCard).toBeHidden();
  const lowercaseControls = page.locator("[data-lowercase-controls]");
  const notationControls = page.locator("[data-notation-controls]");
  await expect(lowercaseControls).toBeVisible();
  await expect(notationControls).toBeVisible();
  await expect(page.locator('[data-lowercase-mode="Wide"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await input.fill("2R");
  await expect(page.locator("[data-status]")).toHaveText("Algorithm · SiGN");
  await expect(page.locator('[data-output="facelets"]')).not.toHaveText("—");
  const innerSliceState = await page.locator('[data-output="facelets"]').textContent();
  await input.fill("r");
  await expect(page.locator('[data-output="facelets"]')).not.toHaveText(innerSliceState ?? "");
  const modernWideState = await page.locator('[data-output="facelets"]').textContent();

  await input.fill("Rw U2 r'");
  await page.locator('[data-lowercase-mode="InnerSlice"]').click();
  await expect(page.locator('[data-lowercase-mode="InnerSlice"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await input.fill("r");
  await expect(page.locator('[data-output="facelets"]')).toHaveText(innerSliceState ?? "");

  await page.locator('[data-lowercase-mode="Wide"]').click();
  await expect(page.locator('[data-output="facelets"]')).toHaveText(modernWideState ?? "");

  await page.locator('[data-size="5"]').click();
  await input.fill("F2'");
  const modernSuffixState = await page.locator('[data-output="facelets"]').textContent();
  await page.locator('[data-notation-dialect="Ruwix"]').click();
  await expect(page.locator("[data-status]")).toHaveText("Algorithm · Ruwix");
  await expect(page.locator('[data-output="facelets"]')).not.toHaveText(modernSuffixState ?? "");
  await input.fill("F₂'");
  const unicodeRuwixState = await page.locator('[data-output="facelets"]').textContent();
  await input.fill("F2'");
  await expect(page.locator('[data-output="facelets"]')).toHaveText(unicodeRuwixState ?? "");

  await page.locator('[data-cube-style="Speed"]').click();
  await expect(page.locator('[data-cube-style="Speed"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-cube-canvas]")).toHaveAttribute("data-webgl", "ready");
  await page.locator("[data-reset-camera]").click();

  await page.locator('[data-size="3"]').click();
  await expect(lowercaseControls).toBeHidden();
  await expect(notationControls).toBeHidden();
  await input.fill("U");
  await expect(page.locator("[data-status]")).toHaveText("Algorithm · SiGN");
  await expect(page.locator("[data-compatibility]")).toBeVisible();
  await expect(page.locator('[data-compatibility-profile="wca"]')).toContainText("✓");
  await expect(page.locator('[data-compatibility-profile="signLgn"]')).toContainText("✓");
  await expect(page.locator('[data-output="pieces"]')).toContainText("cp: 3 0 1 2");
  await expect(page.locator('[data-output="orbit64"]')).toHaveText("AcIufRZj-AAA");
  await input.fill("(M2 E2 S2)(R L) # adjacent groups");
  await expect(page.locator("[data-status]")).toHaveText("Algorithm · SiGN");
  await expect(page.locator('[data-compatibility-profile="wca"]')).toContainText("×");
  await expect(page.locator('[data-compatibility-profile="signLgn"]')).toContainText("×");
  await expect(page.locator('[data-compatibility-profile="cubingJs"]')).toContainText("×");
  await expect(page.locator("[data-move-ribbon] .move-token")).toHaveCount(5);
  expect(pageErrors).toEqual([]);
});

test("replays optional moves from a setup state and keeps both fields shareable", async ({page}) => {
  await page.goto("/");
  const setup = page.locator("[data-input]");
  const moves = page.locator("[data-moves-input]");

  await setup.fill(algorithmFacelets("R"));
  await moves.fill("U F2");
  await expect(page.locator("[data-status]")).toHaveText("Compact facelets + moves");
  await expect(page.locator('[data-output="facelets"]')).toHaveText(algorithmFacelets("R U F2"));
  await expect(page).toHaveURL(/moves=U\+F2/);

  await setup.fill("R U");
  await expect(page.locator("[data-status]")).toHaveText("Algorithm · SiGN + moves");
  await expect(page.locator('[data-output="facelets"]')).toHaveText(algorithmFacelets("R U U F2"));
});

test("extends an algorithm entered in Setup with the Moves field", async ({page}) => {
  await page.goto("/");
  const setup = page.locator("[data-input]");
  const moves = page.locator("[data-moves-input]");

  await setup.fill("F L2 R2 F B' U2 L D U' L F' B D' F' R2 D'");
  await moves.fill("B");
  await expect(page.locator("[data-status]")).toHaveText("Algorithm · SiGN + moves");
  await expect(page.locator('[data-output="facelets"]')).toHaveText(
    algorithmFacelets("F L2 R2 F B' U2 L D U' L F' B D' F' R2 D' B"),
  );
});

test("restores shareable studio state and quick-load presets", async ({page}) => {
  await page.goto("/#size=4&alg=Rw+U2&style=Speed&lowercase=InnerSlice");
  const input = page.locator("[data-input]");
  await expect(input).toHaveValue("Rw U2");
  await expect(page.locator('[data-size="4"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-cube-style="Speed"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-lowercase-mode="InnerSlice"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("[data-status]")).toHaveText("Algorithm · Legacy");

  await input.fill("r U2");
  await expect.poll(() => page.evaluate(() => window.location.hash)).toContain("alg=r+U2");
  await page.reload();
  await expect(input).toHaveValue("r U2");
  await expect(page.locator("[data-status]")).toHaveText("Algorithm · Legacy");

  await page.getByRole("button", {name: "Checkerboard"}).click();
  await expect(page.locator('[data-size="3"]')).toHaveAttribute("aria-pressed", "true");
  await expect(input).toHaveValue("M2 E2 S2");
  await expect(page.locator("[data-status]")).toHaveText("Algorithm · SiGN");
});

test("searches, detects, and previews a known pattern solution", async ({page}) => {
  await page.goto("/");
  await page.locator('[data-workspace-tab="patterns"]').click();
  await page.locator("[data-pattern-library] summary").click();
  await page.locator("[data-pattern-search]").fill("Pons Asinorum");
  await expect(page.locator("[data-pattern-select] option")).toHaveCount(1);
  await page.locator("[data-pattern-load]").click();
  await expect(page.locator("[data-pattern-detected]")).toBeVisible();
  await expect(page.locator("[data-pattern-detected-name]")).toHaveText("Pons Asinorum");
  await expect(page.locator("[data-pattern-detected-solution]")).not.toBeEmpty();
  await page.locator("[data-pattern-preview-solution]").click();
  await expect(page.locator("[data-playback]")).toBeVisible();
  await expect(page.locator("[data-playback-position]")).toContainText("Move 0 of");
});

test("filters and badges mathematical antipodes and extremal states", async ({page}) => {
  await page.goto("/");
  await page.locator('[data-workspace-tab="patterns"]').click();
  await page.locator("[data-pattern-library] summary").click();
  await page.locator("[data-pattern-search]").fill("Superflip");
  await expect(page.locator("[data-pattern-select] option")).toHaveCount(3);

  await page.locator("[data-pattern-extremal-filter]").check();
  await expect(page.locator("[data-pattern-select] option")).toHaveCount(2);
  await expect(page.locator("[data-pattern-select] option")).toHaveText(["Superflip", "Superflip + Fourspot"]);

  await page.locator("[data-pattern-select]").selectOption({label: "Superflip + Fourspot"});
  const badge = page.locator("[data-pattern-extremal-badge]");
  await expect(badge).toBeVisible();
  await expect(badge).toContainText("26 QTM");
  await expect(badge).toHaveAttribute("href", "https://cube20.org/qtm/");

  await page.locator("[data-pattern-select]").selectOption({label: "Superflip"});
  await expect(badge).toContainText("20 HTM");
  await expect(badge).toHaveAttribute("href", "https://en.wikipedia.org/wiki/Superflip");

  await page.locator("[data-pattern-extremal-filter]").uncheck();
  await expect(page.locator("[data-pattern-select] option")).toHaveCount(3);
});

test("places the visualizer before controls on mobile", async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/");
  const viewport = await page.locator("[data-viewport-panel]").boundingBox();
  const inputPanel = await page.locator(".input-panel").boundingBox();
  expect(viewport).not.toBeNull();
  expect(inputPanel).not.toBeNull();
  expect(viewport.y).toBeLessThan(inputPanel.y);
});

test("reports blocked Bluetooth without opening the device chooser", async ({page}) => {
  await page.addInitScript(() => {
    window.__bluetoothRequestCount = 0;
    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      value: {
        getAvailability: async () => false,
        requestDevice: async () => {
          window.__bluetoothRequestCount += 1;
          throw new DOMException("Bluetooth permission has been blocked.", "NotFoundError");
        },
      },
    });
    Object.defineProperty(navigator, "brave", {
      configurable: true,
      value: {isBrave: async () => true},
    });
  });

  await page.goto("/");
  await page.locator("[data-smart-cube-connect]").click();

  await expect(page.locator("[data-smart-cube-dock]")).toBeVisible();
  await expect(page.locator("[data-smart-cube-status]")).toContainText(
    "brave://flags/#brave-web-bluetooth-api",
  );
  await expect(page.locator("[data-smart-cube-status]")).toContainText("relaunch Brave");
  await expect(page.locator("[data-smart-cube-status]")).toHaveCSS("white-space", "normal");
  expect(await page.evaluate(() => window.__bluetoothRequestCount)).toBe(0);
});

test("recovers once from a stale lazy smart-cube chunk", async ({page}) => {
  let chunkRequests = 0;
  await page.route(/(?:\/_astro\/smart-cube\..*\.js|\/src\/client\/smart-cube\/index\.ts)/, async (route) => {
    chunkRequests += 1;
    if (chunkRequests === 1) await route.abort();
    else await route.continue();
  });
  await page.addInitScript(() => {
    window.__bluetoothRequestCount = 0;
    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      value: {
        getAvailability: async () => true,
        requestDevice: async () => {
          window.__bluetoothRequestCount += 1;
          throw new DOMException("User cancelled the requestDevice() chooser.", "NotFoundError");
        },
      },
    });
    Object.defineProperty(navigator, "brave", {
      configurable: true,
      value: {isBrave: async () => false},
    });
  });

  await page.goto("/");
  await page.locator("[data-smart-cube-connect]").click();
  await expect(page.locator("[data-smart-cube-status]")).toContainText(
    "updated while this page was open",
  );

  await expect(page.locator('[data-output="facelets"]')).toHaveText(algorithmFacelets(""));
  await page.locator("[data-smart-cube-connect]").click();
  await expect.poll(() => page.evaluate(() => window.__bluetoothRequestCount)).toBe(1);
  expect(chunkRequests).toBe(2);
});

test("auto-demonstrates regrips without gyro and preserves their lesson frame", async ({page}) => {
  await page.route(/(?:\/src\/client\/smart-cube\/index|\/_astro\/smart-cube\.)/, async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        let stateListener = () => {};
        let eventListener = () => {};
        const device = {
          name: "Mock Cube", macAddress: null, brand: "gocube", brandName: "GoCube",
          protocolId: "mock", protocolName: "Mock", capabilities: {
            orientation: false, battery: false, facelets: false, hardware: false,
            reset: false, led: false
          }
        };
        window.__emitSmartCubeEvent = (event) => eventListener(event);
        export const createSmartCubeManager = () => ({
          getState: () => ({phase: "disconnected", message: "Disconnected", device: null, error: null}),
          connect: async () => {
            stateListener({phase: "connected", message: "Connected", device, error: null});
            return device;
          },
          reconnect: async () => device,
          disconnect: async () => stateListener({phase: "disconnected", message: "Disconnected", device: null, error: null}),
          refresh: async () => {}, resetCubeState: async () => {}, flashLed: async () => {},
          subscribeState: (listener) => {
            stateListener = listener;
            listener({phase: "disconnected", message: "Disconnected", device: null, error: null});
            return () => {};
          },
          subscribeEvents: (listener) => { eventListener = listener; return () => {}; }
        });
      `,
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      value: {getAvailability: async () => true, requestDevice: async () => ({})},
    });
  });

  await page.goto("/#size=3&alg=x2+U2");
  const input = page.locator("[data-input]");
  const facelets = page.locator('[data-output="facelets"]');
  const expectedFinalState = await facelets.textContent();
  const expectedRecoveryState = algorithmFacelets("x2 B");
  await page.locator("[data-smart-cube-connect]").click();
  await expect(page.locator("[data-smart-cube-status]")).toContainText("Live sync");
  await page.evaluate(() => window.__emitSmartCubeEvent({
    type: "facelets",
    facelets: "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB",
    timestamp: Date.now(),
  }));
  await input.fill("x2 U2");
  await expect(page.locator("[data-playback-scrubber]")).toBeEnabled();
  await page.locator("[data-playback-scrubber]").fill("0");
  await page.locator("[data-viewport-panel] [data-playback-speed='2']").click();
  await page.getByRole("button", {name: "Play forward"}).click();
  await expect(page.locator('[data-half-turn-progress="true"]')).toHaveText("x x");
  await expect(page.locator("[data-playback-position]")).toHaveText("Move 1 of 2", {timeout: 2500});
  const waiting = await page.locator("[data-smart-cube-status]").textContent();
  const expectedMove = waiting?.match(/Waiting for ([URFDLB](?:2|')?)/)?.[1];
  expect(expectedMove).toBeTruthy();
  const emitMove = (move) => page.evaluate((physicalMove) => window.__emitSmartCubeEvent({
    type: "move", move: physicalMove, face: 0, direction: 0, localTimestamp: null,
    cubeTimestamp: null, timestamp: Date.now(),
  }), move);

  // Wrong moves form a temporary red sequence around the physical cursor.
  await emitMove("F");
  await expect(page.locator("[data-smart-cube-recovery-block] .smart-cube-recovery-token"))
    .toHaveText(["F", "F'"]);
  await expect(page.locator('[data-output="facelets"]')).toHaveText(expectedRecoveryState ?? "");
  await expect(page.locator("[data-smart-cube-recovery-cursor]")).toHaveCount(1);
  await emitMove("R");
  await expect(page.locator("[data-smart-cube-recovery-block] .smart-cube-recovery-token"))
    .toHaveText(["F", "R", "R'", "F'"]);
  await emitMove("R'");
  await expect(page.locator("[data-smart-cube-recovery-block] .smart-cube-recovery-token"))
    .toHaveText(["F", "F'"]);
  await emitMove("F'");
  await expect(page.locator("[data-smart-cube-recovery-block]")).toHaveCount(0);

  expect(expectedMove).toBe("D2");
  await emitMove("D");
  await expect(facelets).toHaveText(algorithmFacelets("x2 U"));
  await expect(page.locator('[data-half-turn-progress="true"]')).toHaveText("U U");
  await expect(page.locator("[data-motion-overlay]")).not.toHaveAttribute("data-turn-repeat", "2×");
  await emitMove("D");
  await expect(page.locator("[data-playback-position]")).toHaveText("Move 2 of 2");
  await expect(page.locator('[data-output="facelets"]')).toHaveText(expectedFinalState ?? "");

  // A later fixed-frame hardware snapshot must not visually undo the x regrip.
  await page.evaluate(() => window.__emitSmartCubeEvent({
    type: "facelets",
    facelets: "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB",
    timestamp: Date.now(),
  }));
  await expect(page.locator('[data-output="facelets"]')).toHaveText(expectedFinalState ?? "");

});

test("uses GoCube orientation as an x/y/z checkpoint without live-tracking solve mode", async ({page}) => {
  await page.route(/(?:\/src\/client\/smart-cube\/index|\/_astro\/smart-cube\.)/, async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        let stateListener = () => {};
        let eventListener = () => {};
        const device = {
          name: "Mock GoCube", macAddress: null, brand: "gocube", brandName: "GoCube",
          protocolId: "gocube", protocolName: "GoCube", capabilities: {
            orientation: true, battery: false, facelets: false, hardware: false,
            reset: false, led: false
          }
        };
        window.__emitSmartCubeEvent = (event) => eventListener(event);
        export const createSmartCubeManager = () => ({
          getState: () => ({phase: "disconnected", message: "Disconnected", device: null, error: null}),
          connect: async () => {
            stateListener({phase: "connected", message: "Connected", device, error: null});
            return device;
          },
          reconnect: async () => device,
          disconnect: async () => stateListener({phase: "disconnected", message: "Disconnected", device: null, error: null}),
          refresh: async () => {}, resetCubeState: async () => {}, flashLed: async () => {},
          subscribeState: (listener) => {
            stateListener = listener;
            listener({phase: "disconnected", message: "Disconnected", device: null, error: null});
            return () => {};
          },
          subscribeEvents: (listener) => { eventListener = listener; return () => {}; }
        });
      `,
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      value: {getAvailability: async () => true, requestDevice: async () => ({})},
    });
  });

  await page.goto("/#size=3&alg=x+y+R");
  await page.locator("[data-smart-cube-connect]").click();
  await page.waitForFunction(() => typeof window.__emitSmartCubeEvent === "function");
  await page.evaluate(() => window.__emitSmartCubeEvent({
    type: "orientation",
    quaternion: {x: 0, y: 0, z: 0, w: 1},
    coordinateFrame: "viewport",
    timestamp: Date.now(),
  }));
  const canvas = page.locator("[data-cube-canvas]");
  await expect(canvas).toHaveAttribute("data-device-orientation", "tracking");

  await page.locator("[data-playback-scrubber]").fill("0");
  await page.getByRole("button", {name: "Play forward"}).click();
  await expect(page.locator("[data-smart-cube-status]")).toContainText("Waiting for x regrip");
  await expect(canvas).not.toHaveAttribute("data-device-orientation", "tracking");

  const half = Math.sqrt(0.5);
  await page.evaluate((q) => window.__emitSmartCubeEvent({
    type: "orientation",
    quaternion: q,
    coordinateFrame: "viewport",
    timestamp: Date.now(),
  }), {x: -half, y: 0, z: 0, w: half});
  await expect(page.locator("[data-playback-position]")).toHaveText("Move 1 of 3");
  await expect(page.locator("[data-smart-cube-status]")).toContainText("Waiting for y regrip");
  await expect(canvas).not.toHaveAttribute("data-device-orientation", "tracking");
  await expect(page.locator('[data-output="facelets"]')).toHaveText(algorithmFacelets("x"));

  // A clean off-axis regrip is a harmless holding adjustment. It rebases the
  // checkpoint without adding a slip or advancing the lesson.
  await page.evaluate((q) => window.__emitSmartCubeEvent({
    type: "orientation",
    quaternion: q,
    coordinateFrame: "viewport",
    timestamp: Date.now(),
  }), {x: -0.5, y: -0.5, z: -0.5, w: 0.5});
  await expect(page.locator("[data-playback-position]")).toHaveText("Move 1 of 3");
  await expect(page.locator("[data-smart-cube-mistakes]")).toBeHidden();
  await expect(page.locator("[data-smart-cube-recovery-block]")).toHaveCount(0);

  // Performing the requested logical y regrip from the rebased pose.
  await page.evaluate((q) => window.__emitSmartCubeEvent({
    type: "orientation",
    quaternion: q,
    coordinateFrame: "viewport",
    timestamp: Date.now(),
  }), {x: -half, y: -half, z: 0, w: 0});
  await expect(page.locator("[data-playback-position]")).toHaveText("Move 2 of 3");
  await expect(page.locator("[data-smart-cube-status]")).toContainText("Waiting for");
  await expect(canvas).not.toHaveAttribute("data-device-orientation", "tracking");
  await expect(page.locator('[data-output="facelets"]')).toHaveText(algorithmFacelets("x y"));
});

test("verifies live GoCube wire orientation across x, y, and z regrips", async ({page}) => {
  await page.route(/(?:\/src\/client\/smart-cube\/index|\/_astro\/smart-cube\.)/, async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        let stateListener = () => {};
        let eventListener = () => {};
        const device = {
          name: "Mock GoCube", macAddress: null, brand: "gocube", brandName: "GoCube",
          protocolId: "gocube", protocolName: "GoCube", capabilities: {
            orientation: true, battery: false, facelets: false, hardware: false,
            reset: false, led: false
          }
        };
        window.__emitSmartCubeEvent = (event) => eventListener(event);
        export const createSmartCubeManager = () => ({
          getState: () => ({phase: "disconnected", message: "Disconnected", device: null, error: null}),
          connect: async () => {
            stateListener({phase: "connected", message: "Connected", device, error: null});
            return device;
          },
          reconnect: async () => device,
          disconnect: async () => stateListener({phase: "disconnected", message: "Disconnected", device: null, error: null}),
          refresh: async () => {}, resetCubeState: async () => {}, flashLed: async () => {},
          subscribeState: (listener) => {
            stateListener = listener;
            listener({phase: "disconnected", message: "Disconnected", device: null, error: null});
            return () => {};
          },
          subscribeEvents: (listener) => { eventListener = listener; return () => {}; }
        });
      `,
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      value: {getAvailability: async () => true, requestDevice: async () => ({})},
    });
  });

  await page.goto("/#size=3&alg=x+y+z+R");
  await page.locator("[data-smart-cube-connect]").click();
  await page.waitForFunction(() => typeof window.__emitSmartCubeEvent === "function");

  // Initial GoCube wire pose
  await page.evaluate(() => window.__emitSmartCubeEvent({
    type: "orientation",
    quaternion: {x: 0, y: 0, z: 0, w: 1},
    coordinateFrame: "gocube-wire",
    timestamp: Date.now(),
  }));
  const canvas = page.locator("[data-cube-canvas]");
  await expect(canvas).toHaveAttribute("data-device-orientation", "tracking");

  // Start playback into coaching mode
  await page.locator("[data-playback-scrubber]").fill("0");
  await page.getByRole("button", {name: "Play forward"}).click();
  await expect(page.locator("[data-smart-cube-status]")).toContainText("Waiting for x regrip");
  await expect(canvas).not.toHaveAttribute("data-device-orientation", "tracking");

  const half = Math.sqrt(0.5);

  // 1. Physical pitch forward (x) on GoCube wire:
  await page.evaluate((q) => window.__emitSmartCubeEvent({
    type: "orientation",
    quaternion: q,
    coordinateFrame: "gocube-wire",
    timestamp: Date.now(),
  }), {x: -half, y: 0, z: 0, w: half});
  await expect(page.locator("[data-playback-position]")).toHaveText("Move 1 of 4");
  await expect(page.locator("[data-smart-cube-status]")).toContainText("Waiting for y regrip");

  // 2. Physical yaw left (y) on GoCube wire starting from the post-x pose:
  // In world frame: q2 = yRot * q1 = {-0.5, 0.5, 0.5, 0.5}
  await page.evaluate((q) => window.__emitSmartCubeEvent({
    type: "orientation",
    quaternion: q,
    coordinateFrame: "gocube-wire",
    timestamp: Date.now(),
  }), {x: -0.5, y: 0.5, z: 0.5, w: 0.5});
  await expect(page.locator("[data-playback-position]")).toHaveText("Move 2 of 4");
  await expect(page.locator("[data-smart-cube-status]")).toContainText("Waiting for z regrip");

  // 3. Physical roll clockwise (z) on GoCube wire starting from the post-y pose:
  // In world frame: q3 = zRot * q2 = {0, half, 0, half}
  await page.evaluate((q) => window.__emitSmartCubeEvent({
    type: "orientation",
    quaternion: q,
    coordinateFrame: "gocube-wire",
    timestamp: Date.now(),
  }), {x: 0, y: half, z: 0, w: half});
  await expect(page.locator("[data-playback-position]")).toHaveText("Move 3 of 4");
  await expect(page.locator("[data-smart-cube-status]")).toContainText("Waiting for F");
});

test("resets the camera without dropping smart-cube orientation tracking", async ({page}) => {
  await page.route(/(?:\/src\/client\/smart-cube\/index|\/_astro\/smart-cube\.)/, async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        let stateListener = () => {};
        let eventListener = () => {};
        const device = {
          name: "Mock GoCube", macAddress: null, brand: "gocube", brandName: "GoCube",
          protocolId: "gocube", protocolName: "GoCube", capabilities: {
            orientation: true, battery: false, facelets: false, hardware: false,
            reset: false, led: false
          }
        };
        window.__emitSmartCubeEvent = (event) => eventListener(event);
        window.__refreshCalls = 0;
        export const createSmartCubeManager = () => ({
          getState: () => ({phase: "disconnected", message: "Disconnected", device: null, error: null}),
          connect: async () => {
            stateListener({phase: "connected", message: "Connected", device, error: null});
            return device;
          },
          reconnect: async () => device,
          disconnect: async () => stateListener({phase: "disconnected", message: "Disconnected", device: null, error: null}),
          refresh: async () => { window.__refreshCalls += 1; },
          resetCubeState: async () => {}, flashLed: async () => {},
          subscribeState: (listener) => {
            stateListener = listener;
            listener({phase: "disconnected", message: "Disconnected", device: null, error: null});
            return () => {};
          },
          subscribeEvents: (listener) => { eventListener = listener; return () => {}; }
        });
      `,
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      value: {getAvailability: async () => true, requestDevice: async () => ({})},
    });
  });

  await page.goto("/");
  await page.locator("[data-smart-cube-connect]").click();
  await page.waitForFunction(() => typeof window.__emitSmartCubeEvent === "function");
  await page.evaluate(() => window.__emitSmartCubeEvent({
    type: "orientation",
    quaternion: {x: 0, y: 0, z: 0, w: 1},
    coordinateFrame: "viewport",
    timestamp: Date.now(),
  }));
  const canvas = page.locator("[data-cube-canvas]");
  const autoOrbit = page.locator("[data-auto-orbit]");
  await expect(canvas).toHaveAttribute("data-device-orientation", "tracking");
  await expect(autoOrbit).toBeDisabled();
  await expect(autoOrbit).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", {name: "Reset view"}).click();
  await expect(canvas).toHaveAttribute("data-device-orientation", "tracking");
  await expect(autoOrbit).toBeDisabled();
  await expect.poll(() => page.evaluate(() => window.__refreshCalls)).toBe(1);

  await page.locator("[data-smart-cube-orientation]").click();
  await expect(autoOrbit).toBeEnabled();
});

test("ends solve mode and resumes orientation tracking once the timeline completes", async ({page}) => {
  await page.route(/(?:\/src\/client\/smart-cube\/index|\/_astro\/smart-cube\.)/, async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        let stateListener = () => {};
        let eventListener = () => {};
        const device = {
          name: "Mock GoCube", macAddress: null, brand: "gocube", brandName: "GoCube",
          protocolId: "gocube", protocolName: "GoCube", capabilities: {
            orientation: true, battery: false, facelets: false, hardware: false,
            reset: false, led: false
          }
        };
        window.__emitSmartCubeEvent = (event) => eventListener(event);
        export const createSmartCubeManager = () => ({
          getState: () => ({phase: "disconnected", message: "Disconnected", device: null, error: null}),
          connect: async () => {
            stateListener({phase: "connected", message: "Connected", device, error: null});
            return device;
          },
          reconnect: async () => device,
          disconnect: async () => stateListener({phase: "disconnected", message: "Disconnected", device: null, error: null}),
          refresh: async () => {}, resetCubeState: async () => {}, flashLed: async () => {},
          subscribeState: (listener) => {
            stateListener = listener;
            listener({phase: "disconnected", message: "Disconnected", device: null, error: null});
            return () => {};
          },
          subscribeEvents: (listener) => { eventListener = listener; return () => {}; }
        });
      `,
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      value: {getAvailability: async () => true, requestDevice: async () => ({})},
    });
  });

  await page.goto("/#size=3&alg=R");
  const input = page.locator("[data-input]");
  await page.locator("[data-smart-cube-connect]").click();
  await page.waitForFunction(() => typeof window.__emitSmartCubeEvent === "function");
  await page.evaluate(() => window.__emitSmartCubeEvent({
    type: "orientation",
    quaternion: {x: 0, y: 0, z: 0, w: 1},
    coordinateFrame: "viewport",
    timestamp: Date.now(),
  }));
  const canvas = page.locator("[data-cube-canvas]");
  await expect(canvas).toHaveAttribute("data-device-orientation", "tracking");

  await input.fill("R");
  await page.locator("[data-playback-scrubber]").fill("0");
  await page.getByRole("button", {name: "Play forward"}).click();
  await expect(page.locator("[data-smart-cube-status]")).toContainText("Waiting for R");
  await expect(canvas).not.toHaveAttribute("data-device-orientation", "tracking");
  const playForward = page.getByRole("button", {name: "Play forward"});
  await expect(playForward).toHaveAttribute("aria-pressed", "true");

  await page.evaluate(() => window.__emitSmartCubeEvent({
    type: "move", move: "R", face: 0, direction: 0, localTimestamp: null,
    cubeTimestamp: null, timestamp: Date.now(),
  }));
  await expect(page.locator("[data-playback-position]")).toHaveText("Move 1 of 1");
  await expect(page.locator("[data-smart-cube-status]")).toContainText("Timeline complete");
  await expect(playForward).toHaveAttribute("aria-pressed", "false");
  await expect(canvas).toHaveAttribute("data-device-orientation", "tracking");
});

test("plays, steps, and seeks an expanded algorithm timeline", async ({page}) => {
  await page.goto("/");
  const input = page.locator("[data-input]");
  const position = page.locator("[data-playback-position]");
  const facelets = page.locator('[data-output="facelets"]');
  const solved = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

  await input.fill("R U");
  await expect(page.locator("[data-playback]")).toBeVisible();
  await expect(position).toHaveText("Move 2 of 2");
  const finalState = await facelets.textContent();

  await page.locator("[data-playback-scrubber]").fill("0");
  await expect(position).toHaveText("Move 0 of 2");
  await expect(facelets).toHaveText(solved);

  await page.getByRole("button", {name: "Step forward"}).click();
  await expect(page.locator("[data-cube-canvas]")).toHaveAttribute("data-animating", "true");
  await expect(position).toHaveText("Move 1 of 2");
  await expect(page.locator("[data-cube-canvas]")).not.toHaveAttribute("data-animating", "true");

  await page.getByRole("button", {name: "Step backward"}).click();
  await expect(position).toHaveText("Move 0 of 2");
  await expect(facelets).toHaveText(solved);

  await page.getByRole("button", {name: "Play forward"}).click();
  await expect(position).toHaveText("Move 2 of 2");
  await expect(facelets).toHaveText(finalState ?? "");

  await page.getByRole("button", {name: "Play backward"}).click();
  await expect(position).toHaveText("Move 0 of 2");
  await expect(facelets).toHaveText(solved);

  await page.getByRole("button", {name: "Go to end"}).click();
  await expect(position).toHaveText("Move 2 of 2");
  await page.getByRole("button", {name: "Go to beginning"}).click();
  await expect(position).toHaveText("Move 0 of 2");

  const pause = page.getByRole("button", {name: "Pause playback"});
  await page.locator("[data-viewport-panel] [data-playback-speed='0.5']").click();
  await page.getByRole("button", {name: "Play forward"}).click();
  await expect(pause).toBeEnabled();
  await pause.click();
  await expect(pause).toBeDisabled();
  const pausedPosition = await position.textContent();
  await page.waitForTimeout(450);
  await expect(position).toHaveText(pausedPosition ?? "");

  await page.locator("[data-playback-scrubber]").fill("0");
  await page.locator("[data-playback-scrubber]").fill("2");
  await expect(position).toHaveText("Move 2 of 2");
  await expect(facelets).toHaveText(finalState ?? "");

  await input.fill("");
  await expect(page.locator("[data-playback]")).toBeVisible();
  await expect(position).toHaveText("Move 0 of 0");
  await expect(page.locator("[data-playback-play]")).toBeDisabled();
  await input.fill("R");
  await expect(page.locator("[data-cube-canvas]")).toHaveAttribute("data-animating", "true");
  await expect(position).toHaveText("Move 1 of 1");
});

test("shows only a 2× repeat marker on half-turn guides", async ({page}) => {
  await page.goto("/");
  await page.locator("[data-input]").fill("D F2");
  const overlay = page.locator("[data-motion-overlay]");
  const moves = page.locator("[data-move-ribbon] .move-token");

  await moves.nth(0).hover();
  await expect(overlay).not.toHaveAttribute("data-turn-repeat", /.+/);
  await moves.nth(1).hover();
  await expect(overlay).toHaveAttribute("data-turn-repeat", "2×");
});

test("supports keyboard playback, sequence navigation, and camera reset", async ({page}) => {
  await page.goto("/");
  await page.locator("[data-input]").fill("(R U) (F D)");
  const position = page.locator("[data-playback-position]");
  const scrubber = page.locator("[data-playback-scrubber]");
  await scrubber.fill("0");
  await scrubber.evaluate((element) => element.blur());

  await page.keyboard.press("ArrowRight");
  await expect(position).toHaveText("Move 1 of 4");
  await page.keyboard.press("ArrowLeft");
  await expect(position).toHaveText("Move 0 of 4");
  await page.keyboard.press("]");
  await expect(position).toHaveText("Move 2 of 4");
  await page.keyboard.press("[");
  await expect(position).toHaveText("Move 0 of 4");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(position).toHaveText("Move 2 of 4");
  await page.keyboard.press("Space");
  await expect(position).toHaveText("Move 4 of 4");

  const autoOrbit = page.getByRole("button", {name: "Auto orbit"});
  await autoOrbit.click();
  await expect(autoOrbit).toHaveAttribute("aria-pressed", "true");
  await autoOrbit.evaluate((element) => element.blur());
  await page.keyboard.press("c");
  await expect(autoOrbit).toHaveAttribute("aria-pressed", "false");
});

test("enters direct notation moves from the studio keyboard and exposes shortcut help", async ({page}) => {
  await page.goto("/");
  const input = page.locator("[data-input]");
  const canvas = page.locator("[data-cube-canvas]");
  await input.fill("");
  await canvas.focus();

  await page.keyboard.press("r");
  await expect(input).toHaveValue("R");
  await page.keyboard.press("Shift+u");
  await expect(input).toHaveValue("R U'");
  await page.keyboard.press("Alt+f");
  await expect(input).toHaveValue("R U' Fw");
  await page.locator("[data-viewport-panel] [data-playback-speed='1']").click();
  await page.keyboard.down("Alt");
  await page.keyboard.down("Shift");
  await page.keyboard.press("r");
  await page.keyboard.up("Shift");
  await page.keyboard.up("Alt");
  await expect(input).toHaveValue("R U' Fw Rw'");
  await canvas.focus();
  await page.keyboard.press("l");
  await page.keyboard.press("l");
  await expect(input).toHaveValue("R U' Fw Rw' L2");
  await page.keyboard.press("d");
  await page.keyboard.press("2");
  await expect(input).toHaveValue("R U' Fw Rw' L2 D2");
  await page.keyboard.press("w");
  await page.keyboard.press("b");
  await expect(input).toHaveValue("R U' Fw Rw' L2 D2 Bw");
  await page.keyboard.press("m");
  await expect(input).toHaveValue("R U' Fw Rw' L2 D2 Bw M");
  await page.keyboard.press("Shift+x");
  await expect(input).toHaveValue("R U' Fw Rw' L2 D2 Bw M x'");

  await page.keyboard.press("Shift+/");
  await expect(page.locator("[data-shortcuts-dialog]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-shortcuts-dialog]")).not.toBeVisible();

  await input.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("r");
  await expect(input).toHaveValue("R U' Fw Rw' L2 D2 Bw M x'r");
});

test("animates timeline token clicks and time-travels only across distant groups", async ({page}) => {
  await page.goto("/");
  await page.locator("[data-input]").fill("(R U F) (L D B)");
  const ribbon = page.locator("[data-move-ribbon]");
  const tokens = ribbon.locator(".move-token");
  const canvas = page.locator("[data-cube-canvas]");
  const position = page.locator("[data-playback-position]");

  await page.locator("[data-playback-scrubber]").fill("0");
  await tokens.nth(2).click();
  await expect(ribbon).toHaveAttribute("data-navigation-mode", "sequence");
  await expect(ribbon).toHaveAttribute("data-navigation-speed", "2");
  await expect(canvas).toHaveAttribute("data-animating", "true");
  await expect(position).toHaveText("Move 3 of 6");

  await tokens.nth(3).click();
  await expect(ribbon).toHaveAttribute("data-navigation-mode", "adjacent");
  await expect(ribbon).toHaveAttribute("data-navigation-speed", "1");
  await expect(position).toHaveText("Move 4 of 6");

  await tokens.nth(0).click();
  await expect(ribbon).toHaveAttribute("data-navigation-mode", "time-travel");
  await expect(ribbon).toHaveAttribute("data-navigation-speed", "1");
  await expect(position).toHaveText("Move 1 of 6");
});

test("animates distant hover previews and decelerates into the target state", async ({page}) => {
  await page.goto("/");
  await page.locator("[data-input]").fill("(R U F L D B R U)");
  const canvas = page.locator("[data-cube-canvas]");
  const target = page.locator("[data-move-ribbon] .move-token").nth(7);
  await page.locator("[data-playback-scrubber]").fill("0");
  await target.hover();
  await expect(canvas).toHaveAttribute("data-animating", "true");
  await expect(canvas).toHaveAttribute("data-hover-preview-index", "7");
  await expect(canvas).toHaveAttribute("data-hover-preview-speed", "2");
  await expect(canvas).toHaveAttribute("data-preview-move-index", "7");

  await page.locator("[data-playback-position]").hover();
  await expect(canvas).toHaveAttribute("data-animating", "true");
  await expect(canvas).not.toHaveAttribute("data-hover-preview-index", /.+/);
  await expect(page.locator("[data-playback-position]")).toHaveText("Move 0 of 8");
});

test("enables timeline hover previews only while stopped or paused", async ({page}) => {
  await page.goto("/");
  await page.locator("[data-input]").fill("(R U F L D B)");
  const ribbon = page.locator("[data-move-ribbon]");
  const canvas = page.locator("[data-cube-canvas]");
  const target = ribbon.locator(".move-token").nth(5);
  const play = page.getByRole("button", {name: "Play forward"});

  await page.locator("[data-playback-scrubber]").fill("0");
  await page.locator("[data-viewport-panel] [data-playback-speed='0.2']").click();
  await play.click();
  await expect(ribbon).toHaveAttribute("data-hover-preview", "disabled");
  await target.hover();
  await page.waitForTimeout(120);
  await expect(play).toHaveAttribute("aria-pressed", "true");
  await expect(canvas).not.toHaveAttribute("data-preview-move-index", /.+/);

  await page.getByRole("button", {name: "Pause playback"}).click();
  await expect(ribbon).toHaveAttribute("data-hover-preview", "enabled");
  await page.locator("[data-playback-position]").hover();
  await target.hover();
  await expect(canvas).toHaveAttribute("data-preview-move-index", "5");
});

test("holds the hovered cube state over neutral timeline gaps", async ({page}) => {
  await page.goto("/");
  await page.locator("[data-input]").fill("(R U F L) @1.2s (D B)");
  const canvas = page.locator("[data-cube-canvas]");
  const target = page.locator("[data-move-ribbon] .move-token").nth(3);
  await page.locator("[data-playback-scrubber]").fill("0");

  await target.hover();
  await expect(canvas).toHaveAttribute("data-hover-preview-index", "3");
  const heldFacelets = await canvas.getAttribute("data-hover-preview-facelets");

  await page.locator("[data-move-ribbon] .timeline-gap").hover();
  await expect(canvas).toHaveAttribute("data-hover-preview-held", "true");
  await expect(canvas).toHaveAttribute("data-hover-preview-index", "3");
  await expect(canvas).toHaveAttribute("data-hover-preview-facelets", heldFacelets ?? "");
  await expect(canvas).not.toHaveAttribute("data-turn-preview-degrees", /.+/);

  await page.waitForTimeout(300);
  await expect(canvas).toHaveAttribute("data-hover-preview-index", "3");
  await page.locator("[data-playback-position]").hover();
  await expect(canvas).not.toHaveAttribute("data-hover-preview-index", /.+/);
});

test("plays internal pauses without changing the canonical cube state", async ({page}) => {
  await page.goto("/");
  const input = page.locator("[data-input]");
  const position = page.locator("[data-playback-position]");
  const facelets = page.locator('[data-output="facelets"]');

  await input.fill("R . U /* inspection */");
  await expect(page.locator("[data-move-ribbon] .move-token")).toHaveCount(2);
  await expect(page.locator("[data-move-ribbon] .timeline-gap")).toHaveCount(1);
  await expect(page.locator("[data-move-ribbon] .move-token.pause")).toHaveCount(0);
  await page.locator("[data-playback-scrubber]").fill("0");
  await page.getByRole("button", {name: "Step forward"}).click();
  await expect(position).toHaveText("Move 1 of 2");
  const afterR = await facelets.textContent();
  await page.getByRole("button", {name: "Step forward"}).click();
  await expect(position).toHaveText("Move 2 of 2", {timeout: 1100});
  await expect(facelets).not.toHaveText(afterR ?? "");
  await expect(page.locator('[data-compatibility-profile="cubingJs"]')).toContainText("×");

  await input.fill("R @1.3s U");
  await expect(page.locator("[data-move-ribbon] .move-token")).toHaveCount(2);
  await expect(page.locator("[data-move-ribbon] .timeline-gap.step-gap")).toHaveCount(1);
  await expect(page.locator('[data-compatibility-profile="cubingJs"]')).toContainText("✓");

  await input.fill("R x y' z2 @0.5s U");
  await expect(page.locator("[data-move-ribbon] .move-token")).toHaveCount(5);
  await expect(position).toHaveText("Move 5 of 5");
  await expect(page.locator("[data-playback-htm]")).toHaveText("2 of 2");
});

test("steps complete sequences without waiting on pauses", async ({page}) => {
  await page.goto("/");
  await page.locator("[data-input]").fill("(R @1.3s U) (F D)");
  const position = page.locator("[data-playback-position]");
  await page.locator("[data-playback-scrubber]").fill("0");

  await page.locator("[data-playback-scrubber]").evaluate((element) => element.blur());
  await page.keyboard.press("Shift+ArrowRight");
  await expect(position).toHaveText("Move 2 of 4", {timeout: 2200});
  await expect(page.locator("[data-move-ribbon] .move-group").nth(1)).toHaveClass(/focused/);

  await page.keyboard.press("Shift+ArrowLeft");
  await expect(position).toHaveText("Move 0 of 4", {timeout: 2200});
  await expect(page.locator("[data-move-ribbon] .move-group").first()).toHaveClass(/focused/);
});

test("applies algorithm workbench actions and generates size-aware practice scrambles", async ({page}) => {
  await page.goto("/");
  await page.getByRole("button", {name: "Alg Workbench"}).click();
  const input = page.locator("[data-input]");
  const moves = page.locator("[data-moves-input]");
  const invert = page.getByRole("button", {name: "Invert"});

  await expect(invert).toBeDisabled();
  await moves.fill("R U R'");
  await expect(invert).toBeEnabled();
  await invert.click();
  await expect(moves).toHaveValue("R U' R'");

  await moves.fill("R L R'");
  await page.getByRole("button", {name: "Simplify"}).click();
  await expect(moves).toHaveValue("L");

  await moves.fill("(U3')2'");
  const simplify = page.locator('[data-alg-transform="simplify"]');
  await simplify.click();
  await expect(moves).toHaveValue("U2");

  await moves.fill("(F2)2");
  await simplify.click();
  await expect(simplify).toHaveText("Already solved (0 moves)");
  await expect(moves).toHaveValue("");
  await expect(simplify).toHaveText("⚡ Simplify", {timeout: 3000});

  await moves.fill("Rw2 fw'");
  await page.getByRole("button", {name: "Normalize"}).click();
  await expect(moves).toHaveValue("Rw2 Fw'");

  await moves.fill("R U R'");
  await page.getByRole("button", {name: "Mirror L/R"}).click();
  await expect(moves).toHaveValue("L' U' L");

  await moves.fill("F U F'");
  await page.getByRole("button", {name: "Mirror F/B"}).click();
  await expect(moves).toHaveValue("B' U' B");

  await moves.fill("U R U'");
  await page.getByRole("button", {name: "Mirror U/D"}).click();
  await expect(moves).toHaveValue("D' R' D");

  await moves.fill("U F U'");
  await page.getByRole("button", {name: "Rotate x"}).click();
  await expect(moves).toHaveValue("B U B'");

  await moves.fill("R U R'");
  await page.getByRole("button", {name: "Rotate y"}).click();
  await expect(moves).toHaveValue("F U F'");

  await moves.fill("U R U'");
  await page.getByRole("button", {name: "Rotate z"}).click();
  await expect(moves).toHaveValue("R D R'");

  // Setup becoming a non-algorithm state has no bearing on transforms, which
  // operate purely on Moves; clearing Moves is what disables them.
  await moves.fill("");
  await expect(invert).toBeDisabled();
  await moves.fill("R U R'");
  await expect(invert).toBeEnabled();
  await input.fill("AAAAAAAAAAAA");
  await expect(invert).toBeEnabled();
  await moves.fill("");
  await input.fill("");

  await page.locator('[data-size="2"]').click();
  await page.getByRole("button", {name: "Practice scramble"}).click();
  await expect(page.locator("[data-status]")).toHaveText("Algorithm · SiGN");
  const scramble = await input.inputValue();
  expect(scramble.trim().split(/\s+/)).toHaveLength(11);
});

test("searches for a shorter equivalent algorithm and previews it before applying", async ({page}) => {
  await page.goto("/");
  await page.getByRole("button", {name: "Alg Workbench"}).click();
  const moves = page.locator("[data-moves-input]");
  const shorten = page.locator("[data-shorten-search]");
  const result = page.locator("[data-shorten-result]");
  const summary = page.locator("[data-shorten-summary]");
  const preview = page.locator("[data-shorten-preview]");
  const apply = page.locator("[data-shorten-apply]");
  const dismiss = page.locator("[data-shorten-dismiss]");

  // The optimizer only supports 3x3, so the button stays disabled on other sizes
  // even with a non-empty, syntactically valid Moves field.
  await page.locator('[data-size="2"]').click();
  await moves.fill("R U R'");
  await expect(shorten).toBeDisabled();

  await page.locator('[data-size="3"]').click();
  await expect(shorten).toBeDisabled();
  await moves.fill("R R");
  await expect(shorten).toBeEnabled();
  await shorten.click();
  await expect(result).toBeVisible({timeout: 5000});
  await expect(summary).toHaveText(/shorter equivalent: 1 moves \(was 2\)/);
  await expect(preview).toHaveText("R2");
  await expect(apply).toBeVisible();

  await apply.click();
  await expect(moves).toHaveValue("R2");
  await expect(result).toBeHidden();

  await moves.fill("R U R' U R U2 R'");
  await shorten.click();
  await expect(result).toBeVisible({timeout: 5000});
  await expect(summary).toHaveText("No shorter equivalent found within the search budget.");
  await expect(apply).toBeHidden();

  await dismiss.click();
  await expect(result).toBeHidden();

  await moves.fill("");
  await expect(shorten).toBeDisabled();
});

test("recombines and replay-verifies NISS work before loading it", async ({page}) => {
  await page.goto("/");
  await page.getByRole("button", {name: "Alg Workbench"}).click();
  const input = page.locator("[data-input]");
  await input.fill("R U");

  await page.locator("[data-niss-panel] summary").click();
  await expect(page.locator("[data-niss-inverse]")).toHaveText("U' R'");

  await page.locator("[data-niss-normal]").fill("U'");
  await page.locator("[data-niss-inverse-moves]").fill("R");
  await page.getByRole("button", {name: "Recombine and verify"}).click();
  await expect(page.locator("[data-niss-result]")).toContainText("Verified · 2 moves · U' R'");
  await page.getByRole("button", {name: "Load verified solution"}).click();
  await expect(input).toHaveValue("U' R'");

  await input.fill("R U");
  await page.locator("[data-niss-normal]").fill("R'");
  await page.locator("[data-niss-inverse-moves]").fill("U'");
  await page.getByRole("button", {name: "Recombine and verify"}).click();
  await expect(page.locator("[data-niss-result]")).toContainText("does not solve");
  await expect(page.getByRole("button", {name: "Load verified solution"})).toBeDisabled();
});

test("switches SPA workspaces without remounting the viewport and teaches a solution", async ({page}) => {
  await page.goto("/");
  const input = page.locator("[data-input]");
  const canvas = page.locator("[data-cube-canvas]");
  await canvas.evaluate((element) => element.setAttribute("data-persistence-probe", "mounted"));
  await input.fill("R U R' U'");

  await page.getByRole("button", {name: "Academy", exact: true}).click();
  await expect(page.locator("[data-workspace-panel='academy']")).toBeVisible();
  await expect(page.locator("[data-academy-method-panel='beginner']")).toBeVisible();
  await expect(page.locator("[data-workspace-panel='converter']")).toBeHidden();
  await expect(canvas).toHaveAttribute("data-persistence-probe", "mounted");
  await expect(page).toHaveURL(/tab=academy&method=beginner/);

  await page.getByRole("button", {name: "Generate verified solution"}).click();
  await expect(page.locator("[data-beginner-status]")).toContainText("Verified Beginner LBL solution");
  await expect(page.locator("[data-beginner-phase]")).toHaveCount(7);
  await expect(page.locator("[data-beginner-phase]").nth(0)).toContainText("Keep white on top");
  await expect(page.locator("[data-beginner-phase]").nth(2)).toContainText("Turn yellow to the top");
  await expect(page.locator("[data-playback-position]")).toHaveText(/Move 0 of \d+/);
  await expect(page.locator("[data-coaching-controls]")).toBeVisible();
  await expect(page.getByRole("button", {name: "Coached", exact: true})).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-beginner-solution]")).toContainText("// STEP 1: White Cross");
  await expect(page.locator("[data-beginner-solution]")).toContainText("(");
  await expect(page.locator("[data-beginner-solution]")).toContainText("x2");
  await expect(page.locator("[data-beginner-solution]")).toContainText("@0.5s");
  await expect(page.locator("[data-beginner-solution]")).toContainText("@1.2s");
  const firstTimelineGroup = page.locator("[data-move-ribbon] .move-group").first();
  await expect(firstTimelineGroup).toBeVisible();
  await expect(firstTimelineGroup).not.toHaveAttribute("title", /.+/);
  await expect(firstTimelineGroup).toHaveAttribute(
    "aria-label",
    /^Algorithm sequence purpose: .+$/,
  );
  const cameraBeforeSequenceYaw = await canvas.getAttribute("data-camera-yaw");
  const cameraBeforeSequencePitch = await canvas.getAttribute("data-camera-pitch");
  await firstTimelineGroup.hover();
  await expect(firstTimelineGroup).toHaveClass(/focused/);
  await expect(canvas).toHaveAttribute("data-focus-piece", /.+/);
  await expect(canvas).toHaveAttribute("data-focus-highlight", "edges");
  const sequencePurpose = (await firstTimelineGroup.getAttribute("aria-label"))
    ?.replace("Algorithm sequence purpose: ", "");
  await expect(canvas).toHaveAttribute("data-focus-label", sequencePurpose ?? "");
  await expect(page.locator("[data-motion-overlay]")).toHaveAttribute("data-motion-visible", "true");
  await page.waitForTimeout(320);
  const sequenceCameraYaw = await canvas.getAttribute("data-camera-yaw");
  const sequenceCameraPitch = await canvas.getAttribute("data-camera-pitch");
  const firstMove = firstTimelineGroup.locator(".move-token").first();
  const exactBeforeMove = await page.locator('[data-output="facelets"]').textContent();
  await firstMove.hover();
  await expect(firstMove).toHaveClass(/turn-guided/);
  await expect(canvas).toHaveAttribute("data-focus-label", sequencePurpose ?? "");
  await expect(page.locator("[data-motion-overlay]")).toHaveAttribute("data-turn-guide", /.+/);
  await expect(canvas).toHaveAttribute("data-turn-preview-degrees", "4");
  await expect(canvas).toHaveAttribute("data-preview-move-index", "0");
  await expect(canvas).toHaveAttribute("data-preview-facelets", exactBeforeMove ?? "");
  await page.waitForTimeout(220);
  await expect(canvas).toHaveAttribute("data-camera-yaw", sequenceCameraYaw ?? "");
  await expect(canvas).toHaveAttribute("data-camera-pitch", sequenceCameraPitch ?? "");
  await page.locator("[data-playback-position]").hover();
  await page.waitForTimeout(320);
  await expect(canvas).toHaveAttribute("data-camera-yaw", cameraBeforeSequenceYaw ?? "");
  await expect(canvas).toHaveAttribute("data-camera-pitch", cameraBeforeSequencePitch ?? "");
  await firstMove.hover();
  await page.locator("[data-turn-guides]").click();
  await expect(page.locator("[data-motion-overlay]")).not.toHaveAttribute("data-turn-guide", /.+/);
  await firstMove.hover();
  await expect(page.locator("[data-motion-overlay]")).not.toHaveAttribute("data-turn-guide", /.+/);
  await expect(canvas).toHaveAttribute("data-turn-preview-degrees", "4");
  await expect(canvas).toHaveAttribute("data-preview-facelets", exactBeforeMove ?? "");
  await page.locator("[data-playback-position]").hover();
  await page.locator("[data-turn-guides]").click();
  await firstMove.hover();
  await expect(page.locator("[data-motion-overlay]")).toHaveAttribute("data-turn-guide", /.+/);
  await page.locator("[data-playback-position]").hover();
  await expect(canvas).not.toHaveAttribute("data-turn-preview-degrees", /.+/);
  await expect(canvas).not.toHaveAttribute("data-focus-piece", /.+/);
  await expect(page.locator("[data-motion-overlay]")).not.toHaveAttribute("data-turn-guide", /.+/);
  const secondPhase = page.locator("[data-beginner-phase]").nth(1);
  await secondPhase.hover();
  await expect(secondPhase).toHaveClass(/focused/);
  await expect(canvas).toHaveAttribute("data-focus-piece", /.+/);
  await expect(page.locator("[data-move-ribbon] .move-token.pause")).toHaveCount(0);
  await expect(page.locator("[data-move-ribbon] .timeline-gap.sequence-gap")).toHaveCount(0);
  await expect(page.locator("[data-move-ribbon] .timeline-gap.step-gap").first()).toBeVisible();

  const phaseTwoStart = Number(await secondPhase.getAttribute("data-beginner-phase-start"));
  await page.locator("[data-viewport-panel] [data-playback-speed='0.5']").click();
  await page.locator("[data-playback-scrubber]").fill(String(phaseTwoStart - 1));
  await page.getByRole("button", {name: "Step forward"}).click();
  await expect(page.locator("[data-motion-overlay]")).not.toHaveAttribute("data-milestone", /.+/);
  await expect(page.locator("[data-playback-position]")).toHaveText(/Move \d+ of \d+/);

  await page.getByRole("button", {name: "Continuous", exact: true}).click();
  await expect(page.getByRole("button", {name: "Continuous", exact: true})).toHaveAttribute("aria-pressed", "true");

  await page.locator("[data-playback-scrubber]").fill("0");
  await page.locator("[data-viewport-panel] [data-playback-speed='2']").click();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.keyboard.press("Shift+ArrowRight");
  await expect(page.locator("[data-beginner-current]")).toContainText("Step 1: White Cross");
  await expect(canvas).toHaveAttribute("data-sequence-purpose-start", /\d+/);
  await expect(canvas).toHaveAttribute("data-focus-piece", /.+/);
  await expect(canvas).toHaveAttribute("data-sequence-camera-yaw", /-?\d+\.\d+/);
  await expect(canvas).toHaveAttribute("data-sequence-camera-pitch", /-?\d+\.\d+/);

  await page.getByRole("button", {name: "Alg Workbench"}).click();
  await expect(page.locator("[data-workspace-panel='workbench']").first()).toBeVisible();
  await expect(page.locator("[data-workspace-panel='academy']")).toBeHidden();
  await expect(canvas).toHaveAttribute("data-persistence-probe", "mounted");
  await expect(page).toHaveURL(/tab=workbench/);

  await expect(page.locator("[data-practice-scramble]").locator("xpath=parent::*")).toHaveClass(/preset-row/);
});

test("explains solved Academy input and solves a scrambled compact-facelet state", async ({page}) => {
  await page.goto("/#size=3&tab=academy&method=beginner");
  const input = page.locator("[data-input]");
  const status = page.locator("[data-beginner-status]");

  await expect(status).toContainText("already solved");
  await page.getByRole("button", {name: "Show solved phases"}).click();
  await expect(status).toContainText("Already solved · 0 HTM");
  await expect(page.locator("[data-beginner-phase].satisfied")).toHaveCount(7);
  await expect(page.locator("[data-playback]")).toBeVisible();
  await expect(page.locator("[data-playback-position]")).toHaveText("Move 0 of 0");

  await input.fill("R U R' U'");
  await expect(page.locator("[data-status]")).toHaveText("Algorithm · SiGN");
  const scrambledFacelets = await page.locator('[data-output="facelets"]').textContent();
  expect(scrambledFacelets).toBeTruthy();
  expect(scrambledFacelets).not.toBe("UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB");
  await input.fill(scrambledFacelets ?? "");
  await expect(page.locator("[data-status]")).toHaveText("Compact facelets");
  await expect(page.getByRole("button", {name: "Generate verified solution"})).toBeEnabled();
  await page.getByRole("button", {name: "Generate verified solution"}).click();
  await expect(status).toContainText("Verified Beginner LBL solution");
  await expect(status).not.toContainText("0 HTM");
  const moveCounts = await page.locator("[data-beginner-phase]").evaluateAll((phases) =>
    phases.map((phase) => Number(phase.getAttribute("data-phase-move-count")))
  );
  expect(moveCounts.some((count) => count > 0)).toBe(true);
});

test("opens CFOP Academy and builds its four replay-verified stages", async ({page}) => {
  await page.goto("/#size=3&alg=R+U+R%27+U%27&tab=academy&method=fullCfop");
  const canvas = page.locator("[data-cube-canvas]");
  await canvas.evaluate((element) => element.setAttribute("data-cfop-persistence-probe", "mounted"));

  await expect(page.locator("[data-workspace-panel='academy']")).toBeVisible();
  const fullPanel = page.locator("[data-academy-method-panel='fullCfop']");
  await expect(fullPanel).toBeVisible();
  await expect(page.getByRole("button", {name: "Academy", exact: true})).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-academy-method='fullCfop']")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", {name: "Generate verified solution"}).click();

  await expect(page.locator("[data-full-cfop-status]")).toContainText("Verified Full CFOP solution");
  await expect(fullPanel.locator("[data-cfop-phase]")).toHaveCount(4);
  await expect(fullPanel.locator("[data-cfop-phase]").nth(0)).toContainText("Cross");
  await expect(fullPanel.locator("[data-cfop-phase]").nth(1)).toContainText("F2L Pairs");
  await expect(fullPanel.locator("[data-cfop-phase]").nth(2)).toContainText("One-Look OLL");
  await expect(fullPanel.locator("[data-cfop-phase]").nth(3)).toContainText("One-Look PLL");
  await expect(fullPanel.locator("[data-cfop-phase]").nth(1)).toContainText("white–");
  await expect(fullPanel.locator("[data-cfop-phase]").nth(1)).toHaveAttribute("data-phase-move-count", /\d+/);
  await expect(page.locator("[data-full-cfop-solution]")).toContainText("// CFOP 1: Cross");
  await expect(page.locator("[data-full-cfop-solution]")).toContainText("(x2) @0.5s");
  await expect(page.locator("[data-playback-position]")).toHaveText(/Move 0 of \d+/);

  const f2l = fullPanel.locator("[data-cfop-phase]").nth(1);
  await f2l.click();
  await expect(page.locator("[data-full-cfop-current]")).toContainText("Step 2: F2L Pairs");
  await expect(canvas).toHaveAttribute("data-cfop-persistence-probe", "mounted");

  await page.locator("[data-academy-method='advancedLbl']").click();
  const advancedLblPanel = page.locator("[data-academy-method-panel='advancedLbl']");
  await expect(advancedLblPanel).toBeVisible();
  await page.getByRole("button", {name: "Generate verified solution"}).click();
  await expect(page.locator("[data-advanced-lbl-status]")).toContainText("Verified Advanced LBL solution");
  await expect(advancedLblPanel.locator("[data-beginner-phase]")).toHaveCount(7);
  await expect(advancedLblPanel.locator("[data-beginner-phase]").nth(0)).toContainText("Direct White Cross");
  await expect(advancedLblPanel.locator("[data-beginner-phase]").nth(6)).toContainText("Permute Yellow Edges");

  await page.locator("[data-academy-method='beginnerCfop']").click();
  const beginnerCfopPanel = page.locator("[data-academy-method-panel='beginnerCfop']");
  await expect(beginnerCfopPanel).toBeVisible();
  await page.getByRole("button", {name: "Generate verified solution"}).click();
  await expect(page.locator("[data-beginner-cfop-status]")).toContainText("Verified Beginner CFOP solution");
  await expect(beginnerCfopPanel.locator("[data-cfop-phase]").nth(2)).toContainText("Two-Look OLL");
  await expect(beginnerCfopPanel.locator("[data-cfop-phase]").nth(3)).toContainText("Two-Look PLL");

  await page.locator("[data-academy-method='advancedCfop']").click();
  const advancedPanel = page.locator("[data-academy-method-panel='advancedCfop']");
  await page.getByRole("button", {name: "Generate verified solution"}).click();
  await expect(page.locator("[data-advanced-cfop-status]")).toContainText("Verified Advanced CFOP solution");
  await expect(advancedPanel.locator("[data-cfop-phase]").nth(2)).toContainText("One-Look OLL");
  await expect(advancedPanel.locator("[data-cfop-phase]").nth(3)).toContainText("One-Look PLL");

  await page.locator("[data-academy-method='beginner']").click();
  await expect(page.locator("[data-academy-method-panel='beginner']")).toBeVisible();
  await expect(page).toHaveURL(/tab=academy&method=beginner/);
  await page.getByRole("button", {name: "Generate verified solution"}).click();
  await expect(page.locator("[data-beginner-status]")).toContainText("Verified Beginner LBL solution");
  await page.locator("[data-academy-method='fullCfop']").click();
  await expect(page.locator("[data-full-cfop-status]")).toContainText("Verified Full CFOP solution");
  await expect(fullPanel.locator("[data-cfop-phase]")).toHaveCount(4);
  await expect(page.locator("[data-academy-comparison]")).toContainText("Same-state comparison");
  await expect(page.locator("[data-academy-comparison]")).toContainText(/Beginner LBL \d+/);
  await expect(page.locator("[data-academy-comparison]")).toContainText(/Advanced LBL \d+/);
  await expect(page.locator("[data-academy-comparison]")).toContainText(/Beginner CFOP \d+/);
  await expect(page.locator("[data-academy-comparison]")).toContainText(/Full CFOP \d+/);
  await expect(page.locator("[data-academy-comparison]")).toContainText(/Advanced CFOP \d+/);
  await expect(page.locator("[data-playback-position]")).toHaveText(/Move 0 of \d+/);

  await page.getByRole("button", {name: "Converter"}).click();
  await expect(page).toHaveURL(/tab=converter|#size=3/);
  await expect(canvas).toHaveAttribute("data-cfop-persistence-probe", "mounted");
});

test("builds Classical and Enhanced Petrus tutorials from the same cube state", async ({page}) => {
  await page.goto("/#size=3&alg=R+U+R%27+U%27&tab=academy&method=petrus");
  const classical = page.locator("[data-academy-method-panel='petrus']");
  await expect(classical).toBeVisible();
  await expect(page.locator("[data-academy-method='petrus']")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", {name: "Generate verified solution"}).click();
  await expect(page.locator("[data-petrus-status]")).toContainText("Verified Classical Petrus solution");
  await expect(classical.locator("[data-petrus-phase]")).toHaveCount(7);
  await expect(classical.locator("[data-petrus-phase]").nth(0)).toContainText("2×2×2 Block");
  await expect(classical.locator("[data-petrus-phase]").nth(1)).toContainText("2×2×3");
  await expect(classical.locator("[data-petrus-phase]").nth(2)).toContainText("Orient Bad Edges");
  await expect(classical.locator("[data-petrus-phase]").nth(3)).toContainText("2-Generator F2L Finish");
  await expect(classical.locator("[data-petrus-phase]").nth(6)).toContainText("Permute Last-Layer Edges");
  await expect(page.locator("[data-petrus-solution]")).toContainText("// PETRUS 1:");

  await page.locator("[data-academy-method='enhancedPetrus']").click();
  await expect(page).toHaveURL(/method=enhancedPetrus/);
  const enhanced = page.locator("[data-academy-method-panel='enhancedPetrus']");
  await expect(enhanced).toBeVisible();
  await page.getByRole("button", {name: "Generate verified solution"}).click();
  await expect(page.locator("[data-enhanced-petrus-status]")).toContainText("Verified Enhanced Petrus solution");
  await expect(enhanced.locator("[data-petrus-phase]")).toHaveCount(5);
  await expect(enhanced.locator("[data-petrus-phase]").nth(4)).toContainText("COLL + EPLL Finish");
  await expect(enhanced.locator("[data-petrus-phase]").nth(4)).toContainText(/COLL (?:skip|[A-Za-z]+-?\d)/);
  await expect(enhanced.locator("[data-petrus-phase]").nth(4)).toContainText("EPLL:");
  await expect(page.locator("[data-academy-comparison]")).toContainText("Classical Petrus");
  await expect(page.locator("[data-academy-comparison]")).toContainText("Enhanced Petrus");
});

test("mirrors auto-orbit and playback speed between Settings and the viewport, and persists preferences", async ({page}) => {
  await page.goto("/");
  const settingsOpen = page.locator("[data-settings-open]");
  const settingsDialog = page.locator("[data-settings-dialog]");
  const settingsClose = page.locator("[data-settings-close]");
  const settingsAutoOrbit = page.locator("[data-settings-auto-orbit]");
  const viewportAutoOrbit = page.locator("[data-auto-orbit]");
  const settingsSpeed2 = page.locator('[data-settings-dialog] [data-playback-speed="2"]');
  const viewportSpeed2 = page.locator('[data-viewport-panel] [data-playback-speed="2"]');
  const tnoodleUrl = page.locator("[data-settings-tnoodle-url]");
  const inspectionSeconds = page.locator("[data-settings-inspection-seconds]");

  await settingsOpen.click();
  await expect(settingsDialog).toBeVisible();
  await expect(viewportAutoOrbit).toHaveAttribute("aria-pressed", "false");
  await expect(settingsAutoOrbit).toHaveAttribute("aria-pressed", "false");

  // The two auto-orbit controls share URL-addressable workspace state;
  // toggling either must update both.
  await settingsAutoOrbit.click();
  await expect(settingsAutoOrbit).toHaveAttribute("aria-pressed", "true");
  await expect(settingsAutoOrbit).toHaveText("On");
  await expect(viewportAutoOrbit).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/orbit=on/);

  await settingsSpeed2.click();
  await expect(settingsSpeed2).toHaveAttribute("aria-pressed", "true");
  await expect(viewportSpeed2).toHaveAttribute("aria-pressed", "true");

  await tnoodleUrl.fill("http://localhost:9999");
  await tnoodleUrl.press("Tab");
  await inspectionSeconds.fill("12");
  await inspectionSeconds.press("Tab");

  await settingsClose.click();
  await expect(settingsDialog).toBeHidden();

  await page.reload();
  await expect(page.locator("[data-auto-orbit]")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-viewport-panel] [data-playback-speed="2"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("[data-settings-open]").click();
  await expect(page.locator("[data-settings-tnoodle-url]")).toHaveValue("http://localhost:9999");
  await expect(page.locator("[data-settings-inspection-seconds]")).toHaveValue("12");
});

test("exports a solve card compositing the cube image with Setup, Moves, and Note", async ({page}) => {
  await page.goto("/#alg=R+U+R%27+U%27&note=PB+attempt");
  const solveCard = page.locator("[data-solve-card]");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    solveCard.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^cubelab-solve-card-3x3-\d+\.png$/);
  await expect(solveCard).toHaveText(/Copied!|Downloaded!/);
  await expect(solveCard).toHaveText("Solve card", {timeout: 3000});
});

test("resolves a blank 3x3 hand-entry grid quickly, without a lingering spinner or a shifted dot grid", async ({page}) => {
  await page.goto("/");
  await page.locator("[data-manual-state-open]").click();
  const dialog = page.locator("[data-manual-state-dialog]");
  await expect(dialog).toBeVisible();

  // A blank 3x3 has ~48 non-centre stickers each resolving one at a time;
  // this used to take a very long time because dot resolution ran the full
  // corner+edge feasibility search for every candidate colour of every
  // sticker instead of the cheap per-cubie check. Give it a generous but
  // bounded budget so a real regression still fails the test.
  await expect(dialog.locator(".manual-state-dots.pending")).toHaveCount(0, {timeout: 5000});

  // The stale "pending" class used to survive resolution, leaving its ::before
  // spinner as an extra grid item ahead of the six real dots and shifting
  // every dot one cell off its fixed U/D, R/L, F/B slot.
  const firstDots = dialog.locator(".manual-state-dots").first();
  await expect(firstDots).not.toHaveClass(/pending/);
  await expect(firstDots.locator("i")).toHaveCount(6);
  await expect(firstDots.locator('i[data-face="U"]')).toHaveCount(1);
  await expect(firstDots.locator('i[data-face="B"]')).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("shows counted colour pads, a live summary card, and rings a hovered sticker's piece-mates", async ({page}) => {
  await page.goto("/");
  await page.locator("[data-manual-state-open]").click();
  const dialog = page.locator("[data-manual-state-dialog]");
  await expect(dialog).toBeVisible();
  const net = dialog.locator("[data-manual-state-grid]");

  const summaryRows = dialog.locator("[data-manual-state-summary] .manual-state-summary-row");
  await expect(summaryRows).toHaveCount(4); // Entered, Corners, Edges, Remaining
  const paletteLeft = dialog.locator(".manual-state-colour-left");
  await expect(paletteLeft.first()).toHaveText("8 left"); // 9 stickers/face minus the fixed centre

  // Index 8 is UFR's U sticker; its corner slot is [8, 9, 20].
  await net.locator('[data-manual-state-index="8"]').click();
  await expect(paletteLeft.first()).toHaveText("7 left");

  await net.locator('[data-manual-state-index="9"]').hover();
  // The flat net and both preview cubes each carry their own copy of every
  // index, so a hovered piece rings across all three roots at once.
  const selfRings = dialog.locator('[data-piece-hover="self"]');
  await expect(selfRings).toHaveCount(3);
  for (const el of await selfRings.all()) await expect(el).toHaveAttribute("data-manual-state-index", "9");
  const mateRings = dialog.locator('[data-piece-hover="mate"]');
  await expect(mateRings).toHaveCount(6);
  const mateIndices = await mateRings.evaluateAll((els) => els.map((e) => e.getAttribute("data-manual-state-index")).sort());
  expect(mateIndices).toEqual(["20", "20", "20", "8", "8", "8"]);

  // [data-manual-state-grid] is display:contents (its face groups are
  // promoted into .manual-state-net's own grid), so it has no box of its
  // own to hover a position within — hover the real container instead, at
  // one of the net's intentionally-empty corner cells.
  await dialog.locator(".manual-state-net").hover({position: {x: 4, y: 4}});
  await expect(dialog.locator("[data-piece-hover]")).toHaveCount(0);
});

test("paints a specific dot's colour on click and loads a filled sticker's colour on double-click", async ({page}) => {
  await page.goto("/");
  await page.locator("[data-manual-state-open]").click();
  const dialog = page.locator("[data-manual-state-dialog]");
  await expect(dialog).toBeVisible();
  const net = dialog.locator("[data-manual-state-grid]");

  // Up is selected by default, but clicking sticker 8's own Right dot should
  // still paint it Right — the dot clicked wins over the palette selection.
  const sticker8 = net.locator('[data-manual-state-index="8"]');
  await sticker8.locator('.manual-state-dots i[data-face="R"]').click();
  await expect(sticker8).toHaveText("R");

  // Double-click loads that filled sticker's own colour into the palette,
  // without repainting the sticker itself.
  await sticker8.dblclick();
  await expect(dialog.locator('[data-manual-state-colour="R"]')).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.locator('[data-manual-state-colour="U"]')).toHaveAttribute("aria-pressed", "false");
  await expect(sticker8).toHaveText("R");

  // A plain click on an already-filled sticker no longer silently repaints
  // it — that would race the double-click's colour pickup above. Right-click
  // (erase) then click remains the way to correct a filled sticker.
  await dialog.locator('[data-manual-state-colour="U"]').click();
  await sticker8.click();
  await expect(sticker8).toHaveText("R");

  // A fixed centre is a real <button> too, not a native disabled one — that
  // would also suppress its double-click, not just click/drag paint.
  const rCentre = net.locator('[data-manual-state-index="13"]');
  await expect(rCentre).toHaveText("R");
  await dialog.locator('[data-manual-state-colour="U"]').click();
  await rCentre.dblclick();
  await expect(dialog.locator('[data-manual-state-colour="R"]')).toHaveAttribute("aria-pressed", "true");
  await expect(rCentre).toHaveText("R");
});

test("navigates and paints the net with the keyboard, wrapping across a face edge", async ({page}) => {
  await page.goto("/");
  await page.locator("[data-manual-state-open]").click();
  const dialog = page.locator("[data-manual-state-dialog]");
  await expect(dialog).toBeVisible();
  const net = dialog.locator("[data-manual-state-grid]");

  // Index 8 is U's own bottom-right corner (row 2, col 2). A letter key
  // paints whichever sticker currently has focus.
  const u8 = net.locator('[data-manual-state-index="8"]');
  await u8.click();
  await page.keyboard.press("r");
  await expect(u8).toHaveText("R");

  // Moving right off U's last column wraps onto R's own corner column,
  // landing on global index 9 (R0) rather than stopping at the edge.
  await page.keyboard.press("ArrowRight");
  const focusedIndex = await page.evaluate(() => document.activeElement?.getAttribute("data-manual-state-index"));
  expect(focusedIndex).toBe("9");

  // E erases whichever sticker currently has focus.
  await page.keyboard.press("f");
  const r0 = net.locator('[data-manual-state-index="9"]');
  await expect(r0).toHaveText("F");
  await page.keyboard.press("e");
  await expect(r0).toHaveText("");
});

test("recovers full colour availability after erasing every sticker, including auto-set ones", async ({page}) => {
  await page.goto("/");
  await page.locator("[data-manual-state-open]").click();
  const dialog = page.locator("[data-manual-state-dialog]");
  await expect(dialog).toBeVisible();
  const net = dialog.locator("[data-manual-state-grid]");

  // Filling Right and Front by hand (not via Solved, which marks every cell
  // explicit) forces at least one other cell — index 8, U's own corner in
  // the URF piece — auto-set rather than explicitly clicked, so erasing it
  // has to cascade from its explicit driver rather than being erasable
  // directly.
  const rIndices = [9, 10, 11, 12, 14, 15, 16, 17];
  const fIndices = [18, 19, 20, 21, 23, 24, 25, 26];
  await dialog.locator('[data-manual-state-colour="R"]').click();
  for (const index of rIndices) await net.locator(`[data-manual-state-index="${index}"]`).click();
  await dialog.locator('[data-manual-state-colour="F"]').click();
  for (const index of fIndices) await net.locator(`[data-manual-state-index="${index}"]`).click();

  const u8 = net.locator('[data-manual-state-index="8"]');
  await expect(u8).toHaveAttribute("data-auto", "true");
  await expect(u8).toHaveText("U");

  // Erase everything in one ascending pass. index 8 is skipped while still
  // auto-set, but cascades back to blank once its R/F drivers clear.
  for (const index of [...rIndices, ...fIndices]) {
    await net.locator(`[data-manual-state-index="${index}"]`).click({button: "right"});
  }
  await expect(u8).toHaveText("");
  for (const index of [...rIndices, ...fIndices]) {
    await expect(net.locator(`[data-manual-state-index="${index}"]`)).toHaveText("");
  }

  // A fully blank draft is maximally permissive: every colour is available
  // at every remaining sticker, not just some.
  for (const index of [8, 20, 44]) {
    const dots = net.locator(`[data-manual-state-index="${index}"] .manual-state-dots i`);
    await expect(dots).toHaveCount(6);
    for (const dot of await dots.all()) {
      await expect(dot).toHaveAttribute("data-available", "true");
    }
  }
});

test("shows two CSS-3D preview cubes in the net and a shortcuts reference in the header", async ({page}) => {
  await page.goto("/");
  await page.locator("[data-manual-state-open]").click();
  const dialog = page.locator("[data-manual-state-dialog]");
  await expect(dialog).toBeVisible();

  const previews = dialog.locator(".manual-state-preview");
  await expect(previews).toHaveCount(2);
  // Not a paint surface: a foreshortened corner sticker on a cube this small
  // can project to a few-pixel-wide box, and document.elementFromPoint
  // there genuinely — verified directly, not a test artifact — resolves to
  // whichever adjacent face's sticker is nearer at that exact pixel.
  // Painting stays exact on the flat net; the previews stay decorative and
  // hover-reactive only, which the piece-mates test above already covers.
  await expect(previews.first().locator(".manual-state-preview-sticker")).toHaveCount(54);
  await expect(dialog.locator('.manual-state-preview-sticker[data-face="unknown"]').first()).toBeAttached();

  const shortcuts = dialog.locator(".manual-state-shortcuts");
  await expect(shortcuts).toBeVisible();
  await expect(shortcuts).toContainText("set colour");
  await expect(shortcuts).toContainText("paint run");
  await expect(shortcuts).toContainText("erase");
});

test("copies the hand-entered state in the chosen format, only once it is complete", async ({page, context}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.locator("[data-manual-state-open]").click();
  const dialog = page.locator("[data-manual-state-dialog]");
  const toggle = dialog.locator("[data-manual-state-copy-toggle]");

  await expect(toggle).toBeDisabled();

  await dialog.locator("[data-manual-state-solved]").click();
  await expect(toggle).toBeEnabled();

  await toggle.click();
  await expect(dialog.locator("[data-manual-state-copy-menu]")).toBeVisible();
  await dialog.locator('[data-manual-state-copy-format="compact"]').click();
  await expect(dialog.locator("[data-manual-state-copy-menu]")).toBeHidden();
  await expect(toggle).toHaveText("Copied!");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB",
  );
  await expect(toggle).toContainText("Copy as", {timeout: 3000});

  await toggle.click();
  await expect(dialog.locator("[data-manual-state-copy-menu]")).toBeVisible();
  await dialog.locator('[data-manual-state-copy-format="spaced"]').click();
  await expect(dialog.locator("[data-manual-state-copy-menu]")).toBeHidden();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "UUUUUUUUU RRRRRRRRR FFFFFFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB",
  );

  await toggle.click();
  await dialog.locator('[data-manual-state-copy-format="json"]').click();
  const json = await page.evaluate(() => navigator.clipboard.readText());
  expect(JSON.parse(json).facelets).toBe("UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB");

  await toggle.click();
  await dialog.locator('[data-manual-state-copy-format="singmaster"]').click();
  // A solved cube has no permutation cycles and no twisted pieces, so real
  // Singmaster cycle notation renders empty — matching every other Setup
  // format's "blank means solved" convention.
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("");
});
