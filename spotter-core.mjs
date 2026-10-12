/* Pure helpers: no wallet, network requests, or browser globals. */
export function parseJobId(raw) {
  if (typeof raw !== "string" && typeof raw !== "number") return "";
  const value = String(raw).trim().replace(/^"(.*)"$/, "$1");
  if (!/^[1-9][0-9]*$/.test(value)) return "";
  return value;
}

export function transactionHash(tx) {
  const value = typeof tx === "string" ? tx : (tx?.hash ?? tx?.txId ?? tx?.id);
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value) ? value : "";
}

/* Only visit named result fields; never mistake an unrelated receipt number for a job ID. */
export function jobIdFromReceipt(receipt) {
  const seen = new Set();
  function visit(value, depth = 0) {
    if (depth > 5 || value == null) return "";
    if (typeof value === "number") return parseJobId(value);
    if (typeof value === "string") {
      const id = parseJobId(value);
      if (id) return id;
      if (/^\s*[\[{"']/.test(value)) {
        try { return visit(JSON.parse(value), depth + 1); } catch { /* non-JSON return */ }
      }
      return "";
    }
    if (typeof value !== "object" || seen.has(value)) return "";
    seen.add(value);
    const fields = ["returnValue", "return_value", "returnData", "result", "output", "value",
      "decoded", "executionResult", "txExecutionResult", "receipt", "transaction", "data"];
    for (const key of fields) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const id = visit(value[key], depth + 1);
        if (id) return id;
      }
    }
    return "";
  }
  return visit(receipt);
}

export function receiptError(receipt) {
  if (!receipt || typeof receipt !== "object") return "";
  const status = String(receipt.statusName ?? receipt.status ?? "").toUpperCase();
  const execution = String(receipt.txExecutionResultName ?? "").toUpperCase();
  if (/FAILED|FAILURE|ERROR|REVERT|CANCEL/.test(status + " " + execution)) {
    return [status, execution].filter(Boolean).join(" / ");
  }
  return "";
}

export function parseJobResult(raw) {
  const job = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!job || typeof job !== "object" || Array.isArray(job)) {
    throw new Error("Unexpected contract response.");
  }
  return job;
}

export function publicUrl(raw) {
  const value = String(raw ?? "").trim();
  if (!value || value.length > 300) throw new Error("Enter a URL of at most 300 characters.");
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("Enter a valid absolute URL."); }
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("Use a public http(s) URL without embedded credentials.");
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host === "::1" || host === "0.0.0.0" || /^127\./.test(host) ||
      /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) {
    throw new Error("The URL must point to a public website.");
  }
  return value;
}

export function settledStatus(status) {
  return ["HIT", "MISS", "DEAD"].includes(String(status ?? "").toUpperCase());
}

/* Verified against genlayer-js v0.18.0 Studionet ABI: event NewTransaction(bytes32 indexed txId, address indexed recipient, address indexed activator). */
export const NEW_TRANSACTION_TOPIC = "0xdab9102861c7483a187584d6371d88316f005af507982ccf95c110879f3ed5a5";

export function genLayerTxIdFromEthereumReceipt(receipt, consensusAddress) {
  if (!receipt || typeof receipt !== "object") return "";
  const status = String(receipt.status ?? "").toLowerCase();
  if (status === "0x0" || status === "0" || status === "reverted") {
    throw new Error("Wallet transaction reverted before GenLayer accepted it.");
  }
  if (!consensusAddress || !/^0x[0-9a-fA-F]{40}$/.test(consensusAddress)) {
    throw new Error("Missing trusted Studionet consensus contract address.");
  }
  for (const log of receipt.logs ?? []) {
    if (String(log.address ?? "").toLowerCase() !== consensusAddress.toLowerCase()) continue;
    if (String(log.topics?.[0] ?? "").toLowerCase() !== NEW_TRANSACTION_TOPIC) continue;
    const txId = transactionHash(log.topics?.[1]);
    if (txId) return txId;
  }
  return "";
}
