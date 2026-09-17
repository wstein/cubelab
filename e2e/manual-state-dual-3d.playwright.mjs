import {expect, test} from "@playwright/test";

test("Dual 3D shows interactive upper and lower cube corners", async ({page}) => {
  await page.goto("/#size=3");
  await page.locator("[data-manual-state-open]").click();
  await page.locator("[data-manual-state-solved]").click();
  await page.locator('[data-manual-state-representation="dual-3d"]').click();
  await page.waitForTimeout(450);

  const net = page.locator("[data-manual-state-net]");
  await expect(net).toHaveAttribute("data-representation", "dual-3d");
  await expect(page.locator("[data-manual-state-rotation-group]")).toBeVisible();

  const faces = await net.locator(".manual-state-face").evaluateAll((elements) =>
    Object.fromEntries(elements.map((element) => [
      `${element.dataset.dualRig}:${element.dataset.face}`,
      element.getBoundingClientRect().toJSON(),
    ])),
  );
  expect(Object.keys(faces)).toHaveLength(12);
  expect(Object.keys(faces).filter((key) => key.startsWith("upper:"))).toHaveLength(6);
  expect(Object.keys(faces).filter((key) => key.startsWith("lower:"))).toHaveLength(6);
  expect(faces["upper:F"].right).toBeLessThan(faces["lower:B"].left);
  expect((faces["upper:U"].top + faces["upper:U"].bottom) / 2)
    .toBeLessThan((faces["upper:F"].top + faces["upper:F"].bottom) / 2);
  expect((faces["lower:D"].top + faces["lower:D"].bottom) / 2)
    .toBeGreaterThan((faces["lower:B"].top + faces["lower:B"].bottom) / 2);

  const lowerRig = net.locator('.manual-state-face[data-dual-rig="lower"]');
  const upperRig = net.locator('.manual-state-face[data-dual-rig="upper"]');
  const downInnerCorner = lowerRig.locator('[data-manual-state-index="33"]');
  const backInnerCorner = lowerRig.locator('[data-manual-state-index="53"]');
  const leftInnerCorner = lowerRig.locator('[data-manual-state-index="42"]');
  await downInnerCorner.hover();
  await expect(downInnerCorner).toHaveAttribute("data-piece-hover", "self");
  await expect(backInnerCorner).toHaveAttribute("data-piece-hover", "mate");
  await expect(leftInnerCorner).toHaveAttribute("data-piece-hover", "mate");
  await expect(net.locator('[data-piece-hover="mate"]')).toHaveCount(4);
  const selfInsetLayers = await downInnerCorner.evaluate((element) =>
    (getComputedStyle(element).boxShadow.match(/inset/g) ?? []).length,
  );
  expect(selfInsetLayers).toBe(2);

  // Every visible physical plane belongs to a complete six-face rig and is
  // reached through Chromium's real 3D hit test.
  for (const [rig, visibleFaces] of [["upper", ["U", "F", "R"]], ["lower", ["D", "B", "L"]]]) {
    for (const face of visibleFaces) {
      const outerSticker = net.locator(
        `.manual-state-face[data-dual-rig="${rig}"][data-face="${face}"] .manual-state-sticker:first-child`,
      );
      await outerSticker.hover();
      await expect(outerSticker).toHaveAttribute("data-piece-hover", "self");
    }
  }

  const front = net.locator('.manual-state-face[data-dual-rig="upper"][data-face="F"]');
  const initialTransform = await front.evaluate((element) => getComputedStyle(element).transform);
  await page.locator('[data-manual-state-rotate="cw"]').click();
  await expect.poll(() => front.evaluate((element) => getComputedStyle(element).transform)).not.toBe(initialTransform);
  await expect(net).toHaveCSS("--manual-state-dual-yaw", "-90deg");
  await expect(net).toHaveAttribute("data-orientation", "3", {timeout: 1_000});
  await expect(net).toHaveCSS("--manual-state-dual-yaw", "-90deg");
  await expect(upperRig.locator('[data-manual-state-index="13"]')).toHaveAttribute("data-face", "R");

  await page.locator('[data-manual-state-rotate="flip"]').click();
  await expect(net).toHaveCSS("--manual-state-dual-flip", "180deg");
  await expect(net).toHaveAttribute("data-flipped", "true", {timeout: 1_500});
  await expect(net).toHaveCSS("--manual-state-dual-flip", "180deg");
});
