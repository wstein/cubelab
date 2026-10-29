import {expect, test} from "@playwright/test";

// docs/workspace.md ("Offline installation") promises that production builds register a
// service worker, and that once CubeLab has been opened online its static workspace routes
// remain available offline. This file covers exactly that promise and nothing more; it is
// separate from converter.smoke.playwright.mjs, which blocks the worker on purpose so it
// can intercept requests with page.route().

const CACHE = "cubelab-app-shell";

const controlled = (page) => page.evaluate(async () => {
  const registration = await navigator.serviceWorker.ready;
  return {
    scope: registration.scope,
    active: registration.active?.state ?? null,
    controlled: navigator.serviceWorker.controller !== null,
  };
});

test("registers the app-shell service worker and serves later loads through it", async ({page, baseURL}) => {
  await page.goto("/");
  const first = await controlled(page);
  expect(first.scope).toBe(`${baseURL}/`);
  expect(first.active).toBe("activated");

  // install awaited cache.addAll(APP_SHELL) before the worker could activate.
  const shell = await page.evaluate(async (name) => {
    const cache = await caches.open(name);
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  }, CACHE);
  expect(shell).toEqual(expect.arrayContaining(["/", "/workbench/", "/timer/", "/manifest.webmanifest"]));

  // clients.claim() takes control of the already-open page; reloading proves the worker
  // is on the request path for the navigation and the sub-resources it then loads.
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  const handled = await page.evaluate(() => {
    const [navigation] = performance.getEntriesByType("navigation");
    const resources = performance.getEntriesByType("resource")
      .filter((entry) => new URL(entry.name).origin === location.origin);
    return {
      navigation: navigation.workerStart > 0,
      resources: resources.filter((entry) => entry.workerStart > 0).length,
      total: resources.length,
    };
  });
  expect(handled.navigation).toBe(true);
  expect(handled.resources).toBeGreaterThan(0);
});

test("keeps the static workspace routes working offline after one online visit", async ({page, context}) => {
  await page.goto("/");
  await controlled(page);
  // Visit once more so the hashed scripts and styles of the home route are in the cache.
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await expect(page.locator("[data-input]")).toBeVisible();

  await context.setOffline(true);

  // The visited route and a route that was only precached must both load with no network.
  const home = await page.goto("/");
  expect(home?.fromServiceWorker()).toBe(true);
  await expect(page.locator("[data-input]")).toBeVisible();
  await expect(page).toHaveTitle(/Interactive Cube Studio/);

  const response = await page.goto("/timer/");
  expect(response?.fromServiceWorker()).toBe(true);
  await expect(page).toHaveURL(/\/timer\/$/);
  await expect(page).toHaveTitle(/Timer/i);

  await context.setOffline(false);
});

// Known defect, tracked here so it cannot regress silently once fixed: public/sw.js calls
// response.clone() inside the asynchronous caches.open().then() callback, after the response
// body has already been handed to the page, so cache.put() rejects and hashed /_astro/ scripts
// (and later fetched assets such as the 2x2 solver table) are never cached at runtime. The
// offline shell then renders HTML without a working app. test.fail() makes this test pass
// while that is true and fail as soon as the worker is fixed, at which point remove the
// annotation.
test("runs the app itself offline after one online visit", async ({page, context}) => {
  test.fail();
  await page.goto("/");
  await controlled(page);
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  await context.setOffline(true);
  await page.goto("/");
  await page.locator("[data-input]").fill("R U");
  await expect(page.locator("[data-playback-position]")).toHaveText("Move 2 of 2", {timeout: 5_000});
  await context.setOffline(false);
});
