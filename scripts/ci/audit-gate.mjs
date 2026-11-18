#!/usr/bin/env node
// The root dependency audit, as a gate: fails on any high or critical
// advisory that a live entry in audit-allowlist.json does not cover.
//
// `npm audit --audit-level=high` has no way to accept one advisory and
// keep failing on the rest, so an advisory with no patched release (the
// picomatch ReDoS, reached only through dev tooling) turned the audit job
// red on every pull request. The answer to that is not a looser level or
// `|| true`, which would pass the next advisory too. It is a named,
// dated exception:
//
//   id         the GHSA id of the one advisory it accepts
//   package    the package that advisory is filed against
//   reason     why it is acceptable here, in sentences someone can check
//   recheckBy  the last day it holds (UTC); from the next day it fails
//              again, so the exception is looked at, not forgotten
//   nodes      where that package may be installed (package-lock paths)
//
// The entry holds only while the package is installed at those paths
// alone, each marked `dev` in package-lock.json, and nothing under src/
// imports it. `dev` means npm reached it only from devDependencies, not
// that none of its work ships (a build tool's output does), which is why
// the src/ import check is separate. A new install path, a production
// install, an import from the app or a passed date each fail the gate,
// because each breaks the reason the entry was accepted for. If a patched
// release appears, take it (an `overrides` entry in package.json if a tool
// pins the old range) and delete the entry.
//
// The report is read strictly: npm prints JSON for a registry error too,
// so a report without its version, its counts or its vulnerabilities, or
// a high or critical package whose advisories cannot be traced, fails.
//
// Usage: node scripts/ci/audit-gate.mjs   (runs `npm audit --json` here)

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The severities that fail the gate. */
export const GATED = new Set(["high", "critical"]);

/** How far ahead an entry may be dated. Tropos heuristic: a quarter is
 *  long enough for an upstream fix to ship and short enough that an
 *  exception cannot become permanent by writing a far-off date. */
export const MAX_DAYS_AHEAD = 92;

/** The `npm audit --json` shape this reads (npm 7 and later). */
export const REPORT_VERSION = 2;

const GHSA = /^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

/** The GHSA id an advisory's url ends in, or null. */
function ghsaOf(url) {
  const m = /\/(GHSA(?:-[a-z0-9]{4}){3})$/.exec(String(url ?? ""));
  return m ? m[1] : null;
}

/** Whole days from `today` to `day`, both YYYY-MM-DD (UTC). */
function daysBetween(today, day) {
  return Math.round(
    (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      MS_PER_DAY
  );
}

/**
 * Problems with the allowlist file itself. An entry that cannot be
 * checked is not an exception, so a malformed one fails the gate rather
 * than being skipped.
 */
export function allowlistProblems(allowlist, today) {
  const problems = [];
  const entries = allowlist?.advisories;
  if (!Array.isArray(entries)) {
    return ["audit-allowlist.json has no `advisories` array"];
  }
  const seen = new Set();
  for (const [i, e] of entries.entries()) {
    const at = `advisories[${i}]${e?.id ? ` (${e.id})` : ""}`;
    if (!GHSA.test(String(e?.id ?? "")))
      problems.push(`${at}: id must be a GHSA id`);
    else if (seen.has(e.id)) problems.push(`${at}: listed twice`);
    seen.add(e?.id);
    if (typeof e?.package !== "string" || !e.package)
      problems.push(`${at}: package is missing`);
    if (typeof e?.reason !== "string" || e.reason.trim().length < 20)
      problems.push(`${at}: reason must say why, in a sentence`);
    if (!DAY.test(String(e?.recheckBy ?? "")) || isNaN(Date.parse(e.recheckBy)))
      problems.push(`${at}: recheckBy must be a YYYY-MM-DD date`);
    else if (daysBetween(today, e.recheckBy) > MAX_DAYS_AHEAD)
      problems.push(
        `${at}: recheckBy ${e.recheckBy} is more than ${MAX_DAYS_AHEAD} days ahead`
      );
    if (
      !Array.isArray(e?.nodes) ||
      !e.nodes.length ||
      e.nodes.some((v) => typeof v !== "string" || !v)
    )
      problems.push(`${at}: nodes must be a non-empty list of paths`);
  }
  return problems;
}

/**
 * Every high or critical advisory in an `npm audit --json` report, with
 * the package it is filed against and where that package is installed.
 *
 * Each high or critical package is walked down its `via` (a string there
 * names another vulnerable package, an object is an advisory) to the
 * advisories at the bottom. A package that is high or critical with no
 * high or critical advisory under it is a report this cannot account
 * for, and throws, as does a report missing its version or counts.
 */
export function gatedAdvisories(report) {
  if (report?.auditReportVersion !== REPORT_VERSION) {
    throw new Error(
      `the audit report is not version ${REPORT_VERSION} (auditReportVersion: ${JSON.stringify(report?.auditReportVersion)})`
    );
  }
  const counts = report?.metadata?.vulnerabilities;
  if (!counts || typeof counts !== "object") {
    throw new Error(
      "the audit report has no `metadata.vulnerabilities` counts"
    );
  }
  const vulns = report.vulnerabilities;
  if (!vulns || typeof vulns !== "object") {
    throw new Error("the audit report has no `vulnerabilities` object");
  }

  const leavesUnder = (name, seen = new Set()) => {
    if (seen.has(name)) return [];
    seen.add(name);
    const out = [];
    for (const via of vulns[name]?.via ?? []) {
      if (typeof via === "string") out.push(...leavesUnder(via, seen));
      else if (via && typeof via === "object") out.push(via);
    }
    return out;
  };

  const found = new Map();
  const untraced = [];
  for (const [name, vuln] of Object.entries(vulns)) {
    if (!GATED.has(vuln?.severity)) continue;
    const gated = leavesUnder(name).filter((adv) => GATED.has(adv.severity));
    if (!gated.length) untraced.push(`${name} (${vuln.severity})`);
    for (const adv of gated) {
      const id = ghsaOf(adv.url) ?? `npm-advisory-${adv.source}`;
      if (found.has(id)) continue;
      found.set(id, {
        id,
        package: adv.name,
        severity: adv.severity,
        title: adv.title ?? "",
        url: adv.url ?? "",
        nodes: [...(vulns[adv.name]?.nodes ?? [])].sort(),
      });
    }
  }
  if (untraced.length) {
    throw new Error(
      `${untraced.join(", ")} reported with no high or critical advisory under it`
    );
  }
  const countedHigh = (counts.high ?? 0) + (counts.critical ?? 0);
  if (countedHigh > 0 && found.size === 0) {
    throw new Error(
      `the report counts ${countedHigh} high or critical packages but lists none`
    );
  }
  return [...found.values()];
}

/**
 * The gate's verdict on one report.
 *
 * `lock` is package-lock.json, read for the `dev` flag of each install
 * path; `importersOf(name)` lists the files under src/ that import a
 * package; `today` is a YYYY-MM-DD UTC day. All three are passed in, so
 * tests choose them.
 */
export function judge({ report, allowlist, lock, importersOf, today }) {
  const failures = [...allowlistProblems(allowlist, today)];
  const allowed = [];
  const entries = new Map(
    (Array.isArray(allowlist?.advisories) ? allowlist.advisories : []).map(
      (e) => [e.id, e]
    )
  );
  let advisories;
  try {
    if (report?.error) {
      throw new Error(
        `npm audit reported an error: ${report.error.summary ?? report.error.code ?? JSON.stringify(report.error)}`
      );
    }
    advisories = gatedAdvisories(report);
  } catch (err) {
    return { failures: [...failures, String(err.message)], allowed, stale: [] };
  }

  for (const adv of advisories) {
    const label = `${adv.id} (${adv.severity}, ${adv.package}): ${adv.title}`;
    const entry = entries.get(adv.id);
    if (!entry) {
      failures.push(`${label} is not allowlisted. ${adv.url}`);
      continue;
    }
    const why = [];
    if (entry.package !== adv.package)
      why.push(`it is filed against ${adv.package}, not ${entry.package}`);
    if (
      DAY.test(String(entry.recheckBy)) &&
      daysBetween(today, entry.recheckBy) < 0
    )
      why.push(`its recheck date ${entry.recheckBy} has passed`);
    const nodes = Array.isArray(entry.nodes) ? entry.nodes : [];
    const newNodes = adv.nodes.filter((n) => !nodes.includes(n));
    if (newNodes.length)
      why.push(`it is now installed at ${newNodes.join(", ")}`);
    const prod = adv.nodes.filter((n) => lock?.packages?.[n]?.dev !== true);
    if (prod.length)
      why.push(`${prod.join(", ")} is not dev-only in package-lock.json`);
    const importers = importersOf(adv.package);
    if (importers.length) why.push(`src/ imports it (${importers.join(", ")})`);
    if (why.length) {
      failures.push(`${label} is allowlisted, but ${why.join("; ")}.`);
    } else {
      allowed.push({
        id: adv.id,
        recheckBy: entry.recheckBy,
        daysLeft: daysBetween(today, entry.recheckBy),
      });
    }
  }
  const present = new Set(advisories.map((a) => a.id));
  const stale = [...entries.keys()].filter((id) => !present.has(id));
  return { failures, allowed, stale };
}

/** Whether a source file's text imports `name` or a subpath of it. */
export function importsPackage(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return new RegExp(
    `(?:\\bfrom\\s*|\\bimport\\s*\\(\\s*|\\brequire\\s*\\(\\s*|\\bimport\\s+)["']${escaped}(?:/[^"']*)?["']`
  ).test(text);
}

/** Every source file under `dir`, as repo-relative paths. */
function sourceFiles(root, dir) {
  const out = [];
  const walk = (rel) => {
    for (const ent of readdirSync(join(root, rel), { withFileTypes: true })) {
      const path = `${rel}/${ent.name}`;
      if (ent.isDirectory()) {
        if (ent.name !== "node_modules") walk(path);
      } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(ent.name)) {
        out.push(path);
      }
    }
  };
  walk(dir);
  return out;
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, "../..");
  const allowlist = JSON.parse(
    readFileSync(resolve(here, "audit-allowlist.json"), "utf8")
  );
  const lock = JSON.parse(
    readFileSync(resolve(root, "package-lock.json"), "utf8")
  );
  const src = sourceFiles(root, "src").map((path) => ({
    path,
    text: readFileSync(join(root, path), "utf8"),
  }));
  const importersOf = (name) =>
    src.filter((f) => importsPackage(f.text, name)).map((f) => f.path);
  // npm audit exits non-zero whenever it finds anything, at any level, so
  // the exit status says nothing here. The JSON is the answer, and output
  // that does not parse fails the gate.
  const run = spawnSync("npm", ["audit", "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  let report;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    console.error(run.stderr);
    console.error("::error::npm audit did not print a JSON report");
    process.exitCode = 1;
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const { failures, allowed, stale } = judge({
    report,
    allowlist,
    lock,
    importersOf,
    today,
  });
  const counts = report?.metadata?.vulnerabilities;
  if (counts) console.log(`npm audit (packages): ${JSON.stringify(counts)}`);
  for (const a of allowed) {
    console.log(
      `allowed ${a.id} until ${a.recheckBy} (${a.daysLeft} days left), by scripts/ci/audit-allowlist.json`
    );
  }
  for (const id of stale) {
    console.log(
      `::warning::${id} is in scripts/ci/audit-allowlist.json but no longer in the audit; delete the entry`
    );
  }
  for (const f of failures) console.log(`::error::${f}`);
  if (failures.length) {
    console.log(
      "Fix the dependency, add an `overrides` entry, or (only when no fix exists) add a dated entry to scripts/ci/audit-allowlist.json."
    );
    process.exitCode = 1;
  } else {
    console.log("No high or critical advisory outside the allowlist.");
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
