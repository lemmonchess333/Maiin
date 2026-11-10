/**
 * useDayMoment: "now" for a screen, taken again when the day turns.
 *
 * A phone keeps a page mounted overnight. A memo that read `new Date()`
 * once kept yesterday: History opened in the morning still covered the
 * window up to yesterday. Pinned here: the moment holds within a day (so
 * memos keyed on it hold), moves with the day while the page is open, and
 * moves on a return to the app the next morning.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { localDateString } from "@/lib/dateHelpers";
import { restoreRealTimers } from "@/test/fakeTimers";
import { useDayMoment } from "../useDayMoment";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 9, 23, 59, 0));
});
afterEach(async () => {
  await restoreRealTimers();
});

describe("useDayMoment", () => {
  it("holds the same moment within a day", () => {
    const { result, rerender } = renderHook(() => useDayMoment());
    const first = result.current;
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    rerender();
    expect(result.current).toBe(first);
    expect(localDateString(first)).toBe("2026-11-09");
  });

  it("moves to the new day while the page stays open", () => {
    const { result } = renderHook(() => useDayMoment());
    expect(localDateString(result.current)).toBe("2026-11-09");
    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    expect(localDateString(result.current)).toBe("2026-11-10");
  });

  it("moves to the new day on a return to the app the next morning", () => {
    const { result } = renderHook(() => useDayMoment());
    // Asleep in the background overnight: no timer ran, the clock moved.
    vi.setSystemTime(new Date(2026, 10, 10, 7, 30, 0));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(localDateString(result.current)).toBe("2026-11-10");
    expect(result.current.getHours()).toBe(7);
  });
});

/* History and Train's run section mount too much to render here (their
   own suites read the source for the same reason), so what is pinned is
   that their day-dependent memos read the day's moment, and no clock of
   their own. */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = (path: string) =>
  readFileSync(resolve(repoRoot, path), "utf8").replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    " "
  );
/** The `useMemo` assigned to `name`: its body, and its deps, the last
 *  `[...]` before the call closes (prettier puts `);` on its own line). */
function memo(text: string, name: string): { body: string; deps: string } {
  const start = text.indexOf(`const ${name} = useMemo(`);
  expect(
    start,
    `${name} is no longer a memo: retarget this test`
  ).toBeGreaterThan(-1);
  // The deps close the call: `], ...);` on one line or `]\n  );`.
  const close = /\]\s*\);/.exec(text.slice(start));
  expect(close, `${name} has no deps: retarget this test`).not.toBeNull();
  const call = text.slice(start, start + (close?.index ?? 0) + 1);
  const open = call.lastIndexOf("[");
  return { body: call.slice(0, open), deps: call.slice(open) };
}

describe("the screens that read it", () => {
  it("History reads its range and its recovery at the day's moment", () => {
    const history = source("src/pages/History.tsx");
    expect(history).toContain("useDayMoment()");
    const range = memo(history, "range");
    expect(range.body).toMatch(/historyRange\([^)]*\bnow\b/);
    expect(range.deps).toMatch(/\bnow\b/);
    const recovery = memo(history, "muscleRecovery");
    expect(recovery.body).not.toMatch(/new Date\(\)|localDateString\(\)/);
    expect(recovery.deps).toContain("range.todayKey");
  });

  it("Train's run cadence reads the day's moment", () => {
    const section = source("src/components/program/ProgrammeRunSection.tsx");
    const cadence = memo(section, "freeformCadence");
    expect(cadence.body).not.toContain("new Date()");
    expect(cadence.deps).toContain("cadenceNow");
  });
});
