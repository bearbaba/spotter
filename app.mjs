import { createClient } from "https://esm.sh/genlayer-js@0.18.10?bundle";
import { studionet } from "https://esm.sh/genlayer-js@0.18.10/chains?bundle";
import {
  parseJobId, transactionHash, jobIdFromReceipt, receiptError,
  parseJobResult, publicUrl, settledStatus, genLayerTxIdFromEthereumReceipt, independentlyVerifiedAction,
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
let flowStage = 0;

$("caddr").textContent = CONTRACT;
const EXAMPLES = {
  HIT: { q: "Does example.org say the domain is for documentation examples?", r: "HIT if the live page says that.", url: "https://example.org" },
  MISS: { q: "Is example.org the official United Nations homepage?", r: "MISS if the page is not the UN.", url: "https://example.org" },
  DEAD: { q: "Does this page confirm the claim?", r: "DEAD if the page cannot be fetched.", url: "https://this-domain-should-not-resolve-genlayer-test.invalid" },
  PARSE: { q: "__PARSE_TEST__", r: "n/a", url: "https://example.org" },
};
function note(message, variant = "normal") {
  const kind = variant === true ? "error" : (variant === "pending" ? "pending" : "normal");
  $("msg").className = "notice" + (kind === "normal" ? "" : " " + kind);
  $("msg").textContent = String(message);
}
function errorText(err) {
  const value = String(err?.shortMessage || err?.message || err);
  if (/user rejected|user denied|rejected the request/i.test(value)) return "Wallet request rejected. No automatic retry will be attempted.";
  if (/wrong chain|0xf22f|chain mismatch/i.test(value)) return "Switch MetaMask to GenLayer Studionet 61999.";
  if (/locked to hunter/i.test(value)) return "This submitted source belongs to the first hunter.";
  return value.slice(0, 450);
}
function setStep(n) {
  const index = n >= 5 ? 4 : Math.max(1, n);
  ["s1", "s2", "s3", "s4"].forEach((id, i) => $(id).classList.toggle("active", i + 1 === index));
}
function setStage(stage) {
  flowStage = stage;
  const blocked = busy || Boolean(sessionStorage.getItem("spotter.pending"));
  $("openBtn").disabled = blocked || !account;
  $("subBtn").disabled = blocked || !account || stage !== 1;
  $("judgeBtn").disabled = blocked || !account || stage !== 2;
  const descriptions = {
    0: "Connect a Studionet wallet and create a new job. All wallet writes require your approval.",
    1: "Job created. Review the evidence URL, then submit it to the contract.",
    2: "Evidence submitted. Run GenLayer verification to request an on-chain verdict.",
    3: "Verification record is available. Read the proof or create a new job.",
  };
  $("nextStepDescription").textContent = blocked
    ? "A previous transaction is unresolved. Open Transaction details → Resume previous transaction. Never submit it again."
    : descriptions[stage] || descriptions[0];
  setStep(stage === 0 ? (account ? 2 : 1) : stage + 2);
}
function syncWallet(address) {
  const changed = account && address && account.toLowerCase() !== address.toLowerCase();
  account = address || null;
  $("who").textContent = account ? account.slice(0, 6) + "…" + account.slice(-4) : "Read-only";
  $("who").title = account || "No wallet connected";
  $("disconnectBtn").hidden = !account;
  $("disconnectBtn").classList.toggle("hidden", !account);
  $("connectBtn").classList.toggle("hidden", Boolean(account));
  if (changed) { $("jid").value = ""; flowStage = 0; }
  setStage(flowStage);
}
function setBusy(value) {
  busy = value;
  setStage(flowStage);
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
  $("jid").value = "";
  setStage(0);
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
  output.classList.remove("empty");
  const status = String(job.status || "UNKNOWN").toUpperCase();
  const badge = document.createElement("span");
  badge.className = "tag " + (["HIT", "MISS", "DEAD", "OPEN", "SUBMITTED"].includes(status) ? status : "OPEN");
  badge.textContent = status + (job.fail_kind ? " / " + job.fail_kind : "");
  const heading = document.createElement("h4");
  heading.textContent = "On-chain job #" + String(job.id || "?");
  heading.style.margin = "8px 0 12px";
  heading.style.fontSize = "16px";
  output.append(badge, heading);
  const fields = [
    ["Claim", job.question], ["Evidence", job.url], ["Verdict", status],
    ["Reason", job.justification], ["SHA-256", job.page_hash],
  ];
  for (const [label, value] of fields) {
    if (value === undefined || value === null || value === "") continue;
    const row = document.createElement("div");
    row.className = "proof-row";
    const name = document.createElement("span");
    name.className = "proof-label";
    name.textContent = label;
    const text = document.createElement("span");
    text.className = "proof-value";
    text.textContent = String(value);
    row.append(name, text);
    output.append(row);
  }
  const details = document.createElement("details");
  details.className = "proof-json";
  const summary = document.createElement("summary");
  summary.textContent = "View complete on-chain record";
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(job, null, 2);
  details.append(summary, pre);
  output.append(details);
  note("Contract state: " + status + (settledStatus(status) ? " · final verdict available" : " · not a final verdict"));
}
async function readProofById(id) {
  const validated = parseJobId(id);
  if (!validated) throw new Error("Enter a valid public Job ID to read a proof.");
  const job = await readJob(validated);
  if (!job.id) throw new Error("No accepted state found for job " + validated + " yet.");
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
  for (let i=0;i<16;i++) {
    const receipt=await window.ethereum.request({method:"eth_getTransactionReceipt",params:[hash]});
    if(receipt)return receipt;
    await new Promise(resolve=>setTimeout(resolve,2500));
  }
  return null;
}
async function latestJobId(owner) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(owner))) throw Error("Invalid wallet for latest-job lookup.");
  const raw=await readClient.readContract({
    address:CONTRACT,functionName:"last_job_of",args:[owner],transactionHashVariant:"latest-final",
  });
  return parseJobId(raw); // Genuine empty means the wallet has not previously opened a job.
}
async function captureBaseline(fn,args) {
  if(fn==="open_job")return {previousJobId:await latestJobId(account),question:args[0],rubric:args[1]};
  const job=await readJob(args[0]);
  if(!job.id)throw Error("Job not readable. No transaction has been sent.");
  if(fn==="submit_url" && job.status!=="OPEN" && !(job.status==="SUBMITTED"&&String(job.hunter).toLowerCase()===account.toLowerCase()&&job.url!==args[1]))throw Error("This job cannot accept the submitted URL.");
  if(fn==="judge" && job.status!=="SUBMITTED")throw Error("Only submitted jobs can be verified.");
  return {baselineStatus:job.status,baselineUrl:job.url,baselineRound:job.round_no};
}
async function verifyFinalState(p,attempts=5) {
  for(let i=0;i<attempts;i++){
    try{
      const id=p.fn==="open_job"?await latestJobId(p.wallet):parseJobId(p.jobId);
      if(id){
        const raw=await readClient.readContract({address:CONTRACT,functionName:"get_job",args:[id],transactionHashVariant:"latest-final"});
        const job=parseJobResult(raw);
        if(independentlyVerifiedAction(p,job,p.wallet))return {statusName:"FINALIZED",returnValue:id,observedContractState:true,job};
      }
    }catch{/* Wait for finalized state; never send another write. */}
    if(i+1<attempts)await new Promise(resolve=>setTimeout(resolve,3000));
  }
  return null;
}
async function waitOnChain(p) {
  if(!window.ethereum?.request)throw Error("Connect a wallet provider to inspect the pending transaction.");
  const chainId=await window.ethereum.request({method:"eth_chainId"});
  if(String(chainId).toLowerCase()!==CHAIN_ID)throw Error("Switch to Studionet 61999.");
  let genId=p.genlayerId;
  if(!genId){
    note("Checking wallet receipt without sending another transaction…","pending");
    let evm;
    try{evm=await getEthereumReceipt(p.hash)}catch(err){note("Receipt temporarily unavailable. Resume later: "+errorText(err),"pending");return null}
    if(!evm){note("Wallet transaction not mined yet. Use Resume later; do not resend.","pending");return null}
    try{genId=genLayerTxIdFromEthereumReceipt(evm,readClient.chain.consensusMainContract.address)}
    catch(err){if(/reverted/i.test(String(err)))sessionStorage.removeItem("spotter.pending");throw err}
    if(!genId){
      note("Wallet transaction mined, but event log is missing. Checking finalized contract state…","pending");
      const verified=await verifyFinalState(p);
      if(verified){note("Confirmed by matching finalized on-chain state. No duplicate transaction sent.");return verified}
      note("No matching finalized state yet. Keep the transaction hash and use Resume later; never resend.","pending");
      return null;
    }
    p.genlayerId=genId;
    sessionStorage.setItem("spotter.pending",JSON.stringify(p));
  }
  displayHash(genId,p.fn,"genlayer");
  let receipt;
  try{receipt=await readClient.waitForTransactionReceipt({hash:genId,status:"ACCEPTED",interval:3000,retries:24})}
  catch(err){note("Consensus unconfirmed: "+errorText(err)+". Resume later.","pending");return null}
  const failure=receiptError(receipt);
  if(failure){sessionStorage.removeItem("spotter.pending");throw Error("GenLayer execution failed: "+failure)}
  const status=String(receipt?.statusName??receipt?.status_name??"").toUpperCase();
  if(!["ACCEPTED","FINALIZED"].includes(status)){note("Consensus status: "+(status||"pending")+". Resume later.","pending");return null}
  if(p.fn==="open_job"&&!jobIdFromReceipt(receipt)){
    const verified=await verifyFinalState(p,3);
    if(verified)return {...receipt,...verified};
    note("Consensus accepted, but Job ID could not be uniquely verified. Check Studio before clearing local tracking.","pending");
    return null;
  }
  return receipt;
}
async function send(fn,args) {
  if(args.some(arg=>typeof arg!=="string"||!arg.trim()))throw Error("Fill all required fields.");
  if(sessionStorage.getItem("spotter.pending"))throw Error("A prior transaction is unresolved. Use read-only Resume; do not resend.");
  if(!window.ethereum?.request)throw Error("Connect MetaMask first.");
  const chainId=await window.ethereum.request({method:"eth_chainId"});
  if(String(chainId).toLowerCase()!==CHAIN_ID)throw Error("Switch to Studionet 61999.");
  // If the baseline RPC fails, stop BEFORE the wallet popup to avoid misattributing an older job.
  const baseline=await captureBaseline(fn,args);
  const raw=await writer().writeContract({address:CONTRACT,functionName:fn,args,value:0n}); // exactly one signed wallet write
  const hash=transactionHash(raw);
  if(!hash)throw Error("Unknown transaction hash. Check MetaMask before any retry.");
  const pending={hash,fn,genlayerId:"",wallet:account,time:Date.now(),jobId:fn==="open_job"?"":args[0],url:fn==="submit_url"?args[1]:"",...baseline};
  sessionStorage.setItem("spotter.pending",JSON.stringify(pending));
  displayHash(hash,fn);
  const receipt=await waitOnChain(pending);
  if(receipt)sessionStorage.removeItem("spotter.pending");
  return {hash,receipt,pending:!receipt};
}
async function afterWrite(fn, id) {
  const job = await readJob(id);
  if (!job.id) {
    note(fn + " finalized, but accepted job state is not readable yet. Use Read later.");
    return;
  }
  renderJob(job);
  if (fn === "submit_url" && job.status === "SUBMITTED") setStage(2);
  if (fn === "judge") setStage(job.status === "SUBMITTED" ? 2 : 3);
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
  $("lookupId").value = "1";
  try { await readProofById("1"); }
  catch (err) { note(errorText(err), true); }
};
$("readBtn").onclick = async () => {
  try { await readProofById($("lookupId").value); }
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
  note("Job #" + id + " verified and ready for evidence.");
  setStage(1);
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
    if (id) { $("jid").value = id; setStage(1); note("Recovered accepted job #" + id + "."); }
    else note("Could not safely recover the Job ID. Inspect Studio before taking another action.", "pending");
  } else if (parseJobId(pending.jobId)) {
    $("jid").value = pending.jobId;
    await afterWrite(pending.fn, pending.jobId);
  } else {
    note("Transaction accepted. Enter the original Job ID and press Read to verify chain state.");
  }
});
$("clearPendingBtn").onclick = () => {
  const stored = sessionStorage.getItem("spotter.pending");
  if (!stored) { note("No locally tracked transaction to clear."); return; }
  const approved = window.confirm(
    "Only clear local tracking after inspecting the wallet transaction and the job's on-chain state. " +
    "This does not cancel an existing transaction. An unresolved write might already have succeeded. Continue?"
  );
  if (!approved) return;
  sessionStorage.removeItem("spotter.pending");
  flowStage = 0;
  setStage(0);
  note("Local tracking cleared. This DID NOT cancel any blockchain transaction. Check the previous transaction before signing again.", "pending");
};
try {
  const stored = JSON.parse(sessionStorage.getItem("spotter.pending") || "null");
  if (stored?.hash && transactionHash(stored.hash)) {
    displayHash(stored.genlayerId || stored.hash, stored.fn || "transaction", stored.genlayerId ? "genlayer" : "evm");
    note("An earlier transaction is unresolved. Open Transaction details to resume or inspect it before any new write.", "pending");
  }
} catch { /* ignore invalid browser storage */ }
syncWallet(null);
