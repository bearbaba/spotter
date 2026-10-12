import test from "node:test";
import assert from "node:assert/strict";
import { createJobsBrowser } from "../jobs-browser.mjs";

function fakeDocument() {
  const nodes = new Map();
  let next = 0;
  function element(id) {
    if (!nodes.has(id)) nodes.set(id, {
      id, children: [], textContent: "", hidden: false, disabled: false, className: "",
      attrs: {}, classList: { toggle(){} },
      setAttribute(name,value) { this.attrs[name] = value; },
      replaceChildren(...children) { this.children = [...children]; },
      append(...children) { this.children.push(...children); },
    });
    return nodes.get(id);
  }
  return {
    getElementById: element,
    createElement(name) { return element("created-" + name + "-" + (++next)); },
  };
}
function setup(options={}) {
  const document=fakeDocument();
  const owner="0x1111111111111111111111111111111111111111";
  const other="0x2222222222222222222222222222222222222222";
  let account=options.account||null,blocked=false,reads=0,inFlight=0,maxInflight=0;
  const calls=[];
  let failAt=options.failAt||0;
  const jobs=options.jobs||[
    {id:"1",poster:owner,hunter:owner,status:"HIT",question:"Historical example"},
    {id:"2",poster:other,hunter:other,status:"OPEN",question:"Other wallet job"},
    {id:"3",poster:owner,hunter:other,status:"OPEN",question:"Own unfinished job"},
    {id:"4",poster:owner,hunter:owner,status:"SUBMITTED",question:"Awaiting verdict"},
    {id:"5",poster:other,hunter:other,status:"DEAD",question:"Bad source"},
    {id:"6",poster:owner,hunter:owner,status:"OPEN",question:"Known recovered job"},
  ];
  const browser=createJobsBrowser({
    document,
    getAccount:()=>account,
    isWriteBlocked:()=>blocked,
    async readJob(id) {
      reads++;inFlight++;maxInflight=Math.max(maxInflight,inFlight);
      try {
        await Promise.resolve();
        if(Number(id)===failAt)throw Error("RPC temporarily unavailable");
        return jobs.find(j=>j.id===id)||{};
      } finally {inFlight--; }
    },
    readProof:async id=>{calls.push(["read",id]);},
    continueJob:async id=>{calls.push(["continue",id]);},
    notify:()=>{},
  });
  return {browser,document,owner,other,jobs,calls,
    get reads(){return reads;},get maxInflight(){return maxInflight;},
    setAccount(x){account=x;browser.render();},setBlocked(x){blocked=x;browser.render();},
    failAt(x){failAt=x;}};
}
function cards(doc) {
  return doc.getElementById("jobsList").children.filter(x=>x.className==="job-card");
}
test("automatically reads public contiguous job records, sorted newest first, no wallet", async()=>{
  const x=setup();
  await x.browser.scan();
  assert.equal(x.browser.getJobs().length,6);
  assert.equal(x.browser.getState().ended,true);
  assert.equal(x.maxInflight,3);
  assert.equal(cards(x.document).length,6);
  assert.equal(cards(x.document)[0].children[0].children[0].textContent,"Job #6");
  assert.equal(cards(x.document)[0].children[3].children.length,1,"read proof only without wallet");
  assert.match(x.document.getElementById("jobsStatus").textContent,/6 public/);
  await cards(x.document)[0].children[3].children[0].onclick();
  assert.deepEqual(x.calls,[["read","6"]]);
});
test("My jobs filters owner/hunter and only allows poster/authorized hunter to continue",async()=>{
  const x=setup();
  await x.browser.scan();
  x.setAccount(x.owner);
  x.document.getElementById("myJobsBtn").onclick();
  assert.equal(cards(x.document).length,4);
  assert.equal(cards(x.document)[0].children[0].children[0].textContent,"Job #6");
  const open=cards(x.document)[0].children[3].children;
  assert.equal(open.length,2);
  await open[1].onclick();
  assert.deepEqual(x.calls,[["continue","6"]]);
  x.setBlocked(true);
  assert.equal(cards(x.document)[0].children[3].children.length,1);
  x.setBlocked(false);
  x.setAccount(x.other);
  assert.equal(cards(x.document).length,4,"hunter and poster are visible to their own wallet");
  const candidate=cards(x.document).find(c=>c.children[0].children[0].textContent==="Job #3");
  assert.equal(candidate.children[3].children.length,1,"cannot resume somebody else's poster job");
});
test("scan is bounded and paginated for large contract history",async()=>{
  const owner="0x1111111111111111111111111111111111111111";
  const jobs=Array.from({length:25},(_,i)=>({id:String(i+1),poster:owner,status:"OPEN",question:"Evidence "+i}));
  const x=setup({jobs});
  await x.browser.scan();
  assert.equal(x.browser.getJobs().length,12);
  assert.equal(x.browser.getState().ended,false);
  assert.equal(x.document.getElementById("moreJobsBtn").hidden,false);
  await x.document.getElementById("moreJobsBtn").onclick();
  assert.equal(x.browser.getJobs().length,24);
  await x.document.getElementById("moreJobsBtn").onclick();
  assert.equal(x.browser.getJobs().length,25);
  assert.equal(x.browser.getState().ended,true);
  assert.equal(x.document.getElementById("moreJobsBtn").hidden,true);
  assert.ok(x.maxInflight<=3);
});
test("RPC failures retain retry visibility and don't mark enumeration complete",async()=>{
  const x=setup({failAt:3});
  await x.browser.scan();
  assert.equal(x.browser.getState().ended,false);
  assert.match(x.document.getElementById("jobsStatus").textContent,/RPC read failed/);
  x.failAt(0);
  await x.browser.refresh();
  assert.equal(x.browser.getState().ended,true);
  assert.equal(x.browser.getJobs().length,6);
});
test("untrusted job question uses textContent and never HTML injection",async()=>{
  const bad='<img src=x onerror=alert(1)>';
  const x=setup({jobs:[{id:"1",poster:"0x1",status:"OPEN",question:bad}]});
  await x.browser.scan();
  assert.equal(cards(x.document)[0].children[1].textContent,bad);
  assert.equal(cards(x.document)[0].children[1].children.length,0);
});
