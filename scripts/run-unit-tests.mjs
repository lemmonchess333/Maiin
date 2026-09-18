// Unit tests must mock SDK traffic. Emulator suites use their own commands.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const guard = fileURLToPath(
  new URL("./deny-unit-network.cjs", import.meta.url)
);
const clock = fileURLToPath(new URL("./fake-clock.cjs", import.meta.url));
const runner = fileURLToPath(
  new URL("../node_modules/vitest/vitest.mjs", import.meta.url)
);

// The clock shifter rides along only when asked for, so an ordinary run
// is byte-identical to what it was before. Injected HERE rather than
// left to the caller's NODE_OPTIONS so that `TROPOS_CLOCK_OFFSET_DAYS=90
// npm run test` is the whole local incantation, and the CI job sets one
// environment variable rather than a require path it could get wrong.
const requires = [guard];
if (process.env.TROPOS_CLOCK_OFFSET_DAYS || process.env.TROPOS_CLOCK_AT) {
  requires.push(clock);
}

const result = spawnSync(process.execPath, [runner, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    // NODE_OPTIONS also reaches the test runner's child processes/workers.
    NODE_OPTIONS: [
      process.env.NODE_OPTIONS ?? "",
      ...requires.map((r) => `--require=${JSON.stringify(r)}`),
    ]
      .join(" ")
      .trim(),
  },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
