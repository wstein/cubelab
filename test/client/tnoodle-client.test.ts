import {expect, test} from "vitest";

import {parseTnoodleBatch, TnoodleClient, tnoodleBatchUrl} from "../../src/client/scramble/tnoodle-client";

const response = (body: string, status = 200): Response => new Response(body, {status});
const batch = (prefix: string, count: number): string =>
  Array.from({length: count}, (_, index) => `${prefix === "A" ? "R U R'" : "F U2 F'"} ${index % 2 === 0 ? "D" : "L2"}`).join("\n");

test("builds the documented TNoodle text batch endpoint", () => {
  const url = new URL(tnoodleBatchUrl({serverUrl: "http://localhost:2014", event: "333"}));
  expect(url.pathname).toBe("/scramble/.txt");
  expect(url.searchParams.get("e")).toBe("333*5");
});

test("validates complete 3×3 TNoodle text batches", () => {
  expect(parseTnoodleBatch("R U R'\nF2 D' L", 2)).toEqual(["R U R'", "F2 D' L"]);
  expect(() => parseTnoodleBatch("R U\nnot a scramble", 2)).toThrow("invalid 3×3 scramble");
  expect(() => parseTnoodleBatch("R U", 2)).toThrow("expected 2");
});

test("consumes a prefetched FIFO before requesting another batch", async () => {
  let requests = 0;
  const client = new TnoodleClient(async () => {
    requests += 1;
    return response(batch(requests === 1 ? "A" : "B", 3));
  });
  const config = {serverUrl: "http://localhost:2014", event: "333" as const, batchSize: 3};

  const first = await client.next(config);
  const second = await client.next(config);
  const third = await client.next(config);
  expect(requests).toBe(1);
  expect([first.scramble, second.scramble, third.scramble]).toEqual(["R U R' D", "R U R' L2", "R U R' D"]);

  const fourth = await client.next(config);
  expect(requests).toBe(2);
  expect(fourth.scramble).toBe("F U2 F' D");
});

test("clears the queue when the server configuration changes", async () => {
  let requests = 0;
  const client = new TnoodleClient(async () => {
    requests += 1;
    return response(batch(requests === 1 ? "A" : "B", 2));
  });
  await client.next({serverUrl: "http://localhost:2014", event: "333", batchSize: 2});
  const changed = await client.next({serverUrl: "http://localhost:2015", event: "333", batchSize: 2});
  expect(requests).toBe(2);
  expect(changed.scramble).toBe("F U2 F' D");
});

test("uses a successful health probe as the first prefetched batch", async () => {
  let requests = 0;
  const client = new TnoodleClient(async () => {
    requests += 1;
    return response(batch("A", 5));
  });
  const config = {serverUrl: "http://localhost:2014", event: "333" as const};
  await expect(client.checkHealth(config)).resolves.toMatchObject({online: true});
  await expect(client.next(config)).resolves.toMatchObject({scramble: "R U R' L2"});
  expect(requests).toBe(1);
});

test("reports malformed or failing responses as unavailable health", async () => {
  const malformed = new TnoodleClient(async () => response(Array(5).fill("<html>offline</html>").join("\n")));
  await expect(malformed.next({serverUrl: "http://localhost:2014", event: "333"})).rejects.toThrow("invalid 3×3 scramble");

  const unavailable = new TnoodleClient(async () => response("nope", 503));
  await expect(unavailable.checkHealth({serverUrl: "http://localhost:2014", event: "333"})).resolves.toMatchObject({
    online: false,
    latencyMs: null,
    message: "TNoodle returned HTTP 503.",
  });
});
