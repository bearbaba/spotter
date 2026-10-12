import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseJobId, transactionHash, jobIdFromReceipt, receiptError,
  parseJobResult, publicUrl, settledStatus,
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
test("static web code does not use unsafe innerHTML or write retries", () => {
  const app = readFileSync(new URL("../app.mjs", import.meta.url), "utf8");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(!app.includes("innerHTML"));
  assert.ok(!app.includes("catch (first)"));
  assert.ok(!html.includes("<script type=\"module\">"));
  assert.match(html, /Read sample job #1/);
  assert.match(app, /waitForFinalization/);
  assert.match(app, /sessionStorage/);
  assert.match(app, /estimateTransactionFeesForWrite/);
  assert.match(app, /writeContract/);
});
