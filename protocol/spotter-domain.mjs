// Spotter protocol domain model. Pure, side-effect-free rules; NOT a funds-holding contract.
// Model payments only until token/asset mechanics are proven on GenLayer.
export const WORK = Object.freeze(["DRAFT","FUNDED","ACTIVE","SUBMITTED","VERIFYING","REVIEW","ACCEPTED","REJECTED","DISPUTED","SETTLED","CANCELLED"]);
export const ESCROW = Object.freeze(["UNFUNDED","LOCKED","RELEASABLE","REFUNDABLE","PAID","REFUNDED"]);
export const DISPUTE = Object.freeze(["NONE","OPEN","EVIDENCE","TIMEOUT","RESOLVED"]);
export const FINAL_ESCROW = new Set(["PAID","REFUNDED"]);
export function assert(condition,message){ if(!condition) throw new Error(message); }
export function requirePositiveUnits(value){ assert(typeof value==="bigint"&&value>0n,"amount must be a positive integer in smallest units"); return value; }
export function newMilestone({client,worker,verifier,arbitrator,units,deadline,policyHash,challengeSeconds=86400,arbitrationSeconds=604800}){
 assert(client&&worker&&verifier&&arbitrator&&new Set([client,worker,verifier,arbitrator]).size===4,"four distinct role identities required");
 requirePositiveUnits(units);
 assert(Number.isSafeInteger(deadline)&&deadline>0,"deadline required");
 assert(/^[a-f0-9]{64}$/i.test(policyHash),"32-byte policy hash required");
 assert(Number.isSafeInteger(challengeSeconds)&&challengeSeconds>=3600&&challengeSeconds<=604800,"challenge window must be 1 hour to 7 days");
 assert(Number.isSafeInteger(arbitrationSeconds)&&arbitrationSeconds>=86400&&arbitrationSeconds<=2592000,"arbitration window must be 1 to 30 days");
 return Object.freeze({client,worker,verifier,arbitrator,units,deadline,challengeSeconds,arbitrationSeconds,decidedAt:null,disputedAt:null,lastAt:0,clientTimeoutConsent:false,workerTimeoutConsent:false,policyHash:policyHash.toLowerCase(),work:"DRAFT",escrow:"UNFUNDED",dispute:"NONE",version:0,issued:false});
}
export function transition(x,event,actor,now){
 assert(WORK.includes(x.work)&&ESCROW.includes(x.escrow)&&DISPUTE.includes(x.dispute),"invalid state");
 assert(Number.isSafeInteger(now)&&now>=x.lastAt,"timestamp must be monotonic");
 let n={...x};
 const client=actor===x.client,worker=actor===x.worker;
 switch(event){
 case "CANCEL_DRAFT":
   assert(client&&x.work==="DRAFT"&&x.escrow==="UNFUNDED","only client can cancel an unfunded draft");
   n.work="CANCELLED";break;
 case "FUND_CONFIRMED":
   assert(client&&x.work==="DRAFT"&&x.escrow==="UNFUNDED","only client can fund draft");
   n.work="FUNDED";n.escrow="LOCKED";break;
 case "START":
   assert(worker&&x.work==="FUNDED"&&x.escrow==="LOCKED","only worker can start funded work");
   n.work="ACTIVE";break;
 case "EXPIRE_UNSTARTED":
   assert(client&&x.work==="FUNDED"&&x.escrow==="LOCKED"&&now>x.deadline,"only client can expire unstarted work after deadline");
   n.work="SETTLED";n.escrow="REFUNDABLE";break;
 case "EXPIRE_UNSUBMITTED":
   assert(client&&x.work==="ACTIVE"&&x.escrow==="LOCKED"&&now>x.deadline,"only client can expire unsubmitted work after deadline");
   n.work="SETTLED";n.escrow="REFUNDABLE";break;
 case "SUBMIT":
   assert(worker&&x.work==="ACTIVE"&&now<=x.deadline,"submission not allowed");
   n.work="SUBMITTED";break;
 case "BEGIN_VERIFICATION":
   assert((client||worker)&&x.work==="SUBMITTED","not submitted");
   n.work="VERIFYING";break;
 case "EVIDENCE_UNAVAILABLE":
   assert(actor===x.verifier&&x.work==="VERIFYING","verifier only");
   n.work="REVIEW";break;
 case "RETRY":
   assert((client||worker)&&x.work==="REVIEW"&&x.dispute==="NONE","cannot retry");
   n.work="VERIFYING";break;
 case "PROOF_ACCEPTED":
   assert(actor===x.verifier&&x.work==="VERIFYING"&&x.dispute==="NONE","verifier only");
   n.work="ACCEPTED";n.decidedAt=now;break;
 case "PROOF_REJECTED":
   assert(actor===x.verifier&&x.work==="VERIFYING"&&x.dispute==="NONE","verifier only");
   n.work="REJECTED";n.decidedAt=now;break;
 case "OPEN_DISPUTE":
   assert((client||worker)&&["ACCEPTED","REJECTED"].includes(x.work)&&x.escrow==="LOCKED"&&x.dispute==="NONE"&&x.decidedAt!==null&&now>=x.decidedAt&&now<x.decidedAt+x.challengeSeconds,"challenge not authorized or window closed");
   n.work="DISPUTED";n.dispute="OPEN";n.disputedAt=now;break;
 case "RESOLVE_ACCEPT":
 case "RESOLVE_REJECT":
   // This model intentionally permits only an externally designated arbitrator role.
   assert(actor===x.arbitrator&&x.dispute==="OPEN"&&x.work==="DISPUTED"&&now<x.disputedAt+x.arbitrationSeconds,"arbitrator only, before timeout");
   n.dispute="RESOLVED";n.work=event==="RESOLVE_ACCEPT"?"ACCEPTED":"REJECTED";n.decidedAt=now;break;
 case "ESCALATE_TIMEOUT":
   assert((client||worker)&&x.work==="DISPUTED"&&x.dispute==="OPEN"&&now>=x.disputedAt+x.arbitrationSeconds,"arbitration timeout not reached");
   n.dispute="TIMEOUT";break;
 case "CONSENT_TIMEOUT_ACCEPT":
 case "CONSENT_TIMEOUT_REJECT":
   assert((client||worker)&&x.work==="DISPUTED"&&x.dispute==="TIMEOUT","timeout consent unavailable");
   assert(!x.clientTimeoutConsent&&!x.workerTimeoutConsent,"timeout resolution already proposed");
   n.timeoutProposal=event==="CONSENT_TIMEOUT_ACCEPT"?"ACCEPTED":"REJECTED";
   if(client)n.clientTimeoutConsent=true;
   if(worker)n.workerTimeoutConsent=true;
   break;
 case "CONFIRM_TIMEOUT":
   assert((client||worker)&&x.work==="DISPUTED"&&x.dispute==="TIMEOUT"&&["ACCEPTED","REJECTED"].includes(x.timeoutProposal),"no timeout proposal");
   assert(client?!x.clientTimeoutConsent:!x.workerTimeoutConsent,"party already consented");
   if(client)n.clientTimeoutConsent=true;
   if(worker)n.workerTimeoutConsent=true;
   if(n.clientTimeoutConsent&&n.workerTimeoutConsent){n.work=x.timeoutProposal;n.dispute="RESOLVED";n.decidedAt=now;}
   break;
 case "FINALIZE_ACCEPT":
   assert((client||worker)&&x.work==="ACCEPTED"&&x.escrow==="LOCKED"&&x.dispute!=="OPEN"&&(x.dispute==="RESOLVED"||now>=x.decidedAt+x.challengeSeconds),"cannot release");
   n.work="SETTLED";n.escrow="RELEASABLE";break;
 case "FINALIZE_REJECT":
   assert(client&&x.work==="REJECTED"&&x.escrow==="LOCKED"&&x.dispute!=="OPEN"&&(x.dispute==="RESOLVED"||now>=x.decidedAt+x.challengeSeconds),"cannot refund");
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
 n.lastAt=now;
 return Object.freeze(n);
}
