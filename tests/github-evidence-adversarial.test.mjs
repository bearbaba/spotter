// Adversarial GitHub readiness regression matrix for locked PR evidence.
// These are deterministic offline fixtures, not claims that the app audited
// the GitHub codebase or that a PR is accepted by GenLayer.
import test from "node:test";
import assert from "node:assert/strict";
import {inspectPullRequest} from "../github-preflight.mjs";

const policy={owner:"bearbaba",repository:"spotter",branch:"main",number:26,requiredLabel:""};
function merged(overrides={}){
  return {
    number:26,
    state:"closed",
    merged:true,
    merged_at:"2026-10-14T03:15:00Z",
    merge_commit_sha:"84c1b5d74bc7ca8a63b7a363cb919f53c331ea0a",
    base:{ref:"main",repo:{
      full_name:"bearbaba/spotter",
      html_url:"https://github.com/bearbaba/spotter"
    }},
    labels:[],
    title:"Strengthen locked GitHub source validation and regression tests",
    body:"This PR adds targeted positive and negative cases for GitHub PR readiness, including repository identity, branch, merge evidence, labels, and malformed input handling.",
    ...overrides
  };
}
const cases=[
  ["wrong numeric PR", {number:27}],
  ["wrong repository", {base:{ref:"main",repo:{full_name:"attacker/spotter",html_url:"https://github.com/attacker/spotter"}}}],
  ["forged canonical repository URL", {base:{ref:"main",repo:{full_name:"bearbaba/spotter",html_url:"https://github.com/attacker/spotter"}}}],
  ["missing GitHub repository URL", {base:{ref:"main",repo:{full_name:"bearbaba/spotter"}}}],
  ["wrong branch", {base:{ref:"develop",repo:{full_name:"bearbaba/spotter",html_url:"https://github.com/bearbaba/spotter"}}}],
  ["not merged", {merged:false}],
  ["missing merge SHA", {merge_commit_sha:null}],
  ["malformed merge SHA", {merge_commit_sha:"xyz"}],
  ["open PR that claims merged", {state:"open"}],
  ["missing merge timestamp", {merged_at:null}],
  ["malformed merge timestamp", {merged_at:"invalid-date"}],
  ["missing title", {title:null}],
  ["very short PR title", {title:"Fix"}],
  ["empty PR description", {body:""}],
  ["insufficient PR description", {body:"Fixes stuff"}]
];

test("merged source and coherent GitHub API evidence pass all nine checks",()=>{
  const result=inspectPullRequest(merged(),policy);
  assert.equal(result.ready,true);
  assert.equal(result.checks.length,9);
  assert.equal(result.checks.every(check=>check.ok),true);
});
for(const [name,override] of cases){
  test("fail closed: "+name,()=>{
    const result=inspectPullRequest(merged(override),policy);
    assert.equal(result.ready,false);
    assert.ok(result.checks.some(check=>!check.ok));
  });
}
test("required label is checked explicitly",()=>{
 const required={...policy,requiredLabel:"verified-work"};
 assert.equal(inspectPullRequest(merged(),required).ready,false);
 assert.equal(inspectPullRequest(merged({labels:[{name:"verified-work"}]}),required).ready,true);
 assert.equal(inspectPullRequest(merged({labels:[{name:"unrelated"}]}),required).ready,false);
});
test("malformed or absent GitHub evidence fails closed without throwing",()=>{
 for(const v of [null,{},[],false,"invalid",17,{base:null},{labels:null}]){
  const result=inspectPullRequest(v,policy);
  assert.equal(result.ready,false,"input: "+JSON.stringify(v));
 }
});
