import {expect, test} from "@playwright/test";

test("Dual 3D shows two interactive cube corners at the same perspective", async ({page}) => {
  await page.goto("/#size=3");
  await page.locator("[data-manual-state-open]").click();
  await page.locator("[data-manual-state-solved]").click();
  await page.locator('[data-manual-state-representation="dual-3d"]').click();

  const net = page.locator("[data-manual-state-net]");
  await expect(net).toHaveAttribute("data-representation", "dual-3d");
  await expect(page.locator("[data-manual-state-rotation-group]")).toBeHidden();

  const faces = await net.locator(".manual-state-face").evaluateAll((elements) =>
    Object.fromEntries(elements.map((element) => [element.dataset.face, element.getBoundingClientRect().toJSON()])),
  );
  expect(Object.keys(faces).sort()).toEqual(["B", "D", "F", "L", "R", "U"]);
  expect(faces.F.right).toBeLessThan(faces.B.left);
  expect(faces.U.right).toBeLessThan(faces.D.left);

  const backSticker = net.locator('.manual-state-face[data-face="B"] .manual-state-sticker').first();
  await backSticker.hover();
  await expect(backSticker).toHaveAttribute("data-piece-hover", "self");
});
