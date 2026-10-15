import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, "../../Maiin-burpees");
const { defineConfig } = await import(
  pathToFileURL(path.join(repo, "node_modules/vite/dist/node/index.js")).href
);
const { default: react } = await import(
  pathToFileURL(
    path.join(repo, "node_modules/@vitejs/plugin-react/dist/index.js")
  ).href
);
const { default: tailwindcss } = await import(
  pathToFileURL(
    path.join(repo, "node_modules/@tailwindcss/vite/dist/index.mjs")
  ).href
);
const beats = JSON.parse(
  fs.readFileSync(path.join(root, "draft-beats.json"), "utf8")
);
const setupInstructions = [
  "Straddle the loaded bar or landmine and grip the handles at your shins.",
  "Hinge forward to about 45\u00b0, chest up, back flat, core braced.",
];
const rows = beats.map(({ t, label, cue }) => [t, label, cue]);
const staged = {
  name: "staged-t-bar-row-art-only",
  enforce: "pre",
  transform(code, id) {
    const p = id.replaceAll("\\", "/").split("?")[0];
    if (p.endsWith("/src/lib/formArtReleases.data.ts"))
      return (
        code +
        '\nAPPROVED_FORM_ART_RELEASES["t-bar-row"] = ' +
        JSON.stringify({
          folder: "2026-10-15",
          version: "staged-t-bar-row-retained-two-endpoint-v1",
          width: 918,
          height: 1036,
          reference: 1,
        }) +
        ";\n"
      );
    if (p.endsWith("/src/lib/releasedFormPlacards.ts"))
      return (
        code +
        '\nObject.assign(RELEASED_FORM_PLACARDS, {"t-bar-row": placard("t-bar-row", ["Mid Back"], ["Lats","Rhomboids","Biceps"], ' +
        JSON.stringify(rows) +
        "," +
        JSON.stringify(setupInstructions) +
        ")});\n"
      );
  },
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url, "http://127.0.0.1:8786");
      const match = url.pathname.match(
        /^\/form-frames\/t-bar-row\/([1-6])\.webp$/
      );
      if (!match) return next();
      res.setHeader("Content-Type", "image/webp");
      res.setHeader("Cache-Control", "no-store");
      res.end(
        fs.readFileSync(path.join(root, "final-frames", match[1] + ".webp"))
      );
    });
  },
};
export default defineConfig({
  root,
  base: "/",
  publicDir: path.join(repo, "public"),
  plugins: [staged, react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.join(repo, "src"),
      react: path.join(repo, "node_modules/react"),
      "react-dom": path.join(repo, "node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: "127.0.0.1",
    port: 8786,
    strictPort: true,
    fs: {
      allow: [
        root,
        path.dirname(repo),
        fs.realpathSync(path.join(repo, "node_modules")),
      ],
    },
  },
  cacheDir: path.join(root, ".vite-review-cache"),
});
