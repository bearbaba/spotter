import { inspectPullRequest } from "./github-preflight.mjs";
import { createClient } from "https://esm.sh/genlayer-js@0.18.10?bundle";
import { studionet } from "https://esm.sh/genlayer-js@0.18.10/chains?bundle";
import { transactionHash, parseWork, parseWorkCount, parseGitHubPullUrl, workConfirmsPriorStage, workActionAllowed, createdWorkId, finalizedReceipt, unresolvedTransactionBlocks } from "./proofgate-core.mjs";
import { outstandingReceipts, verifyStoredReceipts, compactHistory, getVerifiedReceipt } from "./transaction-tracker.mjs";
import { withExclusiveWriteLock } from "./wallet-write-guard.mjs";
import { isStudionetChainId, requestStudionetSwitch } from "./wallet-network.mjs";
const ADDRESS = "0x506205eBc1ba011707D63d8a152625baaC63002D";
const ENDPOINT = "https://studio.genlayer.com/api";
const CHAIN = 61999;
const ZERO = "0x0000000000000000000000000000000000000000";
const $ = id => document.getElementById(id);
const client = createClient({chain:studionet,endpoint:ENDPOINT,account:ZERO});
// Browser transaction state must never cross deployments. Legacy V2 hashes belong
// to another contract even when they share Work IDs; do not import their locks.
const SCOPE = CHAIN + ":" + ADDRESS.toLowerCase();
const KEY = "spotter.work.pending." + SCOPE;
const HISTORY_KEY = "spotter.work.history.v2." + SCOPE;
const history = () => {try{return compactHistory(JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]"));}catch{return [];}};
function remember(entry){
 if(!/^0x[0-9a-fA-F]{64}$/.test(entry?.hash||""))throw Error("Cannot save invalid transaction hash.");
 const records=history();
 const i=records.findIndex(x=>x.hash.toLowerCase()===entry.hash.toLowerCase());
 const old=i>=0?records.splice(i,1)[0]:{};
 records.unshift({...old,...entry});
 localStorage.setItem(HISTORY_KEY,JSON.stringify(compactHistory(records)));
 renderHistory();
}
// The history is a neutral audit index of hashes; the live monitor owns
// transaction progress and must never claim success without GenVM evidence.
function renderHistory(){
 const root=$("workHistory");if(!root)return;
 root.replaceChildren();
 const records=history();
 if(!records.length){
  const empty=document.createElement("p");
  empty.className="hint";
  empty.textContent="No transaction hashes saved in this browser yet.";
  root.append(empty);return;
 }
 for(const entry of records){
  const item=document.createElement("div");
  item.className="work-hash-item";
  const link=document.createElement("a");
  link.href="https://explorer-studio.genlayer.com/tx/"+encodeURIComponent(entry.hash);
  link.target="_blank";link.rel="noopener noreferrer";
  link.textContent=entry.hash.slice(0,12)+"…"+entry.hash.slice(-8)+" ↗";
  const details=document.createElement("p");
  details.className="hint";
  details.textContent=(entry.workId?"Work #"+entry.workId+" · ":"")+
    new Date(entry.created||Date.now()).toLocaleString();
  item.append(link,details);
  root.append(item);
 }
}

let prReadSequence=0;
function preflightView(target,result,notice=""){
  const el=$(target);if(!el)return;
  el.replaceChildren();const title=document.createElement("strong");title.textContent=notice||(result?.ready?"GitHub checks passed":"GitHub checks need attention");el.append(title);
  if(result?.checks){const list=document.createElement("ul");for(const check of result.checks){const item=document.createElement("li");item.className=check.ok?"ok":"notready";item.textContent=(check.ok?"✓ ":"○ ")+check.text;list.append(item);}el.append(list);}
  const footer=document.createElement("p");footer.textContent="GitHub metadata check only. The GenLayer contract determines the on-chain result.";el.append(footer);
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

async function verifyCreatePrIdentity(config){
  // A work agreement is created BEFORE delivery/merge. Identity must match,
  // but do not require a merged PR until evaluate() on GenLayer.
  const {owner,repository,branch,number}=config;
  const url="https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repository)+"/pulls/"+encodeURIComponent(number);
  const response=await fetch(url,{headers:{Accept:"application/vnd.github+json"},cache:"no-store"});
  if(!response.ok)throw Error("Could not verify the GitHub pull request before signing (HTTP "+response.status+").");
  const pr=await response.json();
  const correctRepo=String(pr.base?.repo?.full_name||"").toLowerCase()===(owner+"/"+repository).toLowerCase();
  if(String(pr.number)!==String(number) || !correctRepo || pr.base?.ref!==branch)
    throw Error("PR repository, number or branch differs from the locked agreement. No wallet signature requested.");
  return true;
}

function showWalletNetwork(chain){
  const installed=Boolean(window.ethereum?.request);
  const correct=isStudionetChainId(chain);
  const status=$("walletNetworkStatus");
  status.dataset.correct=String(correct);
  status.textContent=!installed?"MetaMask unavailable":correct?"Studionet ✓":"Wrong network";
  status.title=!installed?"Install MetaMask to sign":correct?"MetaMask is on GenLayer Studionet (61999)":"Change MetaMask to GenLayer Studionet (61999) before signing";
  $("walletNetworkNotice").hidden=!installed || correct;
}
let chainSequence=0;
async function refreshWalletNetwork(){
  const sequence=++chainSequence;
  if(!window.ethereum?.request){showWalletNetwork(null);return;}
  try{
    const chain=await window.ethereum.request({method:"eth_chainId"});
    if(sequence===chainSequence)showWalletNetwork(chain);
  }catch{
    if(sequence===chainSequence)showWalletNetwork(null);
  }
}
$("walletSwitch").addEventListener("click",async()=>{
  const button=$("walletSwitch");
  button.disabled=true;
  try{
    // A chain switch is a wallet permission action only; never send create_work
    // or re-trigger a previously unresolved transaction automatically.
    const result=await requestStudionetSwitch(window.ethereum);
    await refreshWalletNetwork();
    note(result==="switched"
      ?"MetaMask is now on Studionet (61999). Verify the selected Owner wallet, then click Create once."
      :"Studionet is already selected. Verify the selected Owner wallet before creating work.");
  }catch(error){
    await refreshWalletNetwork();
    note("Network switch was not completed. Check MetaMask's network selection. "+String(error?.message||error).slice(0,150),true);
  }finally{button.disabled=false;}
});
void refreshWalletNetwork();
window.ethereum?.on?.("chainChanged",()=>{void refreshWalletNetwork();});

let lastWork = null;
let busy = false;
let connectedAccount = "";
let authorizedAccounts = [];
function signerAllowed(method,work,account){
 if(method==="create_work")return true;
 if(!work || !account)return false;
 const signer=account.toLowerCase();
 if(method==="submit_for_review")return work.worker?.toLowerCase()===signer;
 if(method==="issue_acceptance")return [work.client,work.worker].some(a=>a?.toLowerCase()===signer);
 return true;
}
function syncButtons() {
  const blocked = busy || preparingSignature;
  for (const button of document.querySelectorAll("[data-work-method]")) {
    const method = button.dataset.workMethod;
    const stageValid=method==="create_work" || (lastWork && lastWork.id===$("workId").value.trim() && workActionAllowed(method,lastWork.state));
    if(method!=="create_work")button.hidden=!stageValid;
    button.disabled = blocked || transactionBlocks(method) || !stageValid || !signerAllowed(method,lastWork,connectedAccount);
    if(stageValid && method!=="create_work")button.title=transactionBlocks(method)?"Waiting for transaction tracking on this work":!signerAllowed(method,lastWork,connectedAccount)?"Selected wallet is not authorized for this action":"";
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
function transactionBlocks(method){
 const p=pending();
 const unresolved=unresolvedTransactionBlocks(history(),method,$("workId").value.trim());
 if(unresolved)return true;
 if(!p)return false;
 if(p.method==="recovered transaction")return false;
 const stored=history().find(e=>e.hash.toLowerCase()===p.hash.toLowerCase());
 if(stored && !["PENDING","FINALIZED · EXECUTION UNVERIFIED"].includes(stored.status))return false;
 if(p.method==="create_work")return method==="create_work";
 if(method==="create_work")return false;
 return Boolean(p.workId && String(p.workId)===$("workId").value.trim());
}
// A lightweight read-only poller: no WebSocket promises, no wallet writes.
let currentMonitor=null;
let dismissedMonitorHash="";
const LIVE_PROGRESS_MAX_AGE_MS=10*60*1000;
function isRecentTransaction(entry,now=Date.now()){
 const created=Number(entry?.created);
 return Number.isFinite(created)&&created>0&&now>=created&&now-created<=LIVE_PROGRESS_MAX_AGE_MS;
}
function showTxMonitor(phase,entry={},message=""){
  const safeHash=/^0x[0-9a-fA-F]{64}$/.test(entry?.hash||"")?entry.hash:"";
  const changed=!currentMonitor || currentMonitor.phase!==phase || currentMonitor.hash!==safeHash;
  currentMonitor={phase,hash:safeHash,method:entry.method||"",workId:entry.workId||"",message,checkedAt:Date.now()};
  dismissedMonitorHash="";
  refreshPending();
  // Bring the real outcome into view, but never scroll every 7-second poll.
  // Particularly important after Create: the form button is below this panel.
  if(changed)$("workTxPanel").scrollIntoView?.({behavior:"smooth",block:"nearest"});
}
function refreshPending(){
 const p=pending();
 const unresolved=history().find(entry =>
   ["PENDING","FINALIZED · EXECUTION UNVERIFIED","FINALIZED · ID UNKNOWN","FINALIZED · VERIFY ID"].includes(entry.status)
   && /^0x[0-9a-fA-F]{64}$/.test(entry.hash||"")
   && !workConfirmsPriorStage(entry,lastWork)
 );
 const active=p?.hash&&!workConfirmsPriorStage(p,lastWork)?p:unresolved;
 const stored=active?.hash?history().find(item=>item.hash.toLowerCase()===active.hash.toLowerCase()):null;
 const settledButUnknown=stored && ["FINALIZED · EXECUTION UNVERIFIED","FINALIZED · ID UNKNOWN","FINALIZED · VERIFY ID"].includes(stored.status);
 const historicalMessage=settledButUnknown
  ?"GenLayer has finalized this transaction, but the execution outcome or new Work ID is not yet independently verifiable. Check Explorer; do not resend."
  :"The transaction was submitted. Checking the network automatically; do not sign the same action again.";
 // Keep a verified final message visible until explicitly dismissed, even if
 // a different, older browser history entry still needs manual inspection.
 const view=currentMonitor || (active ? {
   phase:settledButUnknown?"unknown":"pending",
   hash:active.hash,method:active.method,workId:active.workId,
   message:historicalMessage,checkedAt:Date.now(),networkFinalized:Boolean(settledButUnknown)
 } : null);
 const panel=$("workTxPanel");
 panel.hidden=!view || (view.hash && dismissedMonitorHash===view.hash);
 $("workPending").hidden=panel.hidden;
 $("workClear").hidden=true;
 $("workCheck").hidden=!p || panel.hidden;
 $("workTxDismiss").hidden=!(view && ["success","failure","canceled","confirmed"].includes(view.phase));
 const safeHash=view?.hash||"";
 $("workTxLink").hidden=!safeHash || panel.hidden;
 if(safeHash)$("workTxLink").href="https://explorer-studio.genlayer.com/tx/"+encodeURIComponent(safeHash);
 else $("workTxLink").href="#";
 if(!view){syncButtons();return;}
 const phase=view.phase;
 const labels={
  wallet:"Waiting for MetaMask",
  pending:"Waiting for GenLayer",
  unknown:"Verification incomplete",
  success:"Verified success",
  failure:"Transaction failed",
  canceled:"Signature canceled",
  confirmed:"Work confirmed on-chain"
 };
 panel.dataset.phase=phase;
 const methods={
  create_work:"Create agreement",
  submit_for_review:"Submit work",
  evaluate:"AI evaluation",
  issue_acceptance:"Issue certificate"
 };
 $("workTxTitle").textContent=methods[view.method]||"Transaction status";
 $("workTxState").textContent=labels[phase]||"Checking status";
 $("workPending").textContent=view.message || "Checking the GenLayer network for a verified outcome.";
 $("workTxUpdated").textContent="Last updated: "+new Date(view.checkedAt||Date.now()).toLocaleTimeString()
   +(safeHash?" · "+safeHash.slice(0,12)+"…"+safeHash.slice(-8):"");
 const walletDone=Boolean(safeHash)||["success","failure"].includes(phase);
 const networkDone=phase==="success"||phase==="failure"||phase==="confirmed"||Boolean(view.networkFinalized);
 const resultDone=phase==="success"||phase==="failure";
 $("workTxStepResult").textContent=phase==="confirmed"?"3. Receipt not yet verified":"3. Execution result";
 $("workTxStepWallet").dataset.done=String(walletDone);
 $("workTxStepNetwork").dataset.done=String(networkDone);
 $("workTxStepResult").dataset.done=String(resultDone);
 syncButtons();
}
$("workTxDismiss").addEventListener("click",()=>{
 if(!currentMonitor || !["success","failure","canceled","confirmed"].includes(currentMonitor.phase))return;
 dismissedMonitorHash=currentMonitor.hash || "dismissed_without_hash";
 currentMonitor=null;
 refreshPending();
});

function reconcileProgress(work){
 const p=pending();
 if(!p || String(p.workId)!==String(work.id))return false;
 // Only real progress after the transaction's starting state proves a step
 // advanced. REVIEW -> REVIEW is not evidence that a retry has completed.
 const advanced=workConfirmsPriorStage(p,work);
 if(!advanced)return false;
 // Contract is authoritative for the Work state; it is NOT a transaction receipt.
 remember({...p,status:"WORK STATE VERIFIED ON-CHAIN (RECEIPT NOT CHECKED)",workId:work.id});
 sessionStorage.removeItem(KEY);
 // Finalized Work is authoritative for its state, not proof of this receipt.
 // Keep the unverified hash in history; do not resurface hours-old notices.
 if(isRecentTransaction(p)){
   showTxMonitor("confirmed",p,"Work #"+work.id+" is "+work.state+" in finalized contract state. The receipt still requires independent verification; closing this notice does not discard its hash.");
 }else if(currentMonitor?.hash?.toLowerCase()===p.hash?.toLowerCase()){
   currentMonitor=null;
 }
 return true;
}
function updateWorkGuidance(){
 const help=$("workNextHelp");
 if(!help)return;
 if(!lastWork){help.textContent="Choose a Work to see the next step.";return;}
 const work=lastWork,account=connectedAccount.toLowerCase();
 const contributor=Boolean(account&&work.worker?.toLowerCase()===account);
 const creator=Boolean(account&&work.client?.toLowerCase()===account);
 if(work.state==="OPEN")help.textContent=contributor?"You are the assigned contributor. Click Submit for review when ready.":"The assigned contributor must connect their wallet and click Submit for review.";
 else if(work.state==="SUBMITTED")help.textContent="Once the GitHub PR is merged, run AI evaluation to check the evidence.";
 else if(work.state==="REVIEW")help.textContent="Read the review explanation and inspect any missing evidence before evaluating again.";
 else if(work.state==="ACCEPTED")help.textContent=creator||contributor?"You can issue the certificate. Confirm once in MetaMask.":"Only the creator or contributor can issue this certificate.";
 else if(work.state==="CERTIFIED")help.textContent="Certification is complete on-chain. No further signature is needed.";
 else help.textContent="Refresh Work status to see the next action.";
}

function updateCertifiedFeature(work){
 if(work?.state!=="CERTIFIED" || work.contract_version!=="3.0.0")return;
 const badge=$("featuredWorkBadge");
 const shown=Number(badge?.dataset?.workId||"1");
 if(!badge||!Number.isSafeInteger(Number(work.id))||Number(work.id)<shown)return;
 badge.dataset.workId=work.id;
 badge.textContent="WORK #"+work.id+" · CERTIFIED";
 const pr=$("featuredPrLink");
 pr.textContent="PR #"+work.pr_number;
 pr.href="https://github.com/"+encodeURIComponent(work.owner)+"/"+encodeURIComponent(work.repository)+"/pull/"+encodeURIComponent(work.pr_number);
 $("featuredWorkDescription").firstChild.textContent="Work #"+work.id+" certified for merged ";
 $("featuredWorkMeta").textContent="GenLayer Studionet · V3 contract: "+ADDRESS+" · Work ID: "+work.id+" · State: CERTIFIED";
 const tx=history().find(item=>item.method==="issue_acceptance" && String(item.workId)===work.id && /^0x[0-9a-fA-F]{64}$/.test(item.hash));
 const link=$("featuredTxLink");
 link.href=tx?"https://explorer-studio.genlayer.com/tx/"+encodeURIComponent(tx.hash):"https://explorer-studio.genlayer.com/address/"+ADDRESS;
 link.textContent=tx?"Inspect certificate transaction ↗":"Inspect GenLayer contract ↗";
 $("featuredEvidenceNote").textContent="Certified state comes from the finalized V3 Work record. Receipt and source/deployment audits remain separate checks.";
}

function render(work) {
  lastWork = work;
  updateCertifiedFeature(work);
  $("workExample").hidden=work.id!=="1"; // Do not distract from currently selected Work #2 or later.
  const reconciled=reconcileProgress(work);
  renderHistory();
  $("workOutput").textContent = JSON.stringify(work,null,2);
  $("workOutput").hidden = false;
  const state = work.state || "UNKNOWN";
  const summary=$("workSummary");if(summary){summary.replaceChildren();const tag=document.createElement("span");tag.className="work-state";tag.textContent=state;const heading=document.createElement("strong");heading.textContent="Work #"+work.id+" · "+work.owner+"/"+work.repository+" · PR #"+work.pr_number;const detail=document.createElement("p");detail.textContent=work.explanation || (state==="OPEN"?"Created and ready for the assigned worker.":state==="SUBMITTED"?"Submitted for GenLayer verification.":state==="CERTIFIED"?"Acceptance certificate recorded on-chain.":"Review the evidence and contract state.");summary.append(tag,heading,detail);}
  updateWorkGuidance();
  note(reconciled?"Work #"+work.id+" is "+state+" on latest-final chain state. Previous transaction tracker reconciled to the Work state (receipt outcome not independently verified).":"Work #" + work.id + " is " + state + ". These are contract reads, not local sample data.");
  refreshPending();
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
  if (!work || work.id !== id || work.contract_version !== "3.0.0") throw Error("V3 finalized work record not found or version mismatch.");
  render(work);

}
async function wallet() {
  if (!window.ethereum?.request) throw Error("MetaMask is required for contract writes.");
  const chain = await window.ethereum.request({method:"eth_chainId"});
  if (!isStudionetChainId(chain)) {
     showWalletNetwork(chain);
     throw Error("Wrong network. Click 'Switch to GenLayer Studionet' in Create Work before signing. No transaction was sent.");
  }
  const accounts = await window.ethereum.request({method:"eth_accounts"});
  const selected = connectedAccount || "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(selected) || !accounts.some(a=>a.toLowerCase()===selected.toLowerCase())) throw Error("Select and authorize the signing wallet using Connect wallet before signing.");
  if(accounts[0]?.toLowerCase()!==selected.toLowerCase())throw Error("MetaMask active signing account does not match the wallet selected in Spotter. Switch the active account in MetaMask and reconnect before signing.");
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
  const parsedPr=parseGitHubPullUrl($("workPrUrl").value);
  if(!parsedPr)throw Error("Paste a valid https://github.com/owner/repo/pull/123 URL before creating work.");
  if(parsedPr.owner.toLowerCase()!==owner.toLowerCase() || parsedPr.repository.toLowerCase()!==repo.toLowerCase() || parsedPr.number!==pr)
    throw Error("Advanced GitHub owner, repository or PR number differs from the PR URL. Verify the source before signing.");
  return [worker,owner,repo,branch,Number(pr),label,rubric];
}
let preparingSignature=false;
async function act(method) {
 return withExclusiveWriteLock(navigator?.locks,CHAIN+":"+ADDRESS,()=>performAct(method));
}
async function performAct(method) {
  // Reserve this tab's write slot *before* any awaited RPC or wallet operation.
  // Rapid clicks cannot open competing MetaMask prompts while preparation runs.
  if(busy || preparingSignature || transactionBlocks(method))throw Error("A write is already being prepared or an earlier transaction is unresolved. Check receipt status before signing.");
  preparingSignature=true;
  syncButtons();
  let callArgs, account;
  try {
    if(method!=="create_work"){
      const id=$("workId").value.trim();
      const raw=await client.readContract({address:ADDRESS,functionName:"get_work",args:[id],transactionHashVariant:"latest-final"});
      const current=parseWork(raw);
      if(!current || current.id!==id || current.contract_version!=="3.0.0" || !workActionAllowed(method,current.state)){
        if(current)render(current);
        throw Error("Work state changed on-chain; action canceled without a wallet signature. Read the latest Work state.");
      }
      lastWork=current;
    }
    callArgs=args(method);
    if(method==="create_work"){
      // An open, unmerged PR is valid for a new agreement. Require verified
      // GitHub identity/branch, not evidence of completed work.
      await verifyCreatePrIdentity({
        owner:callArgs[1],repository:callArgs[2],
        branch:callArgs[3],number:callArgs[4]
      });
      preflightView("createPrPreflight",null,"GitHub PR identity verified before signing. Merge and qualitative acceptance are checked later on-chain.");
    }
    account=await wallet();
    if(method!=="create_work" && !signerAllowed(method,lastWork,account))
      throw Error("Wrong signing wallet. This action requires the nominated worker or an authorized participant.");
    // Another tab may have updated the local history while this request was preparing.
    if(transactionBlocks(method))throw Error("An unresolved write appeared during preparation. No new signature requested.");
  } finally {
    preparingSignature=false;
    syncButtons();
  }
  busy=true;
  syncButtons();
  showTxMonitor("wallet",{method},"Approve the transaction in MetaMask. Nothing has been submitted to GenLayer yet.");
  note("Waiting for MetaMask approval. No transaction has been confirmed yet.");
  try {
    note("Selected signing account: "+account.slice(0,6)+"…"+account.slice(-4)+". Confirm this exact address in MetaMask.");
    const writer=createClient({chain:studionet,endpoint:ENDPOINT,account,provider:window.ethereum});
    const result=await writer.writeContract({address:ADDRESS,functionName:method,args:callArgs,value:0n});
    const hash=transactionHash(result);
    if(!hash)throw Error("Wallet response did not contain a recognized transaction hash; inspect wallet history before retrying.");
    const entry={hash,method,fromState:method==="create_work"?"":lastWork?.state||"",account,created:Date.now(),status:"PENDING",workId:method==="create_work"?"":callArgs[0],owner:method==="create_work"?callArgs[1]:"",repository:method==="create_work"?callArgs[2]:"",pr:method==="create_work"?String(callArgs[4]):""};
    sessionStorage.setItem(KEY,JSON.stringify(entry));
    remember(entry);
    showTxMonitor("pending",entry,"Transaction submitted. GenLayer is processing it; verification is automatic and never requires another signature.");
    void checkTransaction();
    note("Transaction sent. GenLayer is processing it. Open the live status panel for the current result.");
  } catch(e) {
    const message=String(e?.shortMessage||e?.message||e);
    if(/rate.limit|429|too many requests|eth_sendRawTransaction/i.test(message)){
      showTxMonitor("unknown",{method},"Submission was interrupted. The wallet or GenLayer may have received the request. Check MetaMask Activity before trying again.");
      note("Studionet RPC reported a submission problem; it may still have reached the network. Inspect MetaMask Activity and re-read the Work. Never resend blindly.",true);
    }else if(e?.code===4001 || /user rejected|user denied/i.test(message)){
      showTxMonitor("canceled",{method},"Signature canceled in MetaMask. No transaction hash was returned and nothing was submitted by this action.");
      note("Signature rejected in MetaMask; no transaction hash was recorded.");
    }else{
      showTxMonitor("unknown",{method},"Wallet submission could not be confirmed. Check MetaMask Activity before doing anything else. "+message.slice(0,130));
      note("Submission returned an error. Inspect MetaMask Activity before retrying. "+message.slice(0,180),true);
    }
  } finally {
    busy=false;
    refreshPending();
    syncButtons();
  }
}
$("workRead").addEventListener("click",async()=>{try {await read();}catch(e){note(e.message,true);}});
$("workExample").addEventListener("click",async()=>{ $("workId").value="1";lastWork=null;syncButtons();try {await read();}catch(e){note(e.message,true);} });
for(const button of document.querySelectorAll("[data-work-method]")) {
  button.addEventListener("click",async()=>{try {await act(button.dataset.workMethod);}catch(e){note(e.message,true);}});
}
$("workId").addEventListener("input",()=>{lastWork=null;syncButtons();});
let checkInProgress=false;
async function checkTransaction(){
 const p=pending();
 if(!p||checkInProgress)return;
 const scopedNote=(message,error=false)=>{if(p.method==="create_work" || String(p.workId)===$("workId").value.trim())note(message,error);};
 checkInProgress=true;$("workCheck").disabled=true;
 try{
  const receipt=await getVerifiedReceipt(hash=>client.getTransaction({hash}),fetch,ENDPOINT,{...p,contract:ADDRESS}); // Read-only GenLayer SDK + raw RPC.
  if(pending()?.hash?.toLowerCase()!==p.hash.toLowerCase())return; // Another task resolved this hash.
  const returnedHash=receipt?.hash??receipt?.txId??receipt?.id;
  if(!returnedHash || String(returnedHash).toLowerCase()!==p.hash.toLowerCase()){
   showTxMonitor("unknown",p,"GenLayer response did not verify this exact transaction hash. Outcome remains unverified; do not resend.");
   scopedNote("RPC receipt identity missing or mismatched. Outcome remains unverified; no retry or signature.",true);
   return;
  }
  const status=finalizedReceipt(receipt);
  if(status==="FAILED"){showTxMonitor("failure",p,"GenLayer finalized this transaction with a GenVM execution failure. Open Explorer to see the error. Do not assume Work advanced.");remember({...p,status:"FAILED (GENVM)"});sessionStorage.removeItem(KEY);refreshPending();scopedNote("Transaction FINALIZED with execution failure. Check Explorer for contract error before considering another attempt.",true);return;}
  if(status==="FINALIZED_UNVERIFIED"){showTxMonitor("unknown",p,"Consensus has finalized, but GenVM execution outcome is not yet verifiable. Status checks continue; do not resend.");remember({...p,status:"FINALIZED · EXECUTION UNVERIFIED"});refreshPending();scopedNote("Consensus FINALIZED but GenVM execution result is still unverified. Read-only recovery continues. Never sign a duplicate.",true);return;}
   if(status!=="FINALIZED"){showTxMonitor("pending",p,"GenLayer status: "+String(receipt?.statusName||receipt?.status||"not available")+". Checking automatically, without another wallet signature.");scopedNote("Transaction status: "+String(receipt?.statusName||receipt?.status||"UNKNOWN")+" / "+String(receipt?.txExecutionResultName||"NOT_DECIDED")+". Read-only tracking continues; no new signature needed.");return;}
  if(p.method==="recovered transaction"){
    showTxMonitor("success",p,"GenVM execution succeeded. For a recovered hash, read the Work record separately to check the resulting state.");
    remember({...p,status:"FINALIZED (RECEIPT VERIFIED)"});
    sessionStorage.removeItem(KEY);refreshPending();
    scopedNote("Recovered transaction FINALIZED; read its Work ID to verify the contract state.");return;
  }
  if(p.method==="create_work"){
    const id=createdWorkId(receipt);
    if(!id){showTxMonitor("unknown",p,"GenVM execution succeeded, but the Work ID was not decoded. Inspect the receipt before retrying.");scopedNote("Transaction finalized, but Work ID could not be safely decoded. Inspect the transaction output in Studio; do not create again.",true);remember({...p,status:"FINALIZED · ID UNKNOWN"});sessionStorage.removeItem(KEY);refreshPending();return;}
    const raw=await client.readContract({address:ADDRESS,functionName:"get_work",args:[id],transactionHashVariant:"latest-final"});
    const work=parseWork(raw);
    if(!work || work.contract_version!=="3.0.0" || work.id!==id || work.client?.toLowerCase()!==p.account.toLowerCase() || work.owner?.toLowerCase()!==p.owner.toLowerCase() || work.repository?.toLowerCase()!==p.repository.toLowerCase() || String(work.pr_number)!==String(p.pr)){
      showTxMonitor("unknown",p,"Execution succeeded, but the new Work record has not been independently verified yet.");
      remember({...p,status:"FINALIZED · VERIFY ID"});sessionStorage.removeItem(KEY);refreshPending();
      scopedNote("Finalized receipt found, but the returned Work ID is not yet independently verified. Inspect Studio; never guess IDs.",true);return;
    }
    showTxMonitor("success",{...p,workId:id},"GenVM execution succeeded. Work #"+id+" has been verified in finalized contract state: "+work.state+".");
    $("workId").value=id;remember({...p,status:"FINALIZED",workId:id});sessionStorage.removeItem(KEY);refreshPending();render(work);scopedNote("Work #"+id+" created and verified on-chain. You can now switch to the nominated worker wallet.");return;
  }
  remember({...p,status:"FINALIZED"});
  sessionStorage.removeItem(KEY);
  let confirmedWork=null;
  if(p.workId){$("workId").value=p.workId;try{await read();confirmedWork=lastWork;}catch{}}
  showTxMonitor(confirmedWork?"success":"unknown",p,
    confirmedWork
      ?"GenVM execution succeeded. Work #"+p.workId+" is now "+confirmedWork.state+" on the finalized contract."
      :"GenVM execution succeeded, but the updated Work record could not be read yet. Refresh Work status to confirm the result.");
  scopedNote("Transaction FINALIZED. Read Work #"+p.workId+" to see the new contract state.");
 }catch(e){if(pending()?.hash?.toLowerCase()!==p.hash.toLowerCase())return;showTxMonitor("unknown",p,"GenLayer receipt is temporarily unavailable. We will keep checking automatically. Do not resend the transaction.");scopedNote("Still checking transaction. No wallet signature or retry sent. "+String(e?.message||"").slice(0,120));}
 finally{checkInProgress=false;$("workCheck").disabled=false;}
}
// Audit all old browser hashes, not just the single transaction from sessionStorage.
// A failed RPC lookup preserves prior state and must never authorize a retry.
let historyScanRunning=false;
let historyScanCursor=0;
async function verifyHistoricalReceipts(){
 if(historyScanRunning || document.visibilityState!=="visible")return;
 const activeHash=pending()?.hash?.toLowerCase();
 const candidates=outstandingReceipts(history()).filter(entry=>entry.hash.toLowerCase()!==activeHash);
 if(!candidates.length)return;
 historyScanRunning=true;
 try {
  const byHash=new Map(candidates.map(entry=>[entry.hash.toLowerCase(),entry]));
   const result=await verifyStoredReceipts(candidates,hash=>getVerifiedReceipt(tx=>client.getTransaction({hash:tx}),fetch,ENDPOINT,{...byHash.get(hash.toLowerCase()),contract:ADDRESS}),{limit:3,offset:historyScanCursor});
  historyScanCursor=result.remaining?(historyScanCursor+result.inspected.length)%result.remaining:0;
  for(const item of result.inspected){
   if(!item.update)continue; // pending, unrecognized or RPC unavailable: no inferred result
   const current=history().find(e=>e.hash.toLowerCase()===item.hash.toLowerCase());
   if(!current || !outstandingReceipts([current]).length)continue;
   let update=item.update;
   if(current.method==="create_work" && update.status==="FINALIZED · VERIFY ID" && update.candidateWorkId){
    try{
     const raw=await client.readContract({address:ADDRESS,functionName:"get_work",args:[update.candidateWorkId],transactionHashVariant:"latest-final"});
     const work=parseWork(raw);
     if(work && work.contract_version==="3.0.0" && work.id===update.candidateWorkId && work.client?.toLowerCase()===current.account?.toLowerCase() && work.owner?.toLowerCase()===current.owner?.toLowerCase() && work.repository?.toLowerCase()===current.repository?.toLowerCase() && String(work.pr_number)===String(current.pr)){
      update={...update,status:"FINALIZED (RECEIPT VERIFIED)",workId:work.id};
     }
    }catch{/* Receipt finalized; contract readback remains unverified. */}
   }
   remember({...current,...update});
  }
  refreshPending(); // A finalized historical hash must release the correct action lock.
 } finally {historyScanRunning=false;}
}
$("workCheck").addEventListener("click",checkTransaction);
// Restore unresolved hashes from durable history after a browser restart. Read-only; never replay writes.
if(!pending()){
 const unresolved=history().find(x=>["PENDING","FINALIZED · EXECUTION UNVERIFIED"].includes(x.status) && /^0x[0-9a-fA-F]{64}$/.test(x.hash||""));
 if(unresolved)sessionStorage.setItem(KEY,JSON.stringify(unresolved));
}
const previousPending=pending();
if(previousPending?.hash && !history().some(x=>x.hash===previousPending.hash))remember({...previousPending,status:"PENDING",created:previousPending.created||previousPending.time||Date.now()});
renderHistory();
// Near-live polling while the page is visible; GenLayer provides eventual finality,
// so this is a 7-second check, not a claim of a push-stream subscription.
setInterval(()=>{if(document.visibilityState==="visible" && pending())void checkTransaction();},7000);
setInterval(()=>{if(document.visibilityState==="visible")void verifyHistoricalReceipts();},30000);
document.addEventListener?.("visibilitychange",()=>{if(document.visibilityState==="visible"){if(pending())void checkTransaction();void verifyHistoricalReceipts();}});
window.addEventListener("focus",()=>{if(pending())void checkTransaction();});
if(pending())void checkTransaction();
void verifyHistoricalReceipts();
$("workClear").addEventListener("click",()=>{
  const p=pending();if(!p)return;
  note("Manual transaction resolution is disabled for safety. Use Check transaction confirmation or inspect Explorer; unverified results must not be marked successful.");
  void checkTransaction();
});
refreshPending();
window.addEventListener("storage",event=>{
 if(event.key!==HISTORY_KEY)return;
 const p=pending();
 const stored=p&&history().find(e=>e.hash.toLowerCase()===p.hash.toLowerCase());
 if(stored&&stored.status!=="PENDING")sessionStorage.removeItem(KEY);
 renderHistory();refreshPending();
});

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
  const value=$("workPrUrl").value.trim();
  if(!value){loadingPrUrl="";return;}
  if(value===loadingPrUrl)return;
  const parsed=parseGitHubPullUrl(value);
  if(!parsed){
    loadingPrUrl="";
    $("workRubricHelp").textContent="Paste a public GitHub PR link (https://github.com/owner/repo/pull/123).";
    return;
  }
  loadingPrUrl=value;
  const {owner,repository,number}=parsed;
  $("workOwner").value=owner;
  $("workRepo").value=repository;
  $("workPr").value=number;
  $("workBranch").value="";
  $("workRubricHelp").textContent="Loading GitHub PR #"+number+"…";
  $("createPrPreflight").textContent="Checking GitHub PR source…";
  try {
    const response=await fetch("https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repository)+"/pulls/"+number,{headers:{Accept:"application/vnd.github+json"},cache:"no-store"});
    if(!response.ok)throw Error("GitHub API returned "+response.status);
    const pr=await response.json();
    if(pr.base?.repo?.full_name?.toLowerCase()!==(owner+"/"+repository).toLowerCase() || String(pr.number)!==number)throw Error("GitHub PR does not match the URL.");
    if($("workPrUrl").value.trim()!==value)return;
    $("workBranch").value=pr.base.ref;
    suggestionVersion++;
    generateRubric();
    const checks=await checkPrReadiness({owner,repository,branch:pr.base.ref,number,requiredLabel:$("workLabel").value.trim()},"createPrPreflight");
    if($("workPrUrl").value.trim()!==value)return;
    $("workRubricHelp").textContent=checks?.ready?"GitHub PR loaded. Review the contributor wallet and acceptance criteria.":"PR identity loaded. An unmerged PR is allowed for a new agreement; GenLayer checks completion when evaluated. Review Advanced settings if metadata is wrong.";
  }catch(e){
    if($("workPrUrl").value.trim()===value){
      $("workRubricHelp").textContent="Could not verify PR automatically: "+String(e?.message||e)+". Retry or inspect Advanced settings.";
      loadingPrUrl="";
    }
  }
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
    const contributor=accounts[0];
    if(connectedAccount && contributor.toLowerCase()===connectedAccount.toLowerCase()
      && !window.confirm("This is also the creator wallet. Do you want the same wallet to be the contributor? Click Cancel to use another wallet."))return;
    $("workWorker").value=contributor;
    note("Contributor wallet selected. Check that this wallet belongs to the person who will submit the work.");
  } catch(e){note(e.message,true);}
});
generateRubric();

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
 $("workSignerStatus").textContent=addr?addr.slice(0,6)+"…"+addr.slice(-4):"Not connected";
 $("workConnectWallet").textContent=addr?"Change wallet":"Connect wallet";
 updateWorkGuidance();
 syncButtons();
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
 const lookupAccount=connectedAccount.toLowerCase();
 display.textContent="Reading work records from GenLayer…";if(primary)primary.textContent="Loading your work…";
 const found=[];
 let checked=0;
 try {
   // The V3 contract exposes an authoritative sequential Work count. Never
   // guess an ID ceiling or stop after gaps that could hide assigned work.
   const countRaw=await client.readContract({address:ADDRESS,functionName:"get_work_count",args:[],transactionHashVariant:"latest-final"});
   const count=parseWorkCount(countRaw);
   if(count===null)throw Error("Invalid contract work count.");
   const first=Math.max(1,count-99);
   for(let id=count;id>=first;id--){
     const raw=await client.readContract({address:ADDRESS,functionName:"get_work",args:[String(id)],transactionHashVariant:"latest-final"});
     const work=parseWork(raw);
     checked++;
     if(!work || work.contract_version!=="3.0.0" || work.id!==String(id))throw Error("Inconsistent V3 work record.");
     if([work.client,work.worker].some(x=>typeof x==="string"&&x.toLowerCase()===lookupAccount))found.push(work);
   }
 }catch(e){if(connectedAccount.toLowerCase()===lookupAccount){display.textContent="Could not finish reading V3 work. Try Refresh my work.";if(primary)primary.textContent="GenLayer V3 reads unavailable. Refresh my work to retry.";}return;}
 if(connectedAccount.toLowerCase()!==lookupAccount)return; // another wallet selection superseded this scan
 display.replaceChildren();if(primary)primary.replaceChildren();
 if(!found.length){const message="No V3 work assigned to this wallet in the latest "+checked+" records.";display.textContent=message;if(primary)primary.textContent=message;return;}
 // Work records are displayed, never used to infer an unrelated transaction hash succeeded.
 if(primary && found.length && !lastWork && !$("workId").value.trim()){$("workId").value=found[0].id;void read().catch(e=>note(e.message,true));}
 for(const work of found){
  const btn=document.createElement("button");btn.type="button";btn.className="btn btn-subtle btn-small";
  btn.textContent="Work #"+work.id+" · "+work.state+" · PR #"+work.pr_number+" ↗";
  btn.style.margin="4px";
  btn.addEventListener("click",()=>{$("workId").value=work.id;render(work);});
  display.append(btn);if(primary){const visible=btn.cloneNode(true);visible.addEventListener("click",()=>{$("workId").value=work.id;void read().catch(e=>note(e.message,true));document.querySelector("#work-app")?.scrollIntoView({behavior:"smooth",block:"start"});});primary.append(visible);}
 }
}
$("walletAccount").addEventListener("change",()=>{showAccount($("walletAccount").value);void findMine();});
$("walletConnect").addEventListener("click",()=>{connectAccount().catch(e=>note(e.message,true));});
$("workConnectWallet").addEventListener("click",()=>{connectAccount().catch(e=>note(e.message,true));});
$("workFindMine").addEventListener("click",()=>{findMine().catch(e=>note(e.message,true));});
if(window.ethereum?.request){
 window.ethereum.request({method:"eth_accounts"}).then(a=>{if(a?.length){setAccounts(a);void findMine();}}).catch(()=>{});
 window.ethereum.on?.("accountsChanged",a=>{setAccounts(a);if(a?.[0]){$("walletAccount").value=a[0];showAccount(a[0]);}lastWork=null;$("workId").value="";syncButtons();void findMine();});
}
