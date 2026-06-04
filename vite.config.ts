import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const isCapacitor = process.env.CAPACITOR_BUILD === "true";

/**
 * Plugin that emits `dist/TROPOS_E2E_BUILD_DO_NOT_DEPLOY` whenever
 * the build runs in test mode (`npm run build:e2e`). The GitHub
 * Pages deploy workflow greps dist/ for this string and aborts if
 * it sees it, so a stray E2E build can't ship to production.
 *
 * Why a separate file rather than a top-of-bundle `banner` string:
 * esbuild's minifier strips ordinary `/* *\/` comments. Even the
 * legal-comment `/*! *\/` form only survives in a subset of
 * chunks under Vite's defaults (`legalComments: "none"`). Emitting
 * a dedicated asset is invariant to minifier behaviour and shows
 * up as a single, obviously-named file in the dist tree.
 */
function e2eMarkerPlugin(): Plugin {
  return {
    name: "tropos-e2e-build-marker",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "TROPOS_E2E_BUILD_DO_NOT_DEPLOY",
        source:
          "TROPOS_E2E_BUILD_DO_NOT_DEPLOY\n" +
          "\n" +
          "Emitted by `vite build --mode=test` (npm run build:e2e). Sentinel for\n" +
          "the GitHub Pages deploy workflow which greps dist/ for this exact\n" +
          "string and aborts if found. The string is repeated in the body so\n" +
          "the deploy-guard `grep -R` matches contents, not just filenames.\n",
      });
    },
  };
}

/**
 * Function form so we can read the resolved Vite mode. `--mode=test`
 * builds (driven by `npm run build:e2e` and the emulator-tests
 * workflow) install the e2eMarkerPlugin. The marker is the second
 * half of a defence-in-depth chain — the first half being
 * Playwright's project-scoped bypassCSP, which only relaxes CSP in
 * the test browser context, never in the served artifact.
 */
export default defineConfig(({ mode }) => ({
  base: isCapacitor ? "/" : "/Maiin/",
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || "1.1.0"),
  },
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === "test" ? [e2eMarkerPlugin()] : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    minify: "esbuild",
    sourcemap: false,
    // Performance budget: warn if any chunk exceeds this limit (KB)
    // maplibre (~1MB) and barcode (~416KB) are already lazy-loaded in their own chunks
    chunkSizeWarningLimit: 1100,

    // Inline assets smaller than 4KB, keep larger ones as separate files
    assetsInlineLimit: 4096,

    rollupOptions: {
      output: {
        manualChunks: {
          "firebase-auth": ["firebase/app", "firebase/auth"],
          "firebase-db": ["firebase/firestore", "firebase/storage"],
          // firebase/analytics (web SDK) and @capacitor-firebase/analytics
          // (native plugin) are deliberately NOT forced into manual chunks:
          // both are loaded via dynamic import from analyticsProvider, and a
          // forced chunk would union the API surface used by each consumer,
          // making the web path ship the larger surface the native plugin's
          // web-fallback references. Letting Rollup auto-split keeps the web
          // analytics chunk tree-shaken to just what the web path uses.
          charts: ["recharts"],
          vendor: ["react", "react-dom", "react-router-dom"],
          maplibre: ["maplibre-gl"],
          motion: ["framer-motion"],
          "date-fns": ["date-fns"],
          barcode: ["@zxing/browser"],
          "body-highlighter": ["react-body-highlighter"],
          stripe: ["@stripe/stripe-js"],
        },
      },
    },
  },
}));
