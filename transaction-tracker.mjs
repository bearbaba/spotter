import { finalizedReceipt, createdWorkId } from "./proofgate-core.mjs";

const HASH = /^0x[0-9a-fA-F]{64}$/;
const CHECKABLE = new Set([
  "PENDING",
  "WORK STATE VERIFIED ON-CHAIN (RECEIPT NOT CHECKED)",
  "WORK VERIFIED ON-CHAIN",
  "ON-CHAIN VERIFIED",
  "UNVERIFIED LOCAL HISTORY",
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
  const outcome = finalizedReceipt(receipt);
  if (outcome === "PENDING") return null;
  const audit = {
    receiptStatus: String(receipt?.statusName ?? receipt?.status ?? ""),
    executionResult: String(receipt?.txExecutionResultName ?? receipt?.executionResult ?? ""),
  };
  if (outcome === "FAILED") return { status: "FAILED (GENVM)", ...audit };
  if (entry.method === "create_work") {
    // Receipt is successful, but its output is not necessarily a verified Work ID.
    const id = createdWorkId(receipt);
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
