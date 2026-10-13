import test from "node:test";
import assert from "node:assert/strict";
import { newMilestone,transition } from "../protocol/spotter-domain.mjs";
const C="client",W="worker",H="a".repeat(64);
function seed(){return newMilestone({client:C,worker:W,units:2000000n,deadline:200,policyHash:H});}
function apply(s,steps){for(const [event,actor,time=100] of steps)s=transition(s,event,actor,time);return s;}
const accept=[["FUND_CONFIRMED",C],["START",W],["SUBMIT",W],["BEGIN_VERIFICATION",C],["PROOF_ACCEPTED",C]];
const reject=[["FUND_CONFIRMED",C],["START",W],["SUBMIT",W],["BEGIN_VERIFICATION",C],["PROOF_REJECTED",C]];
test("client funding is required before any work",()=>{
 assert.throws(()=>transition(seed(),"START",W,100));
 assert.throws(()=>transition(seed(),"FUND_CONFIRMED",W,100));
});
test("exactly one release, with no subsequent refund",()=>{
 let s=apply(seed(),accept);
 s=transition(s,"FINALIZE_ACCEPT",C,100);
 s=transition(s,"RELEASE_CONFIRMED",W,100);
 assert.equal(s.escrow,"PAID");
 assert.throws(()=>transition(s,"RELEASE_CONFIRMED",W,100));
 assert.throws(()=>transition(s,"REFUND_CONFIRMED",C,100));
});
test("rejection refunds client only",()=>{
 let s=apply(seed(),reject);
 assert.throws(()=>transition(s,"FINALIZE_REJECT",W,100));
 s=transition(s,"FINALIZE_REJECT",C,100);
 assert.throws(()=>transition(s,"RELEASE_CONFIRMED",W,100));
 s=transition(s,"REFUND_CONFIRMED",C,100);
 assert.equal(s.escrow,"REFUNDED");
});
test("unauthorized stranger cannot challenge",()=>{
 const s=apply(seed(),accept);
 assert.throws(()=>transition(s,"OPEN_DISPUTE","stranger",100));
 assert.equal(transition(s,"OPEN_DISPUTE",W,100).work,"DISPUTED");
});
test("open dispute blocks release",()=>{
 let s=apply(seed(),accept);
 s=transition(s,"OPEN_DISPUTE",W,100);
 assert.throws(()=>transition(s,"FINALIZE_ACCEPT",C,100));
 assert.throws(()=>transition(s,"RESOLVE_ACCEPT",C,100));
 s=transition(s,"RESOLVE_REJECT","ARBITRATOR",100);
 assert.equal(s.work,"REJECTED");
});
test("deadline enforced",()=>{
 const s=apply(seed(),[["FUND_CONFIRMED",C],["START",W]]);
 assert.throws(()=>transition(s,"SUBMIT",W,201));
});
test("amount & policy cannot be absent",()=>{
 assert.throws(()=>newMilestone({client:C,worker:W,units:0n,deadline:200,policyHash:H}));
 assert.throws(()=>newMilestone({client:C,worker:W,units:1n,deadline:200,policyHash:"unsafe"}));
});
test("review can retry but cannot certify",()=>{
 let s=apply(seed(),[["FUND_CONFIRMED",C],["START",W],["SUBMIT",W],["BEGIN_VERIFICATION",C],["EVIDENCE_UNAVAILABLE",C]]);
 assert.throws(()=>transition(s,"FINALIZE_ACCEPT",C,100));
 s=transition(s,"RETRY",W,100);
 assert.equal(s.work,"VERIFYING");
});
