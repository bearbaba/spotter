// Spotter V3: independent, read-only source and certificate receipt verification.
// GitHub Actions runs this script with Node 22. Never sends a wallet transaction.
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";

const root=new URL("../",import.meta.url);
const manifest=JSON.parse(readFileSync(new URL("deployments/studionet-v3.json",root),"utf8"));
const expectedSource=readFileSync(new URL("contracts/proofgate.py",root));
const rpcEndpoint="https://studio.genlayer.com/api";
const hexAddress=value=>typeof value==="string"&&/^0x[0-9a-fA-F]{40}$/.test(value);
const hexTx=value=>typeof value==="string"&&/^0x[0-9a-fA-F]{64}$/.test(value);
const normalize=value=>String(value||"").toLowerCase();

async function rpc(method,params){
  const resp=await fetch(rpcEndpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:AbortSignal.timeout(25000)});
  if(!resp.ok)throw new Error(method+" HTTP "+resp.status);
  const body=await resp.json();
  if(body.error)throw new Error(method+" JSON-RPC "+JSON.stringify(body.error).slice(0,360));
  if(body.result===null || body.result===undefined)throw new Error(method+" has no result");
  return body.result;
}
function assert(check,message){if(!check)throw Error("VERIFICATION FAILED: "+message);}
assert(manifest.chainId===61999,"unexpected chain");
assert(manifest.version==="3.0.0","version changed");
assert(hexAddress(manifest.address),"missing V3 address");
assert(hexTx(manifest.deployTxHash),"missing deploy transaction");
assert(manifest.positiveCaseReadback?.state==="CERTIFIED","Work #1 is not recorded as CERTIFIED");
const certificateTx=manifest.positiveCaseReadback.certificationTxHash;
assert(hexTx(certificateTx),"missing certificate tx ID");

const contractBase64=await rpc("gen_getContractCode",[{address:manifest.address,status:"finalized"}]);
assert(typeof contractBase64==="string" && /^[A-Za-z0-9+/=]+$/.test(contractBase64),"contract code is not base64");
const deployedCode=Buffer.from(contractBase64,"base64");
const checksum=x=>createHash("sha256").update(x).digest("hex");
const sourceHash=checksum(expectedSource),deployedHash=checksum(deployedCode);
console.log("V3 candidate source sha256:",sourceHash);
console.log("V3 finalized deployed code sha256:",deployedHash);
assert(deployedCode.equals(expectedSource),"deployed contract code differs from frozen GitHub contract source");

const certificate=await rpc("gen_getTransactionReceipt",[{txId:certificateTx}]);
assert(normalize(certificate.id)===normalize(certificateTx),"receipt hash mismatch");
assert(normalize(certificate.recipient)===normalize(manifest.address),"certificate tx recipient not V3 contract");
assert(String(certificate.statusName??"").toUpperCase()==="FINALIZED" || Number(certificate.status)===7,"certificate tx not FINALIZED");
assert(Number(certificate.txExecutionResult)===1,"certificate GenVM execution did not finish successfully");
const expectedClient="0x4C7cb73aC8F8999af21cfc9fF4cF2333a9508Dcb";
const expectedWorker="0xD6b8A3A5eB329410D9504784812b8569afA8C2aF";
assert([expectedClient,expectedWorker].some(a=>normalize(a)===normalize(certificate.sender)),"certificate issuer was not an authorized participant");

const deployment=await rpc("gen_getTransactionReceipt",[{txId:manifest.deployTxHash}]);
assert(normalize(deployment.id)===normalize(manifest.deployTxHash),"deploy receipt hash mismatch");
assert(String(deployment.statusName??"").toUpperCase()==="FINALIZED" || Number(deployment.status)===7,"deploy tx not FINALIZED");
assert(Number(deployment.txExecutionResult)===1,"deploy GenVM execution did not finish successfully");

console.log("Spotter V3 independent verification PASS");
console.log(JSON.stringify({contract:manifest.address,version:manifest.version,sourceSha256:sourceHash,deployedSha256:deployedHash,deployTx:manifest.deployTxHash,certificateTx,certificateSender:certificate.sender,certificateRecipient:certificate.recipient,certificateStatus:certificate.statusName,certificateExecutionResult:certificate.txExecutionResult},null,2));
