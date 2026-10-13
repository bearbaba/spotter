import test from "node:test";
import assert from "node:assert/strict";
import { inspectPullRequest } from "../github-preflight.mjs";

const expected={owner:"bearbaba",repository:"spotter",branch:"main",number:26,requiredLabel:""};
function pr(overrides={}){return {number:26,base:{ref:"main",repo:{full_name:"bearbaba/spotter"}},merged:true,merged_at:"2026-10-13T11:00:00Z",merge_commit_sha:"a".repeat(40),title:"Add public GitHub PR preflight regression coverage",body:"This change adds deterministic tests for the public PR preflight. It checks merge eligibility and prevents misleading ready badges on invalid evidence.",labels:[],...overrides};}

test("merged PR with meaningful description is ready for review",()=>{
 const result=inspectPullRequest(pr(),expected);
 assert.equal(result.ready,true);
 assert.equal(result.checks.length,7);
});
test("unmerged draft PR cannot be displayed as ready",()=>{
 assert.equal(inspectPullRequest(pr({merged:false,merge_commit_sha:null}),expected).ready,false);
});
test("wrong repository or branch is never ready",()=>{
 assert.equal(inspectPullRequest(pr({base:{ref:"develop",repo:{full_name:"attacker/fork"}}}),expected).ready,false);
});
test("matching required GitHub label is enforced",()=>{
 const required={...expected,requiredLabel:"verified-work"};
 assert.equal(inspectPullRequest(pr(),required).ready,false);
 assert.equal(inspectPullRequest(pr({labels:[{name:"verified-work"}]}),required).ready,true);
});
test("missing title or concrete description gets an explicit warning",()=>{
 assert.equal(inspectPullRequest(pr({title:"Fix",body:"tiny"}),expected).ready,false);
});
test("malformed GitHub API response fails closed",()=>{
 assert.equal(inspectPullRequest(null,expected).ready,false);
 assert.equal(inspectPullRequest({},expected).ready,false);
});
