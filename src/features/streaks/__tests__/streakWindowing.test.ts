/**
 * Streak/challenge windowing honesty (D13).
 *
 * `useStreaks` reads a RECENT window (≤400 workout / 400 run / 500 meal docs)
 * and recomputes `totalActiveDays` as the size of the active-date set built from
 * it. That number therefore saturates around ~400 distinct days — a user with a
 * 2-year daily history does NOT see 730. `currentStreak` / `longestStreak` stay
 * accurate (any realistic streak fits the window), but `totalActiveDays` is
 * genuinely windowed.
 *
 * The deliberate decision (D13): KEEP the window — a server-maintained lifetime
 * aggregate is deferred until a surface actually needs a true-lifetime number —
 * but make the windowing IMPOSSIBLE to surface dishonestly. This test pins two
 * things so the next agent can't relabel the windowed value as lifetime:
 *   1. the honesty contract is documented on the field itself, and
 *   2. no UI renders `totalActiveDays` next to a "total"/"lifetime" label.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const srcRoot = resolve(repoRoot, "src");

describe("D13 · streak windowing is documented, not invisible", () => {
  it("StreakData.totalActiveDays carries the windowed/honesty contract in its doc", () => {
    const src = readFileSync(
      resolve(srcRoot, "features/streaks/useStreaks.tsx"),
      "utf8"
    );
    // The field's JSDoc must state it's windowed (not lifetime) AND forbid a
    // lifetime label — the two halves of the decision. If someone deletes the
    // doc, this fails, forcing the windowing back into visibility.
    const fieldDoc = src.match(
      /WINDOWED, not lifetime[\s\S]*?totalActiveDays: number;/
    );
    expect(fieldDoc, "totalActiveDays must keep its windowing JSDoc").not.toBe(
      null
    );
    expect(fieldDoc?.[0]).toMatch(/NEVER\s+"total"\s+or\s+"lifetime"/);
  });

  it("the window-size comment names totalActiveDays as a deliberate windowed limit", () => {
    const src = readFileSync(
      resolve(srcRoot, "features/streaks/useStreaks.tsx"),
      "utf8"
    );
    expect(src).toMatch(/windowed, not truly lifetime \(D13/);
  });
});

describe("D13 · no UI presents the windowed count as lifetime/total", () => {
  // Scan every .tsx for a "total active days" / "lifetime active days" label.
  // The windowed value may be shown — but only as "active days" (recent), never
  // dressed as a lifetime total. Catches the dishonest-label regression directly.
  function tsxFiles(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const full = resolve(dir, name);
      if (statSync(full).isDirectory()) {
        if (name === "node_modules" || name === "__tests__") continue;
        out.push(...tsxFiles(full));
        continue;
      }
      if (name.endsWith(".tsx")) out.push(full);
    }
    return out;
  }

  it("no rendered copy labels active-days as total/lifetime", () => {
    const offenders: string[] = [];
    // Match user-facing label text only (JSX text / string), case-insensitive:
    // "total active days" or "lifetime active days" (with optional words between).
    const dishonest =
      /(total|lifetime)\s+active\s+days|active\s+days\s+(total|lifetime)/i;
    for (const file of tsxFiles(srcRoot)) {
      const src = readFileSync(file, "utf8");
      if (dishonest.test(src)) {
        offenders.push(file.replace(repoRoot + "/", ""));
      }
    }
    expect(
      offenders,
      `These files label active-days as total/lifetime, but the value is ` +
        `windowed (≤~400 days). Use "active days" (recent), or build a server ` +
        `lifetime aggregate first (D13).\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });
});
