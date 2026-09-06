import assert from "node:assert/strict";
import { test } from "vitest";

import {
  chromeDevToolsWorkspacePath,
  createChromeDevToolsWorkspaceManifest,
  chromeDevToolsWorkspacePlugin,
} from "../scripts/chrome-devtools-workspace.mjs";

test("creates the Chrome DevTools automatic-workspace manifest", () => {
  assert.equal(
    chromeDevToolsWorkspacePath,
    "/.well-known/appspecific/com.chrome.devtools.json",
  );
  assert.deepEqual(
    createChromeDevToolsWorkspaceManifest("/Users/example/cube-rosetta"),
    {
      workspace: {
        root: "/Users/example/cube-rosetta",
        uuid: "9e7dfe52-6a7f-4e2f-8d74-e163aa9ae28a",
      },
    },
  );
});

test("serves the manifest from the Chrome well-known endpoint only", () => {
  let middleware;
  chromeDevToolsWorkspacePlugin().configureServer({
    config: { root: "/Users/example/cube-rosetta" },
    middlewares: { use: (handler) => (middleware = handler) },
  });

  const headers = new Map();
  let body;
  middleware(
    { method: "GET", url: `${chromeDevToolsWorkspacePath}?cache=bust` },
    {
      setHeader: (name, value) => headers.set(name, value),
      end: (value) => (body = value),
    },
    () => assert.fail("the manifest request should not fall through"),
  );

  assert.equal(headers.get("Content-Type"), "application/json; charset=utf-8");
  assert.deepEqual(JSON.parse(body), {
    workspace: {
      root: "/Users/example/cube-rosetta",
      uuid: "9e7dfe52-6a7f-4e2f-8d74-e163aa9ae28a",
    },
  });

  let nextCalls = 0;
  middleware({ method: "GET", url: "/not-devtools.json" }, {}, () => nextCalls++);
  assert.equal(nextCalls, 1);
});
