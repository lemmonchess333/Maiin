/**
 * PR Q: vitest config scoped to functions/. Without this the root
 * config (src/test/setup.ts) gets picked up by directory inheritance
 * and the runner errors out trying to resolve a TS setup file that
 * doesn't exist in functions/.
 *
 * functions/ is plain JS / CommonJS — node environment, no jsdom,
 * no setupFile, no path alias. Test files live under __tests__/.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.js"],
    globals: false,
    // Integration tests (under __tests__/integration/) drive the
    // Firestore emulator and need a generous timeout for the
    // 20-parallel-quota concurrency check. Unit tests are well
    // under this ceiling.
    testTimeout: 10_000,
  },
});
