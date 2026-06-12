/**
 * Scheduled-function UTC enforcement (CLAUDE.md recurring-mistake rule).
 *
 * "Never mix local-date and UTC operations… pin scheduled functions to explicit
 * UTC — a Europe/London schedule anchor silently shifts an hour under BST."
 * This shipped as a real bug (PR #815: `weeklyPerformanceRollup` /
 * `dailyPerformanceRefresh` fired an hour off because the schedule anchored to
 * Europe/London, which is UTC+1 under British Summer Time). The fix pinned every
 * cron to UTC.
 *
 * This guard fails if any `.pubsub.schedule(...)` is missing a `.timeZone(...)`,
 * or if any `.timeZone(...)` uses a non-UTC zone (the BST footgun). A new cron
 * on a local zone fails CI before it can drift.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const indexSrc = readFileSync(resolve(repoRoot, "functions/index.js"), "utf8");

/** The only timezone identifiers a scheduled function may anchor to. */
const UTC_ZONES = new Set(["UTC", "Etc/UTC"]);

describe("scheduled-function UTC enforcement", () => {
  const scheduleCount = (indexSrc.match(/\.pubsub\.schedule\(/g) || []).length;
  const timeZoneValues = [...indexSrc.matchAll(/\.timeZone\("([^"]*)"\)/g)].map(
    (m) => m[1]
  );

  it("there is at least one scheduled function (scan isn't vacuous)", () => {
    expect(scheduleCount).toBeGreaterThan(0);
  });

  it("every scheduled function declares a timeZone", () => {
    // One .timeZone per .pubsub.schedule. A schedule without a timeZone defaults
    // to America/Los_Angeles (the GCP default) — a silent, worse footgun.
    expect(
      timeZoneValues.length,
      `${scheduleCount} .pubsub.schedule(...) calls but only ` +
        `${timeZoneValues.length} .timeZone(...) — a schedule is missing an ` +
        `explicit timezone (defaults to America/Los_Angeles). Add .timeZone("Etc/UTC").`
    ).toBe(scheduleCount);
  });

  it("every scheduled function anchors to UTC (no BST-prone local zone)", () => {
    const nonUtc = timeZoneValues.filter((z) => !UTC_ZONES.has(z));
    expect(
      nonUtc,
      `These cron timezones aren't UTC — a local anchor (e.g. Europe/London) ` +
        `shifts an hour under DST and fires the rollup at the wrong time ` +
        `(PR #815). Use "Etc/UTC".\n  ${nonUtc.join("\n  ")}`
    ).toEqual([]);
  });
});
