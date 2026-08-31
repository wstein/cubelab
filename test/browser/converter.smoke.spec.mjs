import {expect, test} from "@playwright/test";

test("converts algorithms and Orbit64 while switching size-aware cards", async ({page}) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  const piecesCard = page.locator('[data-output-card="pieces"]');
  const orbitCard = page.locator('[data-output-card="orbit64"]');
  const input = page.locator("[data-input]");

  await expect(page.locator("[data-status]")).toHaveText("Solved default");
  await expect(page.locator('[data-output="orbit64"]')).toHaveText("AAAAAAAAAAAA");
  await expect(piecesCard).toBeVisible();
  await expect(orbitCard).toBeVisible();

  await input.fill("AAAAAAAAAAAA");
  await expect(page.locator("[data-status]")).toHaveText("Input converted");
  await expect(page.locator('[data-output="facelets"]')).toHaveText(
    "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB",
  );

  await input.fill(
    [
      "      W W W",
      "      W W W",
      "      W W W",
      "O O O G G G R R R B B B",
      "O O O G G G R R R B B B",
      "O O O G G G R R R B B B",
      "      Y Y Y",
      "      Y Y Y",
      "      Y Y Y",
    ].join("\n"),
  );
  await expect(page.locator("[data-status]")).toHaveText("Input converted");
  await expect(page.locator('[data-output="orbit64"]')).toHaveText("AAAAAAAAAAAA");

  await input.fill(
    "cp: 0 1 2 3 4 5 6 7; co: 0 0 0 0 0 0 0 0; " +
      "ep: 0 1 2 3 4 5 6 7 8 9 10 11; eo: 0 0 0 0 0 0 0 0 0 0 0 0",
  );
  await expect(page.locator("[data-status]")).toHaveText("Input converted");
  await expect(page.locator('[data-output="orbit64"]')).toHaveText("AAAAAAAAAAAA");

  await page.locator('[data-size="2"]').click();
  await expect(page.locator('[data-title="pieces"]')).toHaveText("2×2 CP / CO");
  await expect(page.locator('[data-output="pieces"]')).not.toContainText("ep:");
  await expect(orbitCard).toBeHidden();

  await page.locator('[data-size="4"]').click();
  await expect(piecesCard).toBeHidden();
  await expect(orbitCard).toBeHidden();

  await page.locator('[data-size="3"]').click();
  await input.fill("U");
  await expect(page.locator("[data-status]")).toHaveText("Input converted");
  await expect(page.locator('[data-output="pieces"]')).toContainText("cp: 3 0 1 2");
  await expect(page.locator('[data-output="orbit64"]')).toHaveText("AcIufRZj-AAA");
  expect(pageErrors).toEqual([]);
});
