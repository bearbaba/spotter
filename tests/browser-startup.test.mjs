import test from "node:test";
import assert from "node:assert/strict";
import {runInNewContext} from "node:vm";
import {readFileSync} from "node:fs";
import * as core from "../proofgate-core.mjs";
import * as tracker from "../transaction-tracker.mjs";

test("Spotter boots without a wallet or browser transaction",()=>{
 const source=readFileSync(new URL("../proofgate-ui.mjs",import.meta.url),"utf8")
   .replace(/^import .+;\r?\n/gm,"");
 const listeners=new Map(), elements=new Map();
 function element(id){
  if(!elements.has(id)){
   elements.set(id,{
    value:"",hidden:false,disabled:false,textContent:"",className:"",style:{},
    dataset:{},children:[],
    addEventListener(type,callback){listeners.set(id+":"+type,callback);},
    replaceChildren(...items){this.children=items;},
    append(...items){this.children.push(...items);},
    scrollIntoView(){},
   });
  }
  return elements.get(id);
 }
 const writeButton=element("createWorkAction");
 writeButton.dataset.workMethod="create_work";
 const document={
  visibilityState:"visible",
  getElementById:element,
  querySelectorAll:selector=>selector==="[data-work-method]"?[writeButton]:[],
  querySelector:()=>null,
  createElement:()=>element("generated-"+Math.random()),
 };
 const storage=()=>{const data=new Map();return {
   getItem:key=>data.get(key)??null,
   setItem:(key,value)=>data.set(key,String(value)),
   removeItem:key=>data.delete(key)
  };};
 const context={
  ...core,...tracker, document, window:{addEventListener(){}},
  sessionStorage:storage(), localStorage:storage(),
  createClient:()=>({readContract:async()=>null,getTransaction:async()=>null}),
  studionet:{},inspectPullRequest:()=>({ready:false}),
  setInterval:()=>0,setTimeout:()=>0,URL,console
 };
 assert.doesNotThrow(()=>runInNewContext(source,context,{timeout:1500}));
 assert.ok(listeners.has("workRead:click"));
 assert.ok(listeners.has("createWorkAction:click"));
 assert.equal(writeButton.disabled,false);
 assert.equal(element("walletCurrent").textContent,"Wallet not connected");
});
