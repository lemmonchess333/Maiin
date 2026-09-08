/**
 * Who counts as away, and for how long.
 *
 * Both failure modes here are user-facing and opposite: greeting someone
 * who never left is an insult, and greeting a brand-new account with
 * "welcome back" reads as the app not knowing who it is talking to. The run
 * side documents the same two traps.
 *
 * Everything goes through `assessLiftReturn`, the module's only export —
 * testing the contract the app actually calls rather than internals that a
 * refactor could rename without breaking anything real.
 */
import { describe, it, expect } from "vitest";
import { assessLiftReturn, type DatedWorkout } from "../liftLayoff";
import { LAYOFF_GAP_DAYS, LAYOFF_DETRAINED_DAYS } from "../layoffDetection";

/** A session with work in it. */
const trained = (date: string): DatedWorkout => ({
  date,
  exercises: [{ sets: [{}, {}, {}] }],
});

const TODAY = "2026-09-07";
/** `TODAY` minus n days, as a "YYYY-MM-DD" key. */
const daysBefore = (n: number): string => {
  const d = new Date(Date.UTC(2026, 8, 7));
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

describe("assessLiftReturn — no history is not a layoff", () => {
  it("reports nothing for an account that has never logged a session", () => {
    // NOT zero days away: a new account has no history to be away from, and
    // "welcome back" on signup day is the trap this exists to prevent.
    expect(assessLiftReturn([], TODAY)).toEqual({
      daysAway: null,
      layoff: "none",
      dismissKey: null,
    });
  });

  it("treats a history of only-empty documents as no history", () => {
    const opened: DatedWorkout[] = [
      { date: "2026-08-01", exercises: [] },
      { date: "2026-08-02", exercises: [{ sets: [] }] },
      { date: "2026-08-03" },
    ];
    expect(assessLiftReturn(opened, TODAY).daysAway).toBeNull();
    expect(assessLiftReturn(opened, TODAY).layoff).toBe("none");
  });
});

describe("assessLiftReturn — measuring the gap", () => {
  it("measures from the MOST RECENT session, not the array's first", () => {
    const workouts = [
      trained("2026-08-01"),
      trained("2026-09-05"),
      trained("2026-08-20"),
    ];
    expect(assessLiftReturn(workouts, TODAY).daysAway).toBe(2);
  });

  it("ignores an abandoned day more recent than the last real session", () => {
    // The precise way this would go wrong: opening a day yesterday and
    // logging nothing would otherwise mask a three-week absence.
    const workouts: DatedWorkout[] = [
      trained(daysBefore(21)),
      { date: daysBefore(1), exercises: [{ sets: [] }] },
    ];
    const result = assessLiftReturn(workouts, TODAY);
    expect(result.daysAway).toBe(21);
    expect(result.layoff).toBe("detrained");
  });

  it("clamps a future-dated session at zero rather than going negative", () => {
    expect(assessLiftReturn([trained("2026-09-20")], TODAY).daysAway).toBe(0);
  });
});

describe("assessLiftReturn — shares the run side's thresholds", () => {
  it("says nothing about someone who trained recently", () => {
    expect(assessLiftReturn([trained(daysBefore(1))], TODAY).layoff).toBe(
      "none"
    );
  });

  it("is silent right below the gap threshold and speaks at it", () => {
    // The boundary is the policy, so it is pinned on both sides.
    expect(
      assessLiftReturn([trained(daysBefore(LAYOFF_GAP_DAYS - 1))], TODAY).layoff
    ).toBe("none");
    expect(
      assessLiftReturn([trained(daysBefore(LAYOFF_GAP_DAYS))], TODAY).layoff
    ).toBe("gap");
  });

  it("escalates to detrained at the shared 21-day line", () => {
    expect(
      assessLiftReturn([trained(daysBefore(LAYOFF_DETRAINED_DAYS - 1))], TODAY)
        .layoff
    ).toBe("gap");
    expect(
      assessLiftReturn([trained(daysBefore(LAYOFF_DETRAINED_DAYS))], TODAY)
        .layoff
    ).toBe("detrained");
  });
});

describe("assessLiftReturn — the dismissal identity", () => {
  it("identifies the absence by the last real session", () => {
    expect(
      assessLiftReturn([trained("2026-08-17"), trained("2026-08-01")], TODAY)
        .dismissKey
    ).toBe("2026-08-17");
  });

  it("changes once they train again, so a LATER gap asks again", () => {
    // The property that makes a dismissal settle ONE absence rather than
    // silencing the feature for good.
    const first = assessLiftReturn([trained("2026-08-17")], TODAY).dismissKey;
    const later = assessLiftReturn(
      [trained("2026-08-17"), trained("2026-09-06")],
      TODAY
    ).dismissKey;
    expect(later).not.toBe(first);
  });
});
