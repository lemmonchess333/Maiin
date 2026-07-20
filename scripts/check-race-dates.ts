#!/usr/bin/env node
/**
 * Stale race-date tripwire (races plan, 2026-07-20).
 *
 * The race catalogue's ONLY recurring duty is pasting each race's
 * next-edition date forward once a year (Q2 lock: staleness is
 * derived — a passed `event.dateKey` hides the card and CTA but the
 * space stays alive, so nothing breaks while stale). The date LOOKUP
 * is deliberately human/agent work — dates are verified against each
 * race's official site, never guessed (Q5 lock; race dates don't
 * follow rules: London 10,000 moved May→September, London Marathon
 * 2027 became a two-day event). This script automates the NOTICING:
 * `race-date-check.yml` runs it monthly and files/updates a GitHub
 * issue when any race has lapsed.
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
