/**
 * The root audit gate (`scripts/ci/audit-gate.mjs`): every high or
 * critical advisory fails CI unless a live, dated allowlist entry covers
 * it, and an entry covers only the shape it was accepted for.
 *
 * The reports below are cut down from `npm audit --json` on this repo
 * (npm 10, report version 2): the picomatch advisory as it stood, filed
 * against picomatch and reached through five dev tools.
 *
 * No test reads the real clock. `unit-future` runs this suite 90 days on,
 * and the checked-in entry is dated a month out on purpose.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error Standalone Node .mjs script is outside the TS app project.
import * as gate from "./audit-gate.mjs";

interface Verdict {
  failures: string[];
  allowed: { id: string; recheckBy: string; daysLeft: number }[];
  stale: string[];
}
type Json = Record<string, unknown>;

const judge = gate.judge as (args: {
  report: unknown;
  allowlist: unknown;
  lock: unknown;
  today: string;
}) => Verdict;
const allowlistProblems = gate.allowlistProblems as (
  allowlist: unknown,
  today: string
) => string[];
const MAX_DAYS_AHEAD = gate.MAX_DAYS_AHEAD as number;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const checkedIn = JSON.parse(
  readFileSync(resolve(here, "audit-allowlist.json"), "utf8")
) as { advisories: Json[] };

const PICOMATCH = "GHSA-fc5q-39xc-vjpf";

function picomatchAdvisory(severity = "high"): Json {
  return {
    source: 1247710,
    name: "picomatch",
    dependency: "picomatch",
    title:
      "picomatch vulnerable to ReDoS through single-branch repeated extglobs",
    url: `https://github.com/advisories/${PICOMATCH}`,
    severity,
    range: "<=4.0.7",
  };
}

/** The report as it stood: picomatch, the five tools that use it, and
 *  the packages above them that npm also lists, plus a moderate. */
function report(overrides: Record<string, Json> = {}): Json {
  const vulnerabilities: Record<string, Json> = {
    picomatch: {
      name: "picomatch",
      severity: "high",
      via: [picomatchAdvisory()],
      effects: ["fdir", "lint-staged", "tinyglobby", "vite", "vitest"],
      nodes: ["node_modules/picomatch"],
    },
    fdir: {
      name: "fdir",
      severity: "high",
      via: ["picomatch"],
      effects: [],
      nodes: ["node_modules/fdir"],
    },
    tinyglobby: {
      name: "tinyglobby",
      severity: "high",
      via: ["fdir", "picomatch"],
      effects: ["@typescript-eslint/typescript-estree", "vitest"],
      nodes: ["node_modules/tinyglobby"],
    },
    vite: {
      name: "vite",
      severity: "high",
      via: ["picomatch", "tinyglobby"],
      effects: ["@vitejs/plugin-react", "vitest"],
      nodes: ["node_modules/vite"],
    },
    vitest: {
      name: "vitest",
      severity: "high",
      via: ["picomatch", "tinyglobby", "vite"],
      effects: [],
      nodes: ["node_modules/vitest"],
    },
    "lint-staged": {
      name: "lint-staged",
      severity: "high",
      via: ["picomatch"],
      effects: [],
      nodes: ["node_modules/lint-staged"],
    },
    minimatch: {
      name: "minimatch",
      severity: "moderate",
      via: [
        {
          source: 1,
          name: "minimatch",
          title: "a moderate one",
          url: "https://github.com/advisories/GHSA-g3hv-75wg-m249",
          severity: "moderate",
        },
      ],
      effects: [],
      nodes: ["node_modules/rimraf/node_modules/minimatch"],
    },
    ...overrides,
  };
  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: { vulnerabilities: { high: 6, moderate: 1 } },
  };
}

const lock = {
  packages: {
    "": {},
    "node_modules/picomatch": { version: "4.0.7", dev: true },
    "node_modules/foo/node_modules/picomatch": { version: "4.0.7", dev: true },
    "node_modules/left-pad": { version: "1.0.0" },
  },
};

const entry = checkedIn.advisories.find((e) => e.id === PICOMATCH)!;
const recheckBy = String(entry.recheckBy);

/** A YYYY-MM-DD day `n` days from `day`. */
function shift(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

const before = shift(recheckBy, -30);

describe("the checked-in allowlist", () => {
  it("holds the picomatch advisory and nothing it cannot check", () => {
    expect(entry, `${PICOMATCH} is not in audit-allowlist.json`).toBeDefined();
    expect(allowlistProblems(checkedIn, shift(recheckBy, -1))).toEqual([]);
  });

  it("covers the report it was written for, and says when it runs out", () => {
    const v = judge({
      report: report(),
      allowlist: checkedIn,
      lock,
      today: before,
    });
    expect(v.failures).toEqual([]);
    expect(v.allowed).toEqual([{ id: PICOMATCH, recheckBy, daysLeft: 30 }]);
    expect(v.stale).toEqual([]);
  });
});

describe("what fails the gate", () => {
  it("a high advisory nobody allowlisted", () => {
    const v = judge({
      report: report(),
      allowlist: { advisories: [] },
      lock,
      today: before,
    });
    expect(v.failures).toHaveLength(1);
    expect(v.failures[0]).toContain(`${PICOMATCH} (high, picomatch)`);
    expect(v.failures[0]).toContain("not allowlisted");
  });

  it("a critical one, too", () => {
    const v = judge({
      report: report({
        "left-pad": {
          name: "left-pad",
          severity: "critical",
          via: [
            {
              source: 2,
              name: "left-pad",
              title: "a critical one",
              url: "https://github.com/advisories/GHSA-2222-3333-4444",
              severity: "critical",
            },
          ],
          effects: [],
          nodes: ["node_modules/left-pad"],
        },
      }),
      allowlist: checkedIn,
      lock,
      today: before,
    });
    expect(v.failures).toEqual([
      expect.stringContaining("GHSA-2222-3333-4444 (critical, left-pad)"),
    ]);
  });

  it("the allowlisted advisory on the day after its recheck date, not on the day", () => {
    const onTheDay = judge({
      report: report(),
      allowlist: checkedIn,
      lock,
      today: recheckBy,
    });
    expect(onTheDay.failures).toEqual([]);
    const after = judge({
      report: report(),
      allowlist: checkedIn,
      lock,
      today: shift(recheckBy, 1),
    });
    expect(after.failures).toEqual([
      expect.stringContaining(`its recheck date ${recheckBy} has passed`),
    ]);
  });

  it("the advisory reaching the tree through a package the entry does not name", () => {
    const r = report();
    const vulns = r.vulnerabilities as Record<string, Json>;
    vulns.picomatch.effects = [
      ...(vulns.picomatch.effects as string[]),
      "left-pad",
    ];
    const v = judge({ report: r, allowlist: checkedIn, lock, today: before });
    expect(v.failures).toEqual([
      expect.stringContaining("it now reaches the tree through left-pad"),
    ]);
  });

  it("a second copy installed somewhere the entry does not name", () => {
    const r = report();
    const vulns = r.vulnerabilities as Record<string, Json>;
    vulns.picomatch.nodes = [
      "node_modules/picomatch",
      "node_modules/foo/node_modules/picomatch",
    ];
    const v = judge({ report: r, allowlist: checkedIn, lock, today: before });
    expect(v.failures).toEqual([
      expect.stringContaining(
        "it is now installed at node_modules/foo/node_modules/picomatch"
      ),
    ]);
  });

  it("an install that is no longer dev-only", () => {
    const prodLock = {
      packages: {
        ...lock.packages,
        "node_modules/picomatch": { version: "4.0.7" },
      },
    };
    const v = judge({
      report: report(),
      allowlist: checkedIn,
      lock: prodLock,
      today: before,
    });
    expect(v.failures).toEqual([
      expect.stringContaining(
        "node_modules/picomatch is not dev-only in package-lock.json"
      ),
    ]);
  });

  it("an entry filed against a different package", () => {
    const allowlist = {
      advisories: [{ ...entry, package: "micromatch" }],
    };
    const v = judge({ report: report(), allowlist, lock, today: before });
    expect(v.failures).toEqual([
      expect.stringContaining("it is filed against picomatch, not micromatch"),
    ]);
  });

  it("a report npm could not produce, or one with no vulnerabilities object", () => {
    const errored = judge({
      report: { error: { code: "ENOTFOUND", summary: "registry unreachable" } },
      allowlist: checkedIn,
      lock,
      today: before,
    });
    expect(errored.failures).toEqual([
      expect.stringContaining(
        "npm audit reported an error: registry unreachable"
      ),
    ]);
    for (const bad of [undefined, null, {}, { vulnerabilities: "none" }]) {
      const v = judge({
        report: bad,
        allowlist: checkedIn,
        lock,
        today: before,
      });
      expect(v.failures, JSON.stringify(bad)).toEqual([
        "the audit report has no `vulnerabilities` object",
      ]);
    }
  });
});

describe("what the gate lets through", () => {
  it("moderate and low advisories, which it does not gate", () => {
    const r = report();
    const vulns = r.vulnerabilities as Record<string, Json>;
    for (const name of [
      "picomatch",
      "fdir",
      "tinyglobby",
      "vite",
      "vitest",
      "lint-staged",
    ])
      delete vulns[name];
    const v = judge({
      report: r,
      allowlist: { advisories: [] },
      lock,
      today: before,
    });
    expect(v.failures).toEqual([]);
  });

  it("names an entry the audit no longer reports, without failing", () => {
    const r = report();
    const vulns = r.vulnerabilities as Record<string, Json>;
    delete vulns.picomatch;
    for (const name of ["fdir", "tinyglobby", "vite", "vitest", "lint-staged"])
      delete vulns[name];
    const v = judge({ report: r, allowlist: checkedIn, lock, today: before });
    expect(v.failures).toEqual([]);
    expect(v.stale).toEqual([PICOMATCH]);
  });
});

describe("an allowlist entry has to be checkable", () => {
  const good = { ...entry };

  it.each([
    [
      "an id that is not a GHSA id",
      { ...good, id: "CVE-2026-1234" },
      "id must be a GHSA id",
    ],
    ["no reason", { ...good, reason: "" }, "reason must say why"],
    [
      "a date that is not a day",
      { ...good, recheckBy: "soon" },
      "recheckBy must be a YYYY-MM-DD date",
    ],
    [
      "no install locations",
      { ...good, nodes: [] },
      "nodes must be a non-empty list",
    ],
    [
      "no dependents",
      { ...good, through: "vite" },
      "through must be a non-empty list",
    ],
    ["no package", { ...good, package: undefined }, "package is missing"],
  ])("refuses %s", (_label, bad, message) => {
    const problems = allowlistProblems({ advisories: [bad] }, before);
    expect(problems).toEqual([expect.stringContaining(message)]);
    const v = judge({
      report: report(),
      allowlist: { advisories: [bad] },
      lock,
      today: before,
    });
    expect(v.failures.some((f) => f.includes(message))).toBe(true);
  });

  it("refuses a date further ahead than a quarter, so it cannot be made permanent", () => {
    const far = { ...good, recheckBy: shift(before, MAX_DAYS_AHEAD + 1) };
    expect(allowlistProblems({ advisories: [far] }, before)).toEqual([
      expect.stringContaining(`more than ${MAX_DAYS_AHEAD} days ahead`),
    ]);
    const edge = { ...good, recheckBy: shift(before, MAX_DAYS_AHEAD) };
    expect(allowlistProblems({ advisories: [edge] }, before)).toEqual([]);
  });

  it("refuses the same advisory twice, and a file with no list", () => {
    expect(allowlistProblems({ advisories: [good, good] }, before)).toEqual([
      expect.stringContaining("listed twice"),
    ]);
    expect(allowlistProblems({}, before)).toEqual([
      "audit-allowlist.json has no `advisories` array",
    ]);
  });
});

describe("ci.yml runs the gate", () => {
  const ci = readFileSync(
    resolve(repoRoot, ".github/workflows/ci.yml"),
    "utf8"
  );
  const audit = ci.slice(ci.indexOf("\n  audit:\n"));

  it("finds the audit job", () => {
    expect(audit.length).toBeGreaterThan(100);
    expect(audit).toContain("runs-on: ubuntu-latest");
  });

  it("gates the root tree through the allowlist, and the functions tree as before", () => {
    const commands = audit
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => !l.startsWith("#"));
    expect(commands).toContain("run: node scripts/ci/audit-gate.mjs");
    expect(commands).toContain("npm audit --omit=dev --audit-level=high");
    /* The root tree is never audited bare again, and nothing softens a
       failure into a pass. */
    expect(commands.filter((l) => /npm audit(?! --omit=dev)/.test(l))).toEqual(
      []
    );
    expect(audit).not.toMatch(/\|\| true|continue-on-error/);
  });
});
