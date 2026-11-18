/**
 * `classify-changes.mjs` decides what CI runs for a change: whether the
 * unit variants run at all (`app`), whether they run the whole suite or
 * the tests a change reaches (`mode`), what a related run takes, and
 * whether the functions suite runs. `variant-suite.mjs` runs it.
 *
 * Every case below that runs LESS is one someone chose; anything else
 * must run more. A wrong `app: false` skips jobs, so its table is the one
 * to read first.
 */
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error Standalone Node .mjs script is outside the TS app project.
import * as script from "./classify-changes.mjs";
// @ts-expect-error Standalone Node .mjs script is outside the TS app project.
import * as variant from "./variant-suite.mjs";

interface Change {
  path: string;
  deleted?: boolean;
}
interface Answer {
  app: boolean;
  mode: "full" | "related";
  why: string;
}
const classify = script.classify as (changes: Change[] | null) => Answer;
const relatedInputs = script.relatedInputs as (
  changes: Change[],
  io: {
    listDir: (dir: string) => string[];
    readersOf: (needles: string[]) => string[];
  }
) => string[];
const needsFunctions = script.needsFunctions as (
  changes: Change[] | null,
  mode: string,
  functionsReadersOf: (needles: string[]) => string[]
) => boolean;
const needlesFor = script.needlesFor as (paths: string[]) => string[];
const parseNameStatus = script.parseNameStatus as (out: string) => Change[];
const changedFiles = script.changedFiles as (
  cwd: string,
  event: string,
  payload: unknown
) => Change[] | null;
const MAX_RELATED = script.MAX_RELATED as number;
const VITEST_COLLECTS = variant.VITEST_COLLECTS as RegExp[];
const missedTests = variant.missedTests as (
  inputs: string[],
  ran: string[]
) => { expected: string[]; missed: string[] };

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const changed = (...paths: string[]): Change[] =>
  paths.map((path) => ({ path, deleted: false }));

describe("app", () => {
  it.each([
    ["a plan-file lock", [".claude/plans/programme-run-followups.md"]],
    ["CLAUDE.md", ["CLAUDE.md"]],
    [
      "docs, any kind of file",
      ["docs/qa/pre-launch-backlog.md", "docs/x/scores.json"],
    ],
    ["markdown at the root", ["README.md", "GLOSSARY.md"]],
    [
      "the iOS project with its doc",
      ["ios/App/App/AppDelegate.swift", "docs/ios-release.md"],
    ],
  ])("is false for %s", (_label, paths) => {
    expect(classify(changed(...paths)).app).toBe(false);
  });

  it.each([
    [
      "one app file beside a lock",
      [".claude/plans/x.md", "src/lib/timeAgo.ts"],
    ],
    ["a capture spec", ["e2e/screenshots/home.capture.spec.ts"]],
    ["the server", ["functions/index.js"]],
    ["the rules", ["firestore.rules"]],
    ["the lockfile", ["package-lock.json"]],
    ["another workflow", [".github/workflows/emulator-tests.yml"]],
    ["a seed", ["scripts/seed-rich-user.ts"]],
    ["the service worker", ["public/sw.js"]],
    ["index.html", ["index.html"]],
    ["a README that is not markdown", ["src/assets/welcome/README.txt"]],
    ["markdown beside the server", ["functions/README.md"]],
    ["markdown beside the app", ["src/assets/welcome/README.md"]],
    ["the pull request template", [".github/PULL_REQUEST_TEMPLATE.md"]],
    ["a skill", [".claude/skills/pr/SKILL.yaml"]],
    ["a lookalike of ios/", ["iosfoo/thing.ts"]],
    ["a lookalike of docs/", ["docsish/x.ts"]],
    ["a deleted app file", ["src/lib/gone.ts"]],
  ])("is true for %s", (_label, paths) => {
    expect(classify(changed(...paths)).app).toBe(true);
  });
});

describe("mode", () => {
  it.each([
    "package.json",
    "package-lock.json",
    "patches/vitest+5.0.5.patch",
    "vitest.config.ts",
    "vite.config.ts",
    "tsconfig.app.json",
    "tsconfig.json",
    "src/test/setup.ts",
    "src/__mocks__/firebase.ts",
    "src/lib/__mocks__/haptic.ts",
    "scripts/run-unit-tests.mjs",
    "scripts/fake-clock.cjs",
    "scripts/deny-unit-network.cjs",
    "scripts/ci/audit-gate.mjs",
    "scripts/ci/classify-changes.mjs",
    ".github/workflows/ci.yml",
    ".nvmrc",
  ])("is full when %s changes", (file) => {
    const answer = classify(changed("src/lib/timeAgo.ts", file));
    expect(answer.mode).toBe("full");
    expect(answer.why).toBe(`${file} changed`);
  });

  it("is related for an ordinary app change", () => {
    expect(
      classify(changed("src/lib/timeAgo.ts", "src/pages/Home.tsx"))
    ).toEqual({ app: true, mode: "related", why: "2 files changed" });
  });

  it("is related for a test helper other than setup, which tests import", () => {
    expect(classify(changed("src/test/localeGrouping.ts")).mode).toBe(
      "related"
    );
  });

  it(`is full above ${MAX_RELATED} files, and related at it`, () => {
    const many = (n: number) =>
      changed(...Array.from({ length: n }, (_, i) => `src/lib/f${i}.ts`));
    expect(classify(many(MAX_RELATED)).mode).toBe("related");
    expect(classify(many(MAX_RELATED + 1))).toMatchObject({
      app: true,
      mode: "full",
      why: `${MAX_RELATED + 1} files changed`,
    });
  });

  it("is full, with app true, when there is no list", () => {
    for (const none of [null, []]) {
      expect(classify(none)).toEqual({
        app: true,
        mode: "full",
        why: "no list of changes",
      });
    }
  });
});

describe("relatedInputs", () => {
  const tree: Record<string, string[]> = {
    "src/features/program/__tests__/sim/__traces__/actions": ["a.txt"],
    "src/features/program/__tests__/sim/__traces__": ["actions"],
    "src/features/program/__tests__/sim": [
      "__traces__",
      "runSeason.sim.test.ts",
      "helpers.ts",
    ],
    "src/lib/__tests__/fixtures": ["menu.txt"],
    "src/lib/__tests__": ["fixtures", "menu.test.ts", "other.test.tsx"],
  };
  const listDir = (dir: string) => tree[dir] ?? [];
  const noReaders = () => [];

  it("adds the tests in the nearest directory above a text fixture that has some", () => {
    expect(
      relatedInputs(
        changed("src/features/program/__tests__/sim/__traces__/actions/a.txt"),
        { listDir, readersOf: noReaders }
      )
    ).toEqual([
      "src/features/program/__tests__/sim/__traces__/actions/a.txt",
      "src/features/program/__tests__/sim/runSeason.sim.test.ts",
    ]);
    expect(
      relatedInputs(changed("src/lib/__tests__/fixtures/menu.txt"), {
        listDir,
        readersOf: noReaders,
      })
    ).toEqual([
      "src/lib/__tests__/fixtures/menu.txt",
      "src/lib/__tests__/menu.test.ts",
      "src/lib/__tests__/other.test.tsx",
    ]);
  });

  it("leaves modules, snapshots and test files to vitest's own graph", () => {
    const files = [
      "src/lib/timeAgo.ts",
      "src/lib/__tests__/menu.test.ts",
      "src/lib/__tests__/__snapshots__/menu.test.ts.snap",
      "src/lib/__tests__/fixtures/data.json",
    ];
    expect(
      relatedInputs(changed(...files), { listDir, readersOf: noReaders })
    ).toEqual([...files].sort());
  });

  it("never climbs out of the __tests__ directory", () => {
    const lonely: Record<string, string[]> = {
      "src/x/__tests__/data": ["a.txt"],
      "src/x": ["y.test.ts"],
    };
    expect(
      relatedInputs(changed("src/x/__tests__/data/a.txt"), {
        listDir: (d) => lonely[d] ?? [],
        readersOf: noReaders,
      })
    ).toEqual(["src/x/__tests__/data/a.txt"]);
  });

  it("adds every test that names a changed file, asking by path and by file name", () => {
    let asked: string[] = [];
    const inputs = relatedInputs(
      changed("functions/lib/pulse.js", "CLAUDE.md"),
      {
        listDir,
        readersOf: (needles) => {
          asked = needles;
          return [
            "src/lib/__tests__/claudeMdFreshness.test.ts",
            "src/lib/__tests__/pulse.cross.test.ts",
          ];
        },
      }
    );
    expect(asked).toEqual(["functions/lib/pulse.js", "pulse.js", "CLAUDE.md"]);
    expect(inputs).toEqual([
      "CLAUDE.md",
      "functions/lib/pulse.js",
      "src/lib/__tests__/claudeMdFreshness.test.ts",
      "src/lib/__tests__/pulse.cross.test.ts",
    ]);
  });

  it("leaves a deleted file out of the list, and still searches for it", () => {
    let asked: string[] = [];
    const inputs = relatedInputs(
      [
        { path: "src/lib/gone.ts", deleted: true },
        { path: "src/lib/kept.ts", deleted: false },
      ],
      {
        listDir,
        readersOf: (needles) => {
          asked = needles;
          return ["src/lib/__tests__/goneReader.test.ts"];
        },
      }
    );
    expect(asked).toEqual([
      "src/lib/gone.ts",
      "gone.ts",
      "src/lib/kept.ts",
      "kept.ts",
    ]);
    expect(inputs).toEqual([
      "src/lib/__tests__/goneReader.test.ts",
      "src/lib/kept.ts",
    ]);
  });
});

describe("needsFunctions", () => {
  const none = () => [];
  const some = () => ["functions/__tests__/helpers.test.js"];

  it("runs the server suite on a full run, or with no list", () => {
    expect(needsFunctions(changed("src/lib/timeAgo.ts"), "full", none)).toBe(
      true
    );
    expect(needsFunctions(null, "related", none)).toBe(true);
    expect(needsFunctions([], "related", none)).toBe(true);
  });

  it("runs it for any change under functions/, deleted or not", () => {
    expect(
      needsFunctions(
        [{ path: "functions/lib/old.js", deleted: true }],
        "related",
        none
      )
    ).toBe(true);
    expect(
      needsFunctions(changed("functions/package-lock.json"), "related", none)
    ).toBe(true);
  });

  it("asks about deleted files too", () => {
    let asked: string[] = [];
    needsFunctions(
      [{ path: "firestore.rules", deleted: true }],
      "related",
      (n) => {
        asked = n;
        return [];
      }
    );
    expect(asked).toEqual(["firestore.rules"]);
  });

  it("runs it for a file a functions test reads, and not otherwise", () => {
    expect(needsFunctions(changed("firestore.rules"), "related", some)).toBe(
      true
    );
    expect(needsFunctions(changed("src/lib/timeAgo.ts"), "related", none)).toBe(
      false
    );
  });
});

describe("reading git", () => {
  it("parses name-status output, keeping deletions for classification", () => {
    expect(parseNameStatus("M\tsrc/a.ts\nD\tsrc/b.ts\nA\tdocs/c.md\n")).toEqual(
      [
        { path: "src/a.ts", deleted: false },
        { path: "src/b.ts", deleted: true },
        { path: "docs/c.md", deleted: false },
      ]
    );
  });

  it("asks for each path and each file name once", () => {
    expect(needlesFor(["src/a/index.ts", "src/b/index.ts"])).toEqual([
      "src/a/index.ts",
      "index.ts",
      "src/b/index.ts",
    ]);
  });

  function repo() {
    const dir = mkdtempSync(join(tmpdir(), "classify-"));
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
    const write = (path: string, text: string) => {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    };
    git("init", "-q", "-b", "main");
    git("config", "user.email", "ci@example.test");
    git("config", "user.name", "ci");
    write("src/a.ts", "a\n");
    write("src/gone.ts", "gone\n");
    git("add", ".");
    git("commit", "-qm", "base");
    const base = git("rev-parse", "HEAD");
    git("switch", "-qc", "feature");
    write("src/a.ts", "a changed\n");
    git("rm", "-q", "src/gone.ts");
    git("commit", "-qam", "feature");
    git("switch", "-q", "main");
    write("src/b.ts", "on main since\n");
    git("add", ".");
    git("commit", "-qm", "main moves");
    git("merge", "-q", "--no-ff", "--no-edit", "feature");
    return { dir, git, base };
  }

  it("reads a pull request's test-merge commit: what merging changes on main", () => {
    const { dir } = repo();
    try {
      expect(changedFiles(dir, "pull_request", {})).toEqual([
        { path: "src/a.ts", deleted: false },
        { path: "src/gone.ts", deleted: true },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("answers null for a pull request whose HEAD is not a two-parent merge", () => {
    const { dir, git } = repo();
    try {
      git("reset", "-q", "--hard", "HEAD^1");
      expect(changedFiles(dir, "pull_request", {})).toBeNull();
      expect(
        changedFiles(join(dir, "no-such-dir"), "pull_request", {})
      ).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads a push from its `before`, and answers null for a new branch or a bad one", () => {
    const { dir, base } = repo();
    try {
      expect(
        changedFiles(dir, "push", { before: base })
          ?.map((c) => c.path)
          .sort()
      ).toEqual(["src/a.ts", "src/b.ts", "src/gone.ts"]);
      expect(changedFiles(dir, "push", { before: "0".repeat(40) })).toBeNull();
      expect(changedFiles(dir, "push", {})).toBeNull();
      expect(changedFiles(dir, "push", { before: "f".repeat(40) })).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(["schedule", "workflow_dispatch", "merge_group", ""])(
    "answers null for a %j event, so everything runs",
    (event) => {
      expect(changedFiles(repoRoot, event, {})).toBeNull();
      expect(classify(changedFiles(repoRoot, event, {})).mode).toBe("full");
    }
  );
});

describe("a related run that left out a test it selected fails", () => {
  it("names every selected test file vitest collects that did not run", () => {
    const inputs = [
      "src/lib/__tests__/a.test.ts",
      "src/pages/__tests__/B.test.tsx",
      "scripts/ci/c.test.ts",
      "firestore.rules.test.ts",
      "src/lib/__tests__/claudeMdFreshness.test.ts",
      "e2e/smoke.spec.ts",
      "functions/__tests__/d.test.js",
      "scripts/rollover-deployed-challenges.test.mjs",
      "src/lib/timeAgo.ts",
      "CLAUDE.md",
    ];
    expect(
      missedTests(inputs, [
        "src/lib/__tests__/a.test.ts",
        "scripts/ci/c.test.ts",
      ])
    ).toEqual({
      expected: [
        "src/lib/__tests__/a.test.ts",
        "src/pages/__tests__/B.test.tsx",
        "scripts/ci/c.test.ts",
        "firestore.rules.test.ts",
        "src/lib/__tests__/claudeMdFreshness.test.ts",
      ],
      missed: [
        "src/pages/__tests__/B.test.tsx",
        "firestore.rules.test.ts",
        "src/lib/__tests__/claudeMdFreshness.test.ts",
      ],
    });
  });

  it("knows the same test files vitest.config.ts collects", () => {
    /* VITEST_COLLECTS restates the projects' includes. If an include is
       added there, the anti-vacuity check would not know its files, so
       the list of includes is pinned here. */
    const config = readFileSync(resolve(repoRoot, "vitest.config.ts"), "utf8");
    const includes = [...config.matchAll(/include:\s*\[([^\]]*)\]/g)]
      .flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((g) => g[1]))
      .sort();
    expect(includes).toEqual([
      "firestore.*.test.ts",
      "scripts/**/*.test.{ts,tsx}",
      "src/**/*.test.{ts,tsx}",
      "src/features/program/__tests__/**/*.test.{ts,tsx}",
      "src/lib/__tests__/**/*.test.{ts,tsx}",
      "src/utils/__tests__/**/*.test.{ts,tsx}",
      "storage.rules.test.ts",
    ]);
    const collected = (p: string) => VITEST_COLLECTS.some((re) => re.test(p));
    for (const p of [
      "src/lib/__tests__/x.test.ts",
      "src/pages/__tests__/X.test.tsx",
      "scripts/ci/x.test.ts",
      "firestore.rules.test.ts",
      "storage.rules.test.ts",
    ])
      expect(collected(p), p).toBe(true);
    for (const p of [
      "e2e/x.spec.ts",
      "functions/__tests__/x.test.js",
      "scripts/x.test.mjs",
    ])
      expect(collected(p), p).toBe(false);
  });
});
