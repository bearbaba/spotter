import test from "node:test";
import assert from "node:assert/strict";
import {STUDIONET_CHAIN_ID,STUDIONET_CHAIN_HEX,STUDIONET_NETWORK,isStudionetChainId,requestStudionetSwitch} from "../wallet-network.mjs";

test("Studionet chain metadata matches the official network definition",()=>{
  assert.equal(STUDIONET_CHAIN_ID,61999);
  assert.equal(STUDIONET_CHAIN_HEX,"0xf22f");
  assert.equal(STUDIONET_NETWORK.rpcUrls[0],"https://studio.genlayer.com/api");
  assert.equal(STUDIONET_NETWORK.nativeCurrency.symbol,"GEN");
  assert.equal(isStudionetChainId("0xf22f"),true);
  assert.equal(isStudionetChainId("0xF22F"),true);
  assert.equal(isStudionetChainId("0x1080"),false);
  assert.equal(isStudionetChainId("61999"),false);
});
test("already-correct wallet receives no switch and never signs",async()=>{
 const calls=[];
 const wallet={async request({method}){calls.push(method);if(method==="eth_chainId")return "0xf22f";throw Error("Must not write");}};
 assert.equal(await requestStudionetSwitch(wallet),"already_selected");
 assert.deepEqual(calls,["eth_chainId"]);
});
test("wrong network prompts explicit wallet switch, then verifies chain",async()=>{
 let chain="0x1";const calls=[];
 const wallet={async request({method,params}){
  calls.push(method);
  if(method==="eth_chainId")return chain;
  if(method==="wallet_switchEthereumChain"){assert.equal(params[0].chainId,"0xf22f");chain="0xf22f";return null;}
  throw Error("Unrecognized method");
 }};
 assert.equal(await requestStudionetSwitch(wallet),"switched");
 assert.deepEqual(calls,["eth_chainId","wallet_switchEthereumChain","eth_chainId"]);
});
test("unknown chain can be added with the canonical Studionet RPC, never signed",async()=>{
 let chain="0x1",added=false;const calls=[];
 const wallet={async request({method,params}){
  calls.push(method);
  if(method==="eth_chainId")return chain;
  if(method==="wallet_switchEthereumChain"){if(!added)throw Object.assign(Error("Unrecognized chain"),{code:4902});chain="0xf22f";return null;}
  if(method==="wallet_addEthereumChain"){added=true;assert.deepEqual(params[0],STUDIONET_NETWORK);return null;}
  throw Error("Unexpected method "+method);
 }};
 assert.equal(await requestStudionetSwitch(wallet),"switched");
 assert.deepEqual(calls,["eth_chainId","wallet_switchEthereumChain","wallet_addEthereumChain","eth_chainId","wallet_switchEthereumChain","eth_chainId"]);
});
test("rejected switches, unsupported wallets, or mismatching final chain fail closed",async()=>{
 await assert.rejects(requestStudionetSwitch(null),/MetaMask is required/);
 const rejected={async request({method}){if(method==="eth_chainId")return "0x1";throw Object.assign(Error("User rejected"),{code:4001});}};
 await assert.rejects(requestStudionetSwitch(rejected),/User rejected/);
 const failed={async request({method}){if(method==="eth_chainId")return "0x1";return null;}};
 await assert.rejects(requestStudionetSwitch(failed),/has not selected/);
});
