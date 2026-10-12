import { createClient } from "https://esm.sh/genlayer-js@0.18.10?bundle";
import { studionet } from "https://esm.sh/genlayer-js@0.18.10/chains?bundle";
import { createJobsBrowser } from "./jobs-browser.mjs?v=spotter-activity-20261012";
import {
  parseJobId, transactionHash, jobIdFromReceipt, receiptError,
  parseJobResult, publicUrl, settledStatus, genLayerTxIdFromEthereumReceipt, independentlyVerifiedAction, classifyStudioTransaction, studioHashInspection, exactJobIdFromStudioTransaction,
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
let jobsBrowser = null;
let recoveredJobCandidate = null; // Only set by an accepted exact-hash return and matching finalized Job read.

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
  $("pendingRecoveryActions").classList.toggle("hidden", !sessionStorage.getItem("spotter.pending"));
  $("checkCompletedBtn").disabled = busy;
  $("openBtn").disabled = blocked || !account || stage !== 0;
  $("subBtn").disabled = blocked || !account || stage !== 1;
  $("judgeBtn").disabled = blocked || !account || stage !== 2;
  // Only the NEXT valid write is bright. Other steps stay clearly locked.
  const activeId = !blocked && account ? ["openBtn", "subBtn", "judgeBtn"][stage] : null;
  const labels = {
    openBtn: "1 · Create job ↗",
    subBtn: "2 · Submit evidence ↗",
    judgeBtn: "3 · Run verification ↗",
  };
  for (const id of writeButtons) {
    const element = $(id);
    element.dataset.current = String(id === activeId);
    element.setAttribute("aria-busy", String(busy));
    const step = writeButtons.indexOf(id);
    if (busy) element.textContent = "Checking transaction…";
    else element.textContent = labels[id];
    element.title = blocked
      ? "A transaction is still being verified. Do not submit again."
      : !account ? "Connect a Studionet wallet to sign blockchain writes."
      : step > stage ? "Complete the previous step first."
      : step < stage ? "This step is already completed for the selected Job."
      : "Next available action. MetaMask approval is required.";
  }
  const instructions = {
    0: account ? "Review your claim and rubric, then press the highlighted Create job button. Already created a Job? Open Activity & history instead." :
      "Connect a Studionet wallet first. You can read public proofs without connecting.",
    1: "Job selected. Review the evidence URL, then press the highlighted Submit evidence button.",
    2: "Source submitted. Press the highlighted Run verification button to request the on-chain verdict.",
    3: "Verification complete. Read the on-chain proof, or reset the form for a new claim.",
  };
  $("actionGuide").textContent = busy ? "Checking the current transaction. No automatic resend." :
    sessionStorage.getItem("spotter.pending") ? "Transaction tracked. Use read-only Resume below; do NOT resend." :
    instructions[stage] || instructions[0];
  const descriptions = {
    0: "Connect a Studionet wallet and create a new job. All wallet writes require your approval.",
    1: "Job created. Review the evidence URL, then submit it to the contract.",
    2: "Evidence submitted. Run GenLayer verification to request an on-chain verdict.",
    3: "Verification record is available. Read the proof or create a new job.",
  };
  const pending = Boolean(sessionStorage.getItem("spotter.pending"));
  $("nextStepDescription").textContent = pending
    ? "A transaction is still being tracked. Open Transaction details → Resume previous transaction. Never submit it again."
    : busy
      ? "Checking your current action. Wait for confirmation before continuing."
      : stage === 0 && account
        ? "Wallet connected to Studionet. Review your question, decision rule and URL, then select 1 · Create job."
        : descriptions[stage] || descriptions[0];
  setStep(stage === 0 ? (account ? 2 : 1) : stage + 2);
  updateRecoveredControls();
  jobsBrowser?.render();
}
function updateRecoveredControls() {
  const surface = $("recoveredJobActions");
  const button = $("continueRecoveredBtn");
  if (!surface || !button) return;
  const candidate = recoveredJobCandidate;
  surface.classList.toggle("hidden", !candidate);
  if (!candidate) { button.disabled = true; return; }
  const usable = candidate.status === "OPEN" || candidate.status === "SUBMITTED";
  const blocked = busy || Boolean(sessionStorage.getItem("spotter.pending"));
  button.disabled = blocked || !account || !usable;
  button.textContent = "Continue with Job #" + candidate.id + " ↗";
  $("recoveredJobHint").textContent = blocked
    ? "A previous transaction is still pending. Resolve it before continuing with this Job."
    : !account ? "Connect a Studionet wallet to submit a source or run verification."
    : !usable ? "This Job is finalized. Read its proof instead."
    : "Job #" + candidate.id + " is available. Continue only after confirming its on-chain state.";
}
function syncWallet(address) {
  const wasAccount = account;
  const changed = account && address && account.toLowerCase() !== address.toLowerCase();
  account = address || null;
  $("who").textContent = account ? account.slice(0, 6) + "…" + account.slice(-4) : "Read-only";
  $("who").title = account || "No wallet connected";
  $("disconnectBtn").hidden = !account;
  $("disconnectBtn").classList.toggle("hidden", !account);
  $("connectBtn").classList.toggle("hidden", Boolean(account));
  if (changed) { $("jid").value = ""; flowStage = 0; }
  setStage(flowStage);
  if (jobsBrowser) {
    const changedAccount = String(wasAccount || "").toLowerCase() !== String(account || "").toLowerCase();
    if (changedAccount) jobsBrowser.setFilter(account ? "mine" : "all");
    else jobsBrowser.render();
  }
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
    address: CONTRACT, functionName: "get_job", args: [id], transactionHashVariant: "latest-final",
  });
  return parseJobResult(raw);
}
function renderJob(job) {
  const output = $("out");
  output.replaceChildren();
  output.classList.remove("empty");
  output.classList.add("proof-result");
  const status = String(job.status || "UNKNOWN").toUpperCase();
  const final = settledStatus(status);
  const header = document.createElement("div");
  header.className = "proof-header";
  const heading = document.createElement("div");
  const eyebrow = document.createElement("div");
  eyebrow.className = "proof-eyebrow";
  eyebrow.textContent = "GENLAYER · ON-CHAIN RECORD";
  const name = document.createElement("h4");
  name.className = "proof-title";
  name.textContent = "Verification #" + String(job.id || "?");
  heading.append(eyebrow, name);
  const badge = document.createElement("span");
  badge.className = "tag " + (["HIT","MISS","DEAD","OPEN","SUBMITTED"].includes(status) ? status : "SUBMITTED");
  badge.textContent = status;
  header.append(heading, badge);
  output.append(header);
  const summary = document.createElement("p");
  summary.className = "proof-summary";
  summary.textContent = final ? (
    status === "HIT" ? "Evidence supports this claim." :
    status === "MISS" ? "Evidence does not support this claim." :
    "The source could not be reliably retrieved."
  ) : status === "OPEN" ? "Waiting for a public evidence URL." :
      "Evidence submitted. No final verdict yet.";
  output.append(summary);
  const field = (label, value, kind) => {
    if (value === undefined || value === null || value === "") return;
    const item = document.createElement("div");
    item.className = "proof-field";
    const labelNode = document.createElement("div");
    labelNode.className = "proof-field-label";
    labelNode.textContent = label;
    const valueNode = document.createElement("div");
    valueNode.className = "proof-field-value" + (kind === "hash" ? " proof-hash" : "");
    if (kind === "link") {
      const link = document.createElement("a");
      link.href = String(value);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = String(value);
      valueNode.append(link);
    } else {
      valueNode.textContent = String(value);
    }
    item.append(labelNode, valueNode);
    if (kind === "hash") {
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "btn btn-small btn-subtle proof-copy";
      copy.textContent = "Copy hash";
      copy.setAttribute("aria-label", "Copy page SHA-256 hash");
      copy.onclick = async () => {
        try {
          if (!window.navigator?.clipboard?.writeText) throw Error("Clipboard is unavailable.");
          await window.navigator.clipboard.writeText(String(value));
          copy.textContent = "Copied ✓";
        } catch {
          copy.textContent = "Select hash to copy";
        }
      };
      item.append(copy);
    }
    output.append(item);
  };
  field("Claim", job.question);
  field("Evidence URL", job.url, "link");
  if (job.justification) field("Validator explanation", job.justification);
  if (job.page_hash) field("Page SHA-256", job.page_hash, "hash");
  if (job.fail_kind) field("Evaluation note", job.fail_kind);
  const details = document.createElement("details");
  details.className = "proof-json";
  const trigger = document.createElement("summary");
  trigger.textContent = "Technical details · complete on-chain JSON";
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(job, null, 2);
  details.append(trigger, pre);
  output.append(details);
  note("Contract state: " + status + (final ? " · final verdict available" : " · not a final verdict"));
}
async function readProofById(id) {
  const validated = parseJobId(id);
  if (!validated) throw new Error("Enter a valid public Job ID to read a proof.");
  const job = await readJob(validated);
  if (!job.id) throw new Error("No accepted state found for job " + validated + " yet.");
  renderJob(job);
  return job;
}
// Continue an existing finalized Job via the public explorer, with no new open_job.
async function adoptExistingJob(rawId) {
  const id=parseJobId(rawId);
  if(!id)throw Error("Select an existing public Job.");
  if(!account||!window.ethereum?.request)throw Error("Connect a Studionet wallet to join this public Job.");
  if(sessionStorage.getItem("spotter.pending"))throw Error("A previous transaction is still unresolved. Inspect it first.");
  const chain=await window.ethereum.request({method:"eth_chainId"});
  if(String(chain).toLowerCase()!==CHAIN_ID)throw Error("Switch to Studionet 61999.");
  const raw=await diagnosticRead("Selected finalized Job",()=>readClient.readContract({
    address:CONTRACT,functionName:"get_job",args:[id],transactionHashVariant:"latest-final",
  }),9000);
  const job=parseJobResult(raw);
  if(parseJobId(job.id)!==id)throw Error("Job ID mismatch. No transaction was sent.");
  if(job.status!=="OPEN"&&job.status!=="SUBMITTED")
    throw Error("The Job is already finalized; only read-only proof lookup is permitted.");
  $("jid").value=id; $("lookupId").value=id;
  $("q").value=String(job.question||"");
  $("r").value=String(job.rubric||"");
  if(job.url) $("url").value=String(job.url);
  setStage(job.status==="OPEN"?1:2);
  renderJob(job);
  note("Selected Job #"+id+". "+
    (job.status==="OPEN"?"Submit one public URL as its first hunter with your own wallet approval.":
      "Evidence already submitted. You may request a verification with wallet approval.")+
    " No transaction was sent by selecting this Job.");
  $("workspace").scrollIntoView?.({behavior:"smooth",block:"start"});
}
jobsBrowser=createJobsBrowser({
  document,
  getAccount:()=>account,
  isWriteBlocked:()=>busy||Boolean(sessionStorage.getItem("spotter.pending")),
  readJob:async id=>parseJobResult(await readClient.readContract({
    address:CONTRACT,functionName:"get_job",args:[id],transactionHashVariant:"latest-final",
  })),
  readProof:async id=>{
    try{await readProofById(id);$("proofs").scrollIntoView?.({behavior:"smooth",block:"start"});}
    catch(e){note(errorText(e),true);}
  },
  continueJob:id=>guarded(()=>adoptExistingJob(id)),
  notify:note,
});

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
    code.textContent = hash;
    code.style.overflowWrap = "anywhere";
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
// The deployed Python contract stores last_job under str(gl.message.sender_address).
// That string may use EIP-55 casing, while MetaMask may return a lowercase account.
// Its TreeMap[str, str] lookup is case sensitive; use the exact poster string read from chain.
const storedPosterCase = new Map();
async function latestJobId(owner) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(owner))) throw Error("Invalid wallet for latest-job lookup.");
  const key=owner.toLowerCase();
  const lookup=async (who) => parseJobId(await readClient.readContract({
    address:CONTRACT,functionName:"last_job_of",args:[who],transactionHashVariant:"latest-final",
  }));
  const remembered=storedPosterCase.get(key);
  if (remembered) {
    const id=await lookup(remembered);
    if (id) return id;
  }
  const direct=await lookup(owner);
  if (direct) return direct;

  // Read a limited number of finalized, sequential existing IDs to recover the
  // actual string stored by the contract. Read-only; no guesses or new writes.
  for (let n=1;n<=16;n++) {
    const raw=await readClient.readContract({
      address:CONTRACT,functionName:"get_job",args:[String(n)],transactionHashVariant:"latest-final",
    });
    const job=parseJobResult(raw);
    if (!parseJobId(job.id)) break;
    if (typeof job.poster!=="string" || job.poster.toLowerCase()!==key) continue;
    if (!/^0x[0-9a-fA-F]{40}$/.test(job.poster)) continue;
    storedPosterCase.set(key,job.poster);
    const id=await lookup(job.poster);
    if (id) return id;
    // If even the exact stored poster key fails, don't infer a latest ID.
    return "";
  }
  return "";
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
// Prefer a strict final-state match for a known existing Job. The Studio
// envelope is not always shaped like an EVM transfer; rejecting its recipient
// must not strand a successful submit_url transaction on this browser tab.
async function reconcileTrackedExistingJob(p) {
  if (!p || !["open_job", "submit_url", "judge"].includes(p.fn)) return false;
  if (!transactionHash(p.hash)) return false;
  if (p.fn !== "open_job" && !parseJobId(p.jobId)) return false;
  if (!account || String(p.wallet || "").toLowerCase() !== account.toLowerCase()) return false;
  let job;
  let actualId = parseJobId(p.jobId);
  try {
    if (p.fn === "open_job") {
      // Prefer the exact transaction's GenVM return to establish attribution.
      let tx = null;
      try {
        tx = await diagnosticRead("Original GenLayer transaction", () =>
          readClient.getTransaction({hash:p.hash}), 8000);
      } catch { /* Final state below is a conservative fallback. */ }
      const outcome = studioHashInspection(tx,p.hash,CONTRACT);
      if (outcome.outcome === "failed" || outcome.outcome === "invalid") return false;
      if (outcome.outcome === "confirmed") actualId = exactJobIdFromStudioTransaction(tx);
      if (!actualId) {
        // Only select a strictly newer Job matching the pre-write baseline.
        // Never take an arbitrary history card or infer success from an EVM receipt.
        actualId = await diagnosticRead("Latest finalized wallet Job",() =>
          latestJobId(p.wallet),9000);
      }
      if (!actualId) return false;
    }
    job = await diagnosticRead("Finalized Job #" + actualId, () => readJob(actualId), 9000);
  } catch { return false; }
  if (!independentlyVerifiedAction(p, job, account)) return false;
  // The original action is already reflected in an accepted on-chain record.
  // Clearing only the matching saved transaction is not a blockchain write.
  const stored = sessionStorage.getItem("spotter.pending");
  if (!stored) return false;
  let current;
  try { current = JSON.parse(stored); } catch { return false; }
  if (current.hash !== p.hash || current.fn !== p.fn || current.jobId !== p.jobId) return false;
  sessionStorage.removeItem("spotter.pending");
  $("jid").value = actualId;
  $("lookupId").value = actualId;
  $("q").value = String(job.question || "");
  $("r").value = String(job.rubric || "");
  // open_job has no on-chain URL yet: preserve the user's existing draft.
  // Clearing it here strands the restored Job at Submit with an invalid input.
  const source = String(job.url || p.url || "").trim();
  if (source) $("url").value = source;
  const next = job.status === "OPEN" ? 1 : job.status === "SUBMITTED" ? 2 : 3;
  setStage(next);
  renderJob(job);
  note("Job #" + actualId + " confirmed on GenLayer (" + job.status + "). " +
    (next === 1 ? "Next step: Submit evidence." :
     next === 2 ? "Next step: Run verification." :
     next === 3 ? "Read the final proof." : "Review the active Job.") +
    " No additional transaction was sent.");
  return true;
}
async function waitOnChain(p) {
  if(!window.ethereum?.request)throw Error("Connect a wallet provider to inspect the pending transaction.");
  const chainId=await window.ethereum.request({method:"eth_chainId"});
  if(String(chainId).toLowerCase()!==CHAIN_ID)throw Error("Switch to Studionet 61999.");
  if (p.fn !== "open_job" && await reconcileTrackedExistingJob(p)) return { statusName: "FINALIZED", returnValue: p.jobId, observedContractState: true, alreadyReconciled: true };
  let genId=p.genlayerId;
  // On GenLayer Studio, the hash returned to the wallet can ALREADY be
  // the canonical GenLayer transaction hash. Always read that exact ID first.
  // This is read-only and avoids false negatives from EVM receipt event parsing.
  if (!genId && typeof readClient.getTransaction === "function") {
    let direct = null;
    try {
      direct = await diagnosticRead("GenLayer transaction", () =>
        readClient.getTransaction({ hash: p.hash }), 7500);
    } catch { /* Direct RPC unavailable; only then fall back to EVM event receipt. */ }
    const inspection = studioHashInspection(direct, p.hash, CONTRACT);
    if (inspection.outcome === "confirmed") {
      if (p.fn === "open_job") {
        const exactId = exactJobIdFromStudioTransaction(direct);
        if (exactId) {
          try {
            const raw = await readClient.readContract({
              address: CONTRACT, functionName: "get_job", args: [exactId],
              transactionHashVariant: "latest-final",
            });
            if (independentlyVerifiedAction(p, parseJobResult(raw), p.wallet)) {
              note("GenLayer finalized open_job with verified on-chain Job #" + exactId + ".");
              return { statusName: inspection.status, returnValue: exactId, source: "studio-exact-return" };
            }
          } catch { /* Remain pending if final chain state hasn't caught up. */ }
        }
        note("Studio has accepted this open_job, but its Job return cannot yet be safely paired with your original question. Recover it through Browse jobs or wait; never create another Job to compensate.", "pending");
        return null;
      }
      const verified = await verifyFinalState(p, 2);
      if (verified) return verified;
      note("GenLayer confirms the transaction, but the finalized Job state is not yet matched. Refresh the public jobs or Resume later. Do not resend.", "pending");
      return null;
    }
    if (["failed", "invalid", "pending"].includes(inspection.outcome)) {
      note("GenLayer lookup: " + (inspection.reason || inspection.status || inspection.outcome) +
        " / " + inspection.execution + ". No automatic resubmission.", "pending");
      return null;
    }
  }
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
  if(receipt && !receipt.alreadyReconciled)sessionStorage.removeItem("spotter.pending");
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
  void jobsBrowser.refresh();
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
$("newHunt").onclick = () => {
  if (flowStage !== 0 && !window.confirm("Clear this form? The existing on-chain Job is not deleted.")) return;
  $("q").value = ""; $("r").value = ""; $("url").value = "";
  $("jid").value = ""; setStage(0);
  note("Draft reset. Existing on-chain Jobs remain available above. No transaction was sent.");
};
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
  void jobsBrowser.refresh();
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
$("checkCompletedBtn").onclick = async () => {
  const btn = $("checkCompletedBtn");
  if (busy) return;
  btn.textContent = "Checking finalized Job…";
  btn.disabled = true;
  const raw = sessionStorage.getItem("spotter.pending");
  if (!raw) { note("No transaction needs recovery. Open Activity & history to continue an existing Job."); setStage(flowStage); return; }
  let pending;
  try { pending = JSON.parse(raw); }
  catch { note("Saved transaction details are invalid. Use transaction diagnostics; no transaction was sent.", true); btn.disabled=false; btn.textContent="Check now (only if delayed) ↻"; return; }
  try {
    const chain = await diagnosticRead("Wallet network", () =>
      window.ethereum.request({method:"eth_chainId"}), 7000);
    if (String(chain).toLowerCase() !== CHAIN_ID) throw Error("Switch to Studionet 61999 first.");
    if (await reconcileTrackedExistingJob(pending)) return;
    note("Could not yet match the saved transaction to a finalized on-chain Job. The original transaction is still protected. Open Transaction details for diagnostics.", "pending");
  } catch (err) { note(errorText(err), true); }
  finally { btn.textContent = "Check now (only if delayed) ↻"; setStage(flowStage); }
};
$("resumeBtn").onclick = () => guarded(async () => {
  const stored = sessionStorage.getItem("spotter.pending");
  if (!stored) { note("No pending transaction in this tab. Paste the original Studio transaction hash in Recover transaction by hash below."); return; }
  const pending = JSON.parse(stored);
  if (!transactionHash(pending.hash)) throw new Error("Invalid saved wallet transaction hash.");
  displayHash(pending.genlayerId || pending.hash, pending.fn, pending.genlayerId ? "genlayer" : "evm");
  const receipt = await waitOnChain(pending);
  if (!receipt) return;
  if (receipt.alreadyReconciled) return;
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
// This recovery never reads/writes sessionStorage and works in any tab, without MetaMask.
$("recoverHashBtn").onclick = async () => {
  const result = $("recoveryResult");
  result.hidden = false;
  recoveredJobCandidate = null;
  updateRecoveredControls();
  const hash = transactionHash($("recoveryHash").value.trim());
  if (!hash) {
    result.textContent = "Enter a full 0x-prefixed 64-character Studio transaction hash. No transaction was sent.";
    return;
  }
  result.textContent = "READ-ONLY HASH RECOVERY\nHash: " + hash + "\nReading GenLayer Studio transaction…";
  $("recoverHashBtn").disabled = true;
  try {
    if (typeof readClient.getTransaction !== "function") {
      result.textContent = "This SDK runtime cannot read Studio transactions directly. Use the Studio Explorer transaction link.";
      return;
    }
    const tx = await diagnosticRead("Studio transaction lookup", () =>
      readClient.getTransaction({ hash }), 9000);
    const inspection = studioHashInspection(tx, hash, CONTRACT);
    const lines = [
      "READ-ONLY HASH RECOVERY · NO WALLET SIGNATURE",
      "Transaction: " + hash,
      "Status: " + inspection.status,
      "Consensus: " + inspection.consensus,
      "GenVM execution: " + inspection.execution,
      "Interpretation: " + inspection.outcome,
    ];
    if (inspection.reason) lines.push("Warning: " + inspection.reason);
    if (inspection.outcome === "invalid") {
      lines.push("Cannot trust this RPC result for the supplied hash and contract.");
      result.textContent = lines.join("\n");
      return;
    }
    const jobId = inspection.outcome === "confirmed" ? exactJobIdFromStudioTransaction(tx) : "";
    lines.push("Explicit open_job return ID: " + (jobId || "NOT EXPOSED BY SDK"));
    if (jobId) {
      try {
        const job = await diagnosticRead("Job #" + jobId + " read", () =>
          readClient.readContract({ address: CONTRACT, functionName: "get_job", args: [jobId],
            transactionHashVariant: "latest-final" }), 9000);
        const parsed = parseJobResult(job);
        const sender = String(tx?.sender ?? tx?.from_address ?? tx?.from ?? "");
        if (parseJobId(parsed.id) !== jobId ||
          (sender && String(parsed.poster ?? "").toLowerCase() !== sender.toLowerCase())) {
          lines.push("Returned Job ID could not be verified against the on-chain record.");
        } else {
          lines.push("Found Job #" + jobId + " on-chain, status: " + String(parsed.status ?? "unknown"));
          if (!sender) lines.push("Sender metadata unavailable; exact wallet attribution is not verified.");
          $("lookupId").value = jobId;
          renderJob(parsed); // Public proof only; signed workflow remains unchanged.
          if (sender && String(parsed.poster ?? "").toLowerCase() !== sender.toLowerCase()) {
            lines.push("Transaction sender and Job poster did not match; activation is unavailable.");
          } else if (parsed.status === "OPEN" || parsed.status === "SUBMITTED") {
            recoveredJobCandidate = {
              id: jobId, hash, poster: String(parsed.poster ?? ""),
              hunter: String(parsed.hunter ?? ""), status: parsed.status,
            };
            updateRecoveredControls();
            lines.push("To continue, connect the original owner wallet and select Continue with Job #" + jobId + ".");
          }
        }
      } catch (error) {
        lines.push("Job lookup failed: " + errorText(error));
      }
    } else {
      lines.push("Use Studio Explorer → GenVM Execution → Return Value to identify the exact Job ID.");
      lines.push("Do not infer an ID from transaction ordering or send another open_job.");
    }
    lines.push("Inspection finished. This lookup did NOT sign or submit a transaction.");
    result.textContent = lines.join("\n");
  } catch (error) {
    result.textContent += "\nUnable to read this Studio transaction: " + errorText(error) +
      "\nOpen the same hash in Studio Explorer. No wallet transaction was sent.";
  } finally {
    $("recoverHashBtn").disabled = false;
  }
};

// Adopting a recovered job never sends a blockchain transaction. User must click the next write step explicitly.
$("continueRecoveredBtn").onclick = () => guarded(async () => {
  const candidate = recoveredJobCandidate;
  if (!candidate || !parseJobId(candidate.id)) throw Error("Recover an existing transaction by hash first.");
  if (!account) throw Error("Connect a Studionet wallet to continue a public Job.");
  if (sessionStorage.getItem("spotter.pending")) {
    throw Error("Resolve the previous tracked transaction before continuing.");
  }
  const chainId = await window.ethereum?.request({ method: "eth_chainId" });
  if (String(chainId).toLowerCase() !== CHAIN_ID) throw Error("Switch the wallet to Studionet 61999.");
  const raw = await diagnosticRead("Recovered Job state", () => readClient.readContract({
    address: CONTRACT, functionName: "get_job", args: [candidate.id],
    transactionHashVariant: "latest-final",
  }), 9000);
  const job = parseJobResult(raw);
  if (parseJobId(job.id) !== candidate.id) {
    throw Error("Recovered Job no longer matches its ID. No transaction was sent.");
  }
  if (job.status !== "OPEN" && job.status !== "SUBMITTED") {
    throw Error("Job is finalized; no further write is permitted.");
  }
  $("jid").value = candidate.id;
  $("q").value = String(job.question || "");
  $("r").value = String(job.rubric || "");
  recoveredJobCandidate = { ...candidate, status: job.status, hunter: String(job.hunter || "") };
  await adoptExistingJob(candidate.id);
});

$("recoveryHash").oninput = () => {
  recoveredJobCandidate = null;
  updateRecoveredControls();
};

// Read-only RPC inspection. Show progress BEFORE each async request so a slow wallet cannot hide results.
async function diagnosticRead(label, request, timeoutMs = 7500) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(request),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label + " timed out after " + timeoutMs / 1000 + "s")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

$("diagnoseBtn").onclick = async () => {
  const output = $("txDiagnostics");
  output.hidden = false;
  // This first message must be synchronous: even a stuck RPC will show useful feedback.
  output.textContent = "READ-ONLY DIAGNOSTICS · NO WALLET SIGNATURE\nStarting inspection…";
  const raw = sessionStorage.getItem("spotter.pending");
  if (!raw) {
    output.textContent = "No pending transaction is saved in this browser tab. Find its full hash in MetaMask Activity.";
    return;
  }
  let pending;
  try { pending = JSON.parse(raw); }
  catch { output.textContent = "Saved transaction metadata is invalid. Nothing was changed."; return; }
  if (!transactionHash(pending.hash)) {
    output.textContent = "Saved wallet transaction hash is invalid. Nothing was changed.";
    return;
  }
  const lines = [
    "READ-ONLY DIAGNOSTICS · NO WALLET SIGNATURE",
    "Wallet tx: " + pending.hash,
    "Action: " + String(pending.fn || "unknown"),
  ];
  const show = (message) => {
    lines.push(String(message));
    output.textContent = lines.join("\n");
  };
  show("Preparing wallet RPC read…");
  if (!window.ethereum?.request) {
    show("Wallet provider unavailable. Reopen this page with MetaMask to inspect this transaction.");
    return;
  }
  $("diagnoseBtn").disabled = true;
  try {
    show("Checking wallet network…");
    let chainId;
    try {
      chainId = await diagnosticRead("Wallet network", () =>
        window.ethereum.request({ method: "eth_chainId" }));
      show("Wallet chain ID: " + String(chainId));
    } catch (error) {
      show("Wallet network read failed: " + errorText(error));
      show("Transaction lookups skipped until wallet RPC network is known. No transaction has been resent.");
      return;
    }
    if (String(chainId).toLowerCase() !== CHAIN_ID) {
      show("WRONG NETWORK. Switch MetaMask to Studionet 61999 and inspect again.");
      return;
    }
    const expected = readClient.chain.consensusMainContract.address;
    show("Expected Studionet consensus address: " + expected);

    show("Querying GenLayer transaction by the saved hash…");
    if (typeof readClient.getTransaction === "function") {
      try {
        const direct = await diagnosticRead("GenLayer transaction lookup", () =>
          readClient.getTransaction({ hash: pending.hash }));
        const outcome = classifyStudioTransaction(direct, pending.hash, pending.wallet, CONTRACT);
        show("Direct GenLayer lookup: " + outcome.kind.toUpperCase() +
          (outcome.status ? " · " + outcome.status : "") +
          (outcome.execution ? " · " + outcome.execution : ""));
        if (outcome.reason) show("Direct lookup warning: " + outcome.reason);
        if (outcome.kind === "confirmed") {
          show("This hash is an accepted GenLayer transaction. Do not create it again.");
          if (pending.fn === "open_job") {
            const value = parseJobId(direct?.returnValue ?? direct?.return_value);
            show("Exact Job ID from direct SDK response: " + (value || "not exposed; inspect Studio GenVM Return Value"));
          }
        }
      } catch (error) {
        show("Direct GenLayer lookup unavailable: " + errorText(error));
      }
    } else {
      show("Direct GenLayer transaction lookup is unavailable in this SDK runtime.");
    }

    show("Reading wallet transaction destination…");
    let walletTx = null;
    try {
      walletTx = await diagnosticRead("Transaction lookup", () =>
        window.ethereum.request({ method: "eth_getTransactionByHash", params: [pending.hash] }));
    } catch (error) { show("Transaction lookup error: " + errorText(error)); }

    if (walletTx) {
      show("Actual transaction destination: " + String(walletTx.to || "unknown"));
      show("Transaction sender: " + String(walletTx.from || "unknown"));
      if (walletTx.to && walletTx.to.toLowerCase() !== expected.toLowerCase()) {
        show("DESTINATION MISMATCH: wallet transaction was not sent to this chain's consensus contract.");
      }
    } else {
      show("Wallet transaction details: not returned by wallet RPC.");
    }

    show("Reading mined wallet receipt…");
    let evmReceipt = null;
    try {
      evmReceipt = await diagnosticRead("Receipt lookup", () =>
        window.ethereum.request({ method: "eth_getTransactionReceipt", params: [pending.hash] }));
    } catch (error) { show("Receipt lookup error: " + errorText(error)); }

    if (evmReceipt) {
      const status = String(evmReceipt.status ?? "unknown").toLowerCase();
      show("Wallet receipt status: " + status);
      show("Event logs returned: " + (Array.isArray(evmReceipt.logs) ? evmReceipt.logs.length : "unknown"));
      show("Gas used: " + String(evmReceipt.gasUsed ?? "unknown"));
      // Preserve public RPC log evidence even when the SDK event decoder does not recognize it.
      // This never requests a signature and avoids interpreting an unrelated event as a success.
      if (Array.isArray(evmReceipt.logs)) {
        for (const [i, log] of evmReceipt.logs.slice(0, 5).entries()) {
          show("Log #" + i + " emitter: " + String(log?.address ?? log?.emitter ?? "(missing)"));
          show("Log #" + i + " topic[0]: " + String(log?.topics?.[0] ?? log?.topic0 ?? "(missing)"));
          show("Log #" + i + " indexed topic count: " + (Array.isArray(log?.topics) ? log.topics.length : "unknown"));
        }
      }
      if (status === "0x0" || status === "0") {
        show("EVM execution failed. Do not assume a GenLayer Job exists.");
      } else {
        let genId = "";
        try { genId = genLayerTxIdFromEthereumReceipt(evmReceipt, expected); }
        catch (error) { show("GenLayer event decoder: " + errorText(error)); }
        if (genId) show("Verified NewTransaction GenLayer ID: " + genId);
        else show("No matching NewTransaction event was returned. Mining alone does not prove a new Job exists.");
      }
    } else {
      show("Wallet receipt unavailable. Transaction success or failure cannot be determined from this response.");
    }

    // Independently verify that the historical contract itself is still readable on this RPC.
    // A Studio editor list can be empty even when the deployed chain state is intact.
    show("Checking historical contract Job #1 without submitting a transaction…");
    try {
      const proof = parseJobResult(await diagnosticRead("Contract read for Job #1", () =>
        readClient.readContract({
          address: CONTRACT, functionName: "get_job", args: ["1"],
          transactionHashVariant: "latest-final",
        })));
      if (proof?.id === "1") {
        show("Contract Job #1: FOUND — verdict " + String(proof.status ?? "unknown"));
        if (proof.page_hash) show("Contract Job #1 page hash: " + String(proof.page_hash));
      } else {
        show("Contract Job #1: NOT FOUND in current final state. This does not by itself prove the deployment was deleted.");
      }
    } catch (error) {
      show("Contract Job #1 read failed: " + errorText(error) + ". Network or RPC failure is also possible.");
    }
    if (pending.wallet && /^0x[0-9a-fA-F]{40}$/.test(pending.wallet)) {
      show("Checking latest FINAL contract state…");
      try {
        const last = await diagnosticRead("Finalized Job ID", () => latestJobId(pending.wallet));
        show("Latest FINAL Job ID for wallet: " + (last || "(none)"));
        if (last) {
          const rawJob = await diagnosticRead("Finalized Job state", () =>
            readClient.readContract({
              address: CONTRACT, functionName: "get_job", args: [last],
              transactionHashVariant: "latest-final",
            }));
          const job = parseJobResult(rawJob);
          const matched = independentlyVerifiedAction(pending, job, pending.wallet);
          show("Matches stored action baseline: " + (matched ? "YES" : "NO"));
          if (matched) show("Matching final contract state observed, but identical concurrent wallet writes cannot be uniquely attributed without receipts.");
        }
      } catch (error) {
        show("Finalized contract read failed: " + errorText(error));
      }
    } else {
      show("Original sender metadata unavailable, so this transaction cannot be attributed automatically.");
    }
    show("Inspection finished. Do not resend or clear an unresolved transaction without checking the original hash.");
  } catch (error) {
    show("Inspection interrupted: " + errorText(error) + ". No wallet transaction was sent.");
  } finally {
    $("diagnoseBtn").disabled = false;
  }
};

$("copyHashBtn").onclick = async () => {
  let hash = "";
  try {
    const pending = JSON.parse(sessionStorage.getItem("spotter.pending") || "null");
    hash = transactionHash(pending?.hash);
  } catch { /* no saved transaction */ }
  if (!hash) { note("No full transaction hash is saved in this browser tab."); return; }
  try {
    if (!window.navigator?.clipboard?.writeText) throw new Error("Clipboard not available");
    await window.navigator.clipboard.writeText(hash);
    note("Full transaction hash copied. This is a public identifier; no signature was requested.");
  } catch {
    $("txDiagnostics").hidden = false;
    $("txDiagnostics").textContent = "Select and copy the full wallet transaction hash:\n" + hash;
  }
};

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
// History is secondary. Load only when a visitor chooses Activity & history.
// Recover on reload without asking the user to understand transaction hashes.
async function restoreTrackedJobOnLoad() {
  const raw = sessionStorage.getItem("spotter.pending");
  if (!raw) return;
  let p;
  try { p = JSON.parse(raw); } catch { return; }
  if (!account || String(p.wallet || "").toLowerCase() !== account.toLowerCase()) return;
  if (await reconcileTrackedExistingJob(p)) return;
  setStage(flowStage); // Keep unresolved writes blocked, never silently re-send.
}
// Poll READ-ONLY finalized state while a wallet transaction is tracked.
// No wallet signatures, retries of writeContract, or automatic clearing on uncertainty.
let backgroundReconciliationBusy = false;
async function autoReconcileTrackedJob() {
  if (backgroundReconciliationBusy || busy || !account) return;
  const raw = sessionStorage.getItem("spotter.pending");
  if (!raw) return;
  let pending;
  try { pending = JSON.parse(raw); } catch { return; }
  if (String(pending.wallet || "").toLowerCase() !== account.toLowerCase()) return;
  backgroundReconciliationBusy = true;
  try { await reconcileTrackedExistingJob(pending); }
  catch { /* Testnet RPC may be intermittent. Keep tracking and retry later. */ }
  finally { backgroundReconciliationBusy = false; }
}
if (typeof setInterval === "function") {
  setInterval(() => autoReconcileTrackedJob(), 7000);
}
if (typeof document.addEventListener === "function") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void autoReconcileTrackedJob();
  });
}
$("jobs").ontoggle = () => {
  if ($("jobs").open) void jobsBrowser.scan();
};
$("openActivityBtn").onclick = async () => {
  $("jobs").open = true;
  await jobsBrowser.scan();
  $("jobs").scrollIntoView?.({ behavior: "smooth", block: "start" });
};
syncWallet(null);
if(window.ethereum?.request){
  void (async()=>{
    try {
      const authorized=await window.ethereum.request({method:"eth_accounts"});
      if(!Array.isArray(authorized)||!authorized.length)return;
      const chain=await window.ethereum.request({method:"eth_chainId"});
      if(String(chain).toLowerCase()===CHAIN_ID){ syncWallet(authorized[0]); await restoreTrackedJobOnLoad(); }
    }catch{/* Browsing existing public jobs never requires the wallet. */}
  })();
}
