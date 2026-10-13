import { createClient } from "https://esm.sh/genlayer-js@0.18.10?bundle";
import { studionet } from "https://esm.sh/genlayer-js@0.18.10/chains?bundle";
import { transactionHash, parseWork, workActionAllowed, createdWorkId, finalizedReceipt } from "./proofgate-core.mjs";
const ADDRESS = "0xD57aE10754C44223ABf3bA04a43AC2023d92aBE7";
const ENDPOINT = "https://studio.genlayer.com/api";
const CHAIN = 61999;
const ZERO = "0x0000000000000000000000000000000000000000";
const $ = id => document.getElementById(id);
const client = createClient({chain:studionet,endpoint:ENDPOINT,account:ZERO});
const KEY = "spotter.work.pending";
const HISTORY_KEY = "spotter.work.history.v1";
const history = () => {try{const x=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");return Array.isArray(x)?x:[];}catch{return [];}};
function remember(entry){const records=history();const i=records.findIndex(x=>x.hash===entry.hash);if(i>=0)records[i]={...records[i],...entry};else records.unshift(entry);localStorage.setItem(HISTORY_KEY,JSON.stringify(records.slice(0,100)));renderHistory();}
function renderHistory(){const root=$("workHistory");if(!root)return;root.replaceChildren();const rows=history();if(!rows.length){root.textContent="No transactions recorded in this browser.";return;}for(const p of rows){const item=document.createElement("div");item.style.cssText="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;border-bottom:1px solid #284448;padding:10px 0";const label=document.createElement("span");label.textContent=p.method+" · "+(p.status||"PENDING")+(p.workId?" · Work #"+p.workId:"")+" · "+new Date(p.created||Date.now()).toLocaleString();const link=document.createElement("a");link.href="https://explorer-studio.genlayer.com/tx/"+encodeURIComponent(p.hash);link.target="_blank";link.rel="noopener noreferrer";link.textContent=p.hash.slice(0,12)+"… ↗";item.append(label,link);root.append(item);}}

let lastWork = null;
let busy = false;
function syncButtons() {
  const blocked = busy || Boolean(pending());
  for (const button of document.querySelectorAll("[data-work-method]")) {
    const method = button.dataset.workMethod;
    button.disabled = blocked || (method !== "create_work" && (!lastWork || lastWork.id !== $("workId").value.trim() || !workActionAllowed(method,lastWork.state)));
  }
  $("workRead").disabled = busy;
}

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
    $("workCheck").hidden = false;
    $("workTxLink").hidden = false;
    $("workTxLink").href = "https://explorer-studio.genlayer.com/tx/" + encodeURIComponent(p.hash);
  } else {
    $("workClear").hidden = true;
    $("workCheck").hidden = true;
    $("workTxLink").hidden = true;
  }
  syncButtons();
}
function render(work) {
  lastWork = work;
  $("workOutput").textContent = JSON.stringify(work,null,2);
  $("workOutput").hidden = false;
  const state = work.state || "UNKNOWN";
  note("Work #" + work.id + " is " + state + ". These are contract reads, not local sample data.");
  syncButtons();
}
async function read() {
  const id = $("workId").value.trim();
  lastWork = null;
  syncButtons();
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
  if (rubric.trim().length < 16 || rubric.length > 500 || label.length > 64) throw Error("Write specific acceptance requirements (16–500 characters); labels must be 64 characters or less.");
  return [worker,owner,repo,branch,Number(pr),label,rubric];
}
async function act(method) {
  if (busy || pending()) throw Error("Resolve the existing transaction first; duplicate submissions are disabled.");
  const callArgs = args(method);
  const account = await wallet();
  busy=true;
  syncButtons();
  note("Waiting for MetaMask approval. No transaction has been confirmed yet.");
  try {
    const writer=createClient({chain:studionet,endpoint:ENDPOINT,account,provider:window.ethereum});
    const result=await writer.writeContract({address:ADDRESS,functionName:method,args:callArgs,value:0n});
    const hash=transactionHash(result);
    if (!hash) throw Error("Wallet response did not contain a recognized transaction hash; inspect wallet history before retrying.");
    const entry={hash,method,account,created:Date.now(),status:"PENDING",workId:method==="create_work"?"":callArgs[0],owner:method==="create_work"?callArgs[1]:"",repository:method==="create_work"?callArgs[2]:"",pr:method==="create_work"?String(callArgs[4]):""};
    sessionStorage.setItem(KEY,JSON.stringify(entry));remember(entry);
    refreshPending();
    note("Transaction sent. Open the Explorer link below and wait until FINALIZED. Then read the current Work state. Never send an unresolved transaction twice.");
  } finally {busy=false;refreshPending();syncButtons();}
}
$("workRead").addEventListener("click",async()=>{try {await read();}catch(e){note(e.message,true);}});
$("workExample").addEventListener("click",async()=>{ $("workId").value="1";lastWork=null;syncButtons();try {await read();}catch(e){note(e.message,true);} });
for(const button of document.querySelectorAll("[data-work-method]")) {
  button.addEventListener("click",async()=>{try {await act(button.dataset.workMethod);}catch(e){note(e.message,true);}});
}
$("workId").addEventListener("input",()=>{lastWork=null;syncButtons();});
$("workImport").addEventListener("click",()=>{
  const hash=$("workImportHash").value.trim();
  if(!/^0x[0-9a-fA-F]{64}$/.test(hash)){note("Enter a complete 0x transaction hash (64 hexadecimal characters).",true);return;}
  const existing=history().find(x=>x.hash.toLowerCase()===hash.toLowerCase());
  if(existing){note("This transaction is already in local history. Open its Explorer link.");return;}
  remember({hash,method:"recovered transaction",created:Date.now(),status:"UNVERIFIED"});
  $("workImportHash").value="";
  if(!pending()){
    sessionStorage.setItem(KEY,JSON.stringify({hash,method:"recovered transaction",created:Date.now()}));
    refreshPending();
    void checkTransaction();
  }
  note("Transaction added to local history without signing. Its real status must be confirmed from Explorer/GenLayer; no Work ID was assumed.");
});
let checkInProgress=false;
async function checkTransaction(){
 const p=pending();
 if(!p||checkInProgress)return;
 checkInProgress=true;$("workCheck").disabled=true;
 try{
  const receipt=await client.waitForTransactionReceipt({hash:p.hash,status:"ACCEPTED",interval:2500,retries:2});
  const status=finalizedReceipt(receipt);
  if(status==="FAILED"){remember({...p,status:"FAILED"});note("Transaction failed. Inspect Explorer before considering another attempt.",true);return;}
  if(status!=="FINALIZED"){note("Transaction still awaiting FINALIZED. Tracking continues without another signature.");return;}
  if(p.method==="create_work"){
    const id=createdWorkId(receipt);
    if(!id){note("Transaction finalized, but Work ID could not be safely decoded. Inspect the transaction output in Studio; do not create again.",true);remember({...p,status:"FINALIZED · ID UNKNOWN"});return;}
    const raw=await client.readContract({address:ADDRESS,functionName:"get_work",args:[id],transactionHashVariant:"latest-final"});
    const work=parseWork(raw);
    if(!work || work.id!==id || work.client?.toLowerCase()!==p.account.toLowerCase() || work.owner?.toLowerCase()!==p.owner.toLowerCase() || work.repository?.toLowerCase()!==p.repository.toLowerCase() || String(work.pr_number)!==String(p.pr)){
      remember({...p,status:"FINALIZED · VERIFY ID"});
      note("Finalized receipt found, but the returned Work ID is not yet independently verified. Inspect Studio; never guess IDs.",true);return;
    }
    $("workId").value=id;remember({...p,status:"FINALIZED",workId:id});sessionStorage.removeItem(KEY);refreshPending();render(work);note("Work #"+id+" created and verified on-chain. You can now switch to the nominated worker wallet.");return;
  }
  remember({...p,status:"FINALIZED"});
  sessionStorage.removeItem(KEY);refreshPending();
  note("Transaction FINALIZED. Read Work #"+p.workId+" to see the new contract state.");
  if(p.workId){$("workId").value=p.workId;try{await read();}catch{}}
 }catch(e){note("Still checking transaction. No wallet signature or retry sent. "+String(e?.message||"").slice(0,120));}
 finally{checkInProgress=false;$("workCheck").disabled=false;}
}
$("workCheck").addEventListener("click",checkTransaction);
const previousPending=pending();
if(previousPending?.hash && !history().some(x=>x.hash===previousPending.hash))remember({...previousPending,status:"PENDING",created:previousPending.created||previousPending.time||Date.now()});
renderHistory();
setInterval(()=>{if(pending() && document.visibilityState==="visible")void checkTransaction();},15000);
if(pending())void checkTransaction();
$("workClear").addEventListener("click",()=>{
  if (!pending()) return;
  if (!window.confirm("Only clear tracking after Explorer confirms FINALIZED or failed. Clearing does NOT cancel a transaction. Continue?")) return;
  sessionStorage.removeItem(KEY);refreshPending();
  note("Local tracking cleared. Read finalized Work state before another write.");
});
refreshPending();

let rubricEdited = false;
let suggestionVersion = 0;
const criteriaBase = () => {
  const owner=$("workOwner").value.trim(), repo=$("workRepo").value.trim(), branch=$("workBranch").value.trim(), pr=$("workPr").value.trim();
  const label=$("workLabel").value.trim();
  if(!/^[A-Za-z0-9-]{1,39}$/.test(owner)|| !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)|| !branch || !/^[1-9][0-9]*$/.test(pr)) return "";
  return "PR #"+pr+" in "+owner+"/"+repo+" must be merged into "+branch+". The PR title and description must clearly explain the agreed work and demonstrate its completion."+(label?" Required label: "+label+".":"");
};
function generateRubric() {
  const result=criteriaBase();
  if (!rubricEdited) $("workRubric").value=result;
  $("workGenerateRubric").hidden = !rubricEdited;
  $("workRubricHelp").textContent=result ? (rubricEdited?"You edited the criteria. Regenerate only if you want to replace your text.":"Suggested criteria ready. You can edit before signing.") : "Enter GitHub owner, repository, target branch and PR number to prepare criteria.";
}
$("workRubric").addEventListener("input",()=>{rubricEdited=true;generateRubric();});
$("workGenerateRubric").addEventListener("click",()=>{rubricEdited=false;generateRubric();});
for(const id of ["workOwner","workRepo","workBranch","workPr","workLabel"]) {
  $(id).addEventListener("input",()=>{suggestionVersion++;generateRubric();});
}
$("workFetchPr").addEventListener("click",async()=>{
 const owner=$("workOwner").value.trim(),repo=$("workRepo").value.trim(),pr=$("workPr").value.trim(),branch=$("workBranch").value.trim();
 if(!criteriaBase()) { $("workRubricHelp").textContent="Enter the GitHub repository, target branch and PR number first.";return; }
 const revision=++suggestionVersion, button=$("workFetchPr");button.disabled=true;
 $("workRubricHelp").textContent="Reading public GitHub PR details…";
 try{
   const response=await fetch("https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repo)+"/pulls/"+encodeURIComponent(pr),{headers:{"Accept":"application/vnd.github+json"}});
   if(!response.ok)throw Error("GitHub could not return this PR ("+response.status+").");
   const data=await response.json();
   if(revision!==suggestionVersion)return;
   if(String(data.number)!==pr || data.base?.ref!==branch || String(data.base?.repo?.full_name||"").toLowerCase()!==(owner+"/"+repo).toLowerCase()) throw Error("PR details do not match the selected repository or target branch.");
   const title=String(data.title||"").replace(/\s+/g," ").trim().slice(0,130);
   const description=String(data.body||"").replace(/[#*_\x60>]/g," ").replace(/\s+/g," ").trim().slice(0,170);
   const prefix=criteriaBase();
   const suggested=(prefix+" Work described by PR: "+title+"."+(description?" Description: "+description+".":"")).slice(0,500);
   if(rubricEdited && !window.confirm("Replace your edited acceptance criteria with a suggestion based on public PR text?"))return;
   rubricEdited=false;generateRubric();
   $("workRubric").value=suggested;
   $("workRubricHelp").textContent="Suggested using public PR text. Review carefully: the PR description is not independently verified.";
 }catch(e){if(revision===suggestionVersion)$("workRubricHelp").textContent=e.message+" You can use the automatically prepared criteria instead.";}
 finally {button.disabled=false;}
});
$("workPickWallet").addEventListener("click",async()=>{
  try {
    if(!window.ethereum?.request) throw Error("Install or unlock MetaMask first.");
    const accounts=await window.ethereum.request({method:"eth_requestAccounts"});
    if(!/^0x[a-fA-F0-9]{40}$/.test(accounts?.[0]||"")) throw Error("No valid MetaMask account selected.");
    $("workWorker").value=accounts[0];
    note("Worker address selected. You can change it before signing.");
  } catch(e){note(e.message,true);}
});
generateRubric();
