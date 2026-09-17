import {expect, test} from "@playwright/test";

test("rotate and flip controls reorient every state-editor view", async ({page}) => {
  await page.goto("/#size=3");
  await page.locator("[data-manual-state-open]").click();
  await page.locator("[data-manual-state-solved]").click();

  const controls = page.locator("[data-manual-state-rotation-group]");
  const rightCentre = page.locator('[data-manual-state-index="13"]');
  const upCentre = page.locator('[data-manual-state-index="4"]');
  for (const representation of ["standard", "attached", "open-cube", "dual-3d", "isometric"]) {
    await page.locator(`[data-manual-state-representation="${representation}"]`).click();
    await expect(controls).toBeVisible();
  }

  await page.locator('[data-manual-state-representation="standard"]').click();
  await page.locator('[data-manual-state-rotate="cw"]').click();
  await expect(rightCentre.locator("xpath=..")).toHaveAttribute("data-face", "F");
  await page.locator('[data-manual-state-rotate="ccw"]').click();
  await expect(rightCentre.locator("xpath=..")).toHaveAttribute("data-face", "R");

  await page.locator('[data-manual-state-rotate="flip"]').click();
  await expect(upCentre.locator("xpath=..")).toHaveAttribute("data-face", "D");
  await expect(upCentre).toHaveAttribute("data-face", "U");

  await page.locator('[data-manual-state-index="0"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-manual-state-index="1"]')).toHaveAttribute("data-cursor", "true");
});
