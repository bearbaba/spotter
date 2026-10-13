import { readFileSync, mkdirSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname, posix } from "node:path";

const root=resolve(import.meta.dirname,"..");
const output=resolve(root,"dist");
const html=readFileSync(resolve(root,"index.html"),"utf8");

// Explicit static-entry manifest. Never silently omit a dependency of a shipped module.
const files=[
 "index.html",
 "proofgate-ui.mjs",
 "proofgate-core.mjs",
 "transaction-tracker.mjs",
 "github-preflight.mjs",
];
const shipped=new Set(files);
if(!html.includes('id="work-app"') || !html.includes('id="certified-work"'))
 throw Error("Missing certified work interface");
if(html.includes('id="workspace"') || html.includes('src="./app.mjs') || html.includes("0x730143dF831778569e15975Ef44dFDeCB668609b"))
 throw Error("Legacy webpage workflow must not ship on the main site");

const pageScripts=[...html.matchAll(/<script\b[^>]*\bsrc=["'](\.\/[^"'?]+)(?:\?[^"']*)?["'][^>]*>/g)];
for(const [,source] of pageScripts){
 const target=posix.normalize(source.slice(2));
 if(!shipped.has(target))throw Error("Missing local entry point in deployment: "+target);
}
for(const name of files.filter(x=>x.endsWith(".mjs"))){
 const full=resolve(root,name);
 execFileSync(process.execPath,["--check",full],{stdio:"inherit"});
 const source=readFileSync(full,"utf8");
 for(const match of source.matchAll(/\b(?:from\s*|import\s*)["'](\.[^"']+)["']/g)){
  const target=posix.normalize(posix.join(posix.dirname(name),match[1]));
  if(!shipped.has(target) || !existsSync(resolve(root,target)))
   throw Error(name+" imports a missing deployment module: "+target);
 }
}
rmSync(output,{recursive:true,force:true});
mkdirSync(output,{recursive:true});
for(const file of files) {
 const destination=resolve(output,file);
 mkdirSync(dirname(destination),{recursive:true});
 copyFileSync(resolve(root,file),destination);
}
console.log("Spotter static build OK ("+files.length+" deployed files; internal module closure verified).");
