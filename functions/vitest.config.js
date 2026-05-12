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
    // Firestore emulator with optimistic-concurrency retries under
    // 10- and 20-way parallel contention. CI runs 26 + 27 flaked
    // at 10001ms / 10045ms against the previous 10_000 default —
    // the retries can plausibly stack to 12-25s on a loaded
    // runner. 30s gives comfortable headroom for the concurrency
    // tests without weakening the parallelism they exist to
    // verify. Unit tests are well under this ceiling so the
    // global bump doesn't hide a genuinely-stuck test for more
    // than a few extra seconds.
    testTimeout: 30_000,
  },
});
