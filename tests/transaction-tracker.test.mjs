import test from "node:test";
import assert from "node:assert/strict";
import {outstandingReceipts,receiptResolution,verifyStoredReceipts,compactHistory,getVerifiedReceipt} from "../transaction-tracker.mjs";
import {unresolvedTransactionBlocks,workConfirmsPriorStage} from "../proofgate-core.mjs";
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
 assert.equal(receiptResolution(entry,receipt("FINALIZED","UNRECOGNIZED",entry.hash)).status,"FINALIZED · EXECUTION UNVERIFIED");
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

const clientHash="0x83c361db8590599f2bb833ec2772785700a7de7b5603b9ae4e1ea23229a91b33";
const contract="0xD57aE10754C44223ABf3bA04a43AC2023d92aBE7";
const ownerWallet="0x4C7cb73aC8F8999af21cfc9fF4cF2333a9508Dcb";
const item={hash:clientHash,method:"evaluate",workId:"3",account:ownerWallet,contract,status:"PENDING"};

test("Work #3 regression: finalized SDK receipt lacking execution uses verified raw RPC result",async()=>{
 let requested;
 const result=await getVerifiedReceipt(
   async id=>({id,statusName:"FINALIZED",txExecutionResultName:"NOT_DECIDED"}),
   async (endpoint,options)=>{
     assert.equal(endpoint,"https://studio.genlayer.com/api");
     requested=JSON.parse(options.body);
     return {ok:true,json:async()=>({jsonrpc:"2.0",id:1,result:{
       id:clientHash,statusName:"Finalized",txExecutionResult:1,
       recipient:contract,sender:ownerWallet
     }})};
   },
   "https://studio.genlayer.com/api",item
 );
 assert.equal(requested.method,"gen_getTransactionReceipt");
 assert.deepEqual(requested.params,[{txId:clientHash}]);
 assert.equal(receiptResolution(item,result).status,"FINALIZED (RECEIPT VERIFIED)");
});

test("raw RPC cannot resolve different hash, signer, contract, or unsuccessful execution",async()=>{
 for(const bad of [
   {id:hash("b"),sender:ownerWallet,recipient:contract},
   {id:clientHash,sender:"0x"+"f".repeat(40),recipient:contract},
   {id:clientHash,sender:ownerWallet,recipient:"0x"+"a".repeat(40)},
 ]){
  const sdk={id:clientHash,statusName:"FINALIZED",txExecutionResultName:"NOT_DECIDED"};
  const found=await getVerifiedReceipt(async()=>sdk,async()=>({ok:true,json:async()=>({result:{...bad,statusName:"Finalized",txExecutionResult:1}})}),"rpc",item);
  assert.equal(found,sdk);
  assert.equal(receiptResolution(item,found).status,"FINALIZED · EXECUTION UNVERIFIED");
 }
 const fail=await getVerifiedReceipt(async()=>({id:clientHash,statusName:"FINALIZED",txExecutionResultName:"NOT_DECIDED"}),
  async()=>({ok:true,json:async()=>({result:{id:clientHash,statusName:"Finalized",txExecutionResult:2}})}),"rpc",item);
 assert.equal(receiptResolution(item,fail).status,"FAILED (GENVM)");
});

test("unverified finalized receipt stays in history and blocks duplicate evaluate",()=>{
 const record={...item,status:"FINALIZED · EXECUTION UNVERIFIED"};
 assert.equal(unresolvedTransactionBlocks([record],"evaluate","3"),true);
 assert.equal(unresolvedTransactionBlocks([record],"evaluate","2"),false);
 assert.equal(outstandingReceipts([record]).length,1);
 assert.equal(compactHistory([record,...Array.from({length:120},(_,i)=>({hash:"0x"+i.toString(16).padStart(64,"0"),status:"FINALIZED",created:i+2}))]).length,101);
});

test("Unverified earlier transaction does not block a distinct, validated next step",()=>{
 const item={hash:"0x"+"1".repeat(64),method:"evaluate",workId:"2",status:"FINALIZED · EXECUTION UNVERIFIED"};
 assert.equal(unresolvedTransactionBlocks([item],"evaluate","2"),true,"duplicate evaluate stays locked");
 assert.equal(unresolvedTransactionBlocks([item],"issue_acceptance","2"),false,"old evaluation cannot lock certified next step");
 assert.equal(unresolvedTransactionBlocks([item],"submit_for_review","2"),false,"unrelated step not blocked");
 assert.equal(unresolvedTransactionBlocks([item],"evaluate","3"),false,"different Work not blocked");
 const prior={...item,method:"submit_for_review"};
 assert.equal(unresolvedTransactionBlocks([prior],"submit_for_review","2"),true);
 assert.equal(unresolvedTransactionBlocks([prior],"evaluate","2"),false);
});

test("Only confirmed later Work states archive earlier receipt warnings, never fabricate receipt success",()=>{
 const work={contract_version:"3.0.0",id:"2",state:"ACCEPTED"};
 const submit={method:"submit_for_review",workId:"2"};
 const evalTx={method:"evaluate",workId:"2",fromState:"SUBMITTED"};
 assert.equal(workConfirmsPriorStage(submit,work),true);
 assert.equal(workConfirmsPriorStage(evalTx,work),true);
 assert.equal(workConfirmsPriorStage({...evalTx,workId:"3"},work),false);
 assert.equal(workConfirmsPriorStage({...evalTx,method:"issue_acceptance"},work),false);
 assert.equal(workConfirmsPriorStage({...evalTx,method:"evaluate",fromState:"REVIEW"},{...work,state:"REVIEW"}),false,"REVIEW -> REVIEW cannot prove completion");
 assert.equal(workConfirmsPriorStage(evalTx,{...work,state:"REVIEW"}),true,"SUBMITTED -> REVIEW is a state advance");
 assert.equal(workConfirmsPriorStage(evalTx,{...work,contract_version:"2.0.0"}),false);
 assert.equal(workConfirmsPriorStage({...submit,workId:""},{...work,state:"SUBMITTED"}),false);
});

test("historical Create Work receipt locks its own PR, not a later unrelated PR",()=>{
 const oldCreate={hash:hash("d"),method:"create_work",status:"FINALIZED · EXECUTION UNVERIFIED",created:1,
   account:"0x"+"4".repeat(40),owner:"bearbaba",repository:"spotter",pr:"29",workId:""};
 const current=(pr)=>({owner:"bearbaba",repository:"spotter",pr:String(pr)});
 assert.equal(unresolvedTransactionBlocks([oldCreate],"create_work","",current(29)),true,
   "the same GitHub contribution must never be submitted twice blindly");
 assert.equal(unresolvedTransactionBlocks([oldCreate],"create_work","",current(32)),false,
   "an older PR #29 cannot prevent a fresh PR #32 agreement");
 assert.equal(unresolvedTransactionBlocks([oldCreate],"create_work","",{owner:"someone",repository:"spotter",pr:"29"}),false);
 assert.equal(unresolvedTransactionBlocks([oldCreate],"create_work","",{owner:"bearbaba",repository:"another",pr:"29"}),false);
 assert.equal(unresolvedTransactionBlocks([oldCreate],"create_work","",{owner:"BearBaba",repository:"Spotter",pr:29}),true);
 assert.equal(unresolvedTransactionBlocks([oldCreate],"create_work","",null),true,
   "unknown target must fail closed");
 assert.equal(unresolvedTransactionBlocks([oldCreate],"create_work","",{}),true);
 assert.equal(unresolvedTransactionBlocks([{...oldCreate,pr:""}],"create_work","",current(32)),true,
   "missing old PR identity must fail closed");
 assert.equal(unresolvedTransactionBlocks([oldCreate],"issue_acceptance","2"),false,
   "different on-chain step is independently controlled");
});
