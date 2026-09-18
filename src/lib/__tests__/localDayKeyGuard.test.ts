/**
 * Local day-key enforcement (CLAUDE.md recurring-mistake rule:
 * "Never mix local-date and UTC operations in one calculation").
 *
 * The banned idiom is deriving a calendar DAY from the current INSTANT
 * through UTC:
 *
 *   new Date().toISOString().slice(0, 10)
 *   new Date().toISOString().split("T")[0]
 *
 * `dateHelpers.ts`'s own header names this as the reason it exists —
 * "the late-night-PST class of bugs where `new Date().toISOString()`
 * silently rolls a day forward (23:00 PST = 07:00 UTC = next day's ISO
 * date)". The correct call is `localDateString()` from that module.
 *
 * Why a scan rather than a unit test: the defect is never in a helper,
 * it is at the call site, one expression inline in a component. When
 * this guard was written it found seven, every one of them a date a
 * user reads:
 *
 *   - WorkoutSession.tsx (x4) — the date stamped on a personal record.
 *     The same save writes the workout doc's `date` through
 *     `localDateString()`, so a session run before 11:00 in Auckland
 *     produced a PR dated one day earlier than the workout it was set
 *     in, on two different screens. The PR map already held both kinds
 *     of key at once: entries rebuilt from history carry the workout
 *     doc's local date, entries set live carried the UTC one.
 *   - ProgressPhotos.tsx (x2) — a check-in's stored date, and the date
 *     the new-check-in composer pre-fills.
 *   - DataExportSection.tsx — the day in an exported CSV's filename.
 *
 * A full `toISOString()` is untouched: an instant serialised as an
 * instant is correct, and the codebase has many. Only the day-key slice
 * matches. So does a Date built from a VALUE — `new Date(ms)` — because
 * the pattern requires the empty constructor; the round-trip validation
 * in `bodyweightLogs.ts` (`Date.UTC(...)` then `toISOString()`, to check
 * a string parses back to itself) is a carrier, not a clock, and is
 * invisible here.
 *
 * Adding a file to ALLOWLIST is a conscious decision that a UTC day is
 * the RIGHT answer there — which is true in exactly two situations: a
 * value the server also computes in UTC, and something no user reads.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const srcRoot = resolve(repoRoot, "src");

/** Files where a UTC day key is the intended answer. */
const ALLOWLIST = new Map<string, string>([
  [
    "src/features/challenges/useChallenges.ts",
    // `boundaryDayKey` — a challenge's end boundary is the same instant
    // for every participant, so it is UTC on both sides of the mirror.
    "challenge end boundary: one instant shared by all participants",
  ],
  [
    "src/components/food/FoodTimeline.tsx",
    // A per-day throttle key for render telemetry. Nothing a user reads,
    // and a UTC roll is as good a once-a-day boundary as any.
    "render-perf telemetry throttle key — not a user-visible date",
  ],
]);

/** `new Date()` with NO arguments, sliced to a day key. */
const UTC_DAY_KEY =
  /new Date\(\)\s*\.toISOString\(\)\s*\.(slice\(\s*0\s*,\s*10\s*\)|split\(\s*"T"\s*\)\s*\[\s*0\s*\])/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("a day key is derived locally, never from the UTC clock", () => {
  it("no src/ file slices a day key off new Date().toISOString()", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(srcRoot)) {
      const rel = relative(repoRoot, file);
      if (ALLOWLIST.has(rel)) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (UTC_DAY_KEY.test(line)) offenders.push(`${rel}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("the pattern it bans is the one that actually goes wrong", () => {
    // Anchor the regex on real text rather than trusting it: a guard
    // whose pattern matches nothing passes for the wrong reason.
    expect(
      UTC_DAY_KEY.test(`date: new Date().toISOString().split("T")[0],`)
    ).toBe(true);
    expect(
      UTC_DAY_KEY.test(`const today = new Date().toISOString().slice(0, 10);`)
    ).toBe(true);
    // …and leaves the correct idioms alone.
    expect(UTC_DAY_KEY.test(`computedAt: new Date().toISOString(),`)).toBe(
      false
    );
    expect(
      UTC_DAY_KEY.test(`return new Date(ms).toISOString().slice(0, 10);`)
    ).toBe(false);
    expect(UTC_DAY_KEY.test(`date: localDateString(),`)).toBe(false);
  });
});
