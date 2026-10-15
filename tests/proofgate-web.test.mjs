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
 assert.match(html,/0x506205eBc1ba011707D63d8a152625baaC63002D/);
 assert.match(html,/PR #26/);
 assert.doesNotMatch(html,/0xc3d1a5c2611111a8763d74582c07c75bdb8f4694a89f6363e3fabca933107599/);
});

test("receipt must report FINALIZED before success",()=>{
 assert.equal(finalizedReceipt({statusName:"ACCEPTED"}),"PENDING");
 assert.equal(finalizedReceipt({statusName:"FINALIZED",txExecutionResultName:"FINISHED_WITH_RETURN"}),"FINALIZED");
 assert.equal(finalizedReceipt({statusName:"FINALIZED",txExecutionResultName:"FINISHED_WITH_ERROR"}),"FAILED");
 assert.equal(createdWorkId({returnValue:'"2"'}),"2");
 assert.equal(createdWorkId({returnValue:"0x"+"b".repeat(64)}),"");
});

test("receipt watcher fails closed on incomplete and negative executions",()=>{
 assert.equal(finalizedReceipt({statusName:"FINALIZED"}),"FINALIZED_UNVERIFIED");
 assert.equal(finalizedReceipt({statusName:"FINALIZED",txExecutionResultName:"NOT_VOTED"}),"FINALIZED_UNVERIFIED");
 assert.equal(finalizedReceipt({statusName:"FINALIZED",txExecutionResultName:"TIMEOUT"}),"FAILED");
 assert.equal(finalizedReceipt({statusName:"FINALIZED",txExecutionResultName:"NONDET_DISAGREE"}),"FAILED");
 assert.equal(finalizedReceipt({statusName:"PENDING",txExecutionResultName:"FINISHED_WITH_RETURN"}),"PENDING");
 const ui=readFileSync(new URL("../proofgate-ui.mjs",import.meta.url),"utf8");
 assert.match(ui,/getVerifiedReceipt\(hash=>client\.getTransaction\(\{hash\}\)/);
 assert.doesNotMatch(ui,/waitForTransactionReceipt\(\{hash:p\.hash/);
});

test("numeric GenVM success from Studio receipt verifies finalized transaction",()=>{
 const receipt={id:"0x"+"8".repeat(64),statusName:"FINALIZED",txExecutionResult:1};
 assert.equal(finalizedReceipt(receipt),"FINALIZED");
 assert.equal(finalizedReceipt({...receipt,txExecutionResult:"1"}),"FINALIZED");
 assert.equal(finalizedReceipt({...receipt,txExecutionResult:2}),"FAILED");
 assert.equal(finalizedReceipt({...receipt,txExecutionResult:3}),"FAILED");
 assert.equal(finalizedReceipt({...receipt,txExecutionResult:4}),"FAILED");
 assert.equal(finalizedReceipt({...receipt,txExecutionResult:5}),"FAILED");
 assert.equal(finalizedReceipt({...receipt,txExecutionResult:0}),"FINALIZED_UNVERIFIED");
 assert.equal(finalizedReceipt({statusName:"FINALIZED"}),"FINALIZED_UNVERIFIED");
 assert.equal(finalizedReceipt({...receipt,txExecutionResultName:"FINISHED_WITH_ERROR"}),"FINALIZED_UNVERIFIED");
 assert.equal(finalizedReceipt({...receipt,statusName:"ACCEPTED"}),"PENDING");
});

test("V3 app keeps browser transactions scoped to its contract and avoids legacy work-index guesses",()=>{
 const ui=readFileSync(new URL("../proofgate-ui.mjs",import.meta.url),"utf8");
 assert.match(ui,/const SCOPE = CHAIN \+ ":" \+ ADDRESS\.toLowerCase\(\)/);
 assert.match(ui,/spotter\.work\.history\.v2/);
 assert.match(ui,/functionName:"get_work_count"/);
 assert.doesNotMatch(ui,/for\(let id=1;id<=100;id\+\+\)/);
 assert.match(ui,/work\.contract_version !== "3\.0\.0"/);
});
