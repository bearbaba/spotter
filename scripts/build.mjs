import { readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const entry = readFileSync(resolve(root, "app.mjs"), "utf8");
if (!/from "\.\/jobs-browser\.mjs\?v=[a-z0-9-]+"/i.test(entry)) throw new Error("Missing versioned Job explorer module import");
const files = ["index.html", "app.mjs", "spotter-core.mjs", "jobs-browser.mjs"];
for (const file of files) {
  if (file === "index.html" && !/src="\.\/app\.mjs\?v=[a-z0-9-]+"/i.test(html)) {
    throw new Error("Missing application module");
  }
}
if (html.includes('id="undefined"')) throw new Error("Broken HTML reference");
for (const name of ["app.mjs", "spotter-core.mjs", "jobs-browser.mjs"]) {
  execFileSync(process.execPath, ["--check", resolve(root, name)], { stdio: "inherit" });
}
mkdirSync(resolve(root, "dist"), { recursive: true });
for (const file of files) copyFileSync(resolve(root, file), resolve(root, "dist", file));
mkdirSync(resolve(root, "dist", "v2"), { recursive: true });
copyFileSync(resolve(root, "v2", "index.html"), resolve(root, "dist", "v2", "index.html"));
console.log("Static build OK: V1 legacy explorer and V2 preview included.");
