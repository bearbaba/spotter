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
  if(/FAIL|ERROR|CANCEL|REVERT/.test(status+" "+execution))return "FAILED";
  if(status==="FINALIZED" && (!execution || /SUCCESS|FINISHED_WITH_RETURN|ACCEPTED/.test(execution)))return "FINALIZED";
  return "PENDING";
}
