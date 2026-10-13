import test from "node:test";
import assert from "node:assert/strict";
import { parseWork,workActionAllowed } from "../proofgate-core.mjs";
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
