import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {resolve,join,posix} from "node:path";

test("production build includes all module imports, not just a syntactically valid HTML file",()=>{
 const root=resolve(import.meta.dirname,"..");
 execFileSync(process.execPath,[resolve(root,"scripts/build.mjs")],{cwd:root});
 const html=readFileSync(join(root,"dist/index.html"),"utf8");
 const imports=[...html.matchAll(/<script\b[^>]*\bsrc=["'](\.\/[^"'?]+)(?:\?[^"']*)?["']/g)].map(m=>m[1].slice(2));
 assert.ok(imports.includes("proofgate-ui.mjs"));
 const traversed=new Set();
 const visit=name=>{
  if(traversed.has(name))return;
  traversed.add(name);
  const absolute=join(root,"dist",name);
  assert.ok(existsSync(absolute),"Missing deployed JS file: "+name);
  const text=readFileSync(absolute,"utf8");
  for(const match of text.matchAll(/\b(?:from\s*|import\s*)["'](\.[^"']+)["']/g)){
    const next=posix.normalize(posix.join(posix.dirname(name),match[1]));
    visit(next);
  }
 };
 for(const entry of imports)visit(entry);
 assert.ok(traversed.has("github-preflight.mjs"),"GitHub PR checks must be shipped to Vercel");
 assert.ok(traversed.has("transaction-tracker.mjs"),"Multi-receipt tracker must be shipped to Vercel");
});
