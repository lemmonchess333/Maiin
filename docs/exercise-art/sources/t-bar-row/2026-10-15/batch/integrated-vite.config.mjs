import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, "../Maiin-burpees");
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
// Actual repository modules and actual public assets only. No transform,
// middleware asset substitution, staged registry or staged placard plugin.
export default defineConfig({
  root,
  base: "/",
  publicDir: path.join(repo, "public"),
  plugins: [react(), tailwindcss()],
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
    port: 8784,
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
