// Read-only GitHub PR preflight. A convenience check, never an on-chain verdict.
export function inspectPullRequest(data,{owner,repository,branch,number,requiredLabel=""}){
  if(!data || typeof data!=="object")return {ready:false,checks:[{ok:false,text:"GitHub returned no usable pull request"}]};
  const expected=(owner+"/"+repository).toLowerCase();
  const checks=[
    {ok:String(data.number)===String(number),text:"PR number matches agreement"},
    {ok:String(data.base?.repo?.full_name||"").toLowerCase()===expected,text:"Repository matches agreement"},
    {ok:String(data.base?.repo?.html_url||"").replace(/\/$/,"").toLowerCase()==="https://github.com/"+expected,text:"GitHub repository URL matches agreement"},
    {ok:data.base?.ref===branch,text:"Target branch matches agreement"},
    {ok:data.merged===true && typeof data.merge_commit_sha==="string" && /^[a-fA-F0-9]{40}$/.test(data.merge_commit_sha),text:"PR merged with a recorded merge commit"},
    {ok:data.state==="closed" && typeof data.merged_at==="string" && !Number.isNaN(Date.parse(data.merged_at)),text:"PR is closed with a valid merged timestamp"},
    {ok:!requiredLabel || (Array.isArray(data.labels)&&data.labels.some(l=>l?.name===requiredLabel)),text:requiredLabel?"Required label is present":"No label required"},
    {ok:typeof data.title==="string"&&data.title.trim().length>=12,text:"PR has a descriptive title"},
    {ok:typeof data.body==="string"&&data.body.trim().length>=60,text:"PR describes concrete delivery (60+ characters)"}
  ];
  return {ready:checks.every(x=>x.ok),checks};
}
