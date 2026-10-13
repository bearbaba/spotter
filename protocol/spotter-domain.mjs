// Spotter protocol domain model. Pure, side-effect-free rules; NOT a funds-holding contract.
// Model payments only until token/asset mechanics are proven on GenLayer.
export const WORK = Object.freeze(["DRAFT","FUNDED","ACTIVE","SUBMITTED","VERIFYING","REVIEW","ACCEPTED","REJECTED","DISPUTED","SETTLED","CANCELLED"]);
export const ESCROW = Object.freeze(["UNFUNDED","LOCKED","RELEASABLE","REFUNDABLE","PAID","REFUNDED"]);
export const DISPUTE = Object.freeze(["NONE","OPEN","EVIDENCE","RESOLVED"]);
export const FINAL_ESCROW = new Set(["PAID","REFUNDED"]);
export function assert(condition,message){ if(!condition) throw new Error(message); }
export function requirePositiveUnits(value){ assert(typeof value==="bigint"&&value>0n,"amount must be a positive integer in smallest units"); return value; }
export function newMilestone({client,worker,units,deadline,policyHash}){
 assert(client&&worker&&client!==worker,"distinct parties required");
 requirePositiveUnits(units);
 assert(Number.isSafeInteger(deadline)&&deadline>0,"deadline required");
 assert(/^[a-f0-9]{64}$/i.test(policyHash),"32-byte policy hash required");
 return Object.freeze({client,worker,units,deadline,policyHash:policyHash.toLowerCase(),work:"DRAFT",escrow:"UNFUNDED",dispute:"NONE",version:0,issued:false});
}
export function transition(x,event,actor,now){
 assert(WORK.includes(x.work)&&ESCROW.includes(x.escrow)&&DISPUTE.includes(x.dispute),"invalid state");
 assert(Number.isSafeInteger(now)&&now>=0,"invalid time");
 let n={...x};
 const client=actor===x.client,worker=actor===x.worker;
 switch(event){
 case "FUND_CONFIRMED":
   assert(client&&x.work==="DRAFT"&&x.escrow==="UNFUNDED","only client can fund draft");
   n.work="FUNDED";n.escrow="LOCKED";break;
 case "START":
   assert(worker&&x.work==="FUNDED"&&x.escrow==="LOCKED","only worker can start funded work");
   n.work="ACTIVE";break;
 case "SUBMIT":
   assert(worker&&x.work==="ACTIVE"&&now<=x.deadline,"submission not allowed");
   n.work="SUBMITTED";break;
 case "BEGIN_VERIFICATION":
   assert((client||worker)&&x.work==="SUBMITTED","not submitted");
   n.work="VERIFYING";break;
 case "EVIDENCE_UNAVAILABLE":
   assert(x.work==="VERIFYING","not verifying");
   n.work="REVIEW";break;
 case "RETRY":
   assert((client||worker)&&x.work==="REVIEW"&&x.dispute==="NONE","cannot retry");
   n.work="VERIFYING";break;
 case "PROOF_ACCEPTED":
   assert(x.work==="VERIFYING"&&x.dispute==="NONE","invalid acceptance");
   n.work="ACCEPTED";break;
 case "PROOF_REJECTED":
   assert(x.work==="VERIFYING"&&x.dispute==="NONE","invalid rejection");
   n.work="REJECTED";break;
 case "OPEN_DISPUTE":
   assert((client||worker)&&["ACCEPTED","REJECTED"].includes(x.work)&&x.escrow==="LOCKED"&&x.dispute==="NONE","challenge not authorized");
   n.work="DISPUTED";n.dispute="OPEN";break;
 case "RESOLVE_ACCEPT":
 case "RESOLVE_REJECT":
   // This model intentionally permits only an externally designated arbitrator role.
   assert(actor==="ARBITRATOR"&&x.dispute==="OPEN"&&x.work==="DISPUTED","arbitrator only");
   n.dispute="RESOLVED";n.work=event==="RESOLVE_ACCEPT"?"ACCEPTED":"REJECTED";break;
 case "FINALIZE_ACCEPT":
   assert((client||worker)&&x.work==="ACCEPTED"&&x.escrow==="LOCKED"&&x.dispute!=="OPEN","cannot release");
   n.work="SETTLED";n.escrow="RELEASABLE";break;
 case "FINALIZE_REJECT":
   assert(client&&x.work==="REJECTED"&&x.escrow==="LOCKED"&&x.dispute!=="OPEN","cannot refund");
   n.work="SETTLED";n.escrow="REFUNDABLE";break;
 case "RELEASE_CONFIRMED":
   assert(worker&&x.work==="SETTLED"&&x.escrow==="RELEASABLE","not releasable");
   n.escrow="PAID";break;
 case "REFUND_CONFIRMED":
   assert(client&&x.work==="SETTLED"&&x.escrow==="REFUNDABLE","not refundable");
   n.escrow="REFUNDED";break;
 default: throw new Error("unknown transition");
 }
 n.version=x.version+1;
 return Object.freeze(n);
}
