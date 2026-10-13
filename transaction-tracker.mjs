import { finalizedReceipt, createdWorkId } from "./proofgate-core.mjs";

const HASH = /^0x[0-9a-fA-F]{64}$/;
const CHECKABLE = new Set([
  "PENDING",
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
    executionResult: String(receipt?.txExecutionResultName ?? receipt?.executionResult ?? ""),
  };
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
