import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Train says when a lift day runs well past its plan's length, under the
 * day's card, and offers the rebuild there (slice 4; the owner chose this
 * notice, B, on 12 November 2026).
 *
 * Pinned at the source, for the reason `programLiftPurpose.test.ts` gives:
 * nothing renders Program.tsx in jsdom. What the notice says and does is
 * tested in `OutgrownDayNotice.test.tsx`; when a day has outgrown its
 * length in `outgrownDay.test.ts`; the rebuild in `liftDaysRebuild.test.ts`.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = readFileSync(resolve(repoRoot, "src/pages/Program.tsx"), "utf8");
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\n]*/g, " ");

describe("Train's notice for a day past its length", () => {
  const at = code.indexOf("<OutgrownDayNotice");

  it("renders once, under the session card and above the reason", () => {
    expect(at).toBeGreaterThan(-1);
    expect(code.indexOf("<OutgrownDayNotice", at + 1)).toBe(-1);
    expect(at).toBeGreaterThan(code.indexOf('sport="lift"'));
    expect(at).toBeLessThan(code.indexOf("<LiftPurpose"));
  });

  it("shows on a day still to train that has outgrown the plan's length", () => {
    const rule = code.slice(
      code.indexOf("const showOutgrown"),
      code.indexOf("async function rebuildForLength")
    );
    expect(rule).toMatch(/status === "today" \|\| status === "upcoming"/);
    expect(rule).toMatch(/hasOutgrown\(estimatedMinutes, fittedLength\)/);
    expect(rule).toMatch(/!isLongDayKept\(user\?\.uid, outgrownKey\)/);
    expect(code).toMatch(
      /const fittedLength = programState\?\.sessionMinutes;/
    );
  });

  it("gives way to the week-level notice", () => {
    expect(code.slice(Math.max(0, at - 200), at)).toMatch(
      /liftAdvice !== "deload"/
    );
  });

  it("rebuilds for the length it names, once the programme has loaded", () => {
    const handler = code.slice(
      code.indexOf("async function rebuildForLength"),
      code.indexOf("finally", code.indexOf("async function rebuildForLength"))
    );
    expect(handler).toMatch(/readiness !== "ready"/);
    expect(handler).toMatch(
      /import\(\s*"@\/features\/program\/liftPlanRebuild"\s*\)/
    );
    expect(handler).toMatch(/rebuildLiftDaysFor\(length,/);
    expect(handler).toMatch(/refreshProfile\(\)/);
    const props = code.slice(at, code.indexOf("/>", at));
    expect(props).toMatch(/length=\{fittedLength\}/);
    expect(props).toMatch(/rebuildForLength\(fittedLength\)/);
  });
});
