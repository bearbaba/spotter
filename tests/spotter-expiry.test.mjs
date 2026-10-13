import test from "node:test";
import assert from "node:assert/strict";
import { newMilestone, transition } from "../protocol/spotter-domain.mjs";

const C="client",W="worker",V="verifier",A="arbitrator";
function seed(){
 return newMilestone({client:C,worker:W,verifier:V,arbitrator:A,units:1000000n,deadline:200,policyHash:"b".repeat(64)});
}
test("draft cancellation is client-only and terminal without any refund claim",()=>{
 assert.throws(()=>transition(seed(),"CANCEL_DRAFT",W,10));
 const cancelled=transition(seed(),"CANCEL_DRAFT",C,10);
 assert.equal(cancelled.work,"CANCELLED");
 assert.equal(cancelled.escrow,"UNFUNDED");
 assert.throws(()=>transition(cancelled,"FUND_CONFIRMED",C,11));
 assert.throws(()=>transition(cancelled,"REFUND_CONFIRMED",C,11));
});
test("unstarted funded work cannot be expired until strictly past the deadline",()=>{
 const funded=transition(seed(),"FUND_CONFIRMED",C,10);
 assert.throws(()=>transition(funded,"EXPIRE_UNSTARTED",W,201));
 assert.throws(()=>transition(funded,"EXPIRE_UNSTARTED",C,200));
 const expired=transition(funded,"EXPIRE_UNSTARTED",C,201);
 assert.equal(expired.work,"SETTLED");
 assert.equal(expired.escrow,"REFUNDABLE");
 assert.throws(()=>transition(expired,"START",W,202));
 assert.throws(()=>transition(expired,"RELEASE_CONFIRMED",W,202));
 const refunded=transition(expired,"REFUND_CONFIRMED",C,202);
 assert.equal(refunded.escrow,"REFUNDED");
 assert.throws(()=>transition(refunded,"REFUND_CONFIRMED",C,203));
});
test("active but unsubmitted work can expire only after deadline",()=>{
 let active=transition(seed(),"FUND_CONFIRMED",C,10);
 active=transition(active,"START",W,11);
 assert.throws(()=>transition(active,"EXPIRE_UNSUBMITTED",C,200));
 assert.throws(()=>transition(active,"EXPIRE_UNSUBMITTED",W,201));
 const expired=transition(active,"EXPIRE_UNSUBMITTED",C,201);
 assert.equal(expired.escrow,"REFUNDABLE");
 assert.throws(()=>transition(expired,"SUBMIT",W,201));
 assert.equal(transition(expired,"REFUND_CONFIRMED",C,202).escrow,"REFUNDED");
});
test("submitted work cannot be expired even after its deadline",()=>{
 let s=transition(seed(),"FUND_CONFIRMED",C,10);
 s=transition(s,"START",W,11);
 s=transition(s,"SUBMIT",W,200);
 assert.throws(()=>transition(s,"EXPIRE_UNSUBMITTED",C,201));
 assert.throws(()=>transition(s,"EXPIRE_UNSTARTED",C,201));
});
test("expired lifecycle rejects repeated or crossed settlements",()=>{
 let s=transition(seed(),"FUND_CONFIRMED",C,10);
 s=transition(s,"EXPIRE_UNSTARTED",C,201);
 assert.throws(()=>transition(s,"FINALIZE_ACCEPT",C,201));
 assert.throws(()=>transition(s,"FINALIZE_REJECT",C,201));
 assert.throws(()=>transition(s,"EXPIRE_UNSTARTED",C,202));
});
