import test from "node:test";
import assert from "node:assert/strict";
import {parseGitHubPullUrl,parseWork,transactionHash,workActionAllowed,workConfirmsPriorStage,unresolvedTransactionBlocks,finalizedReceipt,createdWorkId} from "../proofgate-core.mjs";
import {receiptResolution,getVerifiedReceipt,compactHistory} from "../transaction-tracker.mjs";
import {isStudionetChainId} from "../wallet-network.mjs";
const hash=c=>"0x"+c.repeat(64);
const work=(state,id="3")=>({contract_version:"3.0.0",id,state});
const tx=(method,status="PENDING")=>({hash:hash("a"),method,workId:"3",status,fromState:"SUBMITTED"});

test("create Work locks a canonical GitHub PR URL on the correct network",()=>{
 assert.deepEqual(parseGitHubPullUrl("https://github.com/bearbaba/spotter/pull/32"),{owner:"bearbaba",repository:"spotter",number:"32"});
 for(const url of ["http://github.com/o/r/pull/2","https://github.com.attacker.invalid/o/r/pull/2","https://github.com/o/r/issues/2","https://github.com/o/r/pull/0"])assert.equal(parseGitHubPullUrl(url),null,url);
 assert.equal(isStudionetChainId("0xf22f"),true);
 assert.equal(isStudionetChainId("0x1"),false);
});
test("OPEN → SUBMITTED allows contributor submission before merge",()=>{
 assert.equal(workActionAllowed("submit_for_review","OPEN"),true);
 assert.equal(workActionAllowed("evaluate","OPEN"),false);
 assert.equal(workActionAllowed("issue_acceptance","OPEN"),false);
 assert.equal(parseWork(JSON.stringify(work("OPEN"))).state,"OPEN");
 assert.equal(workActionAllowed("submit_for_review","SUBMITTED"),false);
 assert.equal(workActionAllowed("evaluate","SUBMITTED"),true);
 assert.equal(workConfirmsPriorStage(tx("submit_for_review"),work("SUBMITTED")),true);
});
test("REVIEW is not ACCEPTED; unchanged REVIEW cannot prove retry complete",()=>{
 assert.equal(workActionAllowed("evaluate","REVIEW"),true);
 assert.equal(workActionAllowed("issue_acceptance","REVIEW"),false);
 assert.equal(workConfirmsPriorStage({...tx("evaluate"),fromState:"REVIEW"},work("REVIEW")),false);
 assert.equal(workConfirmsPriorStage(tx("evaluate"),work("REVIEW")),true);
});
test("certificate is allowed only for ACCEPTED and cannot be repeated",()=>{
 assert.equal(workActionAllowed("issue_acceptance","ACCEPTED"),true);
 assert.equal(workActionAllowed("issue_acceptance","CERTIFIED"),false);
 assert.equal(workConfirmsPriorStage(tx("issue_acceptance"),work("CERTIFIED")),true);
 assert.equal(workConfirmsPriorStage(tx("issue_acceptance"),work("ACCEPTED")),false);
});
test("cross-Work or earlier contract readback never settles unrelated receipt",()=>{
 assert.equal(workConfirmsPriorStage(tx("evaluate"),work("ACCEPTED","2")),false);
 assert.equal(workConfirmsPriorStage(tx("evaluate"),{...work("ACCEPTED"),contract_version:"2.0.0"}),false);
 assert.equal(workConfirmsPriorStage(tx("evaluate"),work("ACCEPTED")),true);
});
test("FINALIZED without verified GenVM result is never success",()=>{
 const base={statusName:"FINALIZED"};
 assert.equal(finalizedReceipt(base),"FINALIZED_UNVERIFIED");
 assert.equal(finalizedReceipt({...base,txExecutionResultName:"NOT_DECIDED"}),"FINALIZED_UNVERIFIED");
 assert.equal(finalizedReceipt({...base,txExecutionResult:1}),"FINALIZED");
 for(const code of [2,3,4,5])assert.equal(finalizedReceipt({...base,txExecutionResult:code}),"FAILED");
 assert.equal(finalizedReceipt({...base,txExecutionResult:1,txExecutionResultName:"FINISHED_WITH_ERROR"}),"FINALIZED_UNVERIFIED");
});
test("foreign receipt hash cannot certify this transaction",()=>{
 const entry=tx("evaluate");
 const receipt={id:entry.hash,statusName:"FINALIZED",txExecutionResult:1};
 assert.equal(receiptResolution(entry,receipt).status,"FINALIZED (RECEIPT VERIFIED)");
 assert.equal(receiptResolution(entry,{...receipt,id:hash("b")}),null);
 assert.equal(transactionHash({txId:entry.hash}),entry.hash);
 assert.equal(transactionHash({txId:"bad"}),"");
});
test("new work receipt requires independently read-back Work ID",()=>{
 const entry={...tx("create_work"),workId:""};
 const receipt={id:entry.hash,statusName:"FINALIZED",txExecutionResult:1,returnValue:"3"};
 assert.equal(createdWorkId(receipt),"3");
 assert.equal(receiptResolution(entry,receipt).status,"FINALIZED · VERIFY ID");
 assert.equal(unresolvedTransactionBlocks([{...entry,status:"FINALIZED · VERIFY ID"}],"create_work",""),true);
});
test("pending result blocks identical re-signing, not next distinct stage",()=>{
 const entry=tx("evaluate","FINALIZED · EXECUTION UNVERIFIED");
 assert.equal(unresolvedTransactionBlocks([entry],"evaluate","3"),true);
 assert.equal(unresolvedTransactionBlocks([entry],"issue_acceptance","3"),false);
 assert.equal(unresolvedTransactionBlocks([entry],"evaluate","2"),false);
});
test("RPC errors and signer mismatches cannot invent successful execution",async()=>{
 const entry={...tx("evaluate"),account:"0x"+"a".repeat(40),contract:"0x"+"b".repeat(40)};
 const sdk={id:entry.hash,statusName:"FINALIZED",txExecutionResultName:"NOT_DECIDED"};
 const missing=await getVerifiedReceipt(async()=>sdk,async()=>{throw Error("network timeout")},"rpc",entry);
 assert.equal(missing,sdk);
 const forged=await getVerifiedReceipt(async()=>sdk,async()=>({ok:true,json:async()=>({result:{id:entry.hash,statusName:"FINALIZED",txExecutionResult:1,sender:"0x"+"f".repeat(40),recipient:entry.contract}})}),"rpc",entry);
 assert.equal(forged,sdk);
 assert.equal(finalizedReceipt(forged),"FINALIZED_UNVERIFIED");
});
test("old unverified hash remains findable after compacting history",()=>{
 const list=Array.from({length:125},(_,i)=>({hash:"0x"+(i+1).toString(16).padStart(64,"0"),status:"FINALIZED (RECEIPT VERIFIED)",created:i}));
 const unresolved={hash:hash("f"),status:"FINALIZED · EXECUTION UNVERIFIED",created:-1};
 const result=compactHistory([...list,unresolved],50);
 assert.equal(result.length,51);
 assert.ok(result.some(item=>item.hash===unresolved.hash));
});
