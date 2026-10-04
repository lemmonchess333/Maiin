const fs = require("node:fs"),
  path = require("node:path");
const dir = path.resolve(process.argv[2] || ".");
const files = [
  "1-master.png",
  "2-half-candidate.png",
  "3-depth-clean.png",
  "2-half-candidate.png",
  "1-master.png",
  "1-master.png",
];
files.forEach((f, i) =>
  fs.copyFileSync(
    path.join(dir, f),
    path.join(dir, "review-" + (i + 1) + ".png")
  )
);
