/**
 * Midnight with the app open. Home, Food and Train each read "today" from
 * the shared day key (`useLocalDateKey`), which moves at midnight and
 * when the app comes back to the foreground. Food and Train worked it
 * out from the clock on each render, so a screen left idle overnight
 * kept showing yesterday until something happened to re-render it:
 * Food's diary, its week strip and its 90-day limit, and Train's lift
 * week label, run plan and day notes.
 *
 * A scan, because the defect is a call written inline in a page: the
 * clock read without an argument, as a day key.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) =>
  readFileSync(resolve(process.cwd(), "src/pages", file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

/** "Today" from the clock, rather than from the day key. */
const CLOCK_DAY = [
  /\blocalDateString\(\s*\)/,
  /\blocalDateString\(\s*new Date\(\s*\)\s*\)/,
  /\blocalWeekKey\(\s*\)/,
  /format\(\s*new Date\(\s*\)\s*,\s*"yyyy-MM-dd"\s*\)/,
  /addDays\(\s*new Date\(\s*\)/,
];

describe.each(["Home.tsx", "Food.tsx", "Program.tsx"])("%s", (file) => {
  const source = read(file);

  it("reads today from the shared day key", () => {
    expect(source).toMatch(/useLocalDateKey\(\)/);
  });

  it("never works today out from the clock", () => {
    for (const pattern of CLOCK_DAY) expect(source).not.toMatch(pattern);
  });
});
