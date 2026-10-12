import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseJobId, transactionHash, jobIdFromReceipt, receiptError,
  parseJobResult, publicUrl, settledStatus, genLayerTxIdFromEthereumReceipt, NEW_TRANSACTION_TOPIC, independentlyVerifiedAction,
} from "../spotter-core.mjs";

test("only decimal positive job IDs are accepted", () => {
  assert.equal(parseJobId('"21"'), "21");
  assert.equal(parseJobId(" 1 "), "1");
  for (const value of ["", "0", "-1", "NaN", "1e2", "0x1", {}, null, "1<script>"]) {
    assert.equal(parseJobId(value), "");
  }
});
test("extract open_job output without confusing it with a transaction hash or status", () => {
  assert.equal(jobIdFromReceipt({ returnValue: '"31"' }), "31");
  assert.equal(jobIdFromReceipt({ result: { output: "12" } }), "12");
  assert.equal(jobIdFromReceipt({ data: '{"result":"7"}' }), "7");
  assert.equal(jobIdFromReceipt({ status: 1, hash: "0x" + "a".repeat(64) }), "");
  assert.equal(jobIdFromReceipt({ result: '{"foo":12}' }), "");
});
test("transaction hash validation prevents bogus explorer URLs", () => {
  assert.equal(transactionHash({ hash: "0x" + "a".repeat(64) }), "0x" + "a".repeat(64));
  assert.equal(transactionHash("0x1234"), "");
  assert.equal(transactionHash({ id: "1" }), "");
});
test("finalized failure is not treated as success", () => {
  assert.match(receiptError({ txExecutionResultName: "FINISHED_WITH_ERROR" }), /ERROR/);
  assert.match(receiptError({ statusName: "CANCELED" }), /CANCEL/);
  assert.equal(receiptError({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN" }), "");
});
test("decode chain state defensively", () => {
  assert.equal(parseJobResult('{"id":"1","status":"HIT"}').status, "HIT");
  assert.deepEqual(parseJobResult("{}"), {});
  assert.throws(() => parseJobResult("not JSON"));
  assert.throws(() => parseJobResult("null"));
  assert.equal(settledStatus("HIT"), true);
  assert.equal(settledStatus("SUBMITTED"), false);
  assert.equal(settledStatus("PARSE"), false);
});
test("reject local and secret-bearing web URLs before writes", () => {
  assert.equal(publicUrl("https://example.org/"), "https://example.org/");
  for (const value of ["javascript:alert(1)", "https://u:p@example.org/", "http://localhost:1234",
    "http://127.0.0.1/", "http://192.168.1.1/", "http://10.0.0.1/", "http://172.16.1.1/", "garbage"]) {
    assert.throws(() => publicUrl(value));
  }
});
test("extract GenLayer tx ID only from the verified consensus NewTransaction log", () => {
  const consensus = "0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575";
  const genId = "0x" + "b".repeat(64);
  const fake = "0x" + "c".repeat(64);
  const real = { address: consensus.toLowerCase(), topics: [NEW_TRANSACTION_TOPIC, genId, "0x" + "0".repeat(64), "0x" + "0".repeat(64)] };
  const distraction = { address: "0x" + "1".repeat(40), topics: [NEW_TRANSACTION_TOPIC, fake] };
  assert.equal(NEW_TRANSACTION_TOPIC, "0xdab9102861c7483a187584d6371d88316f005af507982ccf95c110879f3ed5a5");
  assert.equal(genLayerTxIdFromEthereumReceipt({ status: "0x1", logs: [distraction, real] }, consensus), genId);
  assert.equal(genLayerTxIdFromEthereumReceipt({ status: "0x1", logs: [distraction] }, consensus), "");
  assert.throws(() => genLayerTxIdFromEthereumReceipt({ status: "0x0", logs: [real] }, consensus), /reverted/);
  assert.throws(() => genLayerTxIdFromEthereumReceipt({ status: "0x1", logs: [real] }, ""), /consensus/);
});
test("SDK 0.18.x compatibility and safe one-shot wallet submissions", () => {
  const app = readFileSync(new URL("../app.mjs", import.meta.url), "utf8");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(!app.includes("innerHTML"));
  assert.ok(!app.includes("catch (first)"));
  assert.ok(!html.includes('<script type="module">'));
  assert.match(html, /Read live contract state/);
  assert.equal((app.match(/genlayer-js@0\.18\.10/g) || []).length, 2);
  assert.equal((app.match(/\.writeContract\(/g) || []).length, 1);
  assert.ok(!app.includes("client.estimateTransactionFeesForWrite("));
  assert.ok(!app.includes("readClient.waitForFinalization("));
  assert.match(app, /readClient\.waitForTransactionReceipt\(/);
  assert.match(app, /eth_getTransactionReceipt/);
  assert.match(app, /genLayerTxIdFromEthereumReceipt/);
  assert.match(app, /sessionStorage\.getItem\("spotter\.pending"\)/);
  assert.match(app, /sessionStorage\.setItem\("spotter\.pending"/);
});

test("safe fallback requires independently matching the right wallet, job and baseline", () => {
  const wallet = "0x1111111111111111111111111111111111111111";
  const attacker = "0x2222222222222222222222222222222222222222";
  const created = { id: "13", poster: wallet, question: "Evidence?", rubric: "HIT if yes", status: "OPEN" };
  const pOpen = { fn: "open_job", wallet, question: "Evidence?", rubric: "HIT if yes", previousJobId: "12" };
  assert.equal(independentlyVerifiedAction(pOpen, created, wallet), true);
  assert.equal(independentlyVerifiedAction(pOpen, { ...created, id: "12" }, wallet), false);
  assert.equal(independentlyVerifiedAction(pOpen, { ...created, poster: attacker }, wallet), false);
  assert.equal(independentlyVerifiedAction(pOpen, { ...created, question: "Different" }, wallet), false);
  assert.equal(independentlyVerifiedAction({ ...pOpen, previousJobId: "20" }, created, wallet), false);
  assert.equal(independentlyVerifiedAction(pOpen, created, attacker), false);
  assert.equal(independentlyVerifiedAction({ fn: "open_job" }, created, wallet), false);
  const pSubmit = { fn: "submit_url", wallet, jobId: "13", url: "https://example.org", baselineStatus: "OPEN", baselineUrl: "" };
  const submitted = { ...created, hunter: wallet, status: "SUBMITTED", url: "https://example.org" };
  assert.equal(independentlyVerifiedAction(pSubmit, submitted, wallet), true);
  assert.equal(independentlyVerifiedAction(pSubmit, { ...submitted, hunter: attacker }, wallet), false);
  assert.equal(independentlyVerifiedAction(pSubmit, { ...submitted, status: "OPEN" }, wallet), false);
  assert.equal(independentlyVerifiedAction({ ...pSubmit, baselineStatus: "SUBMITTED", baselineUrl: pSubmit.url }, submitted, wallet), false);
  const pJudge = { fn: "judge", wallet, jobId: "13", baselineRound: 1 };
  assert.equal(independentlyVerifiedAction(pJudge, { ...submitted, status: "HIT", round_no: 2 }, wallet), true);
  assert.equal(independentlyVerifiedAction(pJudge, { ...submitted, status: "HIT", round_no: 1 }, wallet), false);
  assert.equal(independentlyVerifiedAction(pJudge, { ...submitted, status: "SUBMITTED", fail_kind: "PARSE", round_no: 2 }, wallet), true);
  assert.equal(independentlyVerifiedAction(pJudge, { ...submitted, status: "OPEN", round_no: 2 }, wallet), false);
  assert.equal(independentlyVerifiedAction({ ...pJudge, wallet: undefined }, submitted, wallet), false);
});
test("new workspace keeps accessibility, selectors and mobile layout", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../app.mjs", import.meta.url), "utf8");
  for (const id of ["connectBtn","disconnectBtn","who","caddr","exHit","exMiss","exDead","exParse",
    "newHunt","openBtn","subBtn","judgeBtn","readBtn","sampleBtn","resumeBtn","clearPendingBtn","q","r","url","jid","out","msg","txDetail","nextStepDescription"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /@media\(max-width:620px\)/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<details class="details">/);
  assert.ok(!html.includes("<script type=\"module\">"));
  assert.equal((app.match(/\.writeContract\(/g) || []).length, 1);
  assert.match(app, /verifyFinalState/);
  assert.match(app, /independentlyVerifiedAction/);
  assert.match(app, /window\.confirm/);
  assert.match(app, /latest-final/);
});
