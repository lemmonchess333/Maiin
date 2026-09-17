/**
 * `functions/` derives dates in UTC. This pins that convention.
 *
 * Cloud Functions run in UTC and a trigger has no user timezone unless
 * it reads one, so `lib/dateUtils.js` anchors every day-key on UTC
 * deliberately — its header argues the case. Nothing executed that
 * argument, and "the server is UTC anyway" is exactly the belief under
 * which a local-time accessor gets added without anyone noticing: it
 * behaves identically in production, and diverges only off-platform.
 *
 * Measured before writing this, rather than assumed. The whole
 * functions suite gives identical results at UTC, Pacific/Kiritimati
 * (UTC+14), Pacific/Midway (UTC-11) and Pacific/Auckland (a DST zone):
 * 84 files, 1383 tests, no variance. So the convention holds today, and
 * this guard is here to keep it holding rather than to fix anything.
 *
 * Worth recording alongside that: the client had eleven real
 * timezone-dependent failures in the same sweep. The server had none —
 * because it is UTC end to end. `_maybeWriteRecoveryEntryForRun` is the
 * clearest case: it parses a bare race date at UTC midnight, adds
 * N * 7 * 86400000, and reads the digits back out. UTC has no DST, so
 * that is exactly N weeks of calendar days — the same arithmetic in
 * local time is the defect that made a race chip lose a week across a
 * spring-forward.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const functionsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Non-test `.js` under functions/, excluding dependencies. */
function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", "__tests__", "coverage", "lib-dist"].includes(name)) {
      continue;
    }
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (name.endsWith(".js") && !/\.test\.js$/.test(name)) out.push(full);
  }
  return out;
}

/* A local-time date accessor: the same call without the UTC infix. */
const LOCAL_ACCESSOR =
  /\.(get|set)(FullYear|Month|Date|Day|Hours|Minutes|Seconds)\s*\(/g;
const isUtc = (text) => /UTC/.test(text);

/**
 * The two allowed sites, each with the reason it is allowed.
 *
 * Both build an INSTANT used as a rough "active since" horizon against a
 * Firestore Timestamp comparison — not a calendar day, and not anything
 * a user reads. Whether the cutoff lands an hour either side of N*24h
 * cannot change which users a sweep picks up, so the local/UTC
 * distinction is genuinely immaterial here. They are listed rather than
 * silently pattern-excluded so that a THIRD one has to be argued for.
 */
const ALLOWED = new Map([
  ["index.js", "sweepActiveUsers cutoff — an instant horizon, not a day key"],
  [
    "scripts/backfillPerformance.js",
    "same cutoff shape, mirroring sweepActiveUsers",
  ],
]);

describe("functions/ derives dates in UTC", () => {
  it("no source file adds a local-time date accessor", () => {
    const offenders = [];
    for (const file of sourceFiles(functionsRoot)) {
      const rel = relative(functionsRoot, file);
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(LOCAL_ACCESSOR)) {
        if (isUtc(m[0])) continue;
        if (ALLOWED.has(rel)) continue;
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${rel}:${line} ${m[0]}`);
      }
    }
    expect(
      offenders,
      "functions/ anchors dates on UTC (see lib/dateUtils.js). Use the " +
        "getUTC*/setUTC* form, or add the site to ALLOWED here with the " +
        "reason the local/UTC distinction does not matter for it."
    ).toEqual([]);
  });

  it("every allow-listed file still contains the call it excuses", () => {
    /* Otherwise the entry outlives its reason: the call gets fixed or
       deleted, the exemption stays, and the next local accessor added to
       that file is waved through by an allowance nobody re-read. */
    for (const [rel, reason] of ALLOWED) {
      const src = readFileSync(resolve(functionsRoot, rel), "utf8");
      const local = [...src.matchAll(LOCAL_ACCESSOR)].filter(
        (m) => !isUtc(m[0])
      );
      expect(
        local.length,
        `${rel} is allow-listed ("${reason}") but no longer has a local-time accessor — drop the entry`
      ).toBeGreaterThan(0);
    }
  });

  it("the pattern matches a real local accessor and spares the UTC form", () => {
    /* Anchored on the actual text, so the negative above cannot pass by
       matching nothing — the failure mode CLAUDE.md records for guards
       whose expected value is computed by the code under test. */
    const local = [
      ...`cutoff.setDate(cutoff.getDate() - cutoffDays);`.matchAll(
        LOCAL_ACCESSOR
      ),
    ].filter((m) => !isUtc(m[0]));
    expect(local.length).toBe(2);

    const utc = [
      ...`d.setUTCDate(d.getUTCDate() - n); d.getUTCFullYear();`.matchAll(
        LOCAL_ACCESSOR
      ),
    ].filter((m) => !isUtc(m[0]));
    expect(utc.length).toBe(0);
  });
});
