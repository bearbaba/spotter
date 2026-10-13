import test from "node:test";
import assert from "node:assert/strict";
import {emptyLedger,checkLedger,recordDeposit,authorizeClaim,recordWithdrawal} from "../protocol/escrow-accounting.mjs";
const deposit=(s,k="m1",n=100n)=>recordDeposit(s,{milestone:k,client:"alice",worker:"bob",units:n});
test("deposit -> release -> partial withdrawal conserves all smallest units",()=>{
 let s=deposit(emptyLedger());
 assert.deepEqual(checkLedger(s),{locked:100n,claims:0n,deposited:100n,withdrawn:0n});
 s=authorizeClaim(s,{milestone:"m1",outcome:"RELEASE"});
 assert.deepEqual(checkLedger(s),{locked:0n,claims:100n,deposited:100n,withdrawn:0n});
 s=recordWithdrawal(s,{recipient:"bob",units:40n});
 assert.equal(s.balances.get("bob"),60n);
 s=recordWithdrawal(s,{recipient:"bob",units:60n});
 assert.deepEqual(checkLedger(s),{locked:0n,claims:0n,deposited:100n,withdrawn:100n});
});
test("refund goes only to client, not worker",()=>{
 let s=authorizeClaim(deposit(emptyLedger()),{milestone:"m1",outcome:"REFUND"});
 assert.equal(s.balances.get("alice"),100n);
 assert.throws(()=>recordWithdrawal(s,{recipient:"bob",units:1n}));
 assert.equal(recordWithdrawal(s,{recipient:"alice",units:100n}).withdrawn,100n);
});
test("cannot deposit same milestone or settle twice in opposing directions",()=>{
 let s=deposit(emptyLedger());
 assert.throws(()=>deposit(s));
 s=authorizeClaim(s,{milestone:"m1",outcome:"RELEASE"});
 assert.throws(()=>authorizeClaim(s,{milestone:"m1",outcome:"RELEASE"}));
 assert.throws(()=>authorizeClaim(s,{milestone:"m1",outcome:"REFUND"}));
});
test("overdraw, fractional, negative and zero amounts are rejected",()=>{
 let s=deposit(emptyLedger());
 for(const units of [0n,-1n,1.25,100,"100"])assert.throws(()=>recordWithdrawal(s,{recipient:"bob",units}));
 s=authorizeClaim(s,{milestone:"m1",outcome:"RELEASE"});
 assert.throws(()=>recordWithdrawal(s,{recipient:"bob",units:101n}));
});
test("ledger snapshots are copy-on-write and independently auditable",()=>{
 const a=emptyLedger(),b=deposit(a),c=authorizeClaim(b,{milestone:"m1",outcome:"REFUND"});
 assert.equal(a.positions.size,0);
 assert.equal(b.positions.get("m1").status,"LOCKED");
 assert.equal(c.positions.get("m1").status,"REFUNDED");
 assert.equal(checkLedger(b).locked,100n);
});
test("tampered accounting fails closed",()=>{
 let s=deposit(emptyLedger());
 assert.throws(()=>checkLedger({...s,withdrawn:1n}),/conservation/);
 assert.throws(()=>checkLedger({...s,balances:new Map([["mallory",-5n]])}),/negative/);
});
test("multiple claims sum correctly and cannot be spent more than once",()=>{
 let s=deposit(emptyLedger(),"a",5n);
 s=deposit(s,"b",7n);
 s=authorizeClaim(s,{milestone:"a",outcome:"RELEASE"});
 s=authorizeClaim(s,{milestone:"b",outcome:"RELEASE"});
 assert.equal(s.balances.get("bob"),12n);
 s=recordWithdrawal(s,{recipient:"bob",units:12n});
 assert.throws(()=>recordWithdrawal(s,{recipient:"bob",units:1n}));
 assert.equal(checkLedger(s).withdrawn,12n);
});
