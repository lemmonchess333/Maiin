/**
 * CLAUDE.md freshness gate.
 *
 * CLAUDE.md is the first thing every agent reads, and its claims override
 * default behaviour — so a stale claim there is worse than a stale comment
 * in a file nobody opens. By 2026-07-25 it had drifted badly: every file
 * count was 3–7× low (87 components → 319, 31 hooks → 75, 46 lib modules →
 * 198, 31 lib tests → 215), it still described `crews` as a live feature
 * two weeks after #1700 retired them, it listed 3 of 7 feature modules, and
 * it named none of the 9 ADRs.
 *
 * The fix was not to re-count. A number nothing checks is a claim that rots,
 * and re-counting just relines it up to lie again. So the counts were
 * removed, and what remains are claims that CAN be checked — checked here.
 *
 * Deliberately narrow. This does not police prose, and it must not become a
 * spell-checker for a 900-line document. It pins the handful of facts that
 * (a) an agent acts on, and (b) go wrong silently when the codebase moves:
 * the directory inventory, the ADR index, and the absence of retired
 * features. Everything else is judgement, and judgement belongs to review.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const claudeMd = readFileSync(resolve(repoRoot, "CLAUDE.md"), "utf8");

describe("CLAUDE.md — the Home composition sentence", () => {
  /* The document says this line "has now rotted twice": it named
     `HybridBalanceCard` until that was caught rendering nowhere, and the
     replacement then named `TodayGuidanceCard` (also gone) and credited
     StackedCTACards with pills and tiles it has never owned. It also says
     `componentReachability` catches a dead COMPONENT and nothing catches
     a dead SENTENCE — which is true, and is what this closes.

     Checked before writing: the sentence is currently ACCURATE. This is
     not a repair, it is the catch the document asked for. Pinning ORDER
     as well as membership is the point — two of the three rots were a
     component that had moved or gone, and a set-equality check would
     have passed through the second one. */
  const ORDER = [
    "WeekStrip",
    "DayPeekCard",
    "StackedCTACards",
    "TodayEnergy",
    "WaterCard",
    "WeightStepsTiles",
    "WeeklyReviewEntry",
    "PerformanceHeroCard",
  ];

  const homeSrc = readFileSync(resolve(repoRoot, "src/pages/Home.tsx"), "utf8");

  it("names them in the order Home.tsx renders them", () => {
    const positions = ORDER.map((name) => {
      /* Boundary-anchored: a bare indexOf(`<${name}`) also matches
         `<WeekStripFoo`, so renaming a component would leave this
         passing. Caught by mutation, not by reading it. */
      const m = new RegExp(`<${name}(?![A-Za-z0-9_])`).exec(homeSrc);
      return { name, at: m ? m.index : -1 };
    });

    const missing = positions.filter((p) => p.at === -1).map((p) => p.name);
    expect(
      missing,
      `CLAUDE.md's Home chain names ${missing.join(", ")}, which Home.tsx ` +
        `no longer renders. Re-read the sentence against the file and ` +
        `correct it — a dead name there sends every agent looking for ` +
        `something that is not there.`
    ).toEqual([]);

    const rendered = [...positions]
      .sort((a, b) => a.at - b.at)
      .map((p) => p.name);
    expect(
      rendered,
      "CLAUDE.md lists the Home chain in render order; Home.tsx now " +
        "renders them in a different one."
    ).toEqual(ORDER);
  });

  it("and the document still spells that chain", () => {
    /* Anchors the list above to the DOCUMENT, not just to Home.tsx —
       otherwise this passes happily while the sentence it exists to
       protect says something else entirely. */
    for (const name of ORDER) {
      expect(
        claudeMd.includes(name),
        `CLAUDE.md no longer mentions ${name}, so this test is pinning a ` +
          `chain the document does not describe.`
      ).toBe(true);
    }
  });

  /* Deliberately NOT asserted: that CLAUDE.md never mentions
     `HybridBalanceCard` or `TodayGuidanceCard`. It mentions both, on
     purpose — the paragraph recounting how this line rotted twice names
     them as history, and that history is the whole reason the sentence
     is worth pinning. A "never mentions" rule would read a correct
     document as a failure and pressure someone into deleting the
     explanation to get CI green. Drafted it, ran it, deleted it. */
});

describe("CLAUDE.md — Cloud Functions section", () => {
  const functionsIndex = readFileSync(
    resolve(repoRoot, "functions/index.js"),
    "utf8"
  );

  it("states the runtime firebase.json actually deploys", () => {
    /* The header read "Node 20" while firebase.json, functions/package.json
       and this document's OWN later section all said 22. That is not a
       cosmetic slip: the same document records Node 20 as decommissioned
       on 2026-10-30, so an agent trusting the header would target a dead
       runtime — and the deploy gotchas list three files that "must agree"
       without counting the header as one of them. Now it is. */
    const declared = JSON.parse(
      readFileSync(resolve(repoRoot, "firebase.json"), "utf8")
    ).functions?.runtime;
    const major = String(declared ?? "").replace(/^nodejs/, "");
    expect(major, "firebase.json declares no functions runtime").toMatch(
      /^\d+$/
    );
    expect(
      claudeMd,
      `firebase.json deploys nodejs${major}; CLAUDE.md's Cloud Functions ` +
        `header names a different runtime.`
    ).toContain(`Runtime: **Node ${major}**`);
  });

  it("only names functions that still exist", () => {
    /* One direction only, deliberately. The table is a selection — 10 of
       ~55 exports — and requiring it to be exhaustive would mean 42 rows
       now plus a doc edit per new function, which is the rot-generating
       shape this file was created to remove (the counts were deleted
       rather than re-counted for the same reason).

       What DOES need holding is the reverse: a retired function left
       named here sends an agent looking for something that is gone, and
       that has happened — `askGeminiText` was retired and the document
       had to be corrected after the fact. */
    const section = claudeMd.slice(
      claudeMd.indexOf("## Cloud Functions (functions/)"),
      claudeMd.indexOf("## Data Model")
    );
    const named = [...section.matchAll(/^\| `([A-Za-z][A-Za-z0-9_]*)`/gm)].map(
      (m) => m[1]
    );
    expect(
      named.length,
      "no function rows parsed out of the table"
    ).toBeGreaterThan(5);

    const gone = named.filter(
      (n) => !new RegExp(`^exports\\.${n}\\b`, "m").test(functionsIndex)
    );
    expect(
      gone,
      `CLAUDE.md's Cloud Functions table names ${gone.join(", ")}, which ` +
        `functions/index.js no longer exports. A retired function left in ` +
        `the table sends agents looking for something that is gone.`
    ).toEqual([]);
  });
});

describe("CLAUDE.md — feature module inventory", () => {
  it("names every module in src/features/", () => {
    const modules = readdirSync(resolve(repoRoot, "src/features"), {
      withFileTypes: true,
    })
      .filter((e) => e.isDirectory() && e.name !== "__tests__")
      .map((e) => e.name)
      .sort();

    const missing = modules.filter((m) => !claudeMd.includes(`${m}/`));
    expect(
      missing,
      `New feature modules that CLAUDE.md doesn't mention. An agent reading ` +
        `it will not know these exist — add a line under "Feature Modules".`
    ).toEqual([]);
  });
});

describe("CLAUDE.md — ADR index", () => {
  const adrDir = resolve(repoRoot, "docs/adr");

  it("lists every ADR by number", () => {
    const numbers = readdirSync(adrDir)
      .filter((f) => /^\d{4}-.*\.md$/.test(f))
      .map((f) => f.slice(0, 4))
      .sort();
    expect(numbers.length).toBeGreaterThan(0);

    const missing = numbers.filter(
      (n) => !new RegExp(`\\|\\s*${n}\\s*\\|`).test(claudeMd)
    );
    expect(
      missing,
      `ADRs missing from the CLAUDE.md index. The index exists so an audit ` +
        `doesn't re-derive a decision that's already settled — an ADR nobody ` +
        `is pointed at may as well not have been written.`
    ).toEqual([]);
  });

  it("indexes no ADR that doesn't exist", () => {
    const indexed = [...claudeMd.matchAll(/^\|\s*(\d{4})\s*\|/gm)].map(
      (m) => m[1]
    );
    expect(indexed.length).toBeGreaterThan(0);
    const phantom = indexed.filter(
      (n) => !readdirSync(adrDir).some((f) => f.startsWith(n))
    );
    expect(phantom, `Indexed ADRs with no file in docs/adr/`).toEqual([]);
  });
});

describe("CLAUDE.md — retired features", () => {
  /**
   * Features removed from the codebase whose names must not survive in
   * CLAUDE.md as if they were live. Add a row when you retire something;
   * the point is that removal and documentation happen in one change.
   *
   * `probe` proves the retirement is real, so this can't pass vacuously by
   * describing a feature that still exists.
   */
  const RETIRED = [
    {
      name: "crews",
      probe: "src/hooks/useCrews.ts",
      retiredIn: "#1700 (Spaces/Challenges/Circles own their jobs)",
      // The QA-backlog row is a historical record, explicitly marked
      // SUPERSEDED rather than rewritten — matching the append-only
      // discipline the plan-file lock rule uses.
      allowedMentions: 2,
    },
  ];

  for (const entry of RETIRED) {
    it(`\`${entry.name}\` is really gone from the codebase`, () => {
      expect(
        existsSync(join(repoRoot, entry.probe)),
        `${entry.probe} still exists — ${entry.name} is not retired, so the ` +
          `assertion below would be policing a live feature.`
      ).toBe(false);
    });

    it(`CLAUDE.md doesn't describe \`${entry.name}\` as live (retired in ${entry.retiredIn})`, () => {
      const hits = (claudeMd.match(new RegExp(entry.name, "gi")) ?? []).length;
      expect(
        hits,
        `CLAUDE.md mentions "${entry.name}" ${hits}× but it was retired in ` +
          `${entry.retiredIn}. Historical rows are fine when marked ` +
          `SUPERSEDED; raise allowedMentions only for those.`
      ).toBeLessThanOrEqual(entry.allowedMentions);
    });
  }
});

describe("CLAUDE.md — no volatile file counts", () => {
  it("doesn't restate the app version (read it from package.json)", () => {
    // It claimed 1.1.0 while package.json said 1.2.0.
    const version = JSON.parse(
      readFileSync(resolve(repoRoot, "package.json"), "utf8")
    ).version as string;
    const stale = /currently \d+\.\d+\.\d+/.exec(claudeMd);
    expect(
      stale?.[0] ?? null,
      `Don't pin the version in prose; it drifts (package.json is ${version}).`
    ).toBeNull();
  });

  it("doesn't claim a file count for the directories that grow", () => {
    // "(31 hooks)", "(46 modules)", "(87 files total)" — every one of these
    // was wrong by 2026-07-25. Describe the shape instead.
    const offenders = [
      ...claudeMd.matchAll(
        /\((\d+)\s+(hooks|modules|pages|components|files[^)]*)\)/g
      ),
    ].map((m) => m[0]);
    expect(
      offenders,
      `Hard-coded inventory counts rot silently — every one of these was ` +
        `3–7× off before. Describe the directory instead, or pin the number ` +
        `with a test that fails when it changes.`
    ).toEqual([]);
  });
});

/**
 * Routes and file names are the two claims in CLAUDE.md that an agent acts
 * on directly (it navigates to the route, it opens the file) and that go
 * wrong silently when the app moves. Before this pin the Pages table named
 * 14 of 41 routes, listed `Settings.tsx` a full IA migration after it became
 * `SettingsIndex.tsx`, and the lib table carried two modules that did not
 * exist (`calculateDailyMacros.ts`, `voiceFoodParser.ts`). Routes are not
 * volatile counts — the ban on counts above stays — they are an inventory,
 * and an inventory can be checked in both directions.
 */
function section(heading: string): string {
  const start = claudeMd.indexOf(`## ${heading}`);
  expect(start, `CLAUDE.md has no "## ${heading}" section`).toBeGreaterThan(-1);
  const rest = claudeMd.slice(start + heading.length + 3);
  const next = rest.search(/\n## /);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("CLAUDE.md — Pages table ↔ src/App.tsx routes", () => {
  const appTsx = readFileSync(resolve(repoRoot, "src/App.tsx"), "utf8");
  const declared = [
    ...new Set([...appTsx.matchAll(/path="([^"]+)"/g)].map((m) => m[1])),
  ].sort();
  const pages = section("Pages (src/pages/)");
  /** Developer labs are not product surfaces; one family row covers them. */
  const isDevLab = (route: string) => route.startsWith("/dev/");

  it("scans a plausible number of routes (guards a broken scan)", () => {
    expect(declared.length).toBeGreaterThan(20);
  });

  it("names every route App.tsx declares", () => {
    const missing = declared.filter(
      (r) => !isDevLab(r) && !pages.includes(`\`${r}\``)
    );
    expect(
      missing,
      `Routes declared in src/App.tsx but absent from CLAUDE.md's Pages ` +
        `table. Add a row (or mention a redirect in its target's row).`
    ).toEqual([]);
  });

  it("names no route App.tsx does not declare", () => {
    const named = [...pages.matchAll(/`(\/[^`\s]*)`/g)].map((m) => m[1]);
    const stale = named.filter((r) => !isDevLab(r) && !declared.includes(r));
    expect(
      stale,
      `Routes in CLAUDE.md's Pages table that src/App.tsx no longer declares.`
    ).toEqual([]);
  });

  it("every page file it names exists under src/pages/", () => {
    const named = [...pages.matchAll(/^\| `([^`]+\.tsx)`/gm)].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(20);
    const missing = named.filter(
      (f) => !f.includes("*") && !existsSync(join(repoRoot, "src/pages", f))
    );
    expect(
      missing,
      `Page files named in CLAUDE.md that do not exist (renamed or deleted).`
    ).toEqual([]);
  });
});

describe("CLAUDE.md — Key Business Logic table ↔ src/lib", () => {
  it("every module it names exists", () => {
    const lib = section("Key Business Logic (src/lib/)");
    const named = [...lib.matchAll(/^\| `([^`]+\.tsx?)`/gm)].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(20);
    const missing = named.filter(
      (f) => !existsSync(join(repoRoot, "src/lib", f))
    );
    expect(
      missing,
      `Lib modules named in CLAUDE.md that do not exist — the row describes ` +
        `a file an agent will go looking for.`
    ).toEqual([]);
  });
});

describe("CLAUDE.md — the CI suite matrices", () => {
  /* A gate nobody knows about is a gate that gets worked around. The
     Testing section now names the four ways CI runs the unit suite,
     because that changes what you WRITE — no spelled thousands
     separator, no fixture pinned to a date some window has to contain.

     Pinned BOTH ways, unlike the Cloud Functions table below. That table
     is a selection of ~55 and exhaustiveness there would generate rot;
     this is four jobs that change rarely, and the failure with teeth
     runs in the other direction: a matrix added to ci.yml and never
     written down is invisible to every agent reading this document. */
  const ci = readFileSync(
    resolve(repoRoot, ".github/workflows/ci.yml"),
    "utf8"
  );

  /** Job keys in ci.yml that run the unit suite under some condition. */
  const unitJobs = [...ci.matchAll(/^ {2}(unit[a-z-]*):$/gm)].map((m) => m[1]);

  it("ci.yml has the matrices at all", () => {
    /* Guards the parse. Without it a change to the workflow's shape
       would empty `unitJobs` and both directions below would pass by
       asserting nothing about nothing. */
    expect(unitJobs).toContain("unit");
    expect(unitJobs.length).toBeGreaterThanOrEqual(4);
  });

  it("names every unit job ci.yml runs", () => {
    const unnamed = unitJobs.filter((job) => !claudeMd.includes(job));
    expect(
      unnamed,
      `ci.yml runs ${unnamed.join(", ")} and CLAUDE.md does not mention ` +
        `${unnamed.length === 1 ? "it" : "them"}. An agent reading the ` +
        `Testing section would not know the gate exists, which is how a ` +
        `gate gets worked around instead of satisfied.`
    ).toEqual([]);
  });

  it("names no job ci.yml does not run", () => {
    /* The other direction: a matrix removed from CI while the document
       goes on promising it is worse than never having documented it —
       people write to a gate that is no longer there. */
    const named = [...claudeMd.matchAll(/`(unit-[a-z]+)`/g)].map((m) => m[1]);
    const gone = [...new Set(named)].filter((j) => !unitJobs.includes(j));
    expect(
      gone,
      `CLAUDE.md names ${gone.join(", ")}, which ci.yml no longer runs.`
    ).toEqual([]);
  });

  it("keeps the local incantation matching the wrapper's variables", () => {
    /* The Testing section tells people how to reproduce the future run
       locally. Those two variable names are read by
       `scripts/run-unit-tests.mjs`; if either is renamed, the
       instructions become a command that silently does nothing — the
       vacuous-green shape, moved into the documentation. */
    const wrapper = readFileSync(
      resolve(repoRoot, "scripts/run-unit-tests.mjs"),
      "utf8"
    );
    for (const name of ["TROPOS_CLOCK_OFFSET_DAYS", "TROPOS_CLOCK_AT"]) {
      expect(wrapper, `${name} is not read by the test wrapper`).toContain(
        name
      );
      expect(
        claudeMd,
        `CLAUDE.md does not tell anyone about ${name}`
      ).toContain(name);
    }
  });
});
