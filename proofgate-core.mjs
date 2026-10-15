export function parseGitHubPullUrl(raw) {
  if(typeof raw!=="string")return null;
  let url;
  try {url=new URL(raw.trim());}catch{return null;}
  if(url.protocol!=="https:" || url.hostname!=="github.com" || url.username || url.password || url.port)return null;
  const match=url.pathname.match(/^\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9_.-]{1,100})\/pull\/([1-9][0-9]*)\/?$/);
  if(!match || Number(match[3])>4294967295)return null;
  return {owner:match[1],repository:match[2],number:match[3]};
}

export function parseWorkCount(raw) {
  // GenLayer Studio and the JS SDK may return a number, a numeric string,
  // or JSON-encoded / doubly encoded strings. Reject malformed/unbounded IDs.
  let value=raw;
  for(let i=0;i<3 && typeof value==="string";i++) {
    const item=value.trim();
    if(/^(0|[1-9]\d*)$/.test(item)) {value=Number(item);break;}
    try {value=JSON.parse(item);} catch {return null;}
  }
  return Number.isSafeInteger(value) && value>=0 && value<=1000000000 ? value : null;
}

export function parseWork(raw) {
  let value=raw;
  for(let i=0;i<3;i++) {
    if(typeof value!=="string") break;
    try {value=JSON.parse(value);} catch {return null;}
  }
  if (!value || typeof value!=="object" || Array.isArray(value)) return null;
  const id=String(value.id ?? "");
  if (!/^[1-9][0-9]*$/.test(id) || typeof value.state!=="string") return null;
  return {...value,id};
}
export function workActionAllowed(method,state) {
  const rules={submit_for_review:["OPEN"],evaluate:["SUBMITTED","REVIEW"],issue_acceptance:["ACCEPTED"]};
  return Array.isArray(rules[method]) && rules[method].includes(state);
}

export function transactionHash(raw) {
  const v=typeof raw==="string" ? raw : (raw?.hash ?? raw?.txId ?? raw?.id);
  return typeof v==="string" && /^0x[0-9a-fA-F]{64}$/.test(v) ? v : "";
}

export function createdWorkId(receipt) {
  const candidates=[receipt?.returnValue,receipt?.result?.output,receipt?.result?.returnValue,receipt?.data?.result,receipt?.output];
  for(let item of candidates){
    for(let i=0;i<3 && typeof item==="string";i++){
      const raw=item.trim();
      if(/^[1-9][0-9]*$/.test(raw))return raw;
      try{item=JSON.parse(raw);}catch{break;}
    }
    if(typeof item==="number" && Number.isSafeInteger(item)&&item>0)return String(item);
  }
  return "";
}
/**
 * SDK and raw GenLayer RPC receipts may expose either symbolic or numeric
 * GenVM execution results. NEVER mistake consensus finality for execution.
 * Official ITransactions vote codes: 0 NotVoted, 1 FinishedWithReturn,
 * 2 FinishedWithError, 3 Timeout, 4 NondetDisagree, 5 DeterministicViolation.
 */
export function finalizedReceipt(receipt) {
  if(!receipt || typeof receipt!=="object")return "PENDING";
  const status=String(receipt.statusName??receipt.status??"").toUpperCase();
  const name=String(receipt.txExecutionResultName??receipt.executionResult??"").toUpperCase();
  if(/CANCEL|REVERT|FAIL|ERROR/.test(status))return "FAILED";
  if(status!=="FINALIZED")return "PENDING";
  const codeValue=receipt.txExecutionResult;
  const code=typeof codeValue==="number" || typeof codeValue==="string" && /^\d+$/.test(codeValue)
    ? Number(codeValue):NaN;
  const knownSuccess=/FINISHED_WITH_RETURN|SUCCESS/.test(name);
  const knownFailure=/FINISHED_WITH_ERROR|TIMEOUT|NONDET_DISAGREE|DETERMINISTIC_VIOLATION|FAIL|ERROR|REVERT/.test(name);
  const numericSuccess=code===1;
  const numericFailure=[2,3,4,5].includes(code);
  // If a backend returns contradicting execution fields, do not invent success.
  if((knownSuccess && numericFailure)||(knownFailure && numericSuccess))return "FINALIZED_UNVERIFIED";
  if(knownFailure||numericFailure)return "FAILED";
  if(knownSuccess||numericSuccess)return "FINALIZED";
  // Finalization is confirmed, but execution is not. Keep the transaction
  // locked while inspecting a second read-only RPC source.
  return "FINALIZED_UNVERIFIED";
}

/** A later on-chain Work state confirms a stage advanced, not which receipt succeeded. */
export function workConfirmsPriorStage(entry,work) {
  if(!entry || !work || work.contract_version!=="3.0.0" ||
     String(entry.workId||"")!==String(work.id||""))return false;
  if(entry.method==="submit_for_review")
    return ["SUBMITTED","REVIEW","ACCEPTED","CERTIFIED"].includes(work.state);
  if(entry.method==="evaluate")
    // REVIEW -> REVIEW cannot prove that another evaluate completed.
    return ["ACCEPTED","CERTIFIED"].includes(work.state)
      || work.state==="REVIEW" && entry.fromState==="SUBMITTED";
  if(entry.method==="issue_acceptance")return work.state==="CERTIFIED";
  return false;
}

/** Prevent duplicate submissions of the same unresolved step.
 * The next DISTINCT step is allowed only after the UI separately checks
 * the finalized contract state and validates the selected signing wallet.
 */
// A prior Create Work with an unverified receipt must block another Create
// for the SAME GitHub PR, not every unrelated future contribution forever.
// Missing source identity fails closed: never infer that a duplicate is safe.
export function unresolvedTransactionBlocks(records,method,workId,createContext=null) {
 if(!Array.isArray(records))return false;
 return records.some(entry=>{
  if(!entry || entry.method==="recovered transaction")return false;
  if(entry.method==="create_work"){
   if(method!=="create_work" ||
     !["PENDING","FINALIZED · EXECUTION UNVERIFIED","FINALIZED · ID UNKNOWN","FINALIZED · VERIFY ID"].includes(entry.status))return false;
   if(!createContext || !entry.owner || !entry.repository ||
      !/^[1-9][0-9]*$/.test(String(entry.pr||"")) ||
      !createContext.owner || !createContext.repository ||
      !/^[1-9][0-9]*$/.test(String(createContext.pr||"")))return true;
   return entry.owner.toLowerCase()===String(createContext.owner).toLowerCase() &&
     entry.repository.toLowerCase()===String(createContext.repository).toLowerCase() &&
     String(entry.pr)===String(createContext.pr);
  }
  if(entry.method!==method ||
     !["PENDING","FINALIZED · EXECUTION UNVERIFIED"].includes(entry.status))return false;
  return Boolean(entry.workId && String(entry.workId)===String(workId));
 });
}
