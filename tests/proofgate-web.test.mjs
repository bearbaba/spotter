import test from "node:test";
import assert from "node:assert/strict";
import { parseWork,parseWorkCount,parseGitHubPullUrl,workActionAllowed,createdWorkId,finalizedReceipt } from "../proofgate-core.mjs";
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
 assert.match(ui,/parseWorkCount\(countRaw\)/);
 assert.doesNotMatch(ui,/for\(let id=1;id<=100;id\+\+\)/);
 assert.match(ui,/work\.contract_version !== "3\.0\.0"/);
});

test("V3 Work count unwraps actual Studio and SDK numeric readbacks safely",()=>{
 for(const [raw,expected] of [
  [0,0], [1,1], ["0",0], ["1",1], ['"0"',0], ['"1"',1],
  [JSON.stringify(JSON.stringify("5")),5], ["100",100], [1000000000,1000000000],
 ]) assert.equal(parseWorkCount(raw),expected,"readback "+JSON.stringify(raw));
 for(const raw of [null,undefined,{},[],"","foo","-1","1.1",1.25,-1,1000000001,"01",true])
  assert.equal(parseWorkCount(raw),null,"invalid count "+JSON.stringify(raw));
});

test("V3 workspace puts My Work and Work details left, new agreement and transactions right",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const app=html.split('id="work-app"')[1]?.split('id="certified-work"')[0]??"";
 const left=app.split('<div class="work-left-column"')[1]?.split('<aside class="work-right-column"')[0]??"";
 const right=app.split('<aside class="work-right-column"')[1]??"";
 for(const id of ["workPrimaryList","workSummary","workRead","workId","workPrPreflight","workNextHelp"]){
  assert.ok(left.includes('id="'+id+'"'),"left column must contain "+id);
  assert.equal(right.includes('id="'+id+'"'),false,"right column must not contain "+id);
 }
 for(const id of ["workCreateSection","workHistory","workPending","workTxLink","workCheck","workImportHash","workImport"]){
  assert.ok(right.includes('id="'+id+'"'),"right column must contain "+id);
  assert.equal(left.includes('id="'+id+'"'),false,"left column must not contain "+id);
 }
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 for(const id of ["workCreateSection","workHistory","workSummary","workPrimaryList","workStatus","workPending","workTxLink","workImport"]){
  assert.equal(ids.filter(x=>x===id).length,1,"no duplicated interactive DOM ID: "+id);
 }
 assert.ok(html.includes('@media(max-width:900px){.work-product .work-two-columns{grid-template-columns:minmax(0,1fr)}'),"mobile must stack columns");
});

test("Create Work has three primary inputs and no pre-filled demo PR identity",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const app=html.split('id="work-app"')[1].split('id="certified-work"')[0];
 const right=app.split('<aside class="work-right-column"')[1];
 assert.ok(right.indexOf('class="work-tx-panel"')<right.indexOf('id="workCreateSection"'),"active transaction always above the create form");
 const compact=right.split('id="workCreateSection"')[1].split('id="workAdvancedSection"')[0];
 for(const id of ["workPrUrl","workWorker","workRubric"])assert.ok(compact.includes('id="'+id+'"'),"primary field: "+id);
 const advanced=right.split('id="workAdvancedSection"')[1].split('</details>')[0];
 for(const id of ["workOwner","workRepo","workBranch","workPr","workLabel"])assert.ok(advanced.includes('id="'+id+'"'),"advanced field: "+id);
 assert.ok(right.includes('id="workImportHash"'),"recovery remains available under transaction history");
 assert.match(right,/<section id="workTxPanel"[^>]* hidden>/,"the idle tracker is hidden until a tx is unresolved");
 const history=right.split('<details class="work-history"')[1];
 assert.ok(history?.includes('id="workImportHash"'),"recovery field belongs in collapsed history");
 assert.doesNotMatch(right,/<div class="work-tx-proof"/,"certificate examples must not clutter transaction tracker");
 assert.ok(right.indexOf('id="workTxPanel"')<right.indexOf('id="workCreateSection"'),"active txn becomes visible before the create form only when necessary");
 assert.doesNotMatch(compact,/<h3>Create a work agreement<\/h3>/,"no duplicated heading");
 assert.doesNotMatch(right,/value="bearbaba"|value="spotter"|placeholder="24"/,"never pre-fill somebody else's GitHub repo");
 for(const id of ["workCreateSection","workAdvancedSection","workRubric","workHistory","workPending","workImportHash","workImport"]){
  const count=[...html.matchAll(/\bid="([^"]+)"/g)].filter(match=>match[1]===id).length;
  assert.equal(count,1,"unique DOM ID "+id);
 }
});

test("Only real GitHub PR URLs may select locked repository and PR number",()=>{
 assert.deepEqual(parseGitHubPullUrl("https://github.com/bearbaba/spotter/pull/26"),{owner:"bearbaba",repository:"spotter",number:"26"});
 for(const input of ["","github.com/owner/repo/pull/2","http://github.com/owner/repo/pull/2",
  "https://github.com.evil.invalid/o/r/pull/2","https://github.com/o/r/issues/2",
  "https://github.com/o/r/pull/0","https://github.com/o/r/pull/4294967296"]){
  assert.equal(parseGitHubPullUrl(input),null,"invalid URL: "+input);
 }
 const ui=readFileSync(new URL("../proofgate-ui.mjs",import.meta.url),"utf8");
 assert.match(ui,/parsedPr\.number!==pr/,"locked PR and URL must match");
 assert.match(ui,/await verifyCreatePrIdentity\(/,"identity verified before wallet access");
 assert.match(ui,/pr\.base\?\.ref!==branch/,"branch confirmed from GitHub API");
 assert.match(ui,/An open, unmerged PR is valid/,"creating work cannot require the PR to already be merged");
 assert.doesNotMatch(ui,/if\(!checked\?\.ready\)throw/,"do not block legitimate unmerged PRs at creation");
});

test("transaction status is contextual but an unresolved hash stays visible",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../proofgate-ui.mjs",import.meta.url),"utf8");
 assert.match(html,/<section id="workTxPanel"[^>]* hidden>/);
 assert.match(html,/<details class="work-history">/,"history starts collapsed");
 assert.match(ui,/panel\.hidden = !active/);
 assert.match(ui,/\["PENDING","FINALIZED · EXECUTION UNVERIFIED","FINALIZED · ID UNKNOWN","FINALIZED · VERIFY ID"\]/);
 assert.match(ui,/\$\("workTxLink"\)\.href="https:\/\/explorer-studio\.genlayer\.com\/tx\/"/);
 assert.match(ui,/\$\("workPending"\)\.textContent=""/,"empty status resets");
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 for(const id of ["workTxPanel","workPending","workTxLink","workCheck","workImport","workImportHash"])
  assert.equal(ids.filter(x=>x===id).length,1,"unique transaction control "+id);
});

test("wallet mismatch displays an explicit one-click Studionet switch before create",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../proofgate-ui.mjs",import.meta.url),"utf8");
  const build=readFileSync(new URL("../scripts/build.mjs",import.meta.url),"utf8");
  assert.match(html,/id="walletNetworkNotice"[^>]*hidden/);
  assert.match(html,/id="walletSwitch"/);
  assert.match(html,/id="walletNetworkStatus"/);
  assert.match(ui,/await requestStudionetSwitch\(window\.ethereum\)/);
  assert.match(ui,/window\.ethereum\?\.on\?\.\("chainChanged"/);
  assert.match(ui,/if \(!isStudionetChainId\(chain\)\)/);
  assert.ok(build.includes('"wallet-network.mjs"'));
});

test("new user sees creator signing wallet separately from contributor assignment",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../proofgate-ui.mjs",import.meta.url),"utf8");
  const app=html.split('id="work-app"')[1].split('id="certified-work"')[0];
  const right=app.split('<aside class="work-right-column"')[1];
  assert.ok(right.includes('id="workSignerStatus"'));
  assert.ok(right.includes('id="workConnectWallet"'));
  assert.ok(right.includes('id="walletNetworkNotice"'));
  assert.ok(right.indexOf('id="workSignerStatus"')<right.indexOf('data-work-method="create_work"'));
  assert.match(html,/Use my wallet as contributor/);
  assert.match(ui,/workConnectWallet"\)\.addEventListener\("click"/);
  assert.match(ui,/Do you want the same wallet to be the contributor/);
  assert.match(ui,/The assigned contributor must connect their wallet/);
  assert.doesNotMatch(ui,/Read-only preview\. The deployed GenLayer contract/);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  for(const id of ["workSignerStatus","workConnectWallet","walletNetworkNotice","walletSwitch"])
    assert.equal(ids.filter(x=>x===id).length,1,"unique wallet control: "+id);
});

test("V3 does not call proven earlier states active transactions or block a different next action",()=>{
 const ui=readFileSync(new URL("../proofgate-ui.mjs",import.meta.url),"utf8");
 assert.match(ui,/!workConfirmsPriorStage\(entry,lastWork\)/);
 assert.match(ui,/p\?\.hash && !workConfirmsPriorStage\(p,lastWork\)/);
 assert.match(ui,/fromState:method==="create_work"/);
 assert.match(ui,/same action without verifying its result/);
});

test("My Work refresh is visible beside assigned work, not buried inside transaction recovery",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../proofgate-ui.mjs",import.meta.url),"utf8");
 const left=html.split('<div class="work-left-column"')[1].split('<aside class="work-right-column"')[0];
 const right=html.split('<aside class="work-right-column"')[1];
 assert.ok(left.includes('id="workFindMine"'));
 assert.ok(!right.includes('id="workFindMine"'));
 assert.match(ui,/\$\("workFindMine"\)\.addEventListener\("click"/);
 assert.match(ui,/\$\("workExample"\)\.hidden=work\.id!=="1"/);
 assert.equal([...html.matchAll(/id="workFindMine"/g)].length,1);
});

test("video regression: REVIEW-to-REVIEW re-evaluation cannot be reconciled without a receipt",()=>{
 const ui=readFileSync(new URL("../proofgate-ui.mjs",import.meta.url),"utf8");
 assert.match(ui,/const advanced=workConfirmsPriorStage\(p,work\)/);
 assert.doesNotMatch(ui,/p\.method==="evaluate"&&\["REVIEW","ACCEPTED","CERTIFIED"\]/);
});
