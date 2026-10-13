import test from "node:test";
import assert from "node:assert/strict";
import { parseWork,workActionAllowed,createdWorkId,finalizedReceipt } from "../proofgate-core.mjs";
test("work readback unwraps JSON encoded string",()=>{
 const raw=JSON.stringify(JSON.stringify({id:"1",state:"CERTIFIED",owner:"bearbaba"}));
 assert.deepEqual(parseWork(raw),{id:"1",state:"CERTIFIED",owner:"bearbaba"});
});
test("invalid work evidence is not accepted as a readable work",()=>{
 for(const item of ["garbage","{}",'{"id":"0","state":"ACCEPTED"}',null])assert.equal(parseWork(item),null);
});
test("transition guard fails closed",()=>{
 assert.equal(workActionAllowed("issue_acceptance","REVIEW"),false);
 assert.equal(workActionAllowed("issue_acceptance","SUBMITTED"),false);
 assert.equal(workActionAllowed("issue_acceptance","ACCEPTED"),true);
 assert.equal(workActionAllowed("submit_for_review","OPEN"),true);
 assert.equal(workActionAllowed("evaluate","SUBMITTED"),true);
 assert.equal(workActionAllowed("evaluate","REVIEW"),true);
 assert.equal(workActionAllowed("evaluate","CERTIFIED"),false);
});

import { readFileSync } from "node:fs";
test("official page serves only certified-work interface",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.match(html,/id="work-app"/);
 assert.match(html,/id="certified-work"/);
 assert.doesNotMatch(html,/id="workspace"|src="\.\/app\.mjs|0x730143dF831778569e15975Ef44dFDeCB668609b/);
 assert.match(html,/0xD57aE10754C44223ABf3bA04a43AC2023d92aBE7/);
});

test("receipt must report FINALIZED before success",()=>{
 assert.equal(finalizedReceipt({statusName:"ACCEPTED"}),"PENDING");
 assert.equal(finalizedReceipt({statusName:"FINALIZED",txExecutionResultName:"FINISHED_WITH_RETURN"}),"FINALIZED");
 assert.equal(finalizedReceipt({statusName:"FINALIZED",txExecutionResultName:"FINISHED_WITH_ERROR"}),"FAILED");
 assert.equal(createdWorkId({returnValue:'"2"'}),"2");
 assert.equal(createdWorkId({returnValue:"0x"+"b".repeat(64)}),"");
});
