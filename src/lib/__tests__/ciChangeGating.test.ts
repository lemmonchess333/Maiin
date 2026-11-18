/**
 * What CI skips, and what it must never skip.
 *
 * ci.yml's `changes` job (scripts/ci/classify-changes.mjs) reads what a
 * pull request changed. The unit variants skip a pull request that
 * changes only documentation, plan files or the iOS project, and on the
 * rest run the tests its changes reach; ios-native-compile.yml compiles
 * only when a file the compile reads changed. The required checks are
 * `unit` (the repository ruleset) and `emulator-tests` (main's branch
 * protection), and a check skipped by a job-level `if:` reports as
 * passed, so the shapes below are the ones that keep a skip from ever
 * reaching a required check:
 *
 *  - `unit` neither needs `changes` nor has an `if:`, so nothing a
 *    classifier says, or a classifier failing, can skip it.
 *  - every job that needs `changes` runs on one literal condition that
 *    fails open: a failed `changes` leaves its output empty, and empty is
 *    not 'false'.
 *  - ci.yml and emulator-tests.yml have no workflow-level `paths` or
 *    `paths-ignore`: a workflow that does not start leaves a required
 *    check pending for ever, which blocks every merge of that pull
 *    request, or, for one not required, shows no check at all.
 *  - the scheduled runs, which are the only full runs of the variants on
 *    main, stay, with the issue that reports them.
 *
 * Text, as the other workflow guards read it: a job is a two-space key
 * under `jobs:`, its own keys sit at four.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) =>
  readFileSync(resolve(repoRoot, rel), "utf8").replace(/\r\n/g, "\n");

const GATE = "if: ${{ !cancelled() && needs.changes.outputs.app != 'false' }}";

/** A workflow's jobs, each with the text under its key. */
function jobs(file: string): Map<string, string> {
  const src = read(`.github/workflows/${file}`);
  const body = src.slice(src.search(/^jobs:\s*$/m));
  const out = new Map<string, string>();
  for (const part of body.split(/^ {2}(?=[\w-]+:\s*$)/m).slice(1)) {
    out.set(part.slice(0, part.indexOf(":")), part);
  }
  return out;
}

/** The `on:` block of a workflow, comments left out. */
function triggers(file: string): string {
  const src = read(`.github/workflows/${file}`);
  const block = src.match(/^on:\n([\s\S]*?)\n(?=\S)/m)?.[1] ?? "";
  return block
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
}

/** Whether a job's own `needs:` names `changes`. */
function needsChanges(text: string): boolean {
  const scalar = text.match(/^ {4}needs:\s*(\S.*)$/m)?.[1];
  if (scalar) return /\bchanges\b/.test(scalar);
  const list = text.match(/^ {4}needs:\s*\n((?: {6}- .*\n)+)/m)?.[1] ?? "";
  return /^ {6}- changes\s*$/m.test(list);
}

describe("the required checks cannot be skipped by what changed", () => {
  const ci = jobs("ci.yml");
  const emulator = jobs("emulator-tests.yml");

  it("reads the jobs, not nothing", () => {
    expect(ci.get("unit")).toContain("npm run test -- --run");
    expect(ci.get("changes")).toContain("classify-changes.mjs");
    expect(emulator.get("emulator-tests")).toContain(
      "Run firestore.rules tests"
    );
  });

  it("`unit` has no needs, and no if on the job or on any step", () => {
    /* A step-level `if: ${{ false }}` on the suite skips the suite and
       leaves the job green. `unit` has no conditional step, so none is
       allowed; one added on purpose belongs in an allowlist here, with
       its reason. */
    const unit = ci.get("unit")!;
    expect(unit).not.toMatch(/^ {4}needs:/m);
    expect(unit.match(/^\s*(- )?if:/gm)).toBeNull();
  });

  it("`emulator-tests` needs nothing but `changes`, and has no if but the fail-open gate", () => {
    /* A need on any other job makes the required check wait on, and be
       skipped with, a job nothing requires. */
    const job = emulator.get("emulator-tests")!;
    const scalar = job.match(/^ {4}needs:\s*(\S.*)$/m)?.[1];
    const list = job.match(/^ {4}needs:\s*\n((?: {6}- .*\n)+)/m)?.[1];
    if (scalar) expect(scalar.trim()).toBe("changes");
    if (list) expect(list.trim()).toBe("- changes");
    const cond = job.match(/^ {4}(if:.*)$/m)?.[1];
    if (cond) expect(cond).toBe(GATE);
  });

  it.each(["ci.yml", "emulator-tests.yml"])(
    "%s has no workflow-level paths or paths-ignore",
    (file) => {
      const on = triggers(file);
      expect(on).toContain("pull_request:");
      expect(on).not.toMatch(/^\s+paths(-ignore)?:/m);
    }
  );

  it("every job that needs `changes` runs on the one fail-open condition", () => {
    const gated = [...ci, ...emulator].filter(([, text]) => needsChanges(text));
    expect(gated.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        "unit-timezone",
        "unit-locale",
        "unit-future",
        "unit-shuffle",
      ])
    );
    for (const [name, text] of gated) {
      expect(text, name).toContain(`    ${GATE}\n`);
      expect(text.match(/^ {4}if:/gm), name).toHaveLength(1);
    }
  });
});

describe("the `changes` job", () => {
  const changes = jobs("ci.yml").get("changes")!;

  it("costs seconds: a sparse, blob-less checkout and no install", () => {
    expect(changes).toContain("filter: blob:none");
    expect(changes).toContain("sparse-checkout: scripts/ci");
    expect(changes).toContain("fetch-depth: 2");
    expect(changes).not.toContain("setup-node");
    expect(changes).not.toMatch(/npm (ci|install)/);
  });

  it("hands on app and mode", () => {
    expect(changes).toContain("app: ${{ steps.classify.outputs.app }}");
    expect(changes).toContain("mode: ${{ steps.classify.outputs.mode }}");
  });
});

describe("the unit variants", () => {
  const ci = jobs("ci.yml");
  const variants = [...ci.keys()].filter((k) => /^unit-[a-z]+$/.test(k));

  it("are the four claudeMdFreshness knows", () => {
    expect(variants.sort()).toEqual([
      "unit-future",
      "unit-locale",
      "unit-shuffle",
      "unit-timezone",
    ]);
  });

  it.each(variants)(
    "%s runs its suite through variant-suite.mjs, in the mode `changes` chose",
    (name) => {
      const text = ci.get(name)!;
      expect(text).toContain("fetch-depth: 2");
      expect(text).toContain("id: suite");
      expect(text).toMatch(/run: node scripts\/ci\/variant-suite\.mjs/);
      expect(text).toContain("SUITE_MODE: ${{ needs.changes.outputs.mode }}");
      expect(text).not.toContain("npm run test -- --run");
    }
  );

  it.each(variants)(
    "%s runs the functions suite unless variant-suite.mjs said no",
    (name) => {
      const text = ci.get(name)!;
      const fnSteps = text
        .split(/^ {6}- /m)
        .filter((step) => /working-directory: functions/.test(step));
      expect(fnSteps.length).toBe(2);
      for (const step of fnSteps)
        expect(step).toContain(
          "if: ${{ steps.suite.outputs.functions != 'false' }}"
        );
    }
  );
});

describe("the scheduled full runs and their issue", () => {
  const ci = jobs("ci.yml");

  it("ci.yml runs on a schedule", () => {
    expect(triggers("ci.yml")).toMatch(/schedule:\n\s+- cron: "[^"]+"/);
  });

  it("one job reports a red scheduled run as an issue, and only that", () => {
    const issue = ci.get("scheduled-run-issue");
    expect(issue, "the scheduled-run-issue job is gone").toBeDefined();
    expect(issue).toContain(
      "if: ${{ always() && github.event_name == 'schedule' }}"
    );
    expect(issue).toMatch(/^ {4}timeout-minutes: \d+/m);
    expect(issue).toMatch(/^ {4}permissions:\n {6}issues: write\n/m);
    expect(issue).toContain("--label ready-for-agent");
    /* Green only when every need is `success`: a timeout reports
       `cancelled` and a skip tested nothing, and both are red. */
    expect(issue).toContain("RESULTS: ${{ join(needs.*.result, ' ') }}");
    expect(issue).toContain(
      'for r in $RESULTS; do [ "$r" = success ] || red=true; done'
    );
    expect(issue).toContain('[ -n "$RESULTS" ] || red=true');
    expect(issue).not.toMatch(/contains\(needs\.\*\.result/);
    for (const conclusion of ["failure", "cancelled", "timed_out"])
      expect(issue).toContain(`.conclusion == "${conclusion}"`);
    /* No `head` under pipefail (SIGPIPE), and lines cut short of
       GitHub's issue body limit. */
    expect(issue).toContain("sed -n '1,40p' | cut -c1-160");
    expect(issue).not.toMatch(/\|\s*head\b/);
    expect(issue).not.toContain("actions/checkout");
    for (const job of [
      "unit",
      "unit-timezone",
      "unit-locale",
      "unit-future",
      "unit-shuffle",
      "audit",
    ])
      expect(issue).toMatch(new RegExp(`^ {6}- ${job}\\s*$`, "m"));
  });
});

describe("ios-native-compile.yml compiles whenever a file it reads changes", () => {
  const src = read(".github/workflows/ios-native-compile.yml");
  const paths = (
    triggers("ios-native-compile.yml").match(
      /^ {4}paths:\n((?: {6}- .*\n?)+)/m
    )?.[1] ?? ""
  )
    .split("\n")
    .map((l) => l.trim().replace(/^- "?|"$/g, ""))
    .filter(Boolean);

  /** A python script and every local module it imports, transitively. */
  function withImports(script: string, seen = new Set<string>()): string[] {
    if (seen.has(script)) return [];
    seen.add(script);
    const text = read(script);
    const out = [script];
    for (const m of text.matchAll(
      /^\s*(?:from\s+(\w+)\s+import|import\s+(\w+))/gm
    )) {
      const local = `${dirname(script)}/${m[1] ?? m[2]}.py`;
      if (existsSync(resolve(repoRoot, local)))
        out.push(...withImports(local, seen));
    }
    return out;
  }

  it("reads its paths and the scripts it runs", () => {
    expect(paths).toContain("ios/**");
    expect(src).toContain("python3 scripts/verify_ios_watch.py");
  });

  it("lists every script it runs and every local module they import", () => {
    const scripts = [...src.matchAll(/python3 (scripts\/[\w/]+\.py)/g)].map(
      (m) => m[1]
    );
    const needed = [...new Set(scripts.flatMap((s) => withImports(s)))];
    expect(needed).toContain("scripts/verify_ios_push.py");
    expect(paths).toEqual(expect.arrayContaining(needed));
  });

  it("lists what the native build reads outside ios/", () => {
    expect(paths).toEqual(
      expect.arrayContaining([
        "package.json",
        "package-lock.json",
        "patches/**",
        "capacitor.config.ts",
        "vite.config.ts",
        "tsconfig*.json",
        ".github/workflows/ios-native-compile.yml",
      ])
    );
  });

  it("still compiles main on a schedule", () => {
    expect(triggers("ios-native-compile.yml")).toMatch(
      /schedule:\n\s+- cron: "[^"]+"/
    );
  });
});
