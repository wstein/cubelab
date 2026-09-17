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

  const sidebar = await dialog.evaluate((element) => {
    const tools = element.querySelector(".manual-state-tools").getBoundingClientRect();
    const shortcuts = element.querySelector(".manual-state-shortcuts").getBoundingClientRect();
    const footer = element.querySelector(".manual-state-footer").getBoundingClientRect();
    return {
      shortcutHeight: shortcuts.height,
      trailingSpace: tools.bottom - footer.bottom,
    };
  });
  expect(sidebar.shortcutHeight).toBeLessThan(120);
  expect(sidebar.trailingSpace).toBeLessThanOrEqual(1);

  await page.locator('[data-manual-state-representation="standard"]').click();
  await page.waitForTimeout(350);
  const flatLayout = await dialog.evaluate((element) => {
    const dialogBox = element.getBoundingClientRect();
    const tools = element.querySelector(".manual-state-tools").getBoundingClientRect();
    const faces = [...element.querySelectorAll(".manual-state-face")].map((face) => face.getBoundingClientRect());
    return {
      dialogWidth: dialogBox.width,
      netToToolsGap: tools.left - Math.max(...faces.map((face) => face.right)),
    };
  });
  expect(flatLayout.dialogWidth).toBeLessThan(1220);
  expect(flatLayout.netToToolsGap).toBeLessThan(80);

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
        widthFill: (bounds.right - bounds.left) / stage.width,
        heightFill: (bounds.bottom - bounds.top) / stage.height,
      };
    });
    const centeringTolerance = representation === "attached" ? 6 : 32;
    expect(Math.abs(offset.x), `${representation} horizontal offset`).toBeLessThan(centeringTolerance);
    expect(Math.abs(offset.y), `${representation} vertical offset`).toBeLessThan(centeringTolerance);
    if (representation === "isometric") {
      expect(offset.widthFill, "isometric stage width occupancy").toBeGreaterThan(0.68);
      expect(offset.heightFill, "isometric stage height occupancy").toBeGreaterThan(0.84);
    }
  }

  const isometricAutoScales = await dialog.evaluate((element) => [...element.querySelectorAll(".manual-state-face")].map((face) => {
    const sticker = face.querySelector(".manual-state-sticker");
    sticker.style.transition = "none";
    sticker.dataset.auto = "true";
    const transform = new DOMMatrix(getComputedStyle(sticker).transform);
    delete sticker.dataset.auto;
    sticker.style.removeProperty("transition");
    return {
      face: face.dataset.face,
      x: Math.abs(transform.a),
      y: Math.abs(transform.d),
    };
  }));
  for (const scale of isometricAutoScales) {
    expect(scale.x, `${scale.face} auto sticker x scale`).toBeCloseTo(0.85, 2);
    expect(scale.y, `${scale.face} auto sticker y scale`).toBeCloseTo(0.85, 2);
  }

  await page.setViewportSize({width: 700, height: 900});
  const overflow = await dialog.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
