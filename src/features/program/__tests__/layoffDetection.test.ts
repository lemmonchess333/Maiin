/**
 * The layoff classifier — the fitness input `RacePlanV2Input` never had.
 *
 * Two properties matter here and they fail in opposite directions:
 *
 *   1. It must FIRE for a returning runner. Before Run15 the generator handed
 *      a runner ten weeks off the road a `tempo_40` and a 25 km long run in
 *      their first week back.
 *   2. It must NOT fire for anyone else. A false `detrained` rewrites a
 *      training runner's week down to easy running — so the light-trainer and
 *      brand-new-user cases are pinned as hard as the returner case.
 *
 * The re-entry window is the part that is easy to get wrong and easy to leave
 * untested, because a recency-only classifier PASSES a "does it detect a
 * ten-week layoff?" test and still resumes peak volume after a single easy
 * run. The journey tests below drive time forward rather than asserting on one
 * instant, which is the only shape that can see that.
 */
import { describe, it, expect } from "vitest";

import {
  LAYOFF_DETRAINED_DAYS,
  LAYOFF_GAP_DAYS,
  LAYOFF_REENTRY_DAYS,
  classifyLayoff,
  daysSinceLastRun,
  layoffFromRuns,
  type DatedRun,
} from "../layoffDetection";

/** A run that clears `isVolumeEligible` — 8 km in 45 min. */
const run = (date: string, extra: Partial<DatedRun> = {}): DatedRun => ({
  date,
  distance: 8000,
  duration: 2700,
  ...extra,
});

function addDays(key: string, n: number): string {
  // Date-only fixture arithmetic: keep both parsing and formatting in UTC.
  // Mixing local midnight with toISOString made +1 day repeat the SAME
  // date in positive-offset timezones, so the journey never advanced.
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Runs every `every` days, `count` of them, ending on `lastDate`. */
function consistent(lastDate: string, count: number, every = 3): DatedRun[] {
  return Array.from({ length: count }, (_, i) =>
    run(addDays(lastDate, -(count - 1 - i) * every))
  );
}

describe("daysSinceLastRun", () => {
  it("is null when they have never logged an eligible run", () => {
    // NOT zero and NOT infinity — a new user has not lapsed, they have not
    // started. Returning a number here would classify every first-time
    // race-prep user on the day they created their goal.
    expect(daysSinceLastRun([], "2026-08-04")).toBeNull();
    expect(daysSinceLastRun([{ date: undefined }], "2026-08-04")).toBeNull();
  });

  it("measures from the most recent run, whatever order they arrive in", () => {
    const runs = [run("2026-07-01"), run("2026-07-30"), run("2026-07-15")];
    expect(daysSinceLastRun(runs, "2026-08-04")).toBe(5);
  });

  it("ignores runs that do not count toward volume anywhere else", () => {
    // Routed through the shared `isVolumeEligible` on purpose: a run excluded
    // from weekly km must not read as "still training" here. A private
    // predicate in this module is exactly the mirror drift CLAUDE.md warns
    // about.
    const ineligible: DatedRun[] = [
      run("2026-08-03", { isInvalid: true }),
      run("2026-08-03", { savedAnyway: true }),
      run("2026-08-03", { distance: 20 }), // under the 50 m floor
      run("2026-08-03", { duration: 5 }), // under the 30 s floor
    ];
    for (const bad of ineligible) {
      expect(daysSinceLastRun([bad, run("2026-07-01")], "2026-08-04")).toBe(34);
    }
    // …and the same shape WITH a valid run proves the fixtures aren't just
    // being dropped for some unrelated reason.
    expect(daysSinceLastRun([run("2026-08-03")], "2026-08-04")).toBe(1);
  });

  it("clamps a future-dated run to zero rather than reporting negative days", () => {
    // Clock skew or a back-filled manual entry. Not a layoff either way.
    expect(daysSinceLastRun([run("2026-08-20")], "2026-08-04")).toBe(0);
  });
});

describe("classifyLayoff boundaries", () => {
  it("null is none — never run is not lapsed", () => {
    expect(classifyLayoff(null)).toBe("none");
  });

  it("crosses into gap at exactly LAYOFF_GAP_DAYS", () => {
    expect(classifyLayoff(LAYOFF_GAP_DAYS - 1)).toBe("none");
    expect(classifyLayoff(LAYOFF_GAP_DAYS)).toBe("gap");
  });

  it("crosses into detrained at exactly LAYOFF_DETRAINED_DAYS", () => {
    expect(classifyLayoff(LAYOFF_DETRAINED_DAYS - 1)).toBe("gap");
    expect(classifyLayoff(LAYOFF_DETRAINED_DAYS)).toBe("detrained");
  });
});

describe("the re-entry window keeps a returner returning", () => {
  it("advances the journey's calendar fixtures across month and DST boundaries", () => {
    expect(addDays("2026-08-10", 1)).toBe("2026-08-11");
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
  });

  it("a single run back does not clear a ten-week layoff", () => {
    // THE DEFECT THIS PINS. Days-since-last-run is zero the moment they run,
    // so a recency-only classifier flipped to `none` on their first easy
    // session — and the next regeneration handed back the full-volume week.
    const history = [...consistent("2026-05-23", 12), run("2026-08-10")];
    expect(layoffFromRuns(history, "2026-08-10")).toBe("detrained");
    expect(layoffFromRuns(history, "2026-08-12")).toBe("detrained");
  });

  it("holds for the whole window, then releases", () => {
    // Drives the real journey: back on 2026-08-10, running every 2 days.
    const history = [...consistent("2026-05-23", 12)];
    let today = "2026-08-10";
    const seen: Record<number, string> = {};
    for (let day = 0; day <= 30; day++) {
      if (day % 2 === 0) history.push(run(today));
      seen[day] = layoffFromRuns(history, today);
      today = addDays(today, 1);
    }
    // Inside the window, every single day.
    for (let d = 0; d <= LAYOFF_REENTRY_DAYS; d++) {
      expect(seen[d], `day ${d} back`).toBe("detrained");
    }
    // And out the far side — the policy expires, it does not persist.
    expect(seen[LAYOFF_REENTRY_DAYS + 1]).toBe("none");
    expect(seen[30]).toBe("none");
  });

  it("a returner who stops again is still detrained", () => {
    // One run back then silence. Both mechanisms should agree; the point is
    // that neither lets them out.
    const history = [run("2026-05-20"), run("2026-08-10")];
    expect(layoffFromRuns(history, addDays("2026-08-10", 10))).toBe(
      "detrained"
    );
    expect(layoffFromRuns(history, addDays("2026-08-10", 40))).toBe(
      "detrained"
    );
  });
});

describe("the window does not misfire on anyone else", () => {
  it("a consistent light trainer is never detrained", () => {
    // 1×/week for five months. CLAUDE.md makes this segment first-class, and
    // a volume-density classifier would have caught them — which is why this
    // keys on GAPS rather than on how much they run.
    for (const every of [7, 5, 3]) {
      const history = consistent("2026-08-01", 20, every);
      expect(layoffFromRuns(history, "2026-08-04"), `${every}d cadence`).toBe(
        "none"
      );
    }
  });

  it("a brand-new user's first ever run is not a comeback", () => {
    // No preceding run means no gap to have returned from. The window needs a
    // PAIR, which is the same call `null` makes in `daysSinceLastRun`.
    expect(layoffFromRuns([run("2026-08-02")], "2026-08-04")).toBe("none");
    expect(layoffFromRuns([], "2026-08-04")).toBe("none");
  });

  it("a missed fortnight is a gap, not a layoff", () => {
    // The existing fell-behind realign is the right answer here; a re-entry
    // plan is not. Pinning the boundary in both directions.
    const history = consistent("2026-06-28", 10);
    expect(layoffFromRuns(history, addDays("2026-06-28", 12))).toBe("gap");
    expect(layoffFromRuns(history, addDays("2026-06-28", 25))).toBe(
      "detrained"
    );
  });

  it("an old healed layoff stays healed", () => {
    // Gap in the spring, trained solidly since. The window must look at how
    // recently they came BACK, not at whether a gap exists anywhere in the
    // history — otherwise one bad month marks a runner forever.
    const history = [
      run("2026-01-10"),
      ...consistent("2026-08-01", 30), // resumed 2026-05-25, months ago
    ];
    expect(layoffFromRuns(history, "2026-08-04")).toBe("none");
  });
});
