import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  gateFilesTouched,
  globToRegExp,
  matchItems,
  parseDiff,
  parseGateManifest,
  parseReview,
  parseTrigger,
  readFromBase,
  // @ts-expect-error Standalone Node .mjs script, outside the TS app project.
} from "./review-triggers.mjs";

type Item = {
  id: string;
  title: string;
  trigger: string;
  check: string;
  behind: string;
  triggerSpec: {
    paths: string[];
    not: string[];
    added: string[];
    removed: string[];
    deleted: boolean;
  };
};
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

function hitIds(diff: string): string[] {
  return (matchItems(items, parseDiff(diff)) as Hit[]).map((h) => h.id);
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
      expect(item.triggerSpec.paths.length).toBeGreaterThan(0);
      expect(item.check.length).toBeGreaterThan(40);
      // Provenance: a pull request, a commit on main, or a named record.
      expect(item.behind).toMatch(
        /#\d+|`[0-9a-f]{7,}`|\.md|\.test\.tsx?|CLAUDE\.md|S3|F3d|App1/
      );
    }
  );

  it("every glob in a trigger names files that exist, so none has rotted", () => {
    const dead = items.flatMap((item) =>
      [...item.triggerSpec.paths, ...item.triggerSpec.not]
        .filter((g) => !tracked.some((f) => globToRegExp(g).test(f)))
        .map((g) => `${item.id}: ${g}`)
    );
    expect(dead).toEqual([]);
  });

  it("every regex compiles", () => {
    // parseReview compiles them; a bad one throws there.
    for (const item of items) {
      for (const re of [
        ...item.triggerSpec.added,
        ...item.triggerSpec.removed,
      ]) {
        expect(
          () => new RegExp(re.replace(/^\/(.*)\/[a-z]*$/s, "$1"))
        ).not.toThrow();
      }
    }
  });

  it("prose for the owner carries no em dash", () => {
    expect(review).not.toContain("—");
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
    });
  });

  it("refuses a value with no keyword and a trigger with no paths", () => {
    expect(() => parseTrigger("`src/**`")).toThrow(/no keyword/);
    expect(() => parseTrigger("added `x`")).toThrow(/no paths/);
  });
});

describe("globToRegExp", () => {
  it.each([
    ["src/**/*.{ts,tsx}", "src/a.ts", true],
    ["src/**/*.{ts,tsx}", "src/a/b/c.tsx", true],
    ["src/**/*.{ts,tsx}", "src/a.css", false],
    ["**/__tests__/**", "src/lib/__tests__/x.test.ts", true],
    ["**/__tests__/**", "src/lib/x.ts", false],
    [
      "src/lib/__tests__/*Guard*.test.ts",
      "src/lib/__tests__/firestoreWriteGuard.test.ts",
      true,
    ],
    [
      "src/lib/__tests__/*Guard*.test.ts",
      "src/lib/__tests__/a/bGuard.test.ts",
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
        "diff --git a/src/a.ts b/src/a.ts",
        "index 1..2 100644",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -3 +3,2 @@",
        "-old",
        "+new one",
        "+new two",
        "diff --git a/src/gone.test.ts b/src/gone.test.ts",
        "deleted file mode 100644",
        "--- a/src/gone.test.ts",
        "+++ /dev/null",
        "@@ -1 +0,0 @@",
        "-it()",
        "diff --git a/old.md b/new.md",
        "similarity index 100%",
        "rename from old.md",
        "rename to new.md",
        "",
      ].join("\n")
    );
    expect(files).toEqual([
      {
        path: "src/a.ts",
        oldPath: "src/a.ts",
        status: "M",
        added: [
          { line: 3, text: "new one" },
          { line: 4, text: "new two" },
        ],
        removed: [{ line: 3, text: "old" }],
      },
      {
        path: "src/gone.test.ts",
        oldPath: "src/gone.test.ts",
        status: "D",
        added: [],
        removed: [{ line: 1, text: "it()" }],
      },
      {
        path: "new.md",
        oldPath: "old.md",
        status: "R",
        added: [],
        removed: [],
      },
    ]);
  });
});

describe("matchItems against sample diffs", () => {
  it("a raw setDoc in a hook triggers R01, not in its test", () => {
    expect(
      hitIds(
        diffAdding("src/hooks/useThing.ts", ["  await setDoc(ref, data);"])
      )
    ).toContain("R01");
    expect(
      hitIds(
        diffAdding("src/hooks/__tests__/useThing.test.ts", [
          "  await setDoc(ref, data);",
        ])
      )
    ).not.toContain("R01");
  });

  it("a negative waitFor in a test triggers R17", () => {
    expect(
      hitIds(
        diffAdding("src/hooks/__tests__/useX.test.tsx", [
          "    await waitFor(() => expect(result.current.value).toBeNull());",
        ])
      )
    ).toContain("R17");
  });

  it("a new secret in functions triggers R32, a schedule R33", () => {
    const ids = hitIds(
      diffAdding("functions/lib/thing.js", [
        'const KEY = defineSecret("NEW_KEY");',
        '  .pubsub.schedule("15 12 * * 1")',
      ])
    );
    expect(ids).toEqual(expect.arrayContaining(["R32", "R33"]));
  });

  it("a deleted test triggers R23", () => {
    const diff = [
      "diff --git a/src/lib/__tests__/x.test.ts b/src/lib/__tests__/x.test.ts",
      "deleted file mode 100644",
      "--- a/src/lib/__tests__/x.test.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-it('x', () => {});",
      "",
    ].join("\n");
    expect(hitIds(diff)).toContain("R23");
  });

  it("a removed aria-label triggers R24", () => {
    const diff = [
      "diff --git a/src/components/X.tsx b/src/components/X.tsx",
      "--- a/src/components/X.tsx",
      "+++ b/src/components/X.tsx",
      "@@ -5 +5 @@",
      '-      <IconButton aria-label="Open settings" />',
      '+      <IconButton aria-label="Settings" />',
      "",
    ].join("\n");
    expect(hitIds(diff)).toContain("R24");
  });

  it("any change to a workflow triggers R36, and a hex colour R15", () => {
    expect(
      hitIds(diffAdding(".github/workflows/ci.yml", ["      - run: npm test"]))
    ).toContain("R36");
    expect(
      hitIds(diffAdding("src/components/X.tsx", ['  color: "#ff0000",']))
    ).toContain("R15");
    // A pull request number in a comment is not a colour.
    expect(
      hitIds(diffAdding("src/components/X.tsx", ["  // fixed in (#720)"]))
    ).not.toContain("R15");
  });

  it("REVIEW.md's own edits trigger nothing, though its text matches many regexes", () => {
    const lines = review.split("\n");
    expect(hitIds(diffAdding("REVIEW.md", lines, "A"))).toEqual([]);
  });

  it("a docs-only change outside the named paths triggers nothing", () => {
    expect(hitIds(diffAdding("docs/notes/today.md", ["Some words."]))).toEqual(
      []
    );
  });

  it("caps an item's evidence at five lines", () => {
    const hits = matchItems(
      items,
      parseDiff(
        diffAdding(
          "src/hooks/useThing.ts",
          Array(12).fill("await setDoc(a, b);")
        )
      )
    ) as Hit[];
    expect(hits.find((h) => h.id === "R01")?.evidence).toHaveLength(5);
  });
});

describe("readFromBase", () => {
  it("reads the base's copy when there is one", () => {
    const r = readFromBase("REVIEW.md", "abc123", {
      git: (args: string[]) => {
        expect(args).toEqual(["show", "abc123:REVIEW.md"]);
        return "base text";
      },
      readWorkingTree: () => "working tree text",
      workingTreeHas: () => true,
    });
    expect(r).toEqual({ text: "base text", source: "base", warning: null });
  });

  it("falls back to the working tree only with a warning that the change judges itself", () => {
    const r = readFromBase("REVIEW.md", "abc123", {
      git: () => {
        throw new Error("fatal: path 'REVIEW.md' does not exist in 'abc123'");
      },
      readWorkingTree: () => "working tree text",
      workingTreeHas: () => true,
    });
    expect(r.text).toBe("working tree text");
    expect(r.source).toBe("working-tree");
    expect(r.warning).toMatch(/judged by its own copy/);
  });

  it("refuses when neither has it", () => {
    expect(() =>
      readFromBase("REVIEW.md", "abc123", {
        git: () => {
          throw new Error("missing");
        },
        readWorkingTree: () => "",
        workingTreeHas: () => false,
      })
    ).toThrow(/neither/);
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
    expect(runs("src/utils/__tests__/dateTreatment.test.ts")).toBe(true);
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
        diffAdding("src/lib/__tests__/newGuard.test.ts", ["it()"], "A"),
        diffAdding("src/lib/__tests__/racePrediction.cross.test.ts", [
          "  expect(x).toBe(2);",
        ]),
        diffAdding("src/components/X.tsx", ["x"]),
        diffAdding("eslint.config.js", ["  rules: {},"]),
      ].join("")
    );
    const result = gateFilesTouched(
      manifest,
      files,
      (p: string) => p !== "src/lib/__tests__/newGuard.test.ts"
    );
    expect(result.touched.map((t: { path: string }) => t.path)).toEqual([
      "src/utils/__tests__/dateTreatment.test.ts",
      "src/lib/__tests__/newGuard.test.ts",
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
