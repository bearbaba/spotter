import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const path=new URL("../deployments/studionet-v3.json",import.meta.url);
const manifest=JSON.parse(readFileSync(path,"utf8"));
const source=readFileSync(new URL("../contracts/proofgate.py",import.meta.url),"utf8");
const ui=readFileSync(new URL("../proofgate-ui.mjs",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const readme=readFileSync(new URL("../README.md",import.meta.url),"utf8");
const reviewer=readFileSync(new URL("../REVIEWER.md",import.meta.url),"utf8");
const oldAddress="0xD57aE10754C44223ABf3bA04a43AC2023d92aBE7";
const oldCertificate="0xc3d1a5c2611111a8763d74582c07c75bdb8f4694a89f6363e3fabca933107599";

test("V3 schema and public interface preserve exact agreed work lifecycle",()=>{
 for(const api of [
  "def create_work(", "def submit_for_review(", "def evaluate(",
  "def issue_acceptance(", "def get_work(", "def get_version(", "def get_work_count("
 ])assert.ok(source.includes(api),"missing API "+api);
 assert.match(source,/return "3\.0\.0"/);
 assert.match(source,/acceptance rubric required/);
 assert.match(source,/gl\.eq_principle\.strict_eq\(collect\)/);
 assert.match(source,/gl\.eq_principle\.prompt_non_comparative\(/);
 assert.match(source,/parse_qualitative_result\(ai_raw\)/);
 assert.match(source,/qualitative_evidence/);
});

test("No production cutover is permitted without a verifiable V3 deployment record",()=>{
 assert.equal(manifest.chainId,61999);
 assert.equal(manifest.version,"3.0.0");
 assert.equal(manifest.source,"contracts/proofgate.py");
 if(manifest.status==="NOT_DEPLOYED"){
  assert.equal(manifest.address,null);
  assert.equal(manifest.deployTxHash,null);
  assert.equal(manifest.productionCutover,false);
  assert.ok(ui.includes(oldAddress),"legacy web runtime must remain unchanged until real V3 deploy");
  return;
 }
 assert.equal(manifest.status,"VERIFIED_ON_STUDIONET");
 assert.match(manifest.address,/^0x[0-9a-fA-F]{40}$/);
 assert.match(manifest.deployTxHash,/^0x[0-9a-fA-F]{64}$/);
 assert.match(manifest.verifiedSourceCommit,/^[0-9a-f]{40}$/);
 assert.match(manifest.verifiedSourceSha256,/^[0-9a-f]{64}$/);
 assert.ok(ui.includes(manifest.address),"UI must point at deployed V3 address");
 assert.ok(html.includes(manifest.address),"site must link deployed V3 address");
 assert.ok(readme.includes(manifest.address),"README must document deployed V3 address");
 assert.ok(reviewer.includes(manifest.address),"REVIEWER must document deployed V3 address");
 for(const [name,contents] of [["UI",ui],["HTML",html]]){
   assert.ok(!contents.includes(oldAddress),name+" must not show legacy contract as V3");
   assert.ok(!contents.includes(oldCertificate),name+" must not show the old certificate as V3 proof");
 }
});
