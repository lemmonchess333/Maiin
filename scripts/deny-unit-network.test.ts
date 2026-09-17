import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("unit test network isolation", () => {
  /* The guard this asserts is injected by `npm run test`, not by vitest:
     `scripts/run-unit-tests.mjs` adds `--require=deny-unit-network.cjs`
     to NODE_OPTIONS before spawning the runner. So `npx vitest run`
     fails this test for a reason that has nothing to do with the code
     under test, and the bare assertion below says only "expected 0 to
     be 0" — which reads exactly like a real isolation failure.

     Verified both ways rather than assumed: passes through
     `npm run test`, fails through `npx vitest run`. It cost an agent a
     wasted diagnosis of three unrelated map-test failures on the same
     run, so the cause is now named in the failure itself. */
  it("runs under the npm wrapper that injects the guard", () => {
    expect(
      (process.env.NODE_OPTIONS ?? "").includes("deny-unit-network"),
      "The network guard is missing from NODE_OPTIONS. Run the suite with " +
        "`npm run test` — `npx vitest run` skips scripts/run-unit-tests.mjs, " +
        "which is what injects it. This is not an isolation failure."
    ).toBe(true);
  });

  it("blocks TCP and TLS in child processes before sockets open", () => {
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        `
      const assert = require('node:assert/strict');
      const net = require('node:net');
      const tls = require('node:tls');
      for (const attempt of [
        () => net.connect({ host: '127.0.0.1', port: 9 }),
        () => new net.Socket().connect(9, '127.0.0.1'),
        () => tls.connect({ host: '127.0.0.1', port: 9 }),
      ]) assert.throws(attempt, { code: 'ERR_TEST_NETWORK_DISABLED' });
    `,
      ],
      { encoding: "utf8" }
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});
