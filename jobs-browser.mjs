// Public Spotter job discovery for the existing Studionet deployment.
// The v1 contract has no enumeration method; open_job creates contiguous numeric IDs.
// This read-only browser scans bounded pages without signatures, hashes or wallets.
export function createJobsBrowser({document, readJob, getAccount, isWriteBlocked, readProof, continueJob, notify}) {
  const $ = id => document.getElementById(id);
  const PAGE = 12, CAP = 480;
  const jobs = new Map();
  let next = 1, ended = false, loading = false, mode = "all";
  const ownerMatches = (job,who) => Boolean(who && [job.poster,job.hunter].some(x =>
    typeof x === "string" && x.toLowerCase() === who.toLowerCase()));
  const isActionable = (job,who) => Boolean(who && !isWriteBlocked() &&
    String(job.poster || "").toLowerCase() === who.toLowerCase() &&
    (job.status === "OPEN" || (job.status === "SUBMITTED" &&
      String(job.hunter || "").toLowerCase() === who.toLowerCase())));
  function button(label, cls, handler) {
    const el=document.createElement("button");
    el.type="button"; el.className=cls; el.textContent=label; el.onclick=handler;
    return el;
  }
  function render() {
    const el=$("jobsList"); el.replaceChildren();
    $("allJobsBtn").setAttribute?.("aria-pressed",String(mode==="all"));
    $("myJobsBtn").setAttribute?.("aria-pressed",String(mode==="mine"));
    const who=getAccount();
    const filtered=[...jobs.values()]
      .filter(j=>mode==="all"||ownerMatches(j,who))
      .sort((a,b)=>Number(b.id)-Number(a.id));
    if(!filtered.length) {
      const empty=document.createElement("div");empty.className="job-empty";
      empty.textContent=mode==="mine"&&!who?
        "Connect a wallet to see your jobs. All public jobs remain readable.":
        mode==="mine"?"No jobs for this wallet in the scanned range. Load more or refresh.":
        loading?"Reading finalized contract records…":
        "No jobs found in this range. Retry the public RPC if needed.";
      el.append(empty);
    }
    for(const job of filtered) {
      const card=document.createElement("article");card.className="job-card";
      const head=document.createElement("div");head.className="job-card-top";
      const id=document.createElement("strong");id.textContent="Job #"+job.id;
      const tag=document.createElement("span");
      const state=String(job.status||"UNKNOWN").toUpperCase();
      tag.className="tag "+(["HIT","MISS","DEAD","OPEN","SUBMITTED"].includes(state)?state:"SUBMITTED");
      tag.textContent=state+(job.fail_kind?" / "+job.fail_kind:"");
      head.append(id,tag);
      const claim=document.createElement("div");claim.className="job-card-title";
      claim.textContent=String(job.question||"Untitled public verification");
      const meta=document.createElement("div");meta.className="job-card-meta";
      const poster=String(job.poster||"");
      meta.textContent=poster?"Opened by "+poster.slice(0,8)+"…"+poster.slice(-5):"Public verification";
      const actions=document.createElement("div");actions.className="job-card-actions";
      actions.append(button("Read proof ↗","btn btn-small btn-subtle",()=>readProof(String(job.id))));
      if(isActionable(job,who)) {
        actions.append(button(state==="OPEN"?"Continue · Submit ↗":"Continue · Verify ↗",
          "btn btn-small btn-primary",()=>continueJob(String(job.id))));
      }
      card.append(head,claim,meta,actions);el.append(card);
    }
    $("jobsStatus").textContent=loading?"Discovering finalized contract jobs…":
      jobs.size+" public job(s) discovered"+(mode==="mine"?" · "+filtered.length+" match your wallet":"")+".";
    $("jobsCoverage").textContent="Scanned on-chain IDs 1–"+Math.max(0,next-1)+
      (ended?" · current end reached":" · more available on demand");
    $("moreJobsBtn").hidden=ended||next>CAP;
    $("moreJobsBtn").disabled=loading;
    $("refreshJobsBtn").disabled=loading;
  }
  async function scan() {
    if(loading||ended)return;
    if(next>CAP){
      $("jobsStatus").textContent="Browser discovery limit reached. Manual lookup remains available.";
      $("moreJobsBtn").hidden=true;return;
    }
    loading=true;render();
    let error="";
    const end=Math.min(next+PAGE-1,CAP);
    // Throttle to three concurrent on-chain reads.
    for(let start=next;start<=end&&!ended&&!error;start+=3){
      const ids=Array.from({length:Math.min(3,end-start+1)},(_,i)=>start+i);
      const results=await Promise.all(ids.map(async id=>{
        try {
          const job=await readJob(String(id));
          return job&&String(job.id)===String(id)?{id,job}:{id,missing:true};
        }catch(e){return {id,error:String(e?.message||e).slice(0,250)};}
      }));
      for(const entry of results){
        if(entry.error){error=entry.error;break;}
        if(entry.missing){ended=true;break;}
        jobs.set(String(entry.id),entry.job);
        next=entry.id+1;
      }
      render();
    }
    loading=false;render();
    if(error)$("jobsStatus").textContent="Public RPC read failed: "+error+". Refresh to retry.";
  }
  async function refresh() {
    if(loading)return;
    jobs.clear();next=1;ended=false;await scan();
  }
  $("allJobsBtn").onclick=()=>{mode="all";render();};
  $("myJobsBtn").onclick=()=>{mode="mine";render();};
  $("moreJobsBtn").onclick=()=>scan();
  $("refreshJobsBtn").onclick=()=>refresh();
  return {scan,refresh,render,getJobs:()=>[...jobs.values()],getState:()=>({next,ended,loading,mode})};
}
