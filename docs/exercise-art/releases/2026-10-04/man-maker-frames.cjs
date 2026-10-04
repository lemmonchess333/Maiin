const fs = require("node:fs"),
  path = require("node:path");
const dir = path.resolve(process.argv[2] || ".");
for (let i = 1; i <= 6; i++)
  fs.copyFileSync(
    path.join(dir, i + ".png"),
    path.join(dir, "review-" + i + ".png")
  );
