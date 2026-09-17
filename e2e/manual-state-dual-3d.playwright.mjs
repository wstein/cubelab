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
    Object.fromEntries(elements.map((element) => [element.dataset.face, element.getBoundingClientRect().toJSON()])),
  );
  expect(Object.keys(faces).sort()).toEqual(["B", "D", "F", "L", "R", "U"]);
  expect(faces.F.right).toBeLessThan(faces.B.left);
  expect(faces.U.right).toBeLessThan(faces.D.left);
  expect((faces.U.top + faces.U.bottom) / 2).toBeLessThan((faces.F.top + faces.F.bottom) / 2);
  expect((faces.D.top + faces.D.bottom) / 2).toBeGreaterThan((faces.B.top + faces.B.bottom) / 2);

  const backSticker = net.locator('.manual-state-face[data-face="B"] .manual-state-sticker').first();
  await backSticker.dispatchEvent("mouseover");
  await expect(backSticker).toHaveAttribute("data-piece-hover", "self");
  await expect(net.locator('[data-piece-hover="mate"]')).toHaveCount(2);
  const selfInsetLayers = await backSticker.evaluate((element) =>
    (getComputedStyle(element).boxShadow.match(/inset/g) ?? []).length,
  );
  expect(selfInsetLayers).toBe(2);

  const front = net.locator('.manual-state-face[data-face="F"]');
  const initialTransform = await front.evaluate((element) => getComputedStyle(element).transform);
  await page.locator('[data-manual-state-rotate="cw"]').click();
  await expect.poll(() => front.evaluate((element) => getComputedStyle(element).transform)).not.toBe(initialTransform);
  await expect(net).toHaveCSS("--manual-state-dual-yaw", "-90deg");
  await expect(net).toHaveAttribute("data-orientation", "3", {timeout: 1_000});
  await expect(net).toHaveCSS("--manual-state-dual-yaw", "0deg");
  await expect(net.locator('.manual-state-face[data-face="F"] .manual-state-sticker').nth(4)).toHaveAttribute("data-face", "R");
  await expect(net.locator('.manual-state-face[data-face="R"] .manual-state-sticker').nth(4)).toHaveAttribute("data-face", "B");
  await expect(net.locator('.manual-state-face[data-face="B"] .manual-state-sticker').nth(4)).toHaveAttribute("data-face", "L");
  await expect(net.locator('.manual-state-face[data-face="L"] .manual-state-sticker').nth(4)).toHaveAttribute("data-face", "F");
  await expect(net.locator('.manual-state-face[data-face="D"] .manual-state-sticker').nth(4)).toHaveAttribute("data-face", "D");

  await page.locator('[data-manual-state-rotate="flip"]').click();
  await expect(net).toHaveCSS("--manual-state-dual-flip", "90deg");
  await expect(net).toHaveCSS("--manual-state-dual-flip", "180deg", {timeout: 1_000});
  await expect(net).toHaveAttribute("data-flipped", "true", {timeout: 1_500});
  await expect(net).toHaveCSS("--manual-state-dual-flip", "0deg");
});
