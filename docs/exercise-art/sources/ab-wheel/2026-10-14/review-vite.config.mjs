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
  "Kneel on a pad holding the ab wheel with both hands under your shoulders.",
];
const rows = beats.map(({ t, label, cue }) => [t, label, cue]);
const staged = {
  name: "staged-ab-wheel-art-only",
  enforce: "pre",
  transform(code, id) {
    const p = id.replaceAll("\\", "/").split("?")[0];
    if (p.endsWith("/src/lib/formArtReleases.data.ts"))
      return (
        code +
        '\nAPPROVED_FORM_ART_RELEASES["ab-wheel"] = ' +
        JSON.stringify({
          folder: "2026-10-14",
          version: "staged-ab-wheel-connected-window-v1",
          width: 1448,
          height: 924,
          reference: 1,
        }) +
        ";\n"
      );
    if (p.endsWith("/src/lib/releasedFormPlacards.ts"))
      return (
        code +
        '\nObject.assign(RELEASED_FORM_PLACARDS, {"ab-wheel": placard("ab-wheel", ["Core"], ["Lats","Shoulders"], ' +
        JSON.stringify(rows) +
        "," +
        JSON.stringify(setupInstructions) +
        ")});\n"
      );
  },
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url, "http://127.0.0.1:8780");
      const match = url.pathname.match(
        /^\/form-frames\/ab-wheel\/([1-6])\.webp$/
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
    port: 8780,
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
