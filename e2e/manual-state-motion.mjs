import {expect} from "@playwright/test";

// Switching the state-editor representation runs a view transition and then
// 380 ms CSS transform transitions on the faces. How long that takes depends
// on the renderer (software WebGL in CI is much slower), so measure geometry
// only once the new representation is applied and all of those animations
// have finished, instead of after a fixed sleep.
export const waitForManualStateRepresentation = async (page, representation) => {
  await expect(page.locator("[data-manual-state-net]"))
    .toHaveAttribute("data-representation", representation);
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => {
    if (animation.playState !== "running") return false;
    const effect = animation.effect;
    if (effect?.pseudoElement?.startsWith("::view-transition")) return true;
    return effect?.target instanceof Element
      && effect.target.closest("[data-manual-state-dialog]") !== null;
  }).length)).toBe(0);
};
