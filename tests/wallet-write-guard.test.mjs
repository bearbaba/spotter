import test from "node:test";
import assert from "node:assert/strict";
import {withExclusiveWriteLock} from "../wallet-write-guard.mjs";

const scope="61999:0xD57aE10754C44223ABf3bA04a43AC2023d92aBE7";

test("wallet signing refuses to proceed when cross-tab locking is unavailable",async()=>{
 let called=false;
 await assert.rejects(withExclusiveWriteLock(undefined,scope,async()=>{called=true;}),/Web Locks/);
 assert.equal(called,false);
});

test("wallet signing rejects simultaneous calls without second signing callback",async()=>{
 let held=false;
 const locks={async request(name,options,callback){
  assert.ok(name.startsWith("spotter:write:61999:"));
  assert.equal(options.mode,"exclusive");
  assert.equal(options.ifAvailable,true);
  if(held)return callback(null);
  held=true;
  try{return await callback({name});}finally{held=false;}
 }};
 let resolveFirst, calls=0;
 const first=withExclusiveWriteLock(locks,scope,async()=>{
  calls++;
  return new Promise(resolve=>{resolveFirst=resolve;});
 });
 await Promise.resolve();
 await assert.rejects(withExclusiveWriteLock(locks,scope,async()=>{calls++;}),/another Spotter tab/);
 assert.equal(calls,1);
 resolveFirst("signed");
 assert.equal(await first,"signed");
 assert.equal(await withExclusiveWriteLock(locks,scope,async()=>{calls++;return "next";}),"next");
 assert.equal(calls,2);
});

test("invalid contract scope never obtains a wallet write lock",async()=>{
 let called=false;
 const locks={async request(){called=true;}};
 await assert.rejects(withExclusiveWriteLock(locks,"some-other-site",async()=>{}),/Invalid contract lock scope/);
 assert.equal(called,false);
});
