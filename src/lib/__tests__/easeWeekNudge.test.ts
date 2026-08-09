import { describe, it, expect } from "vitest";
import {
  evaluateEaseWeekNudge,
  evaluatePostEaseBounce,
  PACE_WINDOW_DAYS,
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
      trigger: "harder_ratings",
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

  it("shown TODAY still shows (the current showing records its own marker)", () => {
    // The card writes lastShownAt on mount and the parent re-evaluates
    // live; sinceShown === 0 must not suppress or the card would vanish
    // the render after it appears.
    expect(
      evaluateEaseWeekNudge(base({ lastShownAt: TODAY, runs: triggering })).show
    ).toBe(true);
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

/* ── A6: the pace-miss trigger + post-ease bounce ─────────────────── */

describe("A6 — pace-miss trigger", () => {
  const tempo = (
    date: string,
    tone: "on" | "fast" | "slow" | null
  ): EaseWeekNudgeRun => ({
    date,
    relativeEffort: null,
    activityType: "tempo",
    paceVerdictTone: tone,
  });
  const base = (runs: EaseWeekNudgeRun[]): EaseWeekNudgeInput => ({
    isRacePrep: true,
    runs,
    today: TODAY,
    phaseSuppressed: false,
    weekAlreadyEased: false,
    fellBehindPending: false,
    dismissedWeekKey: null,
    lastShownAt: null,
  });

  it("2 slow of the last 3 judged tempo sessions fires the pace trigger", () => {
    const res = evaluateEaseWeekNudge(
      base([
        tempo("2026-07-10", "slow"),
        tempo("2026-07-03", "slow"),
        tempo("2026-06-26", "on"),
      ])
    );
    expect(res).toEqual({
      show: true,
      trigger: "pace_misses",
      slowCount: 2,
      judgedCount: 3,
      windowDays: PACE_WINDOW_DAYS,
    });
  });

  it("on-target and fast verdicts keep it quiet; unjudged runs never count", () => {
    expect(
      evaluateEaseWeekNudge(
        base([
          tempo("2026-07-10", "on"),
          tempo("2026-07-03", "slow"),
          tempo("2026-06-26", "fast"),
        ])
      ).show
    ).toBe(false);
    // Verdicts on non-tempo runs are not an intensity signal.
    expect(
      evaluateEaseWeekNudge(
        base([
          {
            date: "2026-07-10",
            relativeEffort: null,
            activityType: "easy",
            paceVerdictTone: "slow",
          },
          {
            date: "2026-07-03",
            relativeEffort: null,
            activityType: "long",
            paceVerdictTone: "slow",
          },
        ])
      ).show
    ).toBe(false);
  });

  it("only the most recent 3 judged sessions are inspected", () => {
    // Two old slows pushed out of the window by three recent on-targets.
    const res = evaluateEaseWeekNudge(
      base([
        tempo("2026-07-11", "on"),
        tempo("2026-07-08", "on"),
        tempo("2026-07-04", "on"),
        tempo("2026-06-28", "slow"),
        tempo("2026-06-21", "slow"),
      ])
    );
    expect(res.show).toBe(false);
  });

  it("the user-authored harder trigger outranks the measured one", () => {
    const res = evaluateEaseWeekNudge(
      base([
        { ...tempo("2026-07-10", "slow"), relativeEffort: "harder" },
        { ...tempo("2026-07-08", "slow"), relativeEffort: "harder" },
        tempo("2026-07-03", "slow"),
      ])
    );
    expect(res.show && res.trigger).toBe("harder_ratings");
  });

  it("suppressions gate the pace trigger exactly like the effort one", () => {
    const runs = [tempo("2026-07-10", "slow"), tempo("2026-07-03", "slow")];
    expect(
      evaluateEaseWeekNudge({ ...base(runs), phaseSuppressed: true }).show
    ).toBe(false);
    expect(
      evaluateEaseWeekNudge({ ...base(runs), isRacePrep: false }).show
    ).toBe(false);
  });
});

describe("A6 — evaluatePostEaseBounce", () => {
  // TODAY = 2026-07-12 (a Sunday) → current week 2026-07-12, last week
  // 2026-07-05.
  const LAST_WEEK = "2026-07-05";
  const tempoRun = (
    date: string,
    tone: "on" | "fast" | "slow"
  ): EaseWeekNudgeRun => ({
    date,
    relativeEffort: null,
    activityType: "tempo",
    paceVerdictTone: tone,
  });

  it("null without an eased week, or when the eased week wasn't last week", () => {
    expect(
      evaluatePostEaseBounce({ easedWeekKey: null, today: TODAY, runs: [] })
    ).toBeNull();
    expect(
      evaluatePostEaseBounce({
        easedWeekKey: "2026-06-28", // two weeks back — read expired
        today: TODAY,
        runs: [tempoRun("2026-07-12", "on")],
      })
    ).toBeNull();
  });

  it("null until a judged tempo lands in the current week", () => {
    expect(
      evaluatePostEaseBounce({
        easedWeekKey: LAST_WEEK,
        today: TODAY,
        runs: [tempoRun("2026-07-08", "slow")], // last week's run, not this week's
      })
    ).toBeNull();
  });

  it("reads the LATEST judged tempo of the current week", () => {
    // TODAY is the Sunday that STARTS week 2026-07-12.
    expect(
      evaluatePostEaseBounce({
        easedWeekKey: LAST_WEEK,
        today: TODAY,
        runs: [tempoRun("2026-07-12", "on")],
      })
    ).toBe("recovered");
    expect(
      evaluatePostEaseBounce({
        easedWeekKey: LAST_WEEK,
        today: TODAY,
        runs: [tempoRun("2026-07-12", "slow")],
      })
    ).toBe("still_missing");
  });
});
