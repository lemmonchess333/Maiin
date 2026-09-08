// Unit tests must mock SDK traffic. Emulator suites use their own commands.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const guard = fileURLToPath(new URL("./deny-unit-network.cjs", import.meta.url));
const runner = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
const result = spawnSync(process.execPath, [runner, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    // NODE_OPTIONS also reaches the test runner's child processes/workers.
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${JSON.stringify(guard)}`.trim(),
  },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
