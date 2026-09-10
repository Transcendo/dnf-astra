import { readFileSync, writeFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
function replaceOnce(source, target, value) {
  if (source.split(target).length !== 2) {
    throw new Error(`Expected exactly one build reference: ${target}`);
  }
  return source.replace(target, () => value);
}

let html = replaceOnce(read("index.html.in"), '<link rel="stylesheet" href="style.css">', `<style>${read("style.css")}</style>`);
for (const name of ["combat.js", "sprite-data.js", "game.js"]) {
  let script = read(name);
  if (name === "game.js") {
    for (const asset of ["sky-castle.png", "mage-snowman.png"]) {
      const data = readFileSync(new URL(`assets/${asset}`, import.meta.url)).toString("base64");
      script = replaceOnce(script, `assets/${asset}`, `data:image/png;base64,${data}`);
    }
  }
  html = replaceOnce(html, `<script src="${name}"></script>`, `<script>${script}</script>`);
}
// Fail before replacing the last usable artifact if a new resource was not packaged.
if (/<script\b[^>]*\bsrc\s*=|<link\b[^>]*\bhref\s*=|["']assets\//i.test(html)) {
  throw new Error("Standalone build still contains an external resource reference");
}
writeFileSync(new URL("index.html", import.meta.url), html);
console.log("Built standalone offline HTML (scripts, style, background and mage sprites embedded)");
