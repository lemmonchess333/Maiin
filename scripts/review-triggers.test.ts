import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  existsAt,
  gateFilesTouched,
  globToRegExp,
  matchItems,
  mirroredModules,
  parseDiff,
  parseGateManifest,
  parseReview,
  parseTrigger,
  readFromBase,
  // @ts-expect-error Standalone Node .mjs script, outside the TS app project.
} from "./review-triggers.mjs";

type Spec = {
  paths: string[];
  not: string[];
  added: string[];
  removed: string[];
  deleted: boolean;
  mirrored: boolean;
  gateFiles: boolean;
};
type Item = {
  id: string;
  title: string;
  triggers: string[];
  check: string;
  behind: string;
  triggerSpecs: Spec[];
};
type Context = { mirrored?: Set<string>; gateGlobs?: string[] };
type Hit = {
  id: string;
  evidence: { file: string; line: number | null; kind: string }[];
};

const review = readFileSync("REVIEW.md", "utf8");
const items = parseReview(review) as Item[];
/** Files in the checkout: committed, plus new ones not ignored. */
const tracked = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  {
    encoding: "utf8",
  }
)
  .split("\n")
  .filter(Boolean);

/** A one-file `git diff --unified=0` with the given added lines. */
function diffAdding(
  path: string,
  lines: string[],
  status: "A" | "M" = "M"
): string {
  return [
    `diff --git a/${path} b/${path}`,
    status === "A" ? "new file mode 100644" : "index 1111111..2222222 100644",
    status === "A" ? "--- /dev/null" : `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -10,0 +11,${lines.length} @@`,
    ...lines.map((l) => `+${l}`),
    "",
  ].join("\n");
}

function hitIds(diff: string, context: Context = {}): string[] {
  return (matchItems(items, parseDiff(diff), context) as Hit[]).map(
    (h) => h.id
  );
}

describe("REVIEW.md parses into complete items", () => {
  it("has 30 to 40 items with unique ids", () => {
    expect(items.length).toBeGreaterThanOrEqual(30);
    expect(items.length).toBeLessThanOrEqual(40);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it.each(items.map((i) => [i.id, i] as const))(
    "%s has a title, a trigger, a check and what is behind it",
    (_id, item) => {
      expect(item.title.length).toBeGreaterThan(5);
      for (const spec of item.triggerSpecs) {
        expect(spec.paths.length > 0 || spec.mirrored || spec.gateFiles).toBe(
          true
        );
      }
      expect(item.check.length).toBeGreaterThan(40);
      // Provenance: a pull request, a commit on main, or a named record.
      expect(item.behind).toMatch(
        /#\d+|`[0-9a-f]{7,}`|\.md|\.test\.tsx?|CLAUDE\.md|S3|F3d|App1/
      );
    }
  );

  it("every glob in a trigger names files that exist, so none has rotted", () => {
    const dead = items.flatMap((item) =>
      item.triggerSpecs
        .flatMap((spec) => [...spec.paths, ...spec.not])
        .filter((g) => !tracked.some((f) => globToRegExp(g).test(f)))
        .map((g) => `${item.id}: ${g}`)
    );
    expect(dead).toEqual([]);
  });

  it("every regex compiles", () => {
    // parseReview compiles them; a bad one throws there.
    for (const item of items) {
      for (const re of item.triggerSpecs.flatMap((spec) => [
        ...spec.added,
        ...spec.removed,
      ])) {
        expect(
          () => new RegExp(re.replace(/^\/(.*)\/[a-z]*$/s, "$1"))
        ).not.toThrow();
      }
    }
  });

  it("prose for the owner carries no em dash", () => {
    expect(review).not.toContain("—");
  });

  it("a malformed item heading or an unknown field is an error, not a dropped item", () => {
    const good = [
      "### R01. A thing",
      "",
      "- **Trigger:** paths `src/**/*.ts`",
      "- **Check:** It holds.",
      "- **Behind:** #1.",
      "",
    ].join("\n");
    expect(parseReview(good)).toHaveLength(1);
    expect(() => parseReview(good.replace("### R01.", "### R1."))).toThrow(
      /Malformed item heading/
    );
    expect(() => parseReview(good.replace("### R01. ", "### R01 "))).toThrow(
      /Malformed item heading/
    );
    expect(() =>
      parseReview(good.replace("**Trigger:**", "**Triger:**"))
    ).toThrow(/unknown field/);
    expect(() => parseReview(`${good}\n${good}`)).toThrow(/twice/);
  });

  it("an item may carry more than one trigger", () => {
    const two = parseReview(
      [
        "### R01. A thing",
        "",
        "- **Trigger:** paths `src/**/*.ts`; added `a`",
        "- **Trigger:** paths `e2e/**/*.ts`; added `b`",
        "- **Check:** It holds.",
        "- **Behind:** #1.",
      ].join("\n")
    ) as Item[];
    expect(two[0].triggerSpecs.map((t) => t.paths)).toEqual([
      ["src/**/*.ts"],
      ["e2e/**/*.ts"],
    ]);
  });
});

describe("parseTrigger", () => {
  it("reads keywords and their backticked values in order", () => {
    const t = parseTrigger(
      "paths `src/**/*.ts` `e2e/**`; not `**/__tests__/**`; added `a;b` `/x/i`; deleted"
    );
    expect(t).toEqual({
      paths: ["src/**/*.ts", "e2e/**"],
      not: ["**/__tests__/**"],
      added: ["a;b", "/x/i"],
      removed: [],
      deleted: true,
      mirrored: false,
      gateFiles: false,
    });
  });

  it("reads the list keywords, which stand in for paths", () => {
    expect(parseTrigger("mirrored; added `x`").mirrored).toBe(true);
    expect(parseTrigger("gate-files; removed `/./`").gateFiles).toBe(true);
    expect(() => parseTrigger("mirrored `src/lib/gps.ts`")).toThrow(
      /no keyword/
    );
  });

  it("refuses a value with no keyword and a trigger with no paths", () => {
    expect(() => parseTrigger("`src/**`")).toThrow(/no keyword/);
    expect(() => parseTrigger("added `x`")).toThrow(/no paths/);
  });
});

describe("globToRegExp", () => {
  it.each([
    ["src/**/*.{ts,tsx}", "src/lib/gps.ts", true],
    ["src/**/*.{ts,tsx}", "src/components/home/WeekStrip.tsx", true],
    ["src/**/*.{ts,tsx}", "src/index.css", false],
    ["**/__tests__/**", "src/lib/__tests__/gps.test.ts", true],
    ["**/__tests__/**", "src/lib/gps.ts", false],
    [
      "src/lib/__tests__/*Guard.test.ts",
      "src/lib/__tests__/firestoreWriteGuard.test.ts",
      true,
    ],
    [
      "src/lib/__tests__/*Guard.test.ts",
      "src/lib/__tests__/firestoreGuards.test.ts",
      false,
    ],
    ["REVIEW.md", "REVIEW.md", true],
    ["REVIEW.md", "docs/REVIEW.md", false],
  ])("%s against %s is %s", (glob, path, expected) => {
    expect(globToRegExp(glob).test(path)).toBe(expected);
  });
});

describe("parseDiff", () => {
  it("reads added and removed lines with their line numbers, and deletions and renames", () => {
    const files = parseDiff(
      [
        "diff --git a/src/lib/gps.ts b/src/lib/gps.ts",
        "index 1..2 100644",
        "--- a/src/lib/gps.ts",
        "+++ b/src/lib/gps.ts",
        "@@ -3 +3,2 @@",
        "-old",
        "+new one",
        "+new two",
        "diff --git a/src/lib/__tests__/gps.test.ts b/src/lib/__tests__/gps.test.ts",
        "deleted file mode 100644",
        "--- a/src/lib/__tests__/gps.test.ts",
        "+++ /dev/null",
        "@@ -1 +0,0 @@",
        "-it()",
        "diff --git a/CHANGELOG.md b/README.md",
        "similarity index 100%",
        "rename from CHANGELOG.md",
        "rename to README.md",
        "",
      ].join("\n")
    );
    expect(files).toEqual([
      {
        path: "src/lib/gps.ts",
        oldPath: "src/lib/gps.ts",
        status: "M",
        added: [
          { line: 3, text: "new one" },
          { line: 4, text: "new two" },
        ],
        removed: [{ line: 3, text: "old" }],
      },
      {
        path: "src/lib/__tests__/gps.test.ts",
        oldPath: "src/lib/__tests__/gps.test.ts",
        status: "D",
        added: [],
        removed: [{ line: 1, text: "it()" }],
      },
      {
        path: "README.md",
        oldPath: "CHANGELOG.md",
        status: "R",
        added: [],
        removed: [],
      },
    ]);
  });
});

describe("matchItems against sample diffs", () => {
  it("a write that names a mirrored field triggers R03; a read does not", () => {
    expect(
      hitIds(
        diffAdding("src/features/program/useProgram.ts", [
          "  await updateDocGuarded(ref, { raceGoal: next });",
        ])
      )
    ).toContain("R03");
    expect(
      hitIds(
        diffAdding("src/features/program/useProgram.ts", [
          "  const goal = profile.raceGoal ?? null;",
        ])
      )
    ).not.toContain("R03");
  });

  it("a negative waitFor in a test triggers R17; a positive .not anchor does not", () => {
    expect(
      hitIds(
        diffAdding("src/hooks/__tests__/useWorkouts.test.ts", [
          "    await waitFor(() => expect(result.current.value).toBeNull());",
        ])
      )
    ).toContain("R17");
    expect(
      hitIds(
        diffAdding("src/hooks/__tests__/useWorkouts.test.ts", [
          "    await waitFor(() => expect(result.current.value).not.toBeNull());",
        ])
      )
    ).not.toContain("R17");
  });

  it("R19 fires on a wholesale mock in a test, or a new import in app code, not on the names mocks provide", () => {
    expect(
      hitIds(
        diffAdding("src/hooks/__tests__/useWorkouts.test.ts", [
          'vi.mock("@/lib/auth", () => ({ useAuth: () => ({}) }));',
        ])
      )
    ).toContain("R19");
    expect(
      hitIds(
        diffAdding("src/components/home/WeekStrip.tsx", [
          'import { useAuth, getIdTokenSafe } from "@/lib/auth";',
        ])
      )
    ).toContain("R19");
    expect(
      hitIds(
        diffAdding("src/components/home/WeekStrip.tsx", [
          'import { useAuth } from "@/lib/auth";',
        ])
      )
    ).not.toContain("R19");
    // The import half leaves tests out.
    expect(
      hitIds(
        diffAdding("src/hooks/__tests__/useWorkouts.test.ts", [
          'import { fetchFeed } from "@/lib/socialApi";',
        ])
      )
    ).not.toContain("R19");
  });

  it("a test that reads today from the wall clock triggers R20", () => {
    expect(
      hitIds(
        diffAdding("src/components/__tests__/Avatar.test.tsx", [
          "  const yesterday = new Date();",
        ])
      )
    ).toContain("R20");
  });

  it("a new secret in functions triggers R32, a schedule R33", () => {
    const ids = hitIds(
      diffAdding("functions/lib/pulse.js", [
        'const KEY = defineSecret("NEW_KEY");',
        '  .pubsub.schedule("15 12 * * 1")',
      ])
    );
    expect(ids).toEqual(expect.arrayContaining(["R32", "R33"]));
  });

  it("a deleted test triggers R23", () => {
    const diff = [
      "diff --git a/src/lib/__tests__/gps.test.ts b/src/lib/__tests__/gps.test.ts",
      "deleted file mode 100644",
      "--- a/src/lib/__tests__/gps.test.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-it('x', () => {});",
      "",
    ].join("\n");
    expect(hitIds(diff)).toContain("R23");
  });

  it("a removed aria-label triggers R24, in a .ts words file too", () => {
    const diff = (path: string, from: string, to: string) =>
      [
        `diff --git a/${path} b/${path}`,
        `--- a/${path}`,
        `+++ b/${path}`,
        "@@ -5 +5 @@",
        `-${from}`,
        `+${to}`,
        "",
      ].join("\n");
    expect(
      hitIds(
        diff(
          "src/components/home/WeekStrip.tsx",
          '      <IconButton aria-label="Open settings" />',
          '      <IconButton aria-label="Settings" />'
        )
      )
    ).toContain("R24");
    expect(
      hitIds(
        diff(
          "src/lib/homeHero.ts",
          '  start: "Start workout",',
          '  start: "Begin",'
        )
      )
    ).toContain("R24");
  });

  it("an apostrophe in a JSDoc line is not copy", () => {
    expect(
      hitIds(
        diffAdding("src/lib/homeHero.ts", [
          ' * the "person\'s week" as the plan reads it',
        ])
      )
    ).not.toContain("R13");
    expect(
      hitIds(diffAdding("src/lib/homeHero.ts", ['  label: "Couldn\'t save",']))
    ).toContain("R13");
  });

  it("a route is App.tsx's; a lazy child in a page is not", () => {
    expect(
      hitIds(
        diffAdding("src/App.tsx", ['  <Route path="/thing" element={x} />'])
      )
    ).toContain("R30");
    expect(
      hitIds(
        diffAdding("src/pages/Home.tsx", [
          'const Sheet = lazyRetry(() => import("@/components/home/WeekStrip"));',
        ])
      )
    ).not.toContain("R30");
  });

  it("any change to a workflow triggers R36, and a hex colour R15", () => {
    expect(
      hitIds(diffAdding(".github/workflows/ci.yml", ["      - run: npm test"]))
    ).toContain("R36");
    expect(
      hitIds(
        diffAdding("src/components/home/WeekStrip.tsx", ['  color: "#ff0000",'])
      )
    ).toContain("R15");
    // A pull request number in a comment is not a colour.
    expect(
      hitIds(
        diffAdding("src/components/home/WeekStrip.tsx", [
          "  // fixed in (#720)",
        ])
      )
    ).not.toContain("R15");
  });

  it("an engine change triggers R39", () => {
    expect(
      hitIds(
        diffAdding("src/features/program/runScheduler.ts", [
          "  const taperWeeks = 2;",
        ])
      )
    ).toContain("R39");
  });

  it("REVIEW.md's own edits trigger nothing, though its text matches many regexes", () => {
    const lines = review.split("\n");
    expect(hitIds(diffAdding("REVIEW.md", lines, "A"))).toEqual([]);
  });

  it("a docs-only change outside the named paths triggers nothing", () => {
    expect(
      hitIds(diffAdding("docs/agents/review.md", ["Some words."]))
    ).toEqual([]);
  });

  it("caps an item's evidence at five lines", () => {
    const hits = matchItems(
      items,
      parseDiff(
        diffAdding(
          ".github/workflows/ci.yml",
          Array(12).fill("      - run: npm test")
        )
      )
    ) as Hit[];
    // A workflow change with no line condition counts once per file.
    expect(hits.find((h) => h.id === "R36")?.evidence).toHaveLength(1);
    const many = matchItems(
      items,
      parseDiff(
        diffAdding(
          "src/features/program/useProgram.ts",
          Array(12).fill("  await updateDocGuarded(ref, { raceGoal: g });")
        )
      )
    ) as Hit[];
    expect(many.find((h) => h.id === "R03")?.evidence).toHaveLength(5);
  });
});

describe("keywords that read the base's lists", () => {
  it("mirrored: R04 fires on a client module a cross test imports", () => {
    const mirrored = new Set(["src/features/program/represcribe.ts"]);
    const diff = diffAdding("src/features/program/represcribe.ts", [
      "  return step * 2;",
    ]);
    expect(hitIds(diff, { mirrored })).toContain("R04");
    expect(hitIds(diff, { mirrored: new Set() })).not.toContain("R04");
  });

  it("mirroredModules reads value imports, resolves them, and skips types and helpers", () => {
    const files = [
      "src/lib/trainingWeek.ts",
      "src/lib/performanceTypes.ts",
      "src/features/program/represcribe.ts",
      "src/test/firestoreFake.ts",
      "src/features/program/__tests__/represcribe.cross.test.ts",
    ];
    const text = [
      'import { weekDone } from "@/lib/trainingWeek";',
      'import type { Band } from "@/lib/performanceTypes";',
      'import { represcribe } from "../represcribe";',
      'import { seedFirestore } from "@/test/firestoreFake";',
      'import { describe } from "vitest";',
    ].join("\n");
    expect([...mirroredModules(files, () => text)].sort()).toEqual([
      "src/features/program/represcribe.ts",
      "src/lib/trainingWeek.ts",
    ]);
  });

  it("the working tree's cross tests name the engines as mirrored", () => {
    const read = (p: string) => readFileSync(p, "utf8");
    const mirrored = mirroredModules(tracked, read) as Set<string>;
    expect(mirrored.has("src/lib/trainingWeek.ts")).toBe(true);
    expect(mirrored.has("src/features/program/represcribe.ts")).toBe(true);
    expect([...mirrored].some((p) => p.includes("__tests__"))).toBe(false);
  });

  it("gate-files: R38 is the manifest, so the two cannot drift", () => {
    const r38 = items.find((i) => i.id === "R38");
    expect(r38?.triggerSpecs[0].gateFiles).toBe(true);
    expect(r38?.triggerSpecs[0].paths).toEqual([]);
    const gateGlobs = (
      parseGateManifest(readFileSync(".github/gate-files.txt", "utf8")) as {
        globs: string[];
      }
    ).globs;
    const removal = [
      "diff --git a/eslint.config.js b/eslint.config.js",
      "--- a/eslint.config.js",
      "+++ b/eslint.config.js",
      "@@ -9 +8,0 @@",
      '-  "no-restricted-syntax": "error",',
      "",
    ].join("\n");
    expect(hitIds(removal, { gateGlobs })).toContain("R38");
    expect(hitIds(removal, { gateGlobs: [] })).not.toContain("R38");
  });

  it("a dependency bump in package.json is not R38; a test script is", () => {
    const gateGlobs = ["package.json"];
    const bump = [
      "diff --git a/package.json b/package.json",
      "--- a/package.json",
      "+++ b/package.json",
      "@@ -90 +90 @@",
      '-    "vite": "^8.0.1",',
      '+    "vite": "^8.0.2",',
      "",
    ].join("\n");
    expect(hitIds(bump, { gateGlobs })).not.toContain("R38");
    const script = bump
      .replace('-    "vite": "^8.0.1",', '-    "test": "vitest run",')
      .replace('+    "vite": "^8.0.2",', '+    "test": "vitest run --bail 1",');
    expect(hitIds(script, { gateGlobs })).toContain("R38");
  });
});

describe("readFromBase", () => {
  /** A fake git: `ls-tree` answers from `present`, `show` returns text. */
  const fakeGit =
    (present: string[]) =>
    (args: string[]): string => {
      if (args[0] === "ls-tree") {
        const path = args[args.length - 1];
        return present.includes(path) ? `${path}\n` : "";
      }
      if (args[0] === "show") return "base text";
      throw new Error(`unexpected git ${args.join(" ")}`);
    };

  it("reads the base's copy when there is one", () => {
    const r = readFromBase("REVIEW.md", "abc123", {
      git: fakeGit(["REVIEW.md"]),
      readWorkingTree: () => "working tree text",
      workingTreeHas: () => true,
    });
    expect(r).toEqual({ text: "base text", source: "base", warning: null });
  });

  it("refuses its own copy unless asked, and then warns that the change judges itself", () => {
    const opts = {
      git: fakeGit([]),
      readWorkingTree: () => "working tree text",
      workingTreeHas: () => true,
    };
    expect(() => readFromBase("REVIEW.md", "abc123", opts)).toThrow(
      /--allow-own-copy/
    );
    const r = readFromBase("REVIEW.md", "abc123", {
      ...opts,
      allowOwnCopy: true,
    });
    expect(r.text).toBe("working tree text");
    expect(r.source).toBe("working-tree");
    expect(r.warning).toMatch(/judged by its own copy/);
  });

  it("a git failure other than a missing path is an error, not a fallback", () => {
    expect(() =>
      readFromBase("REVIEW.md", "abc123", {
        git: () => {
          throw new Error("fatal: Not a valid object name abc123");
        },
        readWorkingTree: () => "working tree text",
        workingTreeHas: () => true,
        allowOwnCopy: true,
      })
    ).toThrow(/Not a valid object name/);
  });

  it("refuses when neither has it", () => {
    expect(() =>
      readFromBase("REVIEW.md", "abc123", {
        git: fakeGit([]),
        readWorkingTree: () => "",
        workingTreeHas: () => false,
        allowOwnCopy: true,
      })
    ).toThrow(/neither/);
  });

  it("existsAt reads the base's tree", () => {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    expect(existsAt(head, "package.json")).toBe(true);
    expect(existsAt(head, "no-such-file.md")).toBe(false);
  });
});

describe("gate files", () => {
  const manifest = parseGateManifest(
    readFileSync(".github/gate-files.txt", "utf8")
  ) as {
    globs: string[];
    runGlobs: string[];
  };

  it("the manifest names itself, the checklist, the matcher and its workflow", () => {
    expect(manifest.globs).toEqual(
      expect.arrayContaining([
        ".github/gate-files.txt",
        "REVIEW.md",
        "scripts/review-triggers.mjs",
        ".github/workflows/guards-from-base.yml",
      ])
    );
  });

  it("every glob in the manifest names a file that exists", () => {
    const dead = manifest.globs.filter(
      (g) => !tracked.some((f) => globToRegExp(g).test(f))
    );
    expect(dead).toEqual([]);
  });

  it("runs only rule tests from the base, never the pins that move with the code", () => {
    expect(manifest.runGlobs.length).toBeGreaterThan(5);
    for (const g of manifest.runGlobs) expect(g).toMatch(/\.test\.ts$/);
    const runs = (p: string) =>
      manifest.runGlobs.some((g) => globToRegExp(g).test(p));
    expect(runs("src/lib/__tests__/firestoreWriteGuard.test.ts")).toBe(true);
    expect(runs("src/styles/__tests__/paletteClassGuard.test.ts")).toBe(true);
    expect(runs("src/utils/__tests__/dateTreatment.test.ts")).toBe(true);
    // A behaviour test whose name holds "Guard" is not a rule test.
    expect(runs("src/lib/__tests__/firestoreGuards.test.ts")).toBe(false);
    expect(runs("src/hooks/__tests__/useInFlightGuard.test.ts")).toBe(false);
    expect(runs("src/lib/__tests__/racePrediction.cross.test.ts")).toBe(false);
    expect(runs("src/lib/__tests__/mirrorCrossTestGate.test.ts")).toBe(false);
    expect(runs("src/lib/__tests__/claudeMdFreshness.test.ts")).toBe(false);
  });

  it("names edited gate files, and lists the rule tests that exist at the base to run", () => {
    const files = parseDiff(
      [
        diffAdding("src/utils/__tests__/dateTreatment.test.ts", [
          "  'allowed.ts',",
        ]),
        diffAdding(
          "src/lib/__tests__/caseCollisionGuard.test.ts",
          ["it()"],
          "A"
        ),
        diffAdding("src/lib/__tests__/racePrediction.cross.test.ts", [
          "  expect(x).toBe(2);",
        ]),
        diffAdding("src/components/home/WeekStrip.tsx", ["x"]),
        diffAdding("eslint.config.js", ["  rules: {},"]),
      ].join("")
    );
    const result = gateFilesTouched(
      manifest,
      files,
      (p: string) => p !== "src/lib/__tests__/caseCollisionGuard.test.ts"
    );
    expect(result.touched.map((t: { path: string }) => t.path)).toEqual([
      "src/utils/__tests__/dateTreatment.test.ts",
      "src/lib/__tests__/caseCollisionGuard.test.ts",
      "src/lib/__tests__/racePrediction.cross.test.ts",
      "eslint.config.js",
    ]);
    // A new guard has no base copy, a cross test is named but not run, and
    // eslint.config.js is not a test.
    expect(result.tests).toEqual(["src/utils/__tests__/dateTreatment.test.ts"]);
  });

  it("ignores comments and blank lines, and reads the run prefix", () => {
    expect(
      parseGateManifest(
        "# c\n\nREVIEW.md  # the list\n  run src/a.test.ts\neslint.config.js\n"
      )
    ).toEqual({
      globs: ["REVIEW.md", "src/a.test.ts", "eslint.config.js"],
      runGlobs: ["src/a.test.ts"],
    });
  });
});
