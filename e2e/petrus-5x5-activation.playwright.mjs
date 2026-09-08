import {expect, test} from "@playwright/test";

const reportedSnapshot = "RUDBFRDLUFUDUUBUDBRDBFUFRBRUDDUFRURBFRBLFBLURUFULDLDRLDFRLFLFRFFRBBUFULUDBRBRFRBRLUDRDDDDLDBULBUDFBFFUFLDUFLRLRRLRLUUBRLLLBDURDLBUBDBBBBDBFDFLFLFLDRLF";

test("5×5 Petrus applies verified progress to the reported snapshot", async ({page}) => {
  await page.goto(`/#size=5&tab=academy&method=petrus5x5&alg=${reportedSnapshot}`);
  const guide = page.locator("[data-petrus-5x5-academy-guide]");
  const status = page.locator("[data-petrus-5x5-academy-status]");
  const apply = page.locator("[data-petrus-5x5-academy-step]");
  let moves = "";
  for (let score = 8; score < 12; score++) {
    await expect(status).toContainText(`2×2×2: ${score}/19`);
    await expect(apply).toBeVisible();
    const algorithm = (await guide.textContent()).match(/\(Suggested: (.+)\)$/)?.[1];
    expect(algorithm).toBeTruthy();
    moves = [moves, algorithm].filter(Boolean).join(" ");
    await apply.click();
    await expect(page.locator("[data-moves-input]")).toHaveValue(moves);
  }
  await expect(status).toContainText("2×2×2: 12/19");
  await expect(guide).toContainText("No verified improving guide");
  await expect(apply).toBeHidden();
});

test("5×5 Petrus explains a bounded-search stop without offering an unchecked move", async ({page}) => {
  await page.goto(`/#size=5&tab=academy&method=petrus5x5&alg=${reportedSnapshot}`);
  await page.locator("[data-moves-input]").fill("B' 2B2 2F2 R U' B");
  const guide = page.locator("[data-petrus-5x5-academy-guide]");
  await expect(guide).toBeVisible();
  await expect(guide).toContainText("No verified improving guide");
  await expect(guide).not.toContainText("Suggested:");
  await expect(page.locator("[data-petrus-5x5-academy-step]")).toBeHidden();
});

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
  await expect(page.locator("[data-petrus-5x5-academy-guide]")).toContainText("No verified improving guide");
  await expect(page.locator("[data-petrus-5x5-academy-step]")).toBeHidden();

  await page.locator('[data-workspace-tab="converter"]').click();
  await page.locator("[data-moves-input]").fill("");
  await page.locator('[data-workspace-tab="academy"]').click();
  await expect(current).toContainText("completely solved");
  await expect(page.locator("[data-petrus-5x5-academy-step]")).toBeHidden();
  expect(errors).toEqual([]);
});
