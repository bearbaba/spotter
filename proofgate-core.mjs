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
  const code=typeof codeValue==="number" || typeof codeValue==="string" && /^\\d+$/.test(codeValue)
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

/** Prevent duplicate submissions without freezing unrelated work. */
export function unresolvedTransactionBlocks(records, method, workId) {
  if(!Array.isArray(records))return false;
  return records.some(entry=>{
    if(!entry || entry.method==="recovered transaction")return false;
    if(entry.method==="create_work"){
      // Even after a successful create receipt, do not recreate while its Work ID
      // is unknown or awaiting independent contract readback.
      const outstanding=["PENDING","FINALIZED · EXECUTION UNVERIFIED","FINALIZED · ID UNKNOWN","FINALIZED · VERIFY ID"];
      return method==="create_work" && outstanding.includes(entry.status);
    }
    if(!["PENDING","FINALIZED · EXECUTION UNVERIFIED"].includes(entry.status) || method==="create_work")return false;
    return Boolean(entry.workId && String(entry.workId)===String(workId));
  });
}
