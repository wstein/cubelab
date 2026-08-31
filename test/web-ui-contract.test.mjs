import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/pages/index.astro", import.meta.url), "utf8");
const client = await readFile(new URL("../src/client/converter.ts", import.meta.url), "utf8");

test("the static shell declares size-scoped cubie and Orbit64 cards", () => {
  assert.match(page, /key: "pieces"[\s\S]*sizes: "2,3"/);
  assert.match(page, /key: "orbit64"[\s\S]*sizes: "3"/);
  assert.match(page, /data-output-card=\{key\}/);
});

test("the Vanilla DOM client wires reachability-aware outputs", () => {
  assert.match(client, /PieceReducer\.reduce\(parsed\._0\)/);
  assert.match(client, /Orbit64Codec\.encode\(pieces\._0\)/);
  assert.match(client, /Orbit64Codec\.decodeState\(value\)/);
  assert.match(client, /card\.hidden =/);
  assert.match(client, /copy\.disabled = !copyable/);
});
