import test from "node:test";
import assert from "node:assert/strict";
import {createProtocol,registerMilestone,execute,withdrawClaim,protocolSummary} from "../protocol/spotter-engine.mjs";
const C="client",W="worker",V="verifier",A="arbitrator";
const seed=()=>registerMilestone(createProtocol(),{id:"job1",client:C,worker:W,verifier:V,arbitrator:A,units:500n,deadline:200,policyHash:"f".repeat(64)});
const go=(s,event,actor,now=100,depositUnits)=>execute(s,{id:"job1",event,actor,now,depositUnits});
function accepted(){let s=go(seed(),"FUND_CONFIRMED",C,10,500n);s=go(s,"START",W,11);s=go(s,"SUBMIT",W,12);s=go(s,"BEGIN_VERIFICATION",C,13);return go(s,"PROOF_ACCEPTED",V,14);}
test("acceptance -> challenge window -> release -> withdrawal exactly once",()=>{
 let s=accepted();
 assert.throws(()=>go(s,"FINALIZE_ACCEPT",C,100));
 s=go(s,"FINALIZE_ACCEPT",C,86414);
 assert.deepEqual(protocolSummary(s),{locked:0n,claims:500n,deposited:500n,withdrawn:0n,milestones:1,events:6});
 assert.throws(()=>withdrawClaim(s,{id:"job1",actor:C,now:86415}));
 s=withdrawClaim(s,{id:"job1",actor:W,now:86415});
 assert.equal(s.milestones.get("job1").escrow,"PAID");
 assert.equal(protocolSummary(s).withdrawn,500n);
 assert.throws(()=>withdrawClaim(s,{id:"job1",actor:W,now:86416}));
 assert.throws(()=>go(s,"FINALIZE_REJECT",C,86416));
});
test("expired deadline -> refund, never a payout",()=>{
 let s=go(seed(),"FUND_CONFIRMED",C,10,500n);
 assert.throws(()=>go(s,"EXPIRE_UNSTARTED",C,200));
 s=go(s,"EXPIRE_UNSTARTED",C,201);
 assert.throws(()=>withdrawClaim(s,{id:"job1",actor:W,now:201}));
 s=withdrawClaim(s,{id:"job1",actor:C,now:201});
 assert.equal(protocolSummary(s).withdrawn,500n);
});
test("funding requires exact receipt amount and does not partially mutate state",()=>{
 const s=seed();
 assert.throws(()=>go(s,"FUND_CONFIRMED",C,10,499n),/deposit amount mismatch/);
 assert.equal(protocolSummary(s).deposited,0n);
 assert.equal(s.milestones.get("job1").work,"DRAFT");
});
test("dispute prevents release until authorized resolution",()=>{
 let s=accepted();
 s=go(s,"OPEN_DISPUTE",W,15);
 assert.throws(()=>go(s,"FINALIZE_ACCEPT",C,86415));
 assert.throws(()=>go(s,"RESOLVE_ACCEPT",C,16));
 s=go(s,"RESOLVE_ACCEPT",A,16);
 s=go(s,"FINALIZE_ACCEPT",W,16);
 s=withdrawClaim(s,{id:"job1",actor:W,now:17});
 assert.equal(protocolSummary(s).withdrawn,500n);
});
test("withdraw confirmation is isolated from generic state transitions",()=>{
 let s=accepted();
 s=go(s,"FINALIZE_ACCEPT",C,86414);
 assert.throws(()=>go(s,"RELEASE_CONFIRMED",W,86415),/withdrawClaim/);
 assert.equal(protocolSummary(s).claims,500n);
});
test("duplicate IDs are forbidden",()=>{
 const s=seed();
 assert.throws(()=>registerMilestone(s,{id:"job1",client:C,worker:W,verifier:V,arbitrator:A,units:1n,deadline:200,policyHash:"f".repeat(64)}));
});
