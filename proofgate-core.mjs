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
export function finalizedReceipt(receipt) {
  const status=String(receipt?.statusName??receipt?.status??"").toUpperCase();
  const execution=String(receipt?.txExecutionResultName??receipt?.executionResult??"").toUpperCase();
  // Consensus finality alone is not proof that contract execution succeeded.
  if(/CANCEL|REVERT|FAIL|ERROR/.test(status))return "FAILED";
  if(status!=="FINALIZED")return "PENDING";
  if(/FINISHED_WITH_ERROR|TIMEOUT|NONDET_DISAGREE|DETERMINISTIC_VIOLATION|FAIL|ERROR|REVERT/.test(execution))return "FAILED";
  if(/FINISHED_WITH_RETURN|SUCCESS/.test(execution))return "FINALIZED";
  // Missing or unfamiliar execution results must be investigated, never marked successful.
  return "PENDING";
}

/** Prevent duplicate submissions without freezing unrelated work. */
export function unresolvedTransactionBlocks(records, method, workId) {
  if(!Array.isArray(records))return false;
  return records.some(entry=>{
    if(!entry || entry.method==="recovered transaction")return false;
    if(entry.method==="create_work"){
      // Even after a successful create receipt, do not recreate while its Work ID
      // is unknown or awaiting independent contract readback.
      const outstanding=["PENDING","FINALIZED · ID UNKNOWN","FINALIZED · VERIFY ID","WORK VERIFIED ON-CHAIN","ON-CHAIN VERIFIED"];
      return method==="create_work" && outstanding.includes(entry.status);
    }
    if(entry.status!=="PENDING" || method==="create_work")return false;
    return Boolean(entry.workId && String(entry.workId)===String(workId));
  });
}
