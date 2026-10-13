import { createClient } from "https://esm.sh/genlayer-js@0.18.10?bundle";
import { studionet } from "https://esm.sh/genlayer-js@0.18.10/chains?bundle";
import { transactionHash } from "./spotter-core.mjs";
import { parseWork, workActionAllowed } from "./proofgate-core.mjs";
const ADDRESS = "0xD57aE10754C44223ABf3bA04a43AC2023d92aBE7";
const ENDPOINT = "https://studio.genlayer.com/api";
const CHAIN = 61999;
const ZERO = "0x0000000000000000000000000000000000000000";
const $ = id => document.getElementById(id);
const client = createClient({chain:studionet,endpoint:ENDPOINT,account:ZERO});
const KEY = "spotter.work.pending";
let lastWork = null;
let busy = false;
function note(message, error = false) {
  const el = $("workStatus");
  el.textContent = message;
  el.className = "notice" + (error ? " error" : "");
}
function pending() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { return null; }
}
function refreshPending() {
  const p = pending();
  $("workPending").hidden = !p;
  if (p) {
    $("workPending").textContent = "Transaction awaiting confirmation: " + p.method + " / " + p.hash + ". Check wallet and Explorer; only clear after FINALIZED or confirmed failure.";
    $("workClear").hidden = false;
  } else {
    $("workClear").hidden = true;
  }
}
function render(work) {
  lastWork = work;
  $("workOutput").textContent = JSON.stringify(work,null,2);
  $("workOutput").hidden = false;
  const state = work.state || "UNKNOWN";
  note("Work #" + work.id + " is " + state + ". These are contract reads, not local sample data.");
  for (const button of document.querySelectorAll("[data-work-method]")) {
    const method = button.dataset.workMethod;
    button.disabled = (method !== "create_work" && !workActionAllowed(method,state)) || Boolean(pending()) || busy;
  }
}
async function read() {
  const id = $("workId").value.trim();
  if (!/^[1-9][0-9]*$/.test(id)) throw Error("Enter an existing positive numeric Work ID.");
  const raw = await client.readContract({address:ADDRESS,functionName:"get_work",args:[id],transactionHashVariant:"latest-final"});
  const work = parseWork(raw);
  if (!work || work.id !== id) throw Error("Finalized work record not found or response invalid.");
  render(work);
}
async function wallet() {
  if (!window.ethereum?.request) throw Error("MetaMask is required for contract writes.");
  const chain = await window.ethereum.request({method:"eth_chainId"});
  if (Number.parseInt(String(chain),16) !== CHAIN) throw Error("Select GenLayer Studionet (61999) in MetaMask before signing.");
  const accounts = await window.ethereum.request({method:"eth_requestAccounts"});
  if (!Array.isArray(accounts) || !/^0x[a-fA-F0-9]{40}$/.test(accounts[0] || "")) throw Error("Valid wallet not connected.");
  return accounts[0];
}
function args(method) {
  if (method !== "create_work") {
    const id = $("workId").value.trim();
    if (!/^[1-9][0-9]*$/.test(id)) throw Error("Enter a valid Work ID.");
    if (!lastWork || String(lastWork.id) !== id || !workActionAllowed(method,lastWork.state)) throw Error("Read the latest finalized Work state first.");
    return [id];
  }
  const worker = $("workWorker").value.trim(), owner=$("workOwner").value.trim(), repo=$("workRepo").value.trim();
  const branch=$("workBranch").value.trim(), pr=$("workPr").value.trim(), label=$("workLabel").value.trim(), rubric=$("workRubric").value.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(worker)) throw Error("Worker must be an Ethereum wallet address.");
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(owner) || !/^[a-zA-Z0-9_.-]{1,100}$/.test(repo)) throw Error("Enter a valid GitHub owner/repository.");
  if (!branch || branch.length > 100 || !/^[1-9][0-9]*$/.test(pr) || Number(pr)>4294967295) throw Error("Enter a target branch and 32-bit PR number.");
  if (!rubric || rubric.length>2000 || label.length>100) throw Error("Enter a specific acceptance rubric (max 2000 characters).");
  return [worker,owner,repo,branch,Number(pr),label,rubric];
}
async function act(method) {
  if (busy || pending()) throw Error("Resolve the existing transaction first; duplicate submissions are disabled.");
  const callArgs = args(method);
  const account = await wallet();
  busy=true;
  for (const button of document.querySelectorAll("[data-work-method]")) button.disabled=true;
  note("Waiting for MetaMask approval. No transaction has been confirmed yet.");
  try {
    const writer=createClient({chain:studionet,endpoint:ENDPOINT,account,provider:window.ethereum});
    const result=await writer.writeContract({address:ADDRESS,functionName:method,args:callArgs,value:0n});
    const hash=transactionHash(result);
    if (!hash) throw Error("Wallet response did not contain a recognized transaction hash; inspect wallet history before retrying.");
    sessionStorage.setItem(KEY,JSON.stringify({hash,method,account,created:Date.now()}));
    refreshPending();
    note("Transaction submitted: "+hash+". Wait for FINALIZED in Studio/Explorer, then read the Work again. Do not send twice.");
  } finally {busy=false;refreshPending();}
}
$("workRead").addEventListener("click",async()=>{try {await read();}catch(e){note(e.message,true);}});
for(const button of document.querySelectorAll("[data-work-method]")) {
  button.addEventListener("click",async()=>{try {await act(button.dataset.workMethod);}catch(e){note(e.message,true);}});
}
$("workClear").addEventListener("click",()=>{
  if (!pending()) return;
  if (!window.confirm("Only clear tracking after Explorer confirms FINALIZED or failed. Clearing does NOT cancel a transaction. Continue?")) return;
  sessionStorage.removeItem(KEY);refreshPending();
  note("Local tracking cleared. Read finalized Work state before another write.");
});
refreshPending();
