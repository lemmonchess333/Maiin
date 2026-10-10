import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

/**
 * The install script's job is to get past a stalled attempt. The stall
 * itself is easy to bound; what broke CI was the attempt's apt-get
 * outliving the bound with dpkg's lock in hand, so that every retry
 * failed on the lock at once. These tests stage exactly that: a first
 * attempt that leaves a lock holder running in its own session, out of
 * `timeout`'s reach, and later attempts that fail the way apt-get does
 * while the lock is held.
 *
 * The first test runs the old retry step against that stage and expects
 * it to fail, so the others can't pass on a stage that never blocks.
 */
const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, "install-playwright-chromium.sh");
const repoRoot = resolve(here, "../..");

/** A stand-in holds the lock with fcntl, as apt-get and dpkg do. */
const PYTHON = "/usr/bin/python3";
const canStage =
  process.platform === "linux" &&
  existsSync(PYTHON) &&
  existsSync("/proc/locks");

const staged: { dir: string; stray: string }[] = [];
let strayCount = 0;

afterEach(() => {
  for (const { dir, stray } of staged.splice(0)) {
    spawnSync("pkill", ["-KILL", "-x", stray]);
    rmSync(dir, { recursive: true, force: true });
  }
});

type Attempt =
  | "stall-leaving-lock"
  | "stall-leaving-stubborn-lock"
  | "apt"
  | "fail";

/**
 * Runs the script, sourced, with `npx` replaced by a stand-in that plays
 * `attempts` in turn, `sudo` running its command directly, `dpkg`
 * recording its call, and dpkg's locks moved into a scratch directory.
 */
function stage(attempts: Attempt[], options: { oldRetryStep?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "pw-install-"));
  // The name a process is matched by is at most 15 characters.
  const stray = `pws${process.pid % 100000}-${strayCount++}`.slice(0, 15);
  staged.push({ dir, stray });
  const frontend = join(dir, "lock-frontend");
  const lock = join(dir, "lock");
  writeFileSync(frontend, "");
  writeFileSync(lock, "");

  // Holds the lock until killed. Its file name is its process name.
  writeFileSync(
    join(dir, stray),
    [
      `#!${PYTHON}`,
      "import fcntl, signal, sys, time",
      "if sys.argv[2] == 'stubborn':",
      "    signal.signal(signal.SIGTERM, signal.SIG_IGN)",
      "f = open(sys.argv[1], 'w')",
      "fcntl.lockf(f, fcntl.LOCK_EX)",
      "time.sleep(120)",
      "",
    ].join("\n")
  );
  chmodSync(join(dir, stray), 0o755);

  // Fails the way apt-get does when it can't take the lock.
  writeFileSync(
    join(dir, "apt-probe"),
    [
      `#!${PYTHON}`,
      "import fcntl, sys",
      "f = open(sys.argv[1], 'w')",
      "try:",
      "    fcntl.lockf(f, fcntl.LOCK_EX | fcntl.LOCK_NB)",
      "except OSError:",
      "    print(f'E: Could not get lock {sys.argv[1]}', file=sys.stderr)",
      "    sys.exit(100)",
      "",
    ].join("\n")
  );
  chmodSync(join(dir, "apt-probe"), 0o755);

  writeFileSync(
    join(dir, "npx"),
    [
      "#!/usr/bin/env bash",
      `n=$(( $(cat "${dir}/count" 2>/dev/null || echo 0) + 1 ))`,
      `echo "$n" > "${dir}/count"`,
      `case "$(sed -n "\${n}p" "${dir}/attempts")" in`,
      "  stall-leaving-lock | stall-leaving-stubborn-lock)",
      `    mode=$([[ $(sed -n "\${n}p" "${dir}/attempts") == *stubborn* ]] && echo stubborn || echo plain)`,
      `    setsid "${dir}/${stray}" "${frontend}" "$mode" </dev/null >/dev/null 2>&1 &`,
      // Stall only once the lock is taken, as apt-get had it when it hung.
      `    until grep -q ":$(stat -c %i "${frontend}") " /proc/locks; do sleep 0.05; done`,
      "    sleep 60 ;;",
      `  apt) exec "${dir}/apt-probe" "${frontend}" ;;`,
      "  *) exit 1 ;;",
      "esac",
      "",
    ].join("\n")
  );
  chmodSync(join(dir, "npx"), 0o755);
  writeFileSync(join(dir, "attempts"), attempts.join("\n") + "\n");

  const harness = [
    `source "${script}"`,
    'sudo() { "$@"; }',
    'dpkg() { echo "dpkg $*"; }',
    `LOCKS=("${frontend}" "${lock}")`,
    `STRAY=${stray}`,
    "ASK_WAIT=2",
    "KILL_WAIT=4",
    "RETRY_PAUSE=0",
    // The retry step as it was: repair dpkg, nothing else.
    options.oldRetryStep
      ? "release_dpkg() { sudo dpkg --configure -a || true; }"
      : "",
    "main install-deps 1",
  ].join("\n");
  const result = spawnSync("bash", ["-c", harness], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    timeout: 60_000,
  });
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    attemptsMade: Number(readFileSync(join(dir, "count"), "utf8")),
  };
}

describe.skipIf(!canStage)("a stalled attempt that leaves dpkg locked", () => {
  it("fails every retry on the lock with the old retry step", () => {
    const run = stage(["stall-leaving-lock", "apt", "apt"], {
      oldRetryStep: true,
    });
    expect(run.status).toBe(1);
    expect(run.attemptsMade).toBe(3);
    expect(run.output.match(/Could not get lock/g)).toHaveLength(2);
  });

  it("is cleared before the retry, which then installs", () => {
    const run = stage(["stall-leaving-lock", "apt", "apt"]);
    expect(run.output).toContain("attempt 1 failed or stalled; retrying");
    expect(run.output).not.toContain("Could not get lock");
    expect(run.output).toContain("dpkg --configure -a");
    expect(run.status).toBe(0);
    expect(run.attemptsMade).toBe(2);
  });

  it("is cleared even when the holder ignores being asked to stop", () => {
    const run = stage(["stall-leaving-stubborn-lock", "apt", "apt"]);
    expect(run.output).not.toContain("Could not get lock");
    expect(run.status).toBe(0);
    expect(run.attemptsMade).toBe(2);
  });
});

describe.skipIf(!canStage)("attempts", () => {
  it("stops at the first that installs, touching nothing else", () => {
    const run = stage(["apt"]);
    expect(run.status).toBe(0);
    expect(run.attemptsMade).toBe(1);
    expect(run.output).not.toContain("dpkg");
  });

  it("fail the step after three failures", () => {
    const run = stage(["fail", "fail", "fail"]);
    expect(run.status).toBe(1);
    expect(run.attemptsMade).toBe(3);
    expect(run.output).toContain("::error::");
  });
});

describe("usage", () => {
  it.each([[["nope", "60"]], [["install-deps"]], [["install", "0"]]])(
    "refuses %j",
    (args) => {
      const result = spawnSync("bash", [script, ...args], { encoding: "utf8" });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("usage:");
    }
  );
});

/**
 * Every workflow installs Playwright's Chromium through the script, so the
 * fix holds everywhere, and each step's own limit covers the script's
 * worst case: three stalled attempts of SECONDS plus 10 to kill each, and
 * two clear-ups, each the script's waits plus 15 s to repair dpkg.
 */
describe("the workflows", () => {
  const source = readFileSync(script, "utf8");
  const constant = (name: string) =>
    Number(source.match(new RegExp(`^${name}=(\\d+)$`, "m"))![1]);
  const clearUp =
    constant("ASK_WAIT") + constant("KILL_WAIT") + 15 + constant("RETRY_PAUSE");
  const dir = resolve(repoRoot, ".github/workflows");
  const workflows = readdirSync(dir)
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => ({
      name,
      lines: readFileSync(join(dir, name), "utf8").split("\n"),
    }));
  const calls = workflows.flatMap(({ name, lines }) =>
    lines.flatMap((line, at) => {
      const call = line.match(
        /scripts\/ci\/install-playwright-chromium\.sh (install|install-deps) (\d+)/
      );
      return call ? [{ name, lines, at, seconds: Number(call[2]) }] : [];
    })
  );

  it("install Playwright only through the script", () => {
    for (const { name, lines } of workflows) {
      const raw = lines.filter(
        (line) => /npx playwright install/.test(line) && !/^\s*#/.test(line)
      );
      expect(raw, name).toEqual([]);
    }
    expect(calls.length).toBeGreaterThanOrEqual(10);
  });

  it("give each install step a limit that covers its worst case", () => {
    for (const { name, lines, at, seconds } of calls) {
      const indent = (line: string) => line.search(/\S/);
      let start = at;
      while (start > 0 && !/^\s*- /.test(lines[start])) start--;
      let end = at + 1;
      while (
        end < lines.length &&
        !(lines[end].trim() && indent(lines[end]) <= indent(lines[start]))
      )
        end++;
      const limit = lines
        .slice(start, end)
        .join("\n")
        .match(/timeout-minutes: (\d+)/);
      expect(limit, `${name}:${at + 1}`).not.toBeNull();
      const worstSeconds = 3 * (seconds + 10) + 2 * clearUp;
      expect(
        Number(limit![1]) * 60,
        `${name}:${at + 1}`
      ).toBeGreaterThanOrEqual(worstSeconds);
    }
  });
});
