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
//   reason     why it is acceptable here, in a sentence someone can check
//   recheckBy  the last day it holds (UTC); from the next day it fails
//              again, so the exception is looked at, not forgotten
//   nodes      where that package may be installed (package-lock paths),
//              each of them dev-only in package-lock.json
//   through    the packages that may depend on it directly (npm audit's
//              `effects` for it), the ways it reaches the tree
//
// A new carrier, a new install location, a production install or a
// passed date each fail the gate, because each one breaks the reason the
// entry was accepted for. If a patched release appears, an `overrides`
// entry in package.json beats this file: take it and delete the entry.
//
// Usage: node scripts/ci/audit-gate.mjs   (runs `npm audit --json` here)

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The severities that fail the gate. */
export const GATED = new Set(["high", "critical"]);

/** How far ahead an entry may be dated. Tropos heuristic: a quarter is
 *  long enough for an upstream fix to ship and short enough that an
 *  exception cannot become permanent by writing a far-off date. */
export const MAX_DAYS_AHEAD = 92;

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
    for (const key of ["nodes", "through"]) {
      if (
        !Array.isArray(e?.[key]) ||
        !e[key].length ||
        e[key].some((v) => typeof v !== "string" || !v)
      )
        problems.push(`${at}: ${key} must be a non-empty list of names`);
    }
  }
  return problems;
}

/**
 * Every high or critical advisory in an `npm audit --json` report (v2),
 * with the package it is filed against, where that package is installed,
 * and the packages that depend on it directly.
 *
 * An advisory is an object in some package's `via`; a string there only
 * names another vulnerable package. Each advisory is read where it is
 * filed, so one reached through many packages is judged once.
 */
export function gatedAdvisories(report) {
  const vulns = report?.vulnerabilities;
  if (!vulns || typeof vulns !== "object") {
    throw new Error("the audit report has no `vulnerabilities` object");
  }
  const found = new Map();
  for (const vuln of Object.values(vulns)) {
    for (const adv of vuln?.via ?? []) {
      if (!adv || typeof adv !== "object") continue;
      if (!GATED.has(adv.severity)) continue;
      const id = ghsaOf(adv.url) ?? `npm-advisory-${adv.source}`;
      if (found.has(id)) continue;
      const filed = vulns[adv.name] ?? vuln;
      found.set(id, {
        id,
        package: adv.name,
        severity: adv.severity,
        title: adv.title ?? "",
        url: adv.url ?? "",
        nodes: [...(filed.nodes ?? [])].sort(),
        through: [...(filed.effects ?? [])].sort(),
      });
    }
  }
  return [...found.values()];
}

/**
 * The gate's verdict on one report.
 *
 * `lock` is package-lock.json, read for the `dev` flag of each install
 * location; `today` is a YYYY-MM-DD UTC day, passed in so tests choose it.
 */
export function judge({ report, allowlist, lock, today }) {
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
    const through = Array.isArray(entry.through) ? entry.through : [];
    const newThrough = adv.through.filter((p) => !through.includes(p));
    if (newThrough.length)
      why.push(`it now reaches the tree through ${newThrough.join(", ")}`);
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

function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, "../..");
  const allowlist = JSON.parse(
    readFileSync(resolve(here, "audit-allowlist.json"), "utf8")
  );
  const lock = JSON.parse(
    readFileSync(resolve(root, "package-lock.json"), "utf8")
  );
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
    today,
  });
  const counts = report?.metadata?.vulnerabilities;
  if (counts) console.log(`npm audit: ${JSON.stringify(counts)}`);
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
