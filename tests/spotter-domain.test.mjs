import test from "node:test";
import assert from "node:assert/strict";
import { newMilestone,transition } from "../protocol/spotter-domain.mjs";
const C="client",W="worker",V="verifier",A="arbitrator",H="a".repeat(64);
function seed(){return newMilestone({client:C,worker:W,verifier:V,arbitrator:A,units:2000000n,deadline:200,policyHash:H});}
function apply(s,steps){for(const [event,actor,time=100] of steps)s=transition(s,event,actor,time);return s;}
const accept=[["FUND_CONFIRMED",C],["START",W],["SUBMIT",W],["BEGIN_VERIFICATION",C],["PROOF_ACCEPTED",V]];
const reject=[["FUND_CONFIRMED",C],["START",W],["SUBMIT",W],["BEGIN_VERIFICATION",C],["PROOF_REJECTED",V]];
test("client funding is required before any work",()=>{
 assert.throws(()=>transition(seed(),"START",W,100));
 assert.throws(()=>transition(seed(),"FUND_CONFIRMED",W,100));
});
test("exactly one release, with no subsequent refund",()=>{
 let s=apply(seed(),accept);
 s=transition(s,"FINALIZE_ACCEPT",C,86500);
 s=transition(s,"RELEASE_CONFIRMED",W,86500);
 assert.equal(s.escrow,"PAID");
 assert.throws(()=>transition(s,"RELEASE_CONFIRMED",W,86500));
 assert.throws(()=>transition(s,"REFUND_CONFIRMED",C,86500));
});
test("rejection refunds client only",()=>{
 let s=apply(seed(),reject);
 assert.throws(()=>transition(s,"FINALIZE_REJECT",W,86500));
 s=transition(s,"FINALIZE_REJECT",C,86500);
 assert.throws(()=>transition(s,"RELEASE_CONFIRMED",W,86500));
 s=transition(s,"REFUND_CONFIRMED",C,86500);
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
 assert.throws(()=>transition(s,"FINALIZE_ACCEPT",C,86500));
 assert.throws(()=>transition(s,"RESOLVE_ACCEPT",C,100));
 s=transition(s,"RESOLVE_REJECT",A,100);
 assert.equal(s.work,"REJECTED");
});
test("deadline enforced",()=>{
 const s=apply(seed(),[["FUND_CONFIRMED",C],["START",W]]);
 assert.throws(()=>transition(s,"SUBMIT",W,201));
});
test("amount & policy cannot be absent",()=>{
 assert.throws(()=>newMilestone({client:C,worker:W,verifier:V,arbitrator:A,units:0n,deadline:200,policyHash:H}));
 assert.throws(()=>newMilestone({client:C,worker:W,verifier:V,arbitrator:A,units:1n,deadline:200,policyHash:"unsafe"}));
});
test("review can retry but cannot certify",()=>{
 let s=apply(seed(),[["FUND_CONFIRMED",C],["START",W],["SUBMIT",W],["BEGIN_VERIFICATION",C],["EVIDENCE_UNAVAILABLE",V]]);
 assert.throws(()=>transition(s,"FINALIZE_ACCEPT",C,86500));
 s=transition(s,"RETRY",W,100);
 assert.equal(s.work,"VERIFYING");
});

test("spoofed proof outcomes and arbitrary dispute resolution are rejected",()=>{
 const verifying=apply(seed(),[["FUND_CONFIRMED",C],["START",W],["SUBMIT",W],["BEGIN_VERIFICATION",C]]);
 assert.throws(()=>transition(verifying,"PROOF_ACCEPTED","stranger",100));
 assert.throws(()=>transition(verifying,"PROOF_ACCEPTED",C,100));
 assert.throws(()=>transition(verifying,"PROOF_REJECTED",W,100));
 const accepted=transition(verifying,"PROOF_ACCEPTED",V,100);
 const disputed=transition(accepted,"OPEN_DISPUTE",W,100);
 assert.throws(()=>transition(disputed,"RESOLVE_ACCEPT",V,100));
 assert.equal(transition(disputed,"RESOLVE_ACCEPT",A,100).work,"ACCEPTED");
});

test("settlement locked until challenge window expires",()=>{
 const accepted=apply(seed(),accept);
 assert.throws(()=>transition(accepted,"FINALIZE_ACCEPT",C,100));
 assert.throws(()=>transition(accepted,"FINALIZE_ACCEPT",C,86499));
 const settled=transition(accepted,"FINALIZE_ACCEPT",C,86500);
 assert.equal(settled.escrow,"RELEASABLE");
 assert.throws(()=>transition(settled,"OPEN_DISPUTE",W,86500));
});
test("late or unrelated challenge is rejected",()=>{
 const accepted=apply(seed(),accept);
 assert.throws(()=>transition(accepted,"OPEN_DISPUTE",W,86500));
 assert.throws(()=>transition(accepted,"OPEN_DISPUTE","stranger",101));
 const disputed=transition(accepted,"OPEN_DISPUTE",W,101);
 assert.throws(()=>transition(disputed,"OPEN_DISPUTE",C,102));
 assert.throws(()=>transition(disputed,"FINALIZE_ACCEPT",C,90000));
});
test("arbitration finality does not reopen challenges",()=>{
 let s=apply(seed(),reject);
 s=transition(s,"OPEN_DISPUTE",W,101);
 s=transition(s,"RESOLVE_ACCEPT",A,200);
 assert.throws(()=>transition(s,"OPEN_DISPUTE",C,201));
 assert.equal(transition(s,"FINALIZE_ACCEPT",W,200).escrow,"RELEASABLE");
});
test("challenge window bounds are validated",()=>{
 for(const challengeSeconds of [0,-1,3599,604801,1.5]){
  assert.throws(()=>newMilestone({client:C,worker:W,verifier:V,arbitrator:A,units:1n,deadline:200,policyHash:H,challengeSeconds}));
 }
});

test("timed out arbitration never permits unilateral transfer or refund",()=>{
 let s=apply(seed(),accept);
 s=transition(s,"OPEN_DISPUTE",W,101);
 assert.throws(()=>transition(s,"ESCALATE_TIMEOUT",W,604900));
 s=transition(s,"ESCALATE_TIMEOUT",W,604901);
 assert.equal(s.dispute,"TIMEOUT");
 assert.throws(()=>transition(s,"FINALIZE_ACCEPT",C,604901));
 assert.throws(()=>transition(s,"RESOLVE_ACCEPT",A,604901));
 s=transition(s,"CONSENT_TIMEOUT_REJECT",C,604902);
 assert.throws(()=>transition(s,"FINALIZE_REJECT",C,604902));
 assert.throws(()=>transition(s,"CONFIRM_TIMEOUT",C,604902));
 s=transition(s,"CONFIRM_TIMEOUT",W,604903);
 assert.equal(s.work,"REJECTED");
 assert.equal(s.dispute,"RESOLVED");
 assert.equal(transition(s,"FINALIZE_REJECT",C,604903).escrow,"REFUNDABLE");
});
test("monotonic event timestamps prevent rollback",()=>{
 let s=apply(seed(),[["FUND_CONFIRMED",C,100],["START",W,101]]);
 assert.throws(()=>transition(s,"SUBMIT",W,100),/monotonic/);
});
test("arbitration timeout configuration enforced",()=>{
 for(const arbitrationSeconds of [0,86399,2592001,1.5]){
  assert.throws(()=>newMilestone({client:C,worker:W,verifier:V,arbitrator:A,units:1n,deadline:200,policyHash:H,arbitrationSeconds}));
 }
});
