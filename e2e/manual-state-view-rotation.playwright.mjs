import {expect, test} from "@playwright/test";

test("rotation controls appear only on the 3D state-editor views", async ({page}) => {
  await page.goto("/#size=3");
  await page.locator("[data-manual-state-open]").click();
  await page.locator("[data-manual-state-solved]").click();

  const controls = page.locator("[data-manual-state-rotation-group]");
  const rotateClockwise = page.locator('[data-manual-state-rotate="cw"]');
  const flip = page.locator('[data-manual-state-rotate="flip"]');
  const rotateShortcut = page.locator("[data-manual-state-shortcut-rotate]");
  const flipShortcut = page.locator("[data-manual-state-shortcut-flip]");
  const net = page.locator("[data-manual-state-net]");
  for (const representation of ["standard", "attached", "open-cube"]) {
    await page.locator(`[data-manual-state-representation="${representation}"]`).click();
    await expect(controls).toBeHidden();
    await expect(rotateShortcut).toBeHidden();
    await expect(flipShortcut).toBeHidden();
    await page.keyboard.press("]");
    await expect(net).toHaveAttribute("data-orientation", "0");
  }

  await page.locator('[data-manual-state-representation="standard"]').click();
  await page.locator('[data-manual-state-index="0"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-manual-state-index="1"]')).toHaveAttribute("data-cursor", "true");

  await page.locator('[data-manual-state-representation="dual-3d"]').click();
  await expect(controls).toBeVisible();
  await expect(rotateClockwise).toBeVisible();
  await expect(flip).toBeHidden();
  await expect(rotateShortcut).toBeVisible();
  await expect(flipShortcut).toBeHidden();

  await page.locator('[data-manual-state-representation="isometric"]').click();
  await expect(controls).toBeVisible();
  await expect(rotateClockwise).toBeVisible();
  await expect(flip).toBeVisible();
  await expect(rotateShortcut).toBeVisible();
  await expect(flipShortcut).toBeVisible();
  await rotateClockwise.click();
  await expect(net).toHaveAttribute("data-orientation", "3", {timeout: 1_500});
  await page.waitForTimeout(250);
  await flip.click();
  await expect(net).toHaveAttribute("data-flipped", "true", {timeout: 2_000});
});
