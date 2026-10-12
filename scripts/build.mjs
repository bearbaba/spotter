import { readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const files = ["index.html", "app.mjs", "spotter-core.mjs"];
for (const file of files) {
  if (!html.includes('src="./app.mjs"') && file === "index.html") {
    throw new Error("Missing application module");
  }
}
if (html.includes('id="undefined"')) throw new Error("Broken HTML reference");
for (const name of ["app.mjs", "spotter-core.mjs"]) {
  execFileSync(process.execPath, ["--check", resolve(root, name)], { stdio: "inherit" });
}
mkdirSync(resolve(root, "dist"), { recursive: true });
for (const file of files) copyFileSync(resolve(root, file), resolve(root, "dist", file));
console.log("Static build OK: dist/index.html + JS modules; no external install needed.");
