import { createClient } from "https://esm.sh/genlayer-js@0.18.0?bundle";
import { studionet } from "https://esm.sh/genlayer-js@0.18.0/chains?bundle";
import {
  parseJobId, transactionHash, jobIdFromReceipt, receiptError,
  parseJobResult, publicUrl, settledStatus,
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
    address: CONTRACT, functionName: "get_job", args: [id], stateStatus: "accepted",
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
function displayHash(hash, fn) {
  const detail = $("txDetail");
  detail.replaceChildren();
  if (!hash) return;
  const label = document.createElement("span");
  label.textContent = fn + " · ";
  const link = document.createElement("a");
  link.href = EXPLORER + hash;
  link.textContent = hash.slice(0, 12) + "… ↗";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  detail.append(label, link);
}
async function waitOnChain(hash, fn) {
  note(fn + " submitted: " + hash + ". Waiting for finalized execution. Do not submit it again.");
  let receipt;
  try {
    receipt = await readClient.waitForFinalization({ hash });
  } catch (err) {
    note(fn + " was submitted as " + hash + ". Finalization is not confirmed here. Use Resume latest transaction; do NOT resend.");
    return null;
  }
  const failure = receiptError(receipt);
  if (failure) throw new Error("Transaction " + hash + " finalized with an error: " + failure);
  return receipt;
}
async function send(fn, args) {
  if (args.some((arg) => typeof arg !== "string" || !arg.trim())) throw new Error("Fill in all required fields.");
  const client = writer();
  const write = { address: CONTRACT, functionName: fn, args };
  // Estimation failure is not a reason to send an unpriced or duplicate transaction.
  let estimate;
  try {
    estimate = await client.estimateTransactionFeesForWrite(write);
  } catch (err) {
    throw new Error("Fee estimation failed; NO transaction was sent. " + errorText(err));
  }
  if (!estimate?.distribution || estimate.feeValue === undefined) {
    throw new Error("Missing fee estimate. NO transaction was sent.");
  }
  // A single explicit wallet-approved write. NEVER retry a failed writeContract call.
  const raw = await client.writeContract({
    ...write, fees: { distribution: estimate.distribution, feeValue: estimate.feeValue },
  });
  const hash = transactionHash(raw);
  if (!hash) throw new Error("Wallet returned an unknown transaction identifier. Check your wallet before trying again.");
  sessionStorage.setItem("spotter.pending", JSON.stringify({ hash, fn, time: Date.now() }));
  displayHash(hash, fn);
  const receipt = await waitOnChain(hash, fn);
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
  const { hash, fn } = JSON.parse(stored);
  if (!transactionHash(hash)) throw new Error("Invalid saved transaction hash.");
  displayHash(hash, fn);
  const receipt = await waitOnChain(hash, fn);
  if (!receipt) return;
  sessionStorage.removeItem("spotter.pending");
  if (fn === "open_job") {
    const id = jobIdFromReceipt(receipt);
    if (id) { $("jid").value = id; setStep(3); note("Recovered finalized job " + id + "."); }
    else note("Finalized; use Studio to recover the open_job return value.");
  } else if (parseJobId($("jid").value)) {
    await afterWrite(fn, requireJobId());
  } else {
    note("Finalized. Enter the original Job ID and press Read to confirm state.");
  }
});
try {
  const stored = JSON.parse(sessionStorage.getItem("spotter.pending") || "null");
  if (stored?.hash && transactionHash(stored.hash)) {
    displayHash(stored.hash, stored.fn || "transaction");
    note("A transaction was previously submitted in this tab. Use Resume latest transaction before taking another action.");
  }
} catch { /* ignore invalid browser storage */ }
syncWallet(null);
