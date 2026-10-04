#!/usr/bin/env node
/**
 * Stale race-date tripwire (races plan, 2026-07-20).
 *
 * Local diagnostic for lapsed BUNDLED dates. The daily GitHub job now
 * uses refresh-race-dates.ts, which also reads remote updates and checks
 * official organisers. Expired races remain in the directory with a
 * pending-date label; the training picker still requires a future date.
 *
 * Output: a JSON array of stale races on stdout (empty array = all
 * current). Always exits 0 — staleness is a work item, not a build
 * failure (a failing check would redden unrelated PRs on a calendar
 * date).
 *
 * `--today=YYYY-MM-DD` overrides the clock for testing, e.g.
 *   npx tsx scripts/check-race-dates.ts --today=2099-01-01
 */
import { SPACE_DEFS } from "../src/features/spaces/spaceDefs";

function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const todayArg = process.argv
  .find((a) => a.startsWith("--today="))
  ?.slice("--today=".length);
const todayKey =
  todayArg && /^\d{4}-\d{2}-\d{2}$/.test(todayArg)
    ? todayArg
    : localDateString();

const stale = SPACE_DEFS.filter(
  (d) => d.kind === "race" && d.event && d.event.dateKey < todayKey
).map((d) => ({
  id: d.id,
  name: d.name,
  passedDate: d.event!.dateKey,
  websiteUrl: d.event!.websiteUrl,
}));

console.log(JSON.stringify(stale, null, 2));
