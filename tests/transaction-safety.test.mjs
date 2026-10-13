import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync(new URL("../proofgate-ui.mjs", import.meta.url), "utf8");

test("re-read authoritative latest-final work before asking the wallet to sign", () => {
  const start = ui.indexOf("async function act(method)");
  const end = ui.indexOf('const account = await wallet();', start);
  assert.ok(start >= 0 && end > start);
  const beforeWallet = ui.slice(start, end);
  assert.match(beforeWallet, /readContract/);
  assert.match(beforeWallet, /transactionHashVariant:"latest-final"/);
  assert.match(beforeWallet, /workActionAllowed\(method,current.state\)/);
});

test("unresolved persisted transactions continue to block duplicate writes", () => {
  assert.match(ui, /history\(\)\.some\(x=>x\.status==="PENDING"/);
  assert.match(ui, /transactionBlocks\(method\)/);
});

test("no typed receipt outcome may forge success or failure", () => {
  assert.doesNotMatch(ui, /window\.prompt\("Explorer has confirmed this transaction/);
  assert.match(ui, /Manual transaction resolution is disabled for safety/);
});
