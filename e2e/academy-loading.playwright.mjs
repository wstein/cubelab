import {expect, test} from "@playwright/test";

for (const size of [4, 5]) {
  test(`${size}×${size} converter loads without starting unused solver workers`, async ({page}, testInfo) => {
    await page.addInitScript(() => {
      window.__solverWorkerStarts = [];
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          super(url, options);
          if (String(url).includes("solver.worker")) window.__solverWorkerStarts.push(String(url));
        }
      };
    });
    const algorithm = "Rw U2";
    const started = performance.now();
    await page.goto(`/#size=${size}&alg=${encodeURIComponent(algorithm)}`);
    await expect(page.locator("[data-input]")).toHaveValue(algorithm);
    await expect(page.locator("[data-status]")).toContainText("Algorithm");
    const workers = await page.evaluate(() => window.__solverWorkerStarts);
    await testInfo.attach("initial-load", {
      body: JSON.stringify({size, elapsedMs: Math.round(performance.now() - started), solverWorkers: workers.length}),
      contentType: "application/json",
    });
    expect(workers).toEqual([]);
  });

  test(`${size}×${size} shows its background guide above lessons and applies the displayed result`, async ({page}) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/#size=${size}`);
    await page.locator("[data-moves-input]").fill("2R");
    await page.locator('[data-workspace-tab="academy"]').click();
    await page.locator(`[data-academy-method="reduction${size}x${size}"]`).click();
    const prefix = `reduction-${size}x${size}-academy`;
    const guide = page.locator(`[data-${prefix}-guide]`);
    const apply = page.locator(`[data-${prefix}-apply-centre]`);
    await expect(apply).toBeVisible({timeout: 15_000});
    await expect(guide).toContainText("Next");
    const displayedAlgorithm = (await guide.textContent()).match(/setup: (.*?) ·/)?.[1];
    expect(displayedAlgorithm).toBeTruthy();
    expect(await apply.evaluate((element, phasesSelector) =>
      Boolean(element.compareDocumentPosition(document.querySelector(phasesSelector)) & Node.DOCUMENT_POSITION_FOLLOWING),
    `[data-${prefix}-phases]`)).toBe(true);
    await apply.click();
    await expect(page.locator("[data-moves-input]")).toHaveValue(`2R ${displayedAlgorithm}`);
    await expect(apply).toBeHidden({timeout: 15_000});
    expect(errors).toEqual([]);
  });

  test(`${size}×${size} cancels a pending guide when leaving the Academy`, async ({page}) => {
    await page.addInitScript(() => {
      window.__guideRequests = 0;
      window.__guideStops = 0;
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        guide = false;
        postMessage(message, options) {
          if (message.type === "planReductionGuide") {
            this.guide = true;
            window.__guideRequests++;
            // Hold this request so cancellation is deterministic, not CPU-speed dependent.
            return;
          }
          super.postMessage(message, options);
        }
        terminate() {
          if (this.guide) window.__guideStops++;
          super.terminate();
        }
      };
    });
    await page.goto(`/#size=${size}&tab=academy&method=reduction${size}x${size}&alg=2R`);
    await expect.poll(() => page.evaluate(() => window.__guideRequests)).toBe(1);
    await expect(page.locator(`[data-reduction-${size}x${size}-academy-guide]`)).toContainText("Finding");
    await page.locator('[data-workspace-tab="converter"]').click();
    await expect.poll(() => page.evaluate(() => window.__guideStops)).toBe(1);
    await page.locator("[data-input]").fill("R");
    await page.locator('[data-workspace-tab="academy"]').click();
    await expect(page.locator(`[data-reduction-${size}x${size}-academy-status]`)).toContainText("6/6");
    await expect(page.locator(`[data-reduction-${size}x${size}-academy-apply-centre]`)).toBeHidden();
    expect(await page.evaluate(() => window.__guideRequests)).toBe(1);
  });
}
