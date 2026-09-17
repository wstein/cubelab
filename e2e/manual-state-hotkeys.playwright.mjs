import {expect, test} from "@playwright/test";

test("state editor accepts colour-initial hotkeys", async ({page}) => {
  await page.goto("/#size=2");
  await page.locator("[data-manual-state-open]").click();

  const cursor = page.locator('.manual-state-sticker[data-cursor="true"]');
  await expect(cursor).toHaveAttribute("data-face", "unknown");

  for (const [key, face] of [["w", "U"], ["g", "F"], ["y", "D"], ["o", "L"]]) {
    await page.keyboard.press(key);
    await expect(cursor).toHaveAttribute("data-face", face);
    await page.keyboard.press("e");
    await expect(cursor).toHaveAttribute("data-face", "unknown");
  }
});
