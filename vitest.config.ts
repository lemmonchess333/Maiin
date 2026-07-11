import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    "import.meta.env.VITE_FIREBASE_API_KEY": JSON.stringify("test-api-key"),
    "import.meta.env.VITE_FIREBASE_AUTH_DOMAIN": JSON.stringify(
      "test.firebaseapp.com"
    ),
    "import.meta.env.VITE_FIREBASE_PROJECT_ID": JSON.stringify("test-project"),
    "import.meta.env.VITE_FIREBASE_STORAGE_BUCKET":
      JSON.stringify("test.appspot.com"),
    "import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID":
      JSON.stringify("000000000000"),
    "import.meta.env.VITE_FIREBASE_APP_ID": JSON.stringify("1:000:web:000"),
  },
  test: {
    globals: true,
    setupFiles: "./src/test/setup.ts",
    exclude: [
      "e2e/**",
      "node_modules/**",
      // Exclude nested node_modules (e.g. `functions/node_modules/**`).
      // Post-W1f we pulled in @apple/app-store-server-library which
      // ships its own vitest-compatible test suite; without this the
      // root-level runner picks them up and treats them as ours.
      "**/node_modules/**",
      "functions/**",
      ".claude/**",
    ],
    /* Two projects (2026-07-11 repo audit batch 2): jsdom environment
       boot dominates the suite — the baseline profile measured a MEDIAN
       of ~11ms of actual test time per file inside a ~200s wall-clock
       run. Pure business-logic directories run in the near-zero-cost
       node environment; component/hook/page tests keep jsdom. The few
       files inside the pure directories that genuinely need DOM/storage
       APIs carry a per-file `@vitest-environment jsdom` pragma, which
       overrides the project environment — so classification lives WITH
       the file, and a new DOM-dependent test in lib/ just declares
       itself. `npx vitest run` still runs everything. */
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: [
            "src/lib/__tests__/**/*.test.{ts,tsx}",
            "src/utils/__tests__/**/*.test.{ts,tsx}",
            "src/features/program/__tests__/**/*.test.{ts,tsx}",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "root-node",
          environment: "node",
          include: [
            // Firestore rules + collection-group suites (emulator-gated;
            // `npm run test:rules` passes these files EXPLICITLY — a
            // project must include them or that command runs zero tests
            // and passes vacuously) and script tests. All node-safe.
            "firestore.*.test.ts",
            "storage.rules.test.ts",
            "scripts/**/*.test.{ts,tsx}",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: [
            "e2e/**",
            "**/node_modules/**",
            "functions/**",
            ".claude/**",
            // Owned by the node project above.
            "src/lib/__tests__/**",
            "src/utils/__tests__/**",
            "src/features/program/__tests__/**",
          ],
        },
      },
    ],
  },
});
