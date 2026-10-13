// Offline accounting specification only. Never accepts deposits or sends tokens.
// The caller must independently authenticate chain transfer receipts in a real implementation.
const fail=(message)=>{throw new Error(message)};
const positive=(n)=>typeof n==="bigint"&&n>0n||fail("positive bigint units required");
const id=(s)=>typeof s==="string"&&/^[a-zA-Z0-9:_-]{1,128}$/.test(s)||fail("invalid identifier");
const safeState=(s)=>{if(!s||!(s.positions instanceof Map)||!(s.balances instanceof Map)||typeof s.deposited!=="bigint"||typeof s.withdrawn!=="bigint")fail("invalid ledger");};
export function emptyLedger(){return {positions:new Map(),balances:new Map(),deposited:0n,withdrawn:0n};}
export function checkLedger(s){
 safeState(s);
 let locked=0n,claims=0n;
 for(const p of s.positions.values()){
  positive(p.units);id(p.client);id(p.worker);
  if(!["LOCKED","RELEASED","REFUNDED"].includes(p.status))fail("invalid position");
  if(p.status==="LOCKED")locked+=p.units;
 }
 for(const v of s.balances.values()){if(typeof v!=="bigint"||v<0n)fail("negative claim");claims+=v;}
 if(s.deposited!==s.withdrawn+locked+claims)fail("asset conservation violated");
 return Object.freeze({locked,claims,deposited:s.deposited,withdrawn:s.withdrawn});
}
export function recordDeposit(s,{milestone,client,worker,units}){
 checkLedger(s);id(milestone);id(client);id(worker);positive(units);
 if(client===worker)fail("self-dealing milestone");
 if(s.positions.has(milestone))fail("duplicate milestone deposit");
 const positions=new Map(s.positions);
 positions.set(milestone,Object.freeze({client,worker,units,status:"LOCKED"}));
 const n={...s,positions,deposited:s.deposited+units};
 checkLedger(n);return n;
}
export function authorizeClaim(s,{milestone,outcome}){
 checkLedger(s);id(milestone);
 const p=s.positions.get(milestone);
 if(!p||p.status!=="LOCKED")fail("already settled or unknown milestone");
 if(outcome!=="RELEASE"&&outcome!=="REFUND")fail("invalid outcome");
 const recipient=outcome==="RELEASE"?p.worker:p.client;
 const positions=new Map(s.positions),balances=new Map(s.balances);
 positions.set(milestone,Object.freeze({...p,status:outcome==="RELEASE"?"RELEASED":"REFUNDED"}));
 balances.set(recipient,(balances.get(recipient)||0n)+p.units);
 const n={...s,positions,balances};checkLedger(n);return n;
}
export function recordWithdrawal(s,{recipient,units}){
 checkLedger(s);id(recipient);positive(units);
 const due=s.balances.get(recipient)||0n;
 if(units>due)fail("insufficient claim");
 const balances=new Map(s.balances);balances.set(recipient,due-units);
 const n={...s,balances,withdrawn:s.withdrawn+units};checkLedger(n);return n;
}
