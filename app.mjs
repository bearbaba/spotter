import { createClient } from "https://esm.sh/genlayer-js@0.18.10?bundle";
import { studionet } from "https://esm.sh/genlayer-js@0.18.10/chains?bundle";
import {
  parseJobId, transactionHash, jobIdFromReceipt, receiptError,
  parseJobResult, publicUrl, settledStatus, genLayerTxIdFromEthereumReceipt,
} from "./spotter-core.mjs";

const $ = (id) => document.getElementById(id);
const CONTRACT = "0x730143dF831778569e15975Ef44dFDeCB668609b";
const RPC = "https://studio.genlayer.com/api";
const ZERO = "0x0000000000000000000000000000000000000000";
const CHAIN_ID = "0xf22f";
const EXPLORER = "https://explorer-studio.genlayer.com/tx/";
const readClient = createClient({ chain: studionet, endpoint: RPC, account: ZERO });
const writeButtons = ["openBtn", "subBtn", "judgeBtn"];
let account = null;
let busy = false;

$("caddr").textContent = CONTRACT;
const EXAMPLES = {
  HIT: { q: "Does example.org say the domain is for documentation examples?", r: "HIT if the live page says that.", url: "https://example.org" },
  MISS: { q: "Is example.org the official United Nations homepage?", r: "MISS if the page is not the UN.", url: "https://example.org" },
  DEAD: { q: "Does this page confirm the claim?", r: "DEAD if the page cannot be fetched.", url: "https://this-domain-should-not-resolve-genlayer-test.invalid" },
  PARSE: { q: "__PARSE_TEST__", r: "n/a", url: "https://example.org" },
};
function note(message, bad = false) {
  $("msg").className = bad ? "msg bad" : "msg";
  $("msg").textContent = message;
}
function errorText(err) {
  const value = String(err?.shortMessage || err?.message || err);
  if (/user rejected|user denied|rejected the request/i.test(value)) return "Wallet request rejected. No new transaction will be sent automatically.";
  if (/wrong chain|0xf22f|chain mismatch/i.test(value)) return "Switch MetaMask to GenLayer Studionet (61999).";
  if (/locked to hunter/i.test(value)) return "This pending URL belongs to the first hunter.";
  return value.slice(0, 500);
}
function setStep(n) {
  ["s1", "s2", "s3", "s4", "s5"].forEach((id, i) => $(id).classList.toggle("on", i + 1 === n));
}
function syncWallet(address) {
  account = address || null;
  $("who").textContent = account || "not connected · reads work without a wallet";
  $("disconnectBtn").hidden = !account;
  setStep(account ? 2 : 1);
}
function setBusy(value) {
  busy = value;
  for (const id of writeButtons) $(id).disabled = value;
}
async function guarded(task) {
  if (busy) { note("A transaction is already being prepared or checked. Please do not submit it again.", true); return; }
  setBusy(true);
  try { await task(); }
  catch (error) { note(errorText(error), true); }
  finally { setBusy(false); }
}
function loadExample(key) {
  const ex = EXAMPLES[key];
  $("q").value = ex.q;
  $("r").value = ex.r;
  $("url").value = ex.url;
  note(key === "PARSE"
    ? "Loaded a historical PARSE example. This input does NOT guarantee a PARSE verdict in a new transaction."
    : "Loaded " + key + " example. Fresh AI results can vary.");
  setStep(account ? 2 : 1);
}
function requireJobId() {
  const id = parseJobId($("jid").value);
  if (!id) throw new Error("Enter a numeric Job ID from open_job or use Read sample #1.");
  return id;
}
async function readJob(id) {
  const raw = await readClient.readContract({
    address: CONTRACT, functionName: "get_job", args: [id], transactionHashVariant: "latest-nonfinal",
  });
  return parseJobResult(raw);
}
function renderJob(job) {
  const output = $("out");
  output.replaceChildren();
  const status = String(job.status || "UNKNOWN").toUpperCase();
  const badge = document.createElement("span");
  badge.className = "tag " + (["HIT", "MISS", "DEAD", "OPEN", "SUBMITTED"].includes(status) ? status : "OPEN");
  badge.textContent = status;
  const detail = document.createElement("pre");
  detail.textContent = JSON.stringify(job, null, 2);
  output.append(badge, detail);
  const suffix = job.fail_kind ? " / " + job.fail_kind : "";
  note("On-chain state: " + status + suffix + (settledStatus(status) ? " (settled)" : " (not settled)"));
}
async function readCurrentJob() {
  const id = requireJobId();
  const job = await readJob(id);
  if (!job.id) throw new Error("No accepted state found for job " + id + " yet.");
  renderJob(job);
  return job;
}
function writer() {
  if (!account || !window.ethereum) throw new Error("Connect MetaMask before writing.");
  return createClient({ chain: studionet, endpoint: RPC, account, provider: window.ethereum });
}
function displayHash(hash, fn, kind = "evm") {
  const detail = $("txDetail");
  detail.replaceChildren();
  if (!hash) return;
  const label = document.createElement("span");
  label.textContent = fn + " · " + (kind === "genlayer" ? "GenLayer tx: " : "MetaMask tx: ");
  detail.append(label);
  if (kind === "genlayer") {
    const link = document.createElement("a");
    link.href = EXPLORER + hash;
    link.textContent = hash.slice(0, 14) + "… ↗";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    detail.append(link);
  } else {
    const code = document.createElement("code");
    code.textContent = hash.slice(0, 14) + "…";
    detail.append(code);
  }
}

async function getEthereumReceipt(hash) {
  for (let i = 0; i < 16; i++) {
    const receipt = await window.ethereum.request({ method: "eth_getTransactionReceipt", params: [hash] });
    if (receipt) return receipt;
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  return null;
}

async function waitOnChain(pending) {
  const { hash, fn } = pending;
  if (!window.ethereum?.request) throw new Error("Connect MetaMask on Studionet to resume.");
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (String(chainId).toLowerCase() !== CHAIN_ID) throw new Error("Switch to Studionet 61999 to track this transaction.");
  let txId = pending.genlayerId;
  if (!txId) {
    note(fn + " sent. Waiting for MetaMask transaction receipt. Do not send again.");
    const evmReceipt = await getEthereumReceipt(hash);
    if (!evmReceipt) {
      note("Wallet transaction not confirmed yet: " + hash + ". Use Resume later, not the write button.");
      return null;
    }
    try {
      txId = genLayerTxIdFromEthereumReceipt(evmReceipt, readClient.chain.consensusMainContract.address);
    } catch (err) {
      if (/reverted/i.test(String(err))) sessionStorage.removeItem("spotter.pending");
      throw err;
    }
    if (!txId) {
      note("Wallet transaction mined without a NewTransaction event. Inspect wallet hash " + hash + " before attempting another write.", true);
      return null;
    }
    pending.genlayerId = txId;
    sessionStorage.setItem("spotter.pending", JSON.stringify(pending));
  }
  displayHash(txId, fn, "genlayer");
  let receipt;
  try {
    // genlayer-js 0.18.x uses waitForTransactionReceipt, not waitForFinalization.
    receipt = await readClient.waitForTransactionReceipt({ hash: txId, status: "ACCEPTED", interval: 3000, retries: 24 });
  } catch (err) {
    note("GenLayer tx " + txId + " is still pending or cannot be read: " + errorText(err) + ". Resume; never resend.", true);
    return null;
  }
  const failure = receiptError(receipt);
  if (failure) {
    sessionStorage.removeItem("spotter.pending");
    throw new Error("GenLayer transaction failed: " + failure);
  }
  const status = String(receipt?.statusName ?? receipt?.status_name ?? "").toUpperCase();
  if (status !== "ACCEPTED" && status !== "FINALIZED") {
    note("GenLayer transaction is " + (status || "pending") + ". Resume after it reaches ACCEPTED.");
    return null;
  }
  return receipt;
}

async function send(fn, args) {
  if (args.some((arg) => typeof arg !== "string" || !arg.trim())) throw new Error("Fill in all required fields.");
  if (sessionStorage.getItem("spotter.pending")) {
    throw new Error("Another transaction is still being tracked. Use Resume latest transaction first; no automatic resends.");
  }
  if (!window.ethereum?.request) throw new Error("Connect MetaMask first.");
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (String(chainId).toLowerCase() !== CHAIN_ID) throw new Error("Switch to Studionet 61999 first.");
  const client = writer();
  // Actual SDK 0.18.10 API, which estimates EVM gas internally.
  // Exactly one wallet submission. NEVER retry writeContract on any error.
  const raw = await client.writeContract({ address: CONTRACT, functionName: fn, args, value: 0n });
  const hash = transactionHash(raw);
  if (!hash) throw new Error("Unknown wallet transaction hash. Inspect MetaMask before trying again; never auto-retry.");
  const pending = { hash, fn, genlayerId: "", jobId: fn === "open_job" ? "" : args[0], time: Date.now() };
  sessionStorage.setItem("spotter.pending", JSON.stringify(pending));
  displayHash(hash, fn);
  const receipt = await waitOnChain(pending);
  if (receipt) sessionStorage.removeItem("spotter.pending");
  return { hash, receipt, pending: !receipt };
}
async function afterWrite(fn, id) {
  const job = await readJob(id);
  if (!job.id) {
    note(fn + " finalized, but accepted job state is not readable yet. Use Read later.");
    return;
  }
  renderJob(job);
  if (fn === "submit_url" && job.status === "SUBMITTED") setStep(4);
  if (fn === "judge") setStep(5);
}
$("connectBtn").onclick = async () => {
  try {
    if (!window.ethereum) throw new Error("MetaMask-compatible wallet not found.");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID }] });
    syncWallet(accounts[0] || null);
    note("Wallet connected. Review the exact transaction in MetaMask before signing.");
  } catch (err) {
    if (err?.code === 4902) note("Studionet not added to MetaMask. Add chain 61999 using the official GenLayer network details.", true);
    else note(errorText(err), true);
  }
};
$("disconnectBtn").onclick = () => {
  syncWallet(null); // hides the account locally; the wallet itself may remain authorized
  note("Disconnected in this page. Use MetaMask settings to revoke site permissions.");
};
if (window.ethereum?.on) {
  window.ethereum.on("accountsChanged", (accounts) => {
    syncWallet(accounts?.[0] || null);
    note(account ? "Wallet account changed. Verify the selected job before writing." : "Wallet disconnected.");
  });
  window.ethereum.on("chainChanged", () => {
    syncWallet(null);
    note("Wallet network changed. Reconnect on Studionet 61999 before writing.", true);
  });
}
$("exHit").onclick = () => loadExample("HIT");
$("exMiss").onclick = () => loadExample("MISS");
$("exDead").onclick = () => loadExample("DEAD");
$("exParse").onclick = () => loadExample("PARSE");
$("newHunt").onclick = () => loadExample("MISS");
$("sampleBtn").onclick = async () => {
  $("jid").value = "1";
  try { await readCurrentJob(); setStep(5); }
  catch (err) { note(errorText(err), true); }
};
$("readBtn").onclick = async () => {
  try { await readCurrentJob(); setStep(5); }
  catch (err) { note(errorText(err), true); }
};
$("openBtn").onclick = () => guarded(async () => {
  const question = $("q").value.trim();
  const rubric = $("r").value.trim();
  if (!question || !rubric) throw new Error("A question and a decision rubric are required.");
  const result = await send("open_job", [question, rubric]);
  if (result.pending) return;
  const id = jobIdFromReceipt(result.receipt);
  if (!id) {
    note("open_job finalized, but its return value could not be decoded. Retrieve the exact job ID from the transaction result in Studio and paste it here; never guess or use last_job_of.");
    return;
  }
  $("jid").value = id;
  note("Job " + id + " returned by finalized open_job.");
  setStep(3);
});
$("subBtn").onclick = () => guarded(async () => {
  const id = requireJobId();
  const url = publicUrl($("url").value);
  const result = await send("submit_url", [id, url]);
  if (!result.pending) await afterWrite("submit_url", id);
});
$("judgeBtn").onclick = () => guarded(async () => {
  const id = requireJobId();
  const result = await send("judge", [id]);
  if (!result.pending) await afterWrite("judge", id);
});
$("resumeBtn").onclick = () => guarded(async () => {
  const stored = sessionStorage.getItem("spotter.pending");
  if (!stored) { note("No pending transaction in this browser tab."); return; }
  const pending = JSON.parse(stored);
  if (!transactionHash(pending.hash)) throw new Error("Invalid saved wallet transaction hash.");
  displayHash(pending.genlayerId || pending.hash, pending.fn, pending.genlayerId ? "genlayer" : "evm");
  const receipt = await waitOnChain(pending);
  if (!receipt) return;
  sessionStorage.removeItem("spotter.pending");
  if (pending.fn === "open_job") {
    const id = jobIdFromReceipt(receipt);
    if (id) { $("jid").value = id; setStep(3); note("Recovered accepted job " + id + "."); }
    else note("open_job accepted. SDK v0.18.x does not expose its return value here; retrieve the real Job ID in GenLayer Studio. Never guess.");
  } else if (parseJobId(pending.jobId)) {
    $("jid").value = pending.jobId;
    await afterWrite(pending.fn, pending.jobId);
  } else {
    note("Transaction accepted. Enter the original Job ID and press Read to verify chain state.");
  }
});
try {
  const stored = JSON.parse(sessionStorage.getItem("spotter.pending") || "null");
  if (stored?.hash && transactionHash(stored.hash)) {
    displayHash(stored.genlayerId || stored.hash, stored.fn || "transaction", stored.genlayerId ? "genlayer" : "evm");
    note("A transaction was previously submitted in this tab. Use Resume latest transaction before taking another action.");
  }
} catch { /* ignore invalid browser storage */ }
syncWallet(null);
