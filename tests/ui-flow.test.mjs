import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as core from "../spotter-core.mjs";

const source = readFileSync(new URL("../app.mjs", import.meta.url), "utf8")
  .replace(/^import \{ createClient \} from .*?;\n/m, "")
  .replace(/^import \{ studionet \} from .*?;\n/m, "")
  .replace(/^import \{[\s\S]*?\} from "\.\/spotter-core\.mjs";\n/m, "");

function makePage({ applyWrites = true } = {}) {
  const wallet = "0x1111111111111111111111111111111111111111";
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
      disabled: false, title: "", style: {}, children: [],
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
  let job = null, writes = 0;
  const ethereum = {
    async request({ method }) {
      if (method === "eth_requestAccounts") return [wallet];
      if (method === "wallet_switchEthereumChain") return null;
      if (method === "eth_chainId") return "0xf22f";
      if (method === "eth_getTransactionReceipt") return { status: "0x1", logs: [] };
      throw Error("Unexpected wallet RPC " + method);
    },
  };
  const historicalJob = {
    id: "1", status: "HIT", url: "https://example.org",
    question: "Historical sample", justification: "Documentation examples",
    page_hash: "f".repeat(64),
  };
  const readClient = {
    chain: { consensusMainContract: { address: "0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575" } },
    async readContract({ functionName, args = [] }) {
      if (functionName === "last_job_of") return job ? "7" : "";
      if (functionName === "get_job") {
        if (String(args[0]) === "1") return JSON.stringify(historicalJob);
        return JSON.stringify(job || {});
      }
      throw Error("Unexpected GenLayer read " + functionName);
    },
    async waitForTransactionReceipt() {
      throw Error("No GenLayer event ID is available in this mock");
    },
  };
  const writeClient = {
    async writeContract({ functionName, args }) {
      writes += 1;
      if (!applyWrites) return hash;
      if (functionName === "open_job") {
        job = { id: "7", poster: wallet, hunter: "0x0000000000000000000000000000000000000000",
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
    ...core,
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (callback) => { callback(); return 0; },
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
