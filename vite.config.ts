import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { shrinkFormFrames } from "./scripts/art/shrink-form-frames";
import { firstPaintFontPreloads } from "./scripts/first-paint-fonts";

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

/** Re-saves the exercise pictures in the build's output as lossy WebP
 * (`scripts/art/shrink-form-frames.ts`, Ship1): 335 MB of reviewed
 * lossless frames become about 32 MB in what ships, the iPhone app
 * included. `public/form-frames` keeps the reviewed files untouched. */
function shrinkFormFramesPlugin(): Plugin {
  let outDir = "";
  return {
    name: "tropos-shrink-form-frames",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const { files, shrunk, bytesBefore, bytesAfter } = await shrinkFormFrames(
        path.join(outDir, "form-frames"),
        {
          cacheDir: path.resolve(
            __dirname,
            "node_modules/.cache/tropos-form-frames"
          ),
        }
      );
      const mb = (bytes: number) => (bytes / 1e6).toFixed(1);
      console.log(
        `form frames: ${shrunk} of ${files} re-saved, ${mb(bytesBefore)} MB → ${mb(bytesAfter)} MB`
      );
    },
  };
}

/** Preloads the two font files the first screen draws with from
 * `dist/index.html` (`scripts/first-paint-fonts.ts`), so a first visit on
 * the web fetches them with the stylesheet instead of after it. */
function firstPaintFontsPlugin(): Plugin {
  let base = "/";
  return {
    name: "tropos-first-paint-fonts",
    apply: "build",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        return firstPaintFontPreloads(Object.keys(ctx.bundle ?? {}), base);
      },
    },
  };
}

/** Debug tokens bypass device attestation. Read Vite's resolved env so this
 * also catches .env.local / mode files and native or custom-mode builds.
 * Never include the token value in an error or a build artifact. */
function releaseDebugTokenGuard(): Plugin {
  return {
    name: "tropos-release-debug-token-guard",
    apply: "build",
    configResolved(config) {
      if (config.env.VITE_APP_CHECK_DEBUG_TOKEN?.trim()) {
        throw new Error(
          "Refusing to build with VITE_APP_CHECK_DEBUG_TOKEN. Remove it from the build environment and .env files; use it only with the local development server."
        );
      }
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
    releaseDebugTokenGuard(),
    shrinkFormFramesPlugin(),
    firstPaintFontsPlugin(),
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

    // Inline assets smaller than Vite's 4KB default, keep larger ones as
    // separate files, and never inline a font: index.html's CSP takes fonts
    // from 'self' only, so a font inlined as a data: URL is refused (Plus
    // Jakarta Sans's extended-Cyrillic subset, 2.3KB, was). cspFonts.test.ts.
    assetsInlineLimit: (file) =>
      /\.(woff2?|ttf|otf|eot)$/i.test(file) ? false : undefined,

    rollupOptions: {
      output: {
        // No experimentalMinChunkSize, though two chunks in five are
        // under 1 KB. Measured at 2, 5, 10, 15 and 20 KB: Rollup merges a
        // small chunk into whichever chunk it judges cheapest, counting
        // only the small chunk's own bytes. It moved firestoreWrite
        // (600 B) into the entry, which put firebase-db on every cold
        // start (check-dist-size's coldStart gate fails at every size),
        // and the 395 B play icon into GuideWalk, so Home then loaded
        // GuideWalk statically. Naming the entry's own code as a manual
        // chunk keeps merges out of it, and sends the shared small chunks
        // into big lazy ones instead: Home's closure grew 40%. The small
        // chunks are the cheaper cost.
        //
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
        // @capacitor-firebase/analytics (the native plugin) is not pinned:
        // analyticsProvider imports it dynamically, on native only, and
        // Rollup gives it a lazy chunk of its own. The web SDK it falls
        // back to is pinned to firebase-analytics below, which is lazy too.
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
          // The web push and web analytics SDKs, and the installations SDK
          // both of them use, each get a chunk of their own: the catch-all
          // below would put them in firebase-auth, which every cold start
          // loads, though each is reached only by a dynamic import (a web
          // push gesture or the signed-in listener; analytics once the app
          // has started, on the web) and the iPhone app reaches neither.
          if (id.includes("node_modules/@firebase/installations/"))
            return "firebase-installations";
          if (/node_modules\/(@firebase\/|firebase\/)messaging\//.test(id))
            return "firebase-messaging";
          if (/node_modules\/(@firebase\/|firebase\/)analytics\//.test(id))
            return "firebase-analytics";
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
