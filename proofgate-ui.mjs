import { inspectPullRequest } from "./github-preflight.mjs";
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


let prReadSequence=0;
function preflightView(target,result,notice=""){
  const el=$(target);if(!el)return;
  el.replaceChildren();const title=document.createElement("strong");title.textContent=notice||(result?.ready?"GitHub checks passed":"GitHub checks need attention");el.append(title);
  if(result?.checks){const list=document.createElement("ul");for(const check of result.checks){const item=document.createElement("li");item.className=check.ok?"ok":"notready";item.textContent=(check.ok?"✓ ":"○ ")+check.text;list.append(item);}el.append(list);}
  const footer=document.createElement("p");footer.textContent="Read-only preview. The deployed GenLayer contract makes the authoritative decision.";el.append(footer);
}
async function checkPrReadiness(config,target){
  const revision=++prReadSequence;
  preflightView(target,null,"Checking GitHub PR…");
  try{
    const {owner,repository,branch,number,requiredLabel}=config;
    if(!/^[a-zA-Z0-9-]{1,39}$/.test(owner)||!/^[a-zA-Z0-9_.-]{1,100}$/.test(repository)||!/^[1-9][0-9]*$/.test(String(number)))throw Error("Enter a valid repository and PR number first.");
    const url="https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repository)+"/pulls/"+encodeURIComponent(number);
    const response=await fetch(url,{headers:{Accept:"application/vnd.github+json"},cache:"no-store"});
    if(!response.ok)throw Error("GitHub API returned "+response.status+". Try again later.");
    const result=inspectPullRequest(await response.json(),config);
    if(revision===prReadSequence)preflightView(target,result);
    return result;
  }catch(e){if(revision===prReadSequence)preflightView(target,null,String(e?.message||e));return null;}
}

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
  const summary=$("workSummary");if(summary){summary.replaceChildren();const tag=document.createElement("span");tag.className="work-state";tag.textContent=state;const heading=document.createElement("strong");heading.textContent="Work #"+work.id+" · "+work.owner+"/"+work.repository+" · PR #"+work.pr_number;const detail=document.createElement("p");detail.textContent=work.explanation || (state==="OPEN"?"Created and ready for the assigned worker.":state==="SUBMITTED"?"Submitted for GenLayer verification.":state==="CERTIFIED"?"Acceptance certificate recorded on-chain.":"Review the evidence and contract state.");summary.append(tag,heading,detail);}
  const helper=$("workNextHelp");if(helper)helper.textContent=state==="OPEN"?"Only the assigned worker can submit this work.":state==="SUBMITTED"||state==="REVIEW"?"Run GenLayer evaluation to check the locked GitHub evidence.":state==="ACCEPTED"?"The client or worker can issue the on-chain acceptance certificate.":state==="CERTIFIED"?"Completed. No further blockchain action is needed.":"Read the finalized state to see available actions.";
  note("Work #" + work.id + " is " + state + ". These are contract reads, not local sample data.");
  syncButtons();
  if(state==="SUBMITTED"||state==="REVIEW")void checkPrReadiness({owner:work.owner,repository:work.repository,branch:work.target_branch,number:work.pr_number,requiredLabel:work.required_label},"workPrPreflight");
  else preflightView("workPrPreflight",null,state==="CERTIFIED"?"Certification recorded on-chain.":state==="ACCEPTED"?"Accepted on-chain. Ready for certificate issuance.":"GitHub readiness check will appear once submitted.");
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
  const accounts = await window.ethereum.request({method:"eth_accounts"});
  const selected = connectedAccount || "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(selected) || !accounts.some(a=>a.toLowerCase()===selected.toLowerCase())) throw Error("Select and authorize the signing wallet using Connect wallet before signing.");
  return selected;
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
    note("Selected signing account: "+account.slice(0,6)+"…"+account.slice(-4)+". Confirm this exact address in MetaMask.");
    const writer=createClient({chain:studionet,endpoint:ENDPOINT,account,provider:window.ethereum});
    const result=await writer.writeContract({address:ADDRESS,functionName:method,args:callArgs,value:0n});
    const hash=transactionHash(result);
    if (!hash) throw Error("Wallet response did not contain a recognized transaction hash; inspect wallet history before retrying.");
    const entry={hash,method,account,created:Date.now(),status:"PENDING",workId:method==="create_work"?"":callArgs[0],owner:method==="create_work"?callArgs[1]:"",repository:method==="create_work"?callArgs[2]:"",pr:method==="create_work"?String(callArgs[4]):""};
    sessionStorage.setItem(KEY,JSON.stringify(entry));remember(entry);
    refreshPending();
    note("Transaction sent. Open the Explorer link below and wait until FINALIZED. Then read the current Work state. Never send an unresolved transaction twice.");
  } catch(e) {
    const message=String(e?.shortMessage||e?.message||e);
    if(/rate.limit|429|too many requests|eth_sendRawTransaction/i.test(message)) {
      note("Studionet RPC is rate limiting transaction submissions. The wallet request may have reached the network even though this page received no transaction hash. Check MetaMask Activity and re-read Work #"+(method==="create_work"?"(new)":callArgs[0])+" before considering another signature. Do NOT immediately resend.",true);
    } else if(e?.code===4001 || /user rejected|user denied/i.test(message)) {
      note("Signature rejected in MetaMask; no transaction hash was recorded.");
    } else {
      note("Transaction submission returned an error; inspect MetaMask Activity before retrying. "+message.slice(0,180),true);
    }
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
let loadingPrUrl="";
async function loadPrUrl(){
 const value=$("workPrUrl").value.trim();if(!value||value===loadingPrUrl)return;
 let url;try{url=new URL(value);}catch{return;}
 const match=url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/);
 if(url.hostname!=="github.com"||!match)return;
 loadingPrUrl=value;
 const [,owner,repository,number]=match;
 $("workOwner").value=owner;$("workRepo").value=repository;$("workPr").value=number;
 $("workRubricHelp").textContent="Loading GitHub PR #"+number+"…";
 try{
  const response=await fetch("https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repository)+"/pulls/"+number,{headers:{Accept:"application/vnd.github+json"}});
  if(!response.ok)throw Error("GitHub API returned "+response.status);
  const pr=await response.json();
  if(pr.base?.repo?.full_name?.toLowerCase()!==(owner+"/"+repository).toLowerCase())throw Error("PR target repository does not match.");
  if($("workPrUrl").value.trim()!==value)return;
  $("workBranch").value=pr.base.ref;
  suggestionVersion++;generateRubric();
  await checkPrReadiness({owner,repository,branch:pr.base.ref,number,requiredLabel:$("workLabel").value.trim()},"createPrPreflight");
  $("workRubricHelp").textContent="GitHub PR loaded. Verify the worker address and acceptance criteria before signing.";
 }catch(e){$("workRubricHelp").textContent="PR number filled. Check target branch manually: "+String(e.message||e);loadingPrUrl="";}
}
$("workPrUrl").addEventListener("input",()=>{void loadPrUrl();});
$("workPrUrl").addEventListener("change",()=>{void loadPrUrl();});
$("workRubric").addEventListener("input",()=>{rubricEdited=true;generateRubric();});
$("workGenerateRubric").addEventListener("click",()=>{rubricEdited=false;generateRubric();});
for(const id of ["workOwner","workRepo","workBranch","workPr","workLabel"]) {
  $(id).addEventListener("input",()=>{suggestionVersion++;generateRubric();});
}
$("createCheckPr").addEventListener("click",()=>{void checkPrReadiness({owner:$("workOwner").value.trim(),repository:$("workRepo").value.trim(),branch:$("workBranch").value.trim(),number:$("workPr").value.trim(),requiredLabel:$("workLabel").value.trim()},"createPrPreflight");});
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

let connectedAccount="";
let authorizedAccounts=[];
function setAccounts(accounts){
 authorizedAccounts=(Array.isArray(accounts)?accounts:[]).filter(a=>/^0x[a-fA-F0-9]{40}$/.test(a));
 const el=$("walletAccount");el.replaceChildren();
 for(const a of authorizedAccounts){const o=document.createElement("option");o.value=a;o.textContent=a.slice(0,6)+"…"+a.slice(-4);el.append(o);}
 el.hidden=authorizedAccounts.length<2;
 if(!authorizedAccounts.some(a=>a.toLowerCase()===connectedAccount.toLowerCase()))connectedAccount=authorizedAccounts[0]||"";
 el.value=connectedAccount;showAccount(connectedAccount);
}
function showAccount(addr){
 connectedAccount=addr||"";
 $("walletCurrent").textContent=addr?addr.slice(0,6)+"…"+addr.slice(-4):"Wallet not connected";
 $("walletConnect").textContent=addr?"Manage wallets":"Connect wallet";
}
async function connectAccount(){
 if(!window.ethereum?.request)throw Error("MetaMask is not available.");
 if(connectedAccount && window.ethereum.request){
   try{await window.ethereum.request({method:"wallet_requestPermissions",params:[{eth_accounts:{}}]});}
   catch(e){if(e?.code===4001)throw Error("Account selection canceled in MetaMask.");/* wallet may not support permission selection; continue with existing authorized accounts */}
 }
 const accounts=await window.ethereum.request({method:"eth_requestAccounts"});
 const addr=accounts?.[0]||"";
 if(!/^0x[0-9a-fA-F]{40}$/.test(addr))throw Error("Select a valid account in MetaMask.");
 setAccounts(accounts);
 await findMine();
}
async function findMine(){
 const display=$("walletWorks");
 const primary=$("workPrimaryList");
 if(!connectedAccount){display.textContent="Connect MetaMask to find your work.";if(primary)primary.textContent="Connect MetaMask to load your work.";return;}
 display.textContent="Reading work records from GenLayer…";if(primary)primary.textContent="Loading your work…";
 const found=[];
 let missed=0,checked=0;
 // Bounded scan: no indexer exists in the current contract.
 for(let id=1;id<=100;id++){
   try {
     const raw=await client.readContract({address:ADDRESS,functionName:"get_work",args:[String(id)],transactionHashVariant:"latest-final"});
     const work=parseWork(raw);
     checked++;
     if(!work){missed++;if(missed>=5 && id>5)break;continue;}
     missed=0;
     if([work.client,work.worker].some(x=>typeof x==="string"&&x.toLowerCase()===connectedAccount.toLowerCase()))found.push(work);
   }catch(e){display.textContent="Could not finish reading on-chain work. Try Refresh my work.";return;}
 }
 display.replaceChildren();if(primary)primary.replaceChildren();
 if(!found.length){display.textContent="No work assigned to this wallet in the scanned range ("+checked+" IDs).";return;}
 for(const work of found.reverse()){
  const btn=document.createElement("button");btn.type="button";btn.className="btn btn-subtle btn-small";
  btn.textContent="Work #"+work.id+" · "+work.state+" · PR #"+work.pr_number+" ↗";
  btn.style.margin="4px";
  btn.addEventListener("click",()=>{$("workId").value=work.id;render(work);});
  display.append(btn);if(primary){const visible=btn.cloneNode(true);visible.addEventListener("click",()=>{$("workId").value=work.id;render(work);document.querySelector("#work-app")?.scrollIntoView({behavior:"smooth",block:"start"});});primary.append(visible);}
 }
}
$("walletAccount").addEventListener("change",()=>{showAccount($("walletAccount").value);void findMine();});
$("walletConnect").addEventListener("click",()=>{connectAccount().catch(e=>note(e.message,true));});
$("workFindMine").addEventListener("click",()=>{findMine().catch(e=>note(e.message,true));});
if(window.ethereum?.request){
 window.ethereum.request({method:"eth_accounts"}).then(a=>{if(a?.length){setAccounts(a);void findMine();}}).catch(()=>{});
 window.ethereum.on?.("accountsChanged",a=>{setAccounts(a);void findMine();});
}
