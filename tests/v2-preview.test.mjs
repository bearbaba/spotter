import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync(new URL("../v2/index.html",import.meta.url),"utf8");
test("V2 preview identifies itself as non-custodial development UI",()=>{
 assert.match(html,/Development preview · No deposits/);
 assert.match(html,/No escrow contract is authorized for real funds/);
 assert.match(html,/sample UI, not an indexed live marketplace/);
});
test("V2 preview does not pretend to have a deployed escrow or wallet integration",()=>{
 assert.doesNotMatch(html,/ethereum\.request|sendTransaction|writeContract|payable\(/);
 assert.match(html,/finality adapter/);
 assert.match(html,/independent dispute fallback/);
});
test("V2 preview offers navigable protocol and marketplace sections",()=>{
 for(const id of ["protocol","marketplace","security","jobs","filter"])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/replaceChildren\(\)/);
 assert.match(html,/textContent=x.title/);
});
