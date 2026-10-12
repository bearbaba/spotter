import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as core from "../spotter-core.mjs";
import { createJobsBrowser } from "../jobs-browser.mjs";

const source = readFileSync(new URL("../app.mjs", import.meta.url), "utf8")
  .replace(/^import \{ createClient \} from .*?;\n/m, "")
  .replace(/^import \{ studionet \} from .*?;\n/m, "")
  .replace(/^import \{ createJobsBrowser \} from .*?;\n/m, "")
  .replace(/^import \{[\s\S]*?\} from "\.\/spotter-core\.mjs";\n/m, "");

function makePage({ applyWrites = true, stallDiagnosticRpc = false, withUnknownLog = false, mixedCasePoster = false, studioTxSuccess = false, studioReturn = false, studioLeaderReturn = false, existingJob = false } = {}) {
  const wallet = mixedCasePoster ? "0x" + "a".repeat(40) : "0x1111111111111111111111111111111111111111";
  const storedPoster = mixedCasePoster ? "0x" + "A".repeat(40) : wallet;
  const hash = "0x" + "a".repeat(64);
  const elements = new Map();
  const storage = new Map();
  const defaultValues = {
    q: "Does example.org say the domain is for documentation examples?",
    r: "HIT if the live page says that.",
    url: "https://example.org",
  };
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      id, value: defaultValues[id] || "", textContent: "", className: "", hidden: false,
      disabled: false, title: "", style: {}, children: [], dataset: {}, attributes: {},
      setAttribute(name,value) { this.attributes[name] = String(value); },
      classList: { toggle(){}, remove(){}, add(){} },
      replaceChildren(...items) { this.children = [...items]; },
      append(...items) { this.children.push(...items); },
    });
    return elements.get(id);
  }
  const document = {
    getElementById: element,
    createElement: (name) => ({ ...element("created-" + name + "-" + Math.random()), children: [], append(...items){this.children.push(...items);} }),
  };
  let job = existingJob ? { id: "7", poster: storedPoster, status: "OPEN", question: "Historical result", rubric: "Exact match", url: "", round_no: 0 } : null, writes = 0;
  const ethereum = {
    async request({ method }) {
      if (method === "eth_requestAccounts") return [wallet];
      if (method === "wallet_switchEthereumChain") return null;
      if (method === "eth_chainId") return "0xf22f";
      if (method === "eth_getTransactionByHash") {
        if (stallDiagnosticRpc) return new Promise(() => {});
        return { hash, from: wallet, to: "0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575" };
      }
      if (method === "eth_getTransactionReceipt") return {
        status: "0x1",
        logs: withUnknownLog ? [{
          address: "0x2222222222222222222222222222222222222222",
          topics: ["0x" + "b".repeat(64)],
        }] : [],
      };
      throw Error("Unexpected wallet RPC " + method);
    },
  };
  const historicalJob = {
    id: "1", status: "HIT", url: "https://example.org", poster: storedPoster,
    question: "Historical sample", justification: "Documentation examples",
    page_hash: "f".repeat(64),
  };
  const readClient = {
    chain: { consensusMainContract: { address: "0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575" } },
    async readContract({ functionName, args = [] }) {
      if (functionName === "last_job_of") return job && (!mixedCasePoster || args[0] === storedPoster) ? "7" : "";
      if (functionName === "get_job") {
        if (String(args[0]) === "1") return JSON.stringify(historicalJob);
        return JSON.stringify(job || {});
      }
      throw Error("Unexpected GenLayer read " + functionName);
    },
    async waitForTransactionReceipt() {
      throw Error("No GenLayer event ID is available in this mock");
    },
    ...(studioTxSuccess ? {
      async getTransaction({ hash: txHash }) {
        return {
          hash: txHash, statusName: "FINALIZED", resultName: "SUCCESS",
          sender: wallet, recipient: "0x730143dF831778569e15975Ef44dFDeCB668609b",
          ...(studioReturn ? { returnValue: "7" } : {}),
          ...(studioLeaderReturn ? {resultName: "AGREE", consensus_data: {leader_receipt: [{result: {status: "return", payload: {readable: "'7'"}}}]}} : {}),
        };
      },
    } : {}),
  };
  const writeClient = {
    async writeContract({ functionName, args }) {
      writes += 1;
      if (!applyWrites) return hash;
      if (functionName === "open_job") {
        job = { id: "7", poster: storedPoster, hunter: "0x0000000000000000000000000000000000000000",
          question: args[0], rubric: args[1], url: "", status: "OPEN", round_no: 0, justification: "" };
      } else if (functionName === "submit_url") {
        job = { ...job, url: args[1], hunter: wallet, status: "SUBMITTED" };
      } else if (functionName === "judge") {
        job = { ...job, status: "HIT", justification: "Matched the requested claim", page_hash: "a".repeat(64), round_no: 1 };
      } else throw Error("Unexpected write " + functionName);
      return hash;
    },
  };
  const context = {
    document,
    window: { ethereum, confirm: () => true },
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    createClient: (config) => config.account === "0x0000000000000000000000000000000000000000"
      ? readClient : writeClient,
    studionet: { id: 61999 },
    createJobsBrowser,
    ...core,
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (callback, ms = 0) => {
      // Immediate successful wallet calls must resolve before the simulated deadline.
      // Only the explicitly stalled RPC should then hit a synthetic asynchronous timeout.
      if (ms < 6000) callback();
      else if (stallDiagnosticRpc) setImmediate(callback);
      return 0;
    },
    clearTimeout: () => {},
  };
  vm.runInNewContext(source, context, { filename: "app.mjs" });
  return { element, storage, get job(){return job;}, get writes(){return writes;} };
}

test("missing NewTransaction logs: recover Create / Submit / Verify from exact finalized state", async () => {
  const page = makePage();
  await page.element("connectBtn").onclick();
  assert.equal(page.element("openBtn").disabled, false);
  await page.element("openBtn").onclick();
  assert.equal(page.writes, 1);
  assert.equal(page.element("jid").value, "7");
  assert.equal(page.element("subBtn").disabled, false);
  assert.equal(page.storage.has("spotter.pending"), false);
  await page.element("subBtn").onclick();
  assert.equal(page.writes, 2);
  assert.equal(page.job.status, "SUBMITTED");
  assert.equal(page.element("judgeBtn").disabled, false);
  await page.element("judgeBtn").onclick();
  assert.equal(page.writes, 3);
  assert.equal(page.job.status, "HIT");
  assert.equal(page.storage.has("spotter.pending"), false);
  assert.match(page.element("out").children.map(x=>x.textContent||"").join(" "), /HIT/);
});
test("no matching finalized state never auto-resends or announces success", async () => {
  const page = makePage({ applyWrites: false });
  await page.element("connectBtn").onclick();
  await page.element("openBtn").onclick();
  assert.equal(page.writes, 1);
  assert.equal(page.storage.has("spotter.pending"), true);
  assert.equal(page.element("openBtn").disabled, true);
  assert.match(page.element("msg").textContent, /No matching finalized state/);
  await page.element("resumeBtn").onclick();
  assert.equal(page.writes, 1);
  assert.equal(page.storage.has("spotter.pending"), true);
  await page.element("clearPendingBtn").onclick();
  assert.equal(page.storage.has("spotter.pending"), false);
  assert.equal(page.writes, 1);
});

test("historical proof lookup does not mutate live job ID or workflow state", async () => {
  const page = makePage();
  assert.equal(page.element("jid").value, "");
  await page.element("sampleBtn").onclick();
  assert.equal(page.writes, 0, "reading sample must never submit a transaction");
  assert.equal(page.element("jid").value, "", "sample ID must not become active job");
  assert.equal(page.element("lookupId").value, "1");
  assert.match(page.element("out").children.map(x => x.textContent || "").join(" "), /HIT/);
  await page.element("connectBtn").onclick();
  assert.equal(page.element("subBtn").disabled, true, "public proof does not unlock Submit");
  assert.equal(page.element("judgeBtn").disabled, true, "public proof does not unlock Verify");
  await page.element("openBtn").onclick();
  assert.equal(page.element("jid").value, "7");
  assert.equal(page.element("subBtn").disabled, false);
  await page.element("sampleBtn").onclick();
  assert.equal(page.element("jid").value, "7", "existing active job must survive historical read");
  assert.equal(page.element("subBtn").disabled, false, "historical read must not disable active Submit");
  assert.equal(page.writes, 1);
  page.element("lookupId").value = "1";
  await page.element("readBtn").onclick();
  assert.equal(page.element("jid").value, "7");
  assert.equal(page.writes, 1, "manual public proof read must never write");
  await page.element("subBtn").onclick();
  assert.equal(page.job.id, "7");
  assert.equal(page.job.status, "SUBMITTED");
});

test("on-screen guidance follows the actual wallet and transaction status", async () => {
  const page = makePage();
  assert.match(page.element("nextStepDescription").textContent, /Connect a Studionet wallet/);
  await page.element("connectBtn").onclick();
  assert.match(page.element("nextStepDescription").textContent, /Wallet connected to Studionet/);
  assert.doesNotMatch(page.element("nextStepDescription").textContent, /Connect a Studionet wallet/);
  await page.element("sampleBtn").onclick();
  assert.match(page.element("nextStepDescription").textContent, /Wallet connected to Studionet/,
    "reading public evidence must not alter the live-flow instruction");
  await page.element("disconnectBtn").onclick();
  assert.match(page.element("nextStepDescription").textContent, /Connect a Studionet wallet/);
  const stalled = makePage({ applyWrites: false });
  await stalled.element("connectBtn").onclick();
  await stalled.element("openBtn").onclick();
  assert.match(stalled.element("nextStepDescription").textContent, /A transaction is still being tracked/);
  assert.equal(stalled.element("openBtn").disabled, true);
});

test("read-only diagnostics expose full transaction evidence without writing or clearing pending", async () => {
  const page = makePage({ applyWrites: false });
  await page.element("connectBtn").onclick();
  await page.element("openBtn").onclick();
  const countBefore = page.writes;
  const storedBefore = page.storage.get("spotter.pending");
  assert.equal(countBefore, 1);
  await page.element("diagnoseBtn").onclick();
  const report = page.element("txDiagnostics").textContent;
  assert.match(report, /READ-ONLY DIAGNOSTICS/);
  assert.match(report, /0x[a]{64}/);
  assert.match(report, /Expected Studionet consensus address/);
  assert.match(report, /Actual transaction destination/);
  assert.match(report, /Wallet receipt status: 0x1/);
  assert.match(report, /Event logs returned: 0/);
  assert.match(report, /No matching NewTransaction event/);
  assert.equal(page.writes, countBefore, "diagnosis must never trigger another signature");
  assert.equal(page.storage.get("spotter.pending"), storedBefore, "diagnosis must never clear pending");
  await page.element("copyHashBtn").onclick();
  assert.match(page.element("txDiagnostics").textContent, /0x[a]{64}/);
  assert.equal(page.writes, countBefore);
});

test("diagnostics are placed in the open troubleshooting section, not the unrelated advanced Job ID panel", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const advanced = html.indexOf('id="jobRecovery"');
  const troubleshoot = html.indexOf('<summary>Transaction details &amp; troubleshooting</summary>');
  const button = html.indexOf('id="diagnoseBtn"');
  const result = html.indexOf('id="txDiagnostics"');
  const sectionEnd = html.indexOf("</details>", troubleshoot);
  assert.ok(advanced >= 0 && troubleshoot > advanced);
  assert.ok(button > troubleshoot && result > button && result < sectionEnd,
    "diagnostic result must be visible directly under the button in Transaction details");
  assert.equal(html.split('id="txDiagnostics"').length, 2, "diagnostic output must have one unique ID");
  assert.match(html, /\.diagnostics-output\[hidden\]/);
});
test("a hung transaction RPC gives visible diagnostics and bounded timeout without additional writes", async () => {
  const page = makePage({ applyWrites: false, stallDiagnosticRpc: true });
  await page.element("connectBtn").onclick();
  await page.element("openBtn").onclick();
  const countBefore = page.writes;
  const pendingBefore = page.storage.get("spotter.pending");
  await page.element("diagnoseBtn").onclick();
  const report = page.element("txDiagnostics").textContent;
  assert.match(report, /READ-ONLY DIAGNOSTICS/);
  assert.match(report, /Transaction lookup error:.*timed out/);
  assert.match(report, /Wallet receipt status: 0x1/);
  assert.match(report, /Inspection finished/);
  assert.equal(page.element("txDiagnostics").hidden, false);
  assert.equal(page.writes, countBefore);
  assert.equal(page.storage.get("spotter.pending"), pendingBefore);
});

test("diagnostics identify an unknown receipt event and check historical contract liveness", async () => {
  const page = makePage({ applyWrites: false, withUnknownLog: true });
  await page.element("connectBtn").onclick();
  await page.element("openBtn").onclick();
  const writesBefore = page.writes;
  const storedBefore = page.storage.get("spotter.pending");
  await page.element("diagnoseBtn").onclick();
  const details = page.element("txDiagnostics").textContent;
  assert.match(details, /Event logs returned: 1/);
  assert.match(details, /Log #0 emitter: 0x2222222222222222222222222222222222222222/);
  assert.match(details, /Log #0 topic\[0\]: 0x[b]{64}/);
  assert.match(details, /No matching NewTransaction event/);
  assert.match(details, /Contract Job #1: FOUND — verdict HIT/);
  assert.match(details, /Contract Job #1 page hash: [f]{64}/);
  assert.equal(page.writes, writesBefore, "no wallet writes permitted during diagnostics");
  assert.equal(page.storage.get("spotter.pending"), storedBefore);
});

test("historical Studio poster casing recovers accepted open_job without another wallet write", async () => {
  const page = makePage({ mixedCasePoster: true });
  await page.element("connectBtn").onclick();
  assert.equal(page.element("openBtn").disabled, false);
  await page.element("openBtn").onclick();
  assert.equal(page.writes, 1, "exactly one signed transaction");
  assert.equal(page.element("jid").value, "7", "recovers new job from case-matched last_job_of");
  assert.equal(page.element("subBtn").disabled, false, "accepted Job is ready to submit evidence");
  assert.equal(page.storage.has("spotter.pending"), false, "matched final state clears pending only after verification");
  await page.element("sampleBtn").onclick();
  assert.equal(page.element("jid").value, "7", "public sample never overrides active job");
  assert.equal(page.writes, 1);
});
test("case-sensitive last_job_of failure never invents a Job ID or resends", async () => {
  const page = makePage({ mixedCasePoster: true, applyWrites: false });
  await page.element("connectBtn").onclick();
  await page.element("openBtn").onclick();
  assert.equal(page.writes, 1);
  assert.equal(page.element("jid").value, "");
  assert.equal(page.storage.has("spotter.pending"), true);
  await page.element("resumeBtn").onclick();
  assert.equal(page.writes, 1);
  assert.equal(page.storage.has("spotter.pending"), true);
});

test("canonical GenLayer hash reports FINALIZED SUCCESS without relying on EVM NewTransaction logs", async () => {
  const page = makePage({ applyWrites: false, studioTxSuccess: true });
  await page.element("connectBtn").onclick();
  await page.element("openBtn").onclick();
  assert.equal(page.writes, 1);
  assert.match(page.element("msg").textContent, /Studio has accepted this open_job/);
  assert.match(page.element("msg").textContent, /Browse jobs/);
  assert.equal(page.element("jid").value, "", "a successful transaction alone must not guess the Job ID");
  assert.equal(page.storage.has("spotter.pending"), true, "keep pending until exact Job ID is verified");
  await page.element("resumeBtn").onclick();
  assert.equal(page.writes, 1, "Resume must never submit an additional transaction");
  await page.element("diagnoseBtn").onclick();
  assert.match(page.element("txDiagnostics").textContent, /Direct GenLayer lookup: CONFIRMED · FINALIZED · SUCCESS/);
  assert.equal(page.writes, 1);
});

test("explicit Job return from exact GenLayer hash unlocks only the matching job", async () => {
  const page = makePage({ studioTxSuccess: true, studioReturn: true });
  await page.element("connectBtn").onclick();
  await page.element("openBtn").onclick();
  assert.equal(page.writes, 1);
  assert.equal(page.element("jid").value, "7");
  assert.equal(page.element("subBtn").disabled, false);
  assert.equal(page.storage.has("spotter.pending"), false);
});

test("recover existing hash without wallet or sessionStorage", async () => {
  const page = makePage({ studioTxSuccess: true, studioReturn: false });
  page.element("recoveryHash").value = "0x" + "a".repeat(64);
  assert.equal(page.storage.has("spotter.pending"), false);
  assert.equal(page.element("jid").value, "");
  await page.element("recoverHashBtn").onclick();
  assert.equal(page.writes, 0);
  assert.equal(page.storage.has("spotter.pending"), false);
  assert.match(page.element("recoveryResult").textContent, /Status: FINALIZED/);
  assert.match(page.element("recoveryResult").textContent, /Explicit open_job return ID: NOT EXPOSED BY SDK/);
  assert.match(page.element("recoveryResult").textContent, /GenVM Execution/);
  assert.equal(page.element("jid").value, "");
});
test("return encoded in SDK leader receipt identifies a read-only proof without auto-unlocking wallet writes", async () => {
  const page = makePage({ studioTxSuccess: true, studioLeaderReturn: true, existingJob: true });
  page.element("recoveryHash").value = "0x" + "a".repeat(64);
  await page.element("recoverHashBtn").onclick();
  assert.match(page.element("recoveryResult").textContent, /Explicit open_job return ID: 7/);
  assert.equal(page.element("lookupId").value, "7");
  assert.equal(page.element("jid").value, "");
  assert.equal(page.element("openBtn").disabled, true, "no wallet connected");
  assert.equal(page.element("subBtn").disabled, true);
  assert.equal(page.writes, 0);
});
test("recover Job #7 in a new tab and explicitly continue through Submit and Verify", async () => {
  const page = makePage({ studioTxSuccess: true, studioLeaderReturn: true, existingJob: true });
  const hash = "0x" + "a".repeat(64);
  page.element("recoveryHash").value = hash;
  await page.element("recoverHashBtn").onclick();
  assert.equal(page.writes, 0, "recovery must be read-only");
  assert.equal(page.element("jid").value, "", "recovery must not silently become a write action");
  assert.equal(page.element("continueRecoveredBtn").disabled, true, "wallet must be connected");
  await page.element("connectBtn").onclick();
  assert.equal(page.element("continueRecoveredBtn").disabled, false);
  await page.element("continueRecoveredBtn").onclick();
  assert.equal(page.writes, 0, "adopting existing Job does not create a new Job");
  assert.equal(page.element("jid").value, "7");
  assert.equal(page.element("q").value, "Historical result");
  assert.equal(page.element("r").value, "Exact match");
  assert.equal(page.element("subBtn").disabled, false);
  assert.equal(page.element("judgeBtn").disabled, true);
  assert.equal(page.element("openBtn").disabled, true, "must not invite another create while a job is active");
  await page.element("subBtn").onclick();
  assert.equal(page.writes, 1, "only the explicitly approved submit_url is sent");
  assert.equal(page.job.status, "SUBMITTED");
  assert.equal(page.element("judgeBtn").disabled, false);
  await page.element("judgeBtn").onclick();
  assert.equal(page.writes, 2, "only the explicitly approved judge is sent");
  assert.equal(page.job.status, "HIT");
  assert.equal(page.element("jid").value, "7");
});

test("recovering a final proof must not enable a signed workflow", async () => {
  const page = makePage({ studioTxSuccess: true, studioLeaderReturn: true, existingJob: true });
  page.element("recoveryHash").value = "0x" + "a".repeat(64);
  await page.element("recoverHashBtn").onclick();
  await page.element("connectBtn").onclick();
  assert.equal(page.element("continueRecoveredBtn").disabled, false);
  page.element("recoveryHash").value = "0x" + "b".repeat(64);
  page.element("recoveryHash").oninput();
  assert.equal(page.element("continueRecoveredBtn").disabled, true, "changing hash invalidates previously verified job");
  assert.equal(page.element("jid").value, "");
  assert.equal(page.writes, 0);
});

test("invalid hash cannot trigger read or write", async () => {
  const page = makePage({ studioTxSuccess: true });
  page.element("recoveryHash").value = "not-a-hash";
  await page.element("recoverHashBtn").onclick();
  assert.match(page.element("recoveryResult").textContent, /Enter a full/);
  assert.equal(page.writes, 0);
});

test("a FINALIZED GenVM leader return automatically recovers the newly opened job", async () => {
  const page = makePage({ studioTxSuccess: true, studioLeaderReturn: true });
  await page.element("connectBtn").onclick();
  await page.element("openBtn").onclick();
  assert.equal(page.writes, 1, "the only signed action was open_job");
  assert.equal(page.element("jid").value, "7", "job ID comes from exact GenVM return");
  assert.equal(page.element("subBtn").disabled, false);
  assert.equal(page.storage.has("spotter.pending"), false);
});

test("secondary history loads only when explicitly opened and never signs", async () => {
  const page = makePage({ existingJob: true });
  assert.equal(page.writes, 0);
  assert.equal(page.element("jobsList").children.length, 1, "secondary section shows only a dormant empty placeholder before opening");
  assert.match(page.element("jobsStatus").textContent, /^0 public job/);
  assert.equal(page.element("jobs").open, undefined, "secondary history starts collapsed");
  await page.element("openActivityBtn").onclick();
  assert.equal(page.element("jobs").open, true);
  assert.ok(page.element("jobsList").children.length > 0);
  await page.element("allJobsBtn").onclick();
  await page.element("myJobsBtn").onclick();
  assert.equal(page.writes, 0);
  assert.equal(page.element("jid").value, "");
  assert.equal(page.storage.has("spotter.pending"), false);
});

test("verification workspace remains ahead of collapsed Activity & history in the DOM", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /href="#workspace">Start verification/);
  assert.ok(html.indexOf('<main id="workspace">') > 0);
  const workspaceEnd=html.indexOf("</main>");
  const activity=html.indexOf('id="jobs"');
  const footer=html.indexOf('<footer class="footer">');
  assert.ok(activity > workspaceEnd && activity < footer);
  assert.match(html, /<details class="jobs-panel" id="jobs">/);
  assert.doesNotMatch(html, /<details class="jobs-panel" id="jobs" open/);
  assert.match(html, /id="openActivityBtn"/);
  assert.doesNotMatch(html, /Explore verifications<\/h2>/);
});

test("primary actions visibly highlight only the next valid step and report busy state", async () => {
  const page = makePage();
  assert.equal(page.element("openBtn").dataset.current, "false");
  assert.match(page.element("actionGuide").textContent, /Connect a Studionet wallet/);
  await page.element("connectBtn").onclick();
  assert.equal(page.element("openBtn").dataset.current, "true");
  assert.equal(page.element("subBtn").dataset.current, "false");
  assert.match(page.element("subBtn").title, /Complete the previous step/);
  await page.element("openBtn").onclick();
  assert.equal(page.element("openBtn").dataset.current, "false");
  assert.equal(page.element("subBtn").dataset.current, "true");
  assert.match(page.element("actionGuide").textContent, /Submit evidence/);
  await page.element("subBtn").onclick();
  assert.equal(page.element("judgeBtn").dataset.current, "true");
  await page.element("judgeBtn").onclick();
  assert.equal(page.element("judgeBtn").dataset.current, "false");
  assert.equal(page.writes, 3);
});
test("rendered primary buttons have visible press, hover, focus and progress indicators", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /\.action-row \.btn\[data-current="true"\]/);
  assert.match(html, /\.btn:active:not\(:disabled\)/);
  assert.match(html, /\.btn:focus-visible/);
  assert.match(html, /\.btn\[aria-busy="true"\]/);
  assert.match(html, /id="actionGuide"/);
});
