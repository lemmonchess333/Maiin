import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const isCapacitor = process.env.CAPACITOR_BUILD === "true";
// Firebase Hosting serves from the domain root, AND from the same origin as the
// Firebase auth handler (PROJECT.firebaseapp.com/__/auth/handler) — which is
// what makes OAuth sign-in (Apple/Google popup) work on iOS Safari. GitHub
// Pages serves under /Maiin/ on a *different* domain (…github.io), so its
// cross-origin auth popup is severed by Safari ITP. Build with HOSTING_TARGET
// =firebase for the root-based, same-origin Hosting bundle.
const isFirebaseHosting = process.env.HOSTING_TARGET === "firebase";

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
  base: isCapacitor || isFirebaseHosting ? "/" : "/Maiin/",
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
        // FUNCTION form, not the object form. The object form
        // (`charts: ["recharts"]`) claims the listed package AND its
        // entire dependency subtree into the chunk — recharts' subtree
        // includes shared utilities (clsx, react-is, tiny-invariant,
        // use-sync-external-store) that eager code also imports, which
        // gave the entry chunk a static edge to the 403KB charts chunk
        // and made index.html modulepreload it on every cold start.
        // The function form pins ONLY the named packages; shared deps
        // float free and Rollup hoists them into the eager graph where
        // they belong.
        //
        // firebase/analytics (web SDK) and @capacitor-firebase/analytics
        // (native plugin) are deliberately NOT pinned: both are loaded
        // via dynamic import from analyticsProvider, and a forced chunk
        // would union the API surface used by each consumer, making the
        // web path ship the larger surface the native plugin's
        // web-fallback references. Letting Rollup auto-split keeps the
        // web analytics chunk tree-shaken to just what the web path uses.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("node_modules/recharts/")) return "charts";
          if (id.includes("node_modules/maplibre-gl/")) return "maplibre";
          if (
            /node_modules\/(framer-motion|motion-dom|motion-utils)\//.test(id)
          )
            return "motion";
          if (id.includes("node_modules/date-fns/")) return "date-fns";
          if (id.includes("node_modules/@zxing/")) return "barcode";
          if (id.includes("node_modules/react-body-highlighter/"))
            return "body-highlighter";
          if (id.includes("node_modules/@stripe/stripe-js/")) return "stripe";
          // firestore/storage product code + their shims → firebase-db;
          // everything else firebase (+ idb, used by @firebase/app for
          // IndexedDB persistence) → firebase-auth. Order matters: the
          // db match must run before the catch-all.
          if (
            /node_modules\/(@firebase\/(firestore|storage|webchannel-wrapper)|firebase\/(firestore|storage))\//.test(
              id
            )
          )
            return "firebase-db";
          if (/node_modules\/(@firebase\/|firebase\/|idb\/)/.test(id))
            return "firebase-auth";
          if (
            /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(
              id
            )
          )
            return "vendor";
          // Micro-utils shared by BOTH the eager graph and lazy-pinned
          // libs (recharts et al). Left unpinned, Rollup's small-chunk
          // merging can host them INSIDE a lazy chunk (it merged clsx
          // into charts), which silently gives the entry a static edge
          // to that whole chunk — index.html then modulepreloads 403KB
          // of recharts on every cold start just to reach clsx. Pin
          // them to vendor (always eager) so a lazy chunk can never
          // become their host. If a future bundle-size audit shows a
          // lazy chunk back in index.html's modulepreload list, look
          // for a new shared micro-dep first.
          if (
            /node_modules\/(clsx|react-is|tiny-invariant|use-sync-external-store)\//.test(
              id
            )
          )
            return "vendor";
          return undefined;
        },
      },
    },
  },
}));
