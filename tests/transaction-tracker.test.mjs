import test from "node:test";
import assert from "node:assert/strict";
import {outstandingReceipts,receiptResolution,verifyStoredReceipts,compactHistory} from "../transaction-tracker.mjs";
import {unresolvedTransactionBlocks} from "../proofgate-core.mjs";
const hash=n=>"0x"+n.repeat(64);
const receipt=(name,outcome,txId)=>({statusName:name,txExecutionResultName:outcome,txId});

test("receipt queue excludes completed, invalid and duplicate hashes",()=>{
 const entries=[
  {hash:hash("a"),status:"PENDING"},
  {hash:hash("a").toUpperCase().replace("0X","0x"),status:"PENDING"},
  {hash:hash("b"),status:"FINALIZED (RECEIPT VERIFIED)"},
  {hash:hash("c"),status:"WORK STATE VERIFIED ON-CHAIN (RECEIPT NOT CHECKED)"},
  {hash:"bad",status:"PENDING"},
 ];
 assert.deepEqual(outstandingReceipts(entries).map(x=>x.hash),[hash("a"),hash("c")]);
});

test("read-only batch verifies success and failure without mistaking RPC failure for execution failure",async()=>{
 const a=hash("a"),b=hash("b"),c=hash("c");
 let calls=[];
 const getter=async id=>{
  calls.push(id);
  if(id===c)throw Error("temporary RPC outage");
  return id===a?receipt("FINALIZED","FINISHED_WITH_RETURN",a):receipt("FINALIZED","FINISHED_WITH_ERROR",b);
 };
 const entries=[a,b,c].map(x=>({hash:x,status:"PENDING",method:"evaluate",workId:"3"}));
 const batch=await verifyStoredReceipts(entries,getter,{limit:3});
 assert.deepEqual(calls,[a,b,c]);
 assert.equal(batch.inspected[0].update.status,"FINALIZED (RECEIPT VERIFIED)");
 assert.equal(batch.inspected[1].update.status,"FAILED (GENVM)");
 assert.equal(batch.inspected[2].update,null);
 assert.equal(batch.inspected[2].error,"RPC_UNAVAILABLE");
});

test("pending and unfamiliar finalized execution never claim success",()=>{
 const entry={hash:hash("d"),method:"evaluate"};
 assert.equal(receiptResolution(entry,receipt("PENDING","NOT_VOTED",entry.hash)),null);
 assert.equal(receiptResolution(entry,receipt("FINALIZED","UNRECOGNIZED",entry.hash)),null);
 assert.equal(receiptResolution(entry,receipt("FINALIZED","FINISHED_WITH_RETURN",hash("e"))),null);
});

test("create receipt remains locked until contract readback independently confirms ID",()=>{
 const entry={hash:hash("f"),method:"create_work"};
 const ok=receipt("FINALIZED","FINISHED_WITH_RETURN",entry.hash);
 assert.equal(receiptResolution(entry,ok).status,"FINALIZED · ID UNKNOWN");
 const withCandidate=receiptResolution({...entry,candidateWorkId:"3"},ok);
 assert.equal(withCandidate.status,"FINALIZED · VERIFY ID");
 assert.equal(withCandidate.candidateWorkId,"3");
 assert.equal(unresolvedTransactionBlocks([{...entry,status:"FINALIZED · VERIFY ID"}],"create_work",""),true);
 assert.equal(unresolvedTransactionBlocks([{...entry,status:"FINALIZED · ID UNKNOWN"}],"create_work",""),true);
 assert.equal(unresolvedTransactionBlocks([{...entry,status:"PENDING"}],"evaluate","3"),false);
 assert.equal(unresolvedTransactionBlocks([{...entry,status:"PENDING"}],"create_work",""),true);
});

test("batch is bounded and rotates for larger browser histories",async()=>{
 const entries="abcde".split("").map(x=>({hash:hash(x),status:"PENDING",method:"evaluate"}));
 const calls=[];
 await verifyStoredReceipts(entries,async id=>{calls.push(id);return receipt("ACCEPTED","NOT_VOTED",id);},{limit:2,offset:4});
 assert.deepEqual(calls,[hash("e"),hash("a")]);
});

test("unverified imported transactions are checked without wallet signatures",async()=>{
 const record={hash:hash("a"),method:"recovered transaction",status:"UNVERIFIED"};
 assert.equal(outstandingReceipts([record]).length,1);
 const resolved=await verifyStoredReceipts([record],async()=>receipt("FINALIZED","FINISHED_WITH_RETURN",record.hash));
 assert.equal(resolved.inspected[0].update.status,"FINALIZED (RECEIPT VERIFIED)");
});

test("history compaction never evicts a pending hash when 150 completed records exist",()=>{
 const old={hash:hash("a"),created:1,method:"evaluate",workId:"3",status:"PENDING"};
 const done=Array.from({length:150},(_,i)=>({
  hash:"0x"+i.toString(16).padStart(64,"0"),
  created:150-i+2,status:"FINALIZED (RECEIPT VERIFIED)"
 }));
 const compacted=compactHistory([...done,old]);
 assert.equal(compacted.length,101);
 assert.ok(compacted.some(x=>x.hash===old.hash && x.status==="PENDING"));
 assert.equal(compacted.filter(x=>x.status==="FINALIZED (RECEIPT VERIFIED)").length,100);
});

test("verified Work readback may release create guard without claiming receipt success",()=>{
 const entry={hash:hash("a"),method:"create_work",status:"WORK VERIFIED ON-CHAIN"};
 assert.equal(unresolvedTransactionBlocks([entry],"create_work",""),false);
 assert.equal(unresolvedTransactionBlocks([{...entry,status:"ON-CHAIN VERIFIED"}],"create_work",""),false);
 assert.equal(unresolvedTransactionBlocks([{...entry,status:"FINALIZED · VERIFY ID"}],"create_work",""),true);
});
