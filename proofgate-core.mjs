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
