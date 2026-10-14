import { finalizedReceipt, createdWorkId } from "./proofgate-core.mjs";

const HASH = /^0x[0-9a-fA-F]{64}$/;
const CHECKABLE = new Set([
  "PENDING",
  "FINALIZED · EXECUTION UNVERIFIED",
  "WORK STATE VERIFIED ON-CHAIN (RECEIPT NOT CHECKED)",
  "WORK VERIFIED ON-CHAIN",
  "ON-CHAIN VERIFIED",
  "UNVERIFIED LOCAL HISTORY",
  "UNVERIFIED",
  "FINALIZED · VERIFY ID",
]);

// Browser history is a hint, never proof. Only hashes with unresolved receipts are polled.
export function outstandingReceipts(records) {
  if (!Array.isArray(records)) return [];
  const seen = new Set();
  return records.filter(entry => {
    if (!entry || !HASH.test(entry.hash || "") || !CHECKABLE.has(entry.status)) return false;
    const key = entry.hash.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function receiptResolution(entry, receipt) {
  const identity = receipt?.hash ?? receipt?.txId ?? receipt?.id;
  if(identity && String(identity).toLowerCase()!==String(entry.hash).toLowerCase())return null;
  const outcome = finalizedReceipt(receipt);
  if (outcome === "PENDING") return null;
  const audit = {
    receiptStatus: String(receipt?.statusName ?? receipt?.status ?? ""),
    executionResult: String(receipt?.txExecutionResultName ?? receipt?.executionResult ?? receipt?.txExecutionResult ?? ""),
  };
  if(outcome==="FINALIZED_UNVERIFIED")return {status:"FINALIZED · EXECUTION UNVERIFIED",...audit};
  if (outcome === "FAILED") return { status: "FAILED (GENVM)", ...audit };
  if (entry.method === "create_work") {
    // Receipt is successful, but its output is not necessarily a verified Work ID.
    const id = entry.candidateWorkId || createdWorkId(receipt);
    return { status: id ? "FINALIZED · VERIFY ID" : "FINALIZED · ID UNKNOWN",
      ...(id ? {candidateWorkId:id} : {}), ...audit };
  }
  return { status: "FINALIZED (RECEIPT VERIFIED)", ...audit };
}

// Read-only, rate-bounded and deterministic. No wallet/provider write calls.
export async function verifyStoredReceipts(records, getTransaction, { limit = 3, offset = 0 } = {}) {
  const outstanding = outstandingReceipts(records);
  if (!outstanding.length) return { inspected: [], remaining: 0 };
  const safeLimit = Math.max(1, Math.min(5, Number(limit) || 3));
  const start = Math.abs(Number(offset) || 0) % outstanding.length;
  const selected = Array.from({length:Math.min(safeLimit,outstanding.length)}, (_,i)=>outstanding[(start+i)%outstanding.length]);
  const inspected = [];
  for (const entry of selected) {
    try {
      const receipt = await getTransaction(entry.hash);
      inspected.push({ hash: entry.hash, update: receiptResolution(entry,receipt), error: null });
    } catch {
      inspected.push({hash:entry.hash, update:null, error:"RPC_UNAVAILABLE"});
    }
  }
  return {inspected, remaining:outstanding.length};
}

/**
 * Retain every unresolved receipt and the newest bounded number of completed
 * records; never silently drop a pending hash when the history becomes large.
 */
export function compactHistory(records, completedLimit=100){
  if(!Array.isArray(records))return [];
  const found=new Set(),valid=[];
  for(const entry of records){
    if(!entry || !HASH.test(entry.hash||""))continue;
    const hash=entry.hash.toLowerCase();
    if(found.has(hash))continue;
    found.add(hash);
    valid.push(entry);
  }
  const unresolved=valid.filter(entry=>CHECKABLE.has(entry.status)||entry.status==="FINALIZED · ID UNKNOWN");
  const resolved=valid.filter(entry=>!CHECKABLE.has(entry.status)&&entry.status!=="FINALIZED · ID UNKNOWN");
  const limit=Math.max(0,Math.min(1000,Number(completedLimit)||0));
  return [...unresolved,...resolved.slice(0,limit)].sort((a,b)=>(Number(b.created)||0)-(Number(a.created)||0));
}

/**
 * Read the SDK view, then use GenLayer's documented raw receipt RPC only when
 * it cannot establish the GenVM execution outcome. The second read is strictly
 * read-only; it never causes a wallet signature or overwrites a known failure.
 */
export async function getVerifiedReceipt(getSdkTransaction, fetchRpc, endpoint, entry){
  const hash=entry?.hash;
  if(!HASH.test(hash||""))throw Error("Invalid transaction hash");
  let sdk;
  try{sdk=await getSdkTransaction(hash);}catch{/* A raw read may still work. */}
  if(sdk && finalizedReceipt(sdk)!=="FINALIZED_UNVERIFIED" && finalizedReceipt(sdk)!=="PENDING")
    return sdk;
  if(sdk && finalizedReceipt(sdk)==="PENDING" &&
    String(sdk.statusName??sdk.status??"").toUpperCase()!=="FINALIZED")return sdk;
  // RPC response has a separate JSON-RPC request ID; match the returned tx ID.
  // A missing tx ID / mismatched signer / recipient must never settle history.
  if(typeof fetchRpc!=="function")return sdk;
  try{
    const response=await fetchRpc(endpoint,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({jsonrpc:"2.0",id:1,method:"gen_getTransactionReceipt",params:[{txId:hash}]}),
      cache:"no-store"
    });
    if(!response?.ok)return sdk;
    const raw=await response.json();
    if(raw?.error || !raw?.result || typeof raw.result!=="object")return sdk;
    const receipt=raw.result;
    if(String(receipt.id??receipt.txId??receipt.hash??"").toLowerCase()!==hash.toLowerCase())return sdk;
    if(entry.account && receipt.sender && String(entry.account).toLowerCase()!==String(receipt.sender).toLowerCase())return sdk;
    if(entry.contract && receipt.recipient && String(entry.contract).toLowerCase()!==String(receipt.recipient).toLowerCase())return sdk;
    // Preserve SDK terminal failure if any. Accept raw receipt only if it
    // contains enough information to resolve an otherwise incomplete view.
    return finalizedReceipt(receipt)==="PENDING" && sdk ? sdk : receipt;
  }catch{return sdk;}
}
