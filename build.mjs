import { readFileSync, writeFileSync } from "node:fs";
const html = readFileSync(new URL("index.html", import.meta.url), "utf8")
  .replace(
    '<link rel="stylesheet" href="style.css">',
    () =>
      "<style>" +
      readFileSync(new URL("style.css", import.meta.url), "utf8") +
      "</style>",
  )
  .replace(
    '<script src="combat.js"></script>',
    () =>
      "<script>" +
      readFileSync(new URL("combat.js", import.meta.url), "utf8") +
      "</script>",
  )
  .replace(
    '<script src="game.js"></script>',
    () =>
      "<script>" +
      readFileSync(new URL("game.js", import.meta.url), "utf8").replace(
        "assets/sky-castle.png",
        "data:image/png;base64," +
          readFileSync(
            new URL("assets/sky-castle.png", import.meta.url),
          ).toString("base64"),
      ) +
      "</script>",
  );
writeFileSync(new URL("锅盖雪人.html", import.meta.url), html);
console.log("Built standalone offline HTML");
