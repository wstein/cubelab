import {expect, test} from "@playwright/test";

test("state editor keeps every cube view centered in the compact layout", async ({page}) => {
  await page.setViewportSize({width: 1400, height: 1000});
  await page.goto("/#size=3");
  await page.locator("[data-manual-state-open]").click();

  const dialog = page.locator("[data-manual-state-dialog]");
  const notationInTools = await dialog.evaluate((element) => {
    const tools = element.querySelector(".manual-state-tools");
    const notation = element.querySelector(".manual-state-notation");
    return Boolean(tools && notation && tools.contains(notation));
  });
  expect(notationInTools).toBe(true);
  expect((await dialog.boundingBox()).height).toBeLessThan(900);

  for (const representation of ["standard", "attached", "open-cube", "dual-3d", "isometric"]) {
    await page.locator(`[data-manual-state-representation="${representation}"]`).click();
    await page.waitForTimeout(350);
    const offset = await dialog.evaluate((element) => {
      const stage = element.querySelector(".manual-state-stage").getBoundingClientRect();
      const faces = [...element.querySelectorAll(".manual-state-face")].map((face) => face.getBoundingClientRect());
      const bounds = faces.reduce((result, face) => ({
        left: Math.min(result.left, face.left),
        top: Math.min(result.top, face.top),
        right: Math.max(result.right, face.right),
        bottom: Math.max(result.bottom, face.bottom),
      }), {left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity});
      return {
        x: (bounds.left + bounds.right - stage.left - stage.right) / 2,
        y: (bounds.top + bounds.bottom - stage.top - stage.bottom) / 2,
      };
    });
    expect(Math.abs(offset.x), `${representation} horizontal offset`).toBeLessThan(32);
    expect(Math.abs(offset.y), `${representation} vertical offset`).toBeLessThan(32);
  }

  await page.setViewportSize({width: 700, height: 900});
  const overflow = await dialog.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
