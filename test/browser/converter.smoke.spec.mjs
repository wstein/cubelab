import {expect, test} from "@playwright/test";

test("converts algorithms and Orbit64 while switching size-aware cards", async ({page}) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  const piecesCard = page.locator('[data-output-card="pieces"]');
  const orbitCard = page.locator('[data-output-card="orbit64"]');
  const input = page.locator("[data-input]");

  await expect(page.locator("[data-status]")).toHaveText("Solved default");
  await expect(page.locator('[data-output="orbit64"]')).toHaveText("AAAAAAAAAAAA");
  await expect(piecesCard).toBeVisible();
  await expect(orbitCard).toBeVisible();
  await expect(page.locator("[data-cube-canvas]")).toHaveAttribute("data-webgl", "ready");

  await input.fill("AAAAAAAAAAAA");
  await expect(page.locator("[data-status]")).toHaveText("Orbit64");
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
  await expect(page.locator('[data-title="pieces"]')).toHaveText("2×2 CP / CO");
  await expect(page.locator('[data-output="pieces"]')).not.toContainText("ep:");
  await expect(orbitCard).toBeHidden();

  await page.locator('[data-size="4"]').click();
  await expect(piecesCard).toBeHidden();
  await expect(orbitCard).toBeHidden();
  const lowercaseControls = page.locator("[data-lowercase-controls]");
  const notationControls = page.locator("[data-notation-controls]");
  const lowercaseBanner = page.locator("[data-lowercase-banner]");
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
  await expect(lowercaseBanner).toContainText("modern SiGN wide turns");

  await input.fill("Rw U2 r'");
  await expect(lowercaseBanner).toContainText("Mixed Rw and r notation detected");
  await page.locator("[data-switch-lowercase]").click();
  await expect(page.locator('[data-lowercase-mode="InnerSlice"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(lowercaseBanner).toContainText("Legacy mode is active");
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
  await expect(page.locator('[data-output="pieces"]')).toContainText("cp: 3 0 1 2");
  await expect(page.locator('[data-output="orbit64"]')).toHaveText("AcIufRZj-AAA");
  await input.fill("(M2 E2 S2)(R L) # adjacent groups");
  await expect(page.locator("[data-status]")).toHaveText("Algorithm · SiGN");
  await expect(page.locator("[data-move-ribbon] .move-token")).toHaveCount(5);
  expect(pageErrors).toEqual([]);
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

test("places the visualizer before controls on mobile", async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/");
  const viewport = await page.locator("[data-viewport-panel]").boundingBox();
  const inputPanel = await page.locator(".input-panel").boundingBox();
  expect(viewport).not.toBeNull();
  expect(inputPanel).not.toBeNull();
  expect(viewport.y).toBeLessThan(inputPanel.y);
});

test("plays, reverses, and seeks an expanded algorithm timeline", async ({page}) => {
  await page.goto("/");
  const input = page.locator("[data-input]");
  const position = page.locator("[data-playback-position]");
  const facelets = page.locator('[data-output="facelets"]');
  const solved = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

  await input.fill("R U");
  await expect(page.locator("[data-playback]")).toBeVisible();
  await expect(position).toHaveText("Move 2 of 2");
  const finalState = await facelets.textContent();

  await page.getByRole("button", {name: "Jump to start"}).click();
  await expect(position).toHaveText("Move 0 of 2");
  await expect(facelets).toHaveText(solved);

  await page.getByRole("button", {name: "Next move"}).click();
  await expect(page.locator("[data-cube-canvas]")).toHaveAttribute("data-animating", "true");
  await expect(position).toHaveText("Move 1 of 2");
  await expect(page.locator("[data-cube-canvas]")).not.toHaveAttribute("data-animating", "true");

  await page.getByRole("button", {name: "Previous move"}).click();
  await expect(position).toHaveText("Move 0 of 2");
  await expect(facelets).toHaveText(solved);

  await page.getByRole("button", {name: "Play algorithm"}).click();
  await expect(position).toHaveText("Move 2 of 2");
  await expect(facelets).toHaveText(finalState ?? "");

  await page.getByRole("button", {name: "Jump to start"}).click();
  await page.locator("[data-playback-scrubber]").fill("2");
  await expect(position).toHaveText("Move 2 of 2");
  await expect(facelets).toHaveText(finalState ?? "");

  await input.fill("");
  await expect(page.locator("[data-playback]")).toBeHidden();
  await input.fill("R");
  await expect(page.locator("[data-cube-canvas]")).toHaveAttribute("data-animating", "true");
  await expect(position).toHaveText("Move 1 of 1");
});
