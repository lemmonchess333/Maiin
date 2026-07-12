import { describe, it, expect } from "vitest";
import {
  evaluateEaseWeekNudge,
  type EaseWeekNudgeInput,
  type EaseWeekNudgeRun,
  WINDOW_DAYS,
  COOLDOWN_DAYS,
} from "../easeWeekNudge";

/* Run14 — the ease-week nudge trigger. Suggest+approve: this decides
 * SHOW; the card opens AdjustWeekSheet. Harder-streak only, race-prep
 * only, heavily suppressed. Self-gating on real ratings. */

const TODAY = "2026-07-12"; // a Sunday
const run = (
  date: string,
  relativeEffort: EaseWeekNudgeRun["relativeEffort"]
) => ({
  date,
  relativeEffort,
});

function base(overrides: Partial<EaseWeekNudgeInput> = {}): EaseWeekNudgeInput {
  return {
    isRacePrep: true,
    runs: [],
    today: TODAY,
    phaseSuppressed: false,
    weekAlreadyEased: false,
    fellBehindPending: false,
    dismissedWeekKey: null,
    lastShownAt: null,
    ...overrides,
  };
}

describe("evaluateEaseWeekNudge — trigger", () => {
  it("fires when 2 of the last 3 rated runs were harder, in window", () => {
    const res = evaluateEaseWeekNudge(
      base({
        runs: [
          run("2026-07-11", "harder"),
          run("2026-07-09", "harder"),
          run("2026-07-07", "matched"),
        ],
      })
    );
    expect(res).toEqual({
      show: true,
      harderCount: 2,
      ratedCount: 3,
      windowDays: WINDOW_DAYS,
    });
  });

  it("fires on 2 of 2 rated (both harder) — self-gates on real signals", () => {
    const res = evaluateEaseWeekNudge(
      base({ runs: [run("2026-07-11", "harder"), run("2026-07-08", "harder")] })
    );
    expect(res.show).toBe(true);
    if (res.show) expect(res).toMatchObject({ harderCount: 2, ratedCount: 2 });
  });

  it("does NOT fire on a single harder run", () => {
    const res = evaluateEaseWeekNudge(
      base({
        runs: [run("2026-07-11", "harder"), run("2026-07-08", "matched")],
      })
    );
    expect(res.show).toBe(false);
  });

  it("does NOT fire when the harder runs are older than the window", () => {
    // Both harder but > WINDOW_DAYS ago.
    const res = evaluateEaseWeekNudge(
      base({ runs: [run("2026-06-30", "harder"), run("2026-06-28", "harder")] })
    );
    expect(res.show).toBe(false);
  });

  it("only inspects the most recent 3 rated — an older harder pair can't stack", () => {
    // 3 recent are matched/easier; two harder sit 4th/5th → excluded.
    const res = evaluateEaseWeekNudge(
      base({
        runs: [
          run("2026-07-12", "matched"),
          run("2026-07-11", "easier"),
          run("2026-07-10", "matched"),
          run("2026-07-09", "harder"),
          run("2026-07-08", "harder"),
        ],
      })
    );
    expect(res.show).toBe(false);
  });

  it("ignores skipped (null) check-ins when picking the recent 3", () => {
    // Nulls are not rated; the two harder ratings are the recent rated set.
    const res = evaluateEaseWeekNudge(
      base({
        runs: [
          run("2026-07-12", null),
          run("2026-07-11", "harder"),
          run("2026-07-10", null),
          run("2026-07-09", "harder"),
        ],
      })
    );
    expect(res.show).toBe(true);
  });

  it("does not count future-dated runs", () => {
    const res = evaluateEaseWeekNudge(
      base({ runs: [run("2026-07-20", "harder"), run("2026-07-19", "harder")] })
    );
    expect(res.show).toBe(false);
  });
});

describe("evaluateEaseWeekNudge — scope + suppression", () => {
  const triggering = [run("2026-07-11", "harder"), run("2026-07-09", "harder")];

  it("suppressed outside a race-prep block (freeform has no plan)", () => {
    expect(
      evaluateEaseWeekNudge(base({ isRacePrep: false, runs: triggering })).show
    ).toBe(false);
  });

  it("suppressed during taper / race week / recovery", () => {
    expect(
      evaluateEaseWeekNudge(base({ phaseSuppressed: true, runs: triggering }))
        .show
    ).toBe(false);
  });

  it("suppressed when the week was already eased / re-planned", () => {
    expect(
      evaluateEaseWeekNudge(base({ weekAlreadyEased: true, runs: triggering }))
        .show
    ).toBe(false);
  });

  it("suppressed while a fell-behind prompt is pending (stronger signal wins)", () => {
    expect(
      evaluateEaseWeekNudge(base({ fellBehindPending: true, runs: triggering }))
        .show
    ).toBe(false);
  });

  it("suppressed for the rest of a week the user dismissed it in", () => {
    // localWeekKey of 2026-07-12 (Sunday) is 2026-07-12 itself.
    expect(
      evaluateEaseWeekNudge(
        base({ dismissedWeekKey: "2026-07-12", runs: triggering })
      ).show
    ).toBe(false);
    // A different (prior) week's dismissal does not suppress this week.
    expect(
      evaluateEaseWeekNudge(
        base({ dismissedWeekKey: "2026-07-05", runs: triggering })
      ).show
    ).toBe(true);
  });

  it("respects the 14-day cooldown after a showing", () => {
    const justInside = evaluateEaseWeekNudge(
      base({ lastShownAt: "2026-07-05", runs: triggering }) // 7d ago < 14
    );
    expect(justInside.show).toBe(false);

    const pastCooldown = evaluateEaseWeekNudge(
      base({
        lastShownAt: "2026-06-27", // 15d ago >= 14
        runs: triggering,
      })
    );
    expect(pastCooldown.show).toBe(true);
  });

  it("cooldown boundary: exactly COOLDOWN_DAYS ago is allowed", () => {
    // 2026-07-12 minus 14 days = 2026-06-28.
    expect(COOLDOWN_DAYS).toBe(14);
    expect(
      evaluateEaseWeekNudge(
        base({ lastShownAt: "2026-06-28", runs: triggering })
      ).show
    ).toBe(true);
  });
});
