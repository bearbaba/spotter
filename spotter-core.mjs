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
  const execution = String(receipt.txExecutionResultName ?? receipt.resultName ?? receipt.result_name ?? "").toUpperCase();
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

/** Only accept a fallback if the finalized contract state independently proves the expected action.
 * Do not treat an EVM receipt with missing NewTransaction logs as a successful GenLayer execution.
 */
export function independentlyVerifiedAction(pending, job, wallet) {
  if (!pending || !job || typeof job !== "object" || !parseJobId(job.id)) return false;
  const equals = (a,b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
  if (!equals(pending.wallet, wallet)) return false;
  if (pending.fn === "open_job") {
    const previous = parseJobId(pending.previousJobId);
    if (previous && BigInt(job.id) <= BigInt(previous)) return false;
    return equals(job.poster, wallet) && job.question === pending.question && job.rubric === pending.rubric;
  }
  if (parseJobId(pending.jobId) !== parseJobId(job.id)) return false;
  if (pending.fn === "submit_url") {
    return equals(job.hunter, wallet) && job.url === pending.url &&
      (job.status === "SUBMITTED" || settledStatus(job.status)) &&
      (pending.baselineStatus === "OPEN" || pending.baselineUrl !== pending.url);
  }
  if (pending.fn === "judge") {
    const roundBefore = Number(pending.baselineRound);
    const roundAfter = Number(job.round_no);
    return Number.isSafeInteger(roundBefore) && Number.isSafeInteger(roundAfter) &&
      roundAfter > roundBefore &&
      (settledStatus(job.status) || (job.status === "SUBMITTED" && job.fail_kind === "PARSE"));
  }
  return false;
}

/** Read-only Studio transaction classification. Never infer a Job ID from an unrelated numeric field. */
export function classifyStudioTransaction(tx, expectedHash, owner, contract) {
  if (!tx || typeof tx !== "object" || Array.isArray(tx)) return { kind: "missing" };
  const expected = transactionHash(expectedHash);
  if (!expected) return { kind: "invalid", reason: "Invalid transaction hash" };
  const returnedHash = transactionHash(tx.hash ?? tx.txId);
  if (returnedHash && returnedHash.toLowerCase() !== expected.toLowerCase()) {
    return { kind: "invalid", reason: "RPC returned a different transaction hash" };
  }
  const from = tx.sender ?? tx.from_address ?? tx.from;
  const to = tx.recipient ?? tx.to_address ?? tx.to;
  if (typeof from === "string" && owner && from.toLowerCase() !== owner.toLowerCase()) {
    return { kind: "invalid", reason: "Transaction sender does not match saved wallet" };
  }
  // MetaMask-signed GenLayer writes can target Studionet's consensus gateway
  // rather than the Intelligent Contract itself. That is NOT evidence of
  // a different contract call. Retain strict rejection for unrelated addresses;
  // subsequent action-specific finalized state checks remain mandatory.
  const studioConsensusGateway = "0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575";
  if (typeof to === "string" && contract &&
      to.toLowerCase() !== contract.toLowerCase() &&
      to.toLowerCase() !== studioConsensusGateway.toLowerCase()) {
    return { kind: "invalid", reason: "Transaction recipient is not Spotter or the known Studionet consensus gateway" };
  }
  const status = String(tx.statusName ?? (typeof tx.status === "string" ? tx.status : "")).toUpperCase();
  const execution = String(tx.txExecutionResultName ?? tx.resultName ?? (typeof tx.executionResult === "string" ? tx.executionResult : "")).toUpperCase();
  if (status === "FINALIZED" || status === "ACCEPTED") {
    if (execution === "SUCCESS") return { kind: "confirmed", status, execution };
    if (execution === "FAILURE" || execution === "ERROR") return { kind: "failed", status, execution };
    return { kind: "status-only", status, execution };
  }
  if (status) return { kind: "pending", status, execution };
  return { kind: "unknown" };
}

/** Inspect a single exact Studio hash. A consensus AGREE is not a GenVM SUCCESS. */
export function studioHashInspection(tx, expectedHash, contract) {
  const basic = classifyStudioTransaction(tx, expectedHash, null, contract);
  const raw = tx && typeof tx === "object" ? tx : {};
  const leaders = raw.consensus_data?.leader_receipt;
  const leader = Array.isArray(leaders) ? leaders[0] : leaders;
  const output = leader && typeof leader === "object" ? leader.result : undefined;
  const executionStatus = String(output?.status ?? leader?.execution_result ?? "").toLowerCase();
  const final = basic.status === "FINALIZED" || basic.status === "ACCEPTED";
  const isReturn = executionStatus === "return" || executionStatus === "success";
  const isError = ["rollback","contract_error","error","revert","failed"].includes(executionStatus);
  const outcome = basic.kind === "invalid" ? "invalid"
    : basic.kind === "failed" || isError ? "failed"
    : final && (basic.kind === "confirmed" || isReturn) ? "confirmed"
    : final ? "final-status-only" : basic.kind;
  return {
    outcome, status: basic.status || "UNKNOWN",
    consensus: String(raw.resultName ?? "").toUpperCase() || "UNKNOWN",
    execution: executionStatus || basic.execution || "UNKNOWN",
    reason: basic.reason || "",
  };
}

/** Extract only explicit open_job return fields, not receipt status, nonce or arbitrary numbers. */
export function exactJobIdFromStudioTransaction(tx) {
  if (!tx || typeof tx !== "object") return "";
  const candidates = [tx.returnValue, tx.return_value];
  const receipt = tx.consensus_data?.leader_receipt;
  const leaders = Array.isArray(receipt) ? receipt : receipt ? [receipt] : [];
  for (const leader of leaders) {
    if (!leader || typeof leader !== "object") continue;
    const result = leader.result;
    if (result && typeof result === "object" && String(result.status ?? "").toLowerCase() === "return") {
      candidates.push(result.payload?.readable, result.payload?.value, result.payload);
    }
  }
  for (const value of candidates) {
    const id = parseJobId(value);
    if (id) return id;
    if (typeof value === "string") {
      const quoted = value.trim();
      if (/^['"][1-9][0-9]*['"]$/.test(quoted)) return quoted.slice(1,-1);
    }
  }
  return "";
}
