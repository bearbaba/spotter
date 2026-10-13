// Pure end-to-end sandbox protocol model. NOT an escrow smart contract.
// All identities, timestamps and confirmations are caller-provided test inputs.
import {newMilestone,transition} from "./spotter-domain.mjs";
import {emptyLedger,recordDeposit,authorizeClaim,recordWithdrawal,checkLedger} from "./escrow-accounting.mjs";
const fail=(message)=>{throw new Error(message)};
export function createProtocol(){
 return {milestones:new Map(),ledger:emptyLedger(),sequence:0,events:[]};
}
export function registerMilestone(s,{id,...definition}){
 if(typeof id!=="string"||!/^[a-zA-Z0-9:_-]{1,128}$/.test(id)||s.milestones.has(id))fail("invalid or duplicate milestone");
 const milestone=newMilestone(definition);
 const milestones=new Map(s.milestones);milestones.set(id,milestone);
 return {...s,milestones};
}
export function execute(s,{id,event,actor,now,depositUnits}){
 const previous=s.milestones.get(id);
 if(!previous)fail("unknown milestone");
 if(event==="RELEASE_CONFIRMED"||event==="REFUND_CONFIRMED")fail("use withdrawClaim to confirm an actual withdrawal");
 let next=transition(previous,event,actor,now);
 let ledger=s.ledger;
 if(event==="FUND_CONFIRMED"){
  // Caller must supply a validated deposit receipt amount in a real adapter.
  if(depositUnits!==previous.units)fail("deposit amount mismatch");
  ledger=recordDeposit(ledger,{milestone:id,client:previous.client,worker:previous.worker,units:depositUnits});
 }
 if(previous.escrow==="LOCKED"&&next.escrow==="RELEASABLE"){
  ledger=authorizeClaim(ledger,{milestone:id,outcome:"RELEASE"});
 }
 if(previous.escrow==="LOCKED"&&next.escrow==="REFUNDABLE"){
  ledger=authorizeClaim(ledger,{milestone:id,outcome:"REFUND"});
 }
 checkLedger(ledger);
 const milestones=new Map(s.milestones);milestones.set(id,next);
 return {...s,milestones,ledger,sequence:s.sequence+1,events:[...s.events,Object.freeze({id,event,version:next.version})]};
}
export function withdrawClaim(s,{id,actor,now}){
 const previous=s.milestones.get(id);
 if(!previous||!["RELEASABLE","REFUNDABLE"].includes(previous.escrow))fail("no withdrawable milestone");
 const event=previous.escrow==="RELEASABLE"?"RELEASE_CONFIRMED":"REFUND_CONFIRMED";
 const next=transition(previous,event,actor,now);
 // Model milestone-specific withdrawal, so no other milestone can be paid twice.
 const ledger=recordWithdrawal(s.ledger,{recipient:actor,units:previous.units});
 const milestones=new Map(s.milestones);milestones.set(id,next);
 return {...s,milestones,ledger,sequence:s.sequence+1,events:[...s.events,Object.freeze({id,event,version:next.version})]};
}
export function protocolSummary(s){
 const assets=checkLedger(s.ledger);
 return {...assets,milestones:s.milestones.size,events:s.events.length};
}
