import {expect, test} from "@playwright/test";

test("5×5 Petrus activates with workspace moves and refreshes after an inactive edit", async ({page}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#size=5");
  await expect(page.locator("[data-status]")).toHaveText("Solved default");
  await page.locator("[data-moves-input]").fill("R");
  await page.locator('[data-workspace-tab="academy"]').click();
  await page.locator('[data-academy-method="petrus5x5"]').click();
  const current = page.locator("[data-petrus-5x5-academy-current]");
  await expect(current).toBeVisible();
  await expect(current).not.toContainText("completely solved");
  await expect(page.locator("[data-petrus-5x5-academy-step]")).toBeVisible();

  await page.locator('[data-workspace-tab="converter"]').click();
  await page.locator("[data-moves-input]").fill("");
  await page.locator('[data-workspace-tab="academy"]').click();
  await expect(current).toContainText("completely solved");
  await expect(page.locator("[data-petrus-5x5-academy-step]")).toBeHidden();
  expect(errors).toEqual([]);
});
