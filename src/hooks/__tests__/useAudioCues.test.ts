/**
 * Split cues say a number out loud and then judge it. Both halves were
 * wrong, and nothing tested either.
 *
 * `checkDistanceCue` was handed `calculatePace(gps.distance, elapsed)` —
 * the CUMULATIVE average — and `splitCue` announced it as "Pace 5:44 per
 * kilometre" alongside "That split was quicker". The announcement was
 * simply the wrong number; the comparison was wrong in a way that got
 * worse the further you ran, because consecutive cumulative averages
 * differ by roughly (split − average) / N. A kilometre a full minute off
 * pace moves the average 12s at km 5 and 6s at km 10 — under the ±10s
 * threshold — so from about halfway the cue told a fading runner "Right on
 * rhythm".
 *
 * The tests drive the hook the way the run loop does: cumulative metres
 * and cumulative seconds, tick by tick. Speech is asserted through a
 * `speechSynthesis` stub, so what is checked is the sentence the runner
 * actually hears.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

/** Sentences passed to speechSynthesis.speak, in order. */
let spoken: string[] = [];

class FakeUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  volume = 1;
  lang = "";
  voice: unknown = null;
  constructor(text: string) {
    this.text = text;
  }
}

beforeEach(() => {
  spoken = [];
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  vi.stubGlobal("speechSynthesis", {
    cancel: vi.fn(),
    speak: (u: { text: string; volume: number }) => {
      // The priming utterance is empty + silent; not a cue.
      if (u.text) spoken.push(u.text);
    },
    getVoices: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  // Unmount BEFORE dropping the stub: the hook's effect cleanup calls
  // `speechSynthesis.removeEventListener`, and RTL's auto-cleanup would
  // otherwise run after the global had been removed.
  cleanup();
  vi.unstubAllGlobals();
});

import { useAudioCues } from "../useAudioCues";

/* The cue hook now speaks in the listener's unit, which resolves from the
   auth profile — and `useAuth` throws outside an AuthProvider, which this
   suite doesn't render. Mocked to metric so every existing assertion about
   kilometre markers and "per kilometre" phrasing still describes what the
   hook is being asked to do; the miles behaviour is pinned in
   runCueCopy.test.ts against the pure copy functions. */
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));


function mountCues(frequency: "every_km" | "every_500m" = "every_km") {
  return renderHook(() => useAudioCues(true, frequency));
}

/** Announce successive kilometres, each taking `seconds` to cover. */
function runKms(
  api: ReturnType<typeof useAudioCues>,
  splitSeconds: number[]
): void {
  let metres = 0;
  let elapsed = 0;
  for (const s of splitSeconds) {
    metres += 1000;
    elapsed += s;
    act(() => {
      api.checkDistanceCue(metres, elapsed);
    });
  }
}

describe("split cues announce the split, not the running average", () => {
  it("speaks each kilometre's own pace", () => {
    /* 5:00 then 6:00. The cumulative average after km 2 is 5:30, which is
       what the cue used to say — a pace the runner ran in neither
       kilometre. */
    const { result } = mountCues();
    runKms(result.current, [300, 360]);

    expect(spoken).toHaveLength(2);
    expect(spoken[0]).toContain("5:00");
    expect(spoken[1]).toContain("6:00");
    expect(spoken[1]).not.toContain("5:30");
  });

  it("still names the distance reached", () => {
    const { result } = mountCues();
    runKms(result.current, [300, 300, 300]);
    expect(spoken[0]).toContain("1 kilometre");
    expect(spoken[2]).toContain("3 kilometres");
  });

  it("calls a slower kilometre slower — deep into a long run", () => {
    /* THE regression. Eight steady kilometres, then one a minute slower.
       On cumulative averages that ninth split moved the number by ~7s,
       under the ±10s threshold, so the runner was told they were on
       rhythm. */
    const { result } = mountCues();
    runKms(result.current, [300, 300, 300, 300, 300, 300, 300, 300, 360]);

    const last = spoken[spoken.length - 1];
    expect(last).toContain("6:00");
    expect(last).toMatch(/slower|Settle back in|rhythm again/i);
    expect(last).not.toMatch(/Right on rhythm|Steady as you like|Locked in/i);
  });

  it("calls a faster kilometre faster, equally late in the run", () => {
    // The mirror case, so "always says slower" cannot pass the test above.
    const { result } = mountCues();
    runKms(result.current, [360, 360, 360, 360, 360, 360, 360, 360, 300]);

    const last = spoken[spoken.length - 1];
    expect(last).toMatch(/[Qq]uicker|building speed/i);
  });

  it("calls an unchanged kilometre steady", () => {
    const { result } = mountCues();
    runKms(result.current, [300, 300, 300]);
    expect(spoken[2]).toMatch(/Right on rhythm|Steady as you like|Locked in/i);
  });

  it("passes no judgement on the very first split", () => {
    // Nothing to compare against; the cue is the distance and pace only.
    const { result } = mountCues();
    runKms(result.current, [300]);
    expect(spoken[0]).toContain("1 kilometre");
    expect(spoken[0]).not.toMatch(/quicker|slower|rhythm|Locked in/i);
  });
});

describe("marker bookkeeping", () => {
  it("announces each marker once, however often it is polled", () => {
    /* The run loop calls this on every GPS tick, several times per second
       — the marker guard is what stops a kilometre being announced
       repeatedly. */
    const { result } = mountCues();
    for (const m of [400, 800, 1000, 1200, 1600, 1900]) {
      act(() => {
        result.current.checkDistanceCue(m, m * 0.3);
      });
    }
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toContain("1 kilometre");
  });

  it("measures a 500m split over 500m, not over a kilometre", () => {
    /* Half-kilometre mode: 500m in 150s IS 5:00/km. Dividing the segment
       time by a hardcoded kilometre would say 2:30. */
    const { result } = mountCues("every_500m");
    act(() => {
      result.current.checkDistanceCue(500, 150);
    });
    expect(spoken[0]).toContain("0.5 kilometres");
    expect(spoken[0]).toContain("5:00");
  });

  it("starts the next run from scratch after reset", () => {
    /* Without clearing the marker distance and elapsed, the first split of
       the next run is measured against the end of the previous one — a
       negative segment, or an hour-long one if the app sat idle. */
    const { result } = mountCues();
    runKms(result.current, [300, 300]);
    act(() => {
      result.current.reset();
    });
    spoken = [];

    runKms(result.current, [360]);
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toContain("1 kilometre");
    expect(spoken[0]).toContain("6:00");
    // First split of a fresh run — no comparison to the old run's splits.
    expect(spoken[0]).not.toMatch(/quicker|slower|rhythm|Locked in/i);
  });

  it("says nothing before the first full marker", () => {
    const { result } = mountCues();
    act(() => {
      result.current.checkDistanceCue(999, 290);
    });
    expect(spoken).toEqual([]);
  });

  it("stays silent when cues are switched off", () => {
    const { result } = renderHook(() => useAudioCues(false, "every_km"));
    act(() => {
      result.current.checkDistanceCue(1000, 300);
    });
    expect(spoken).toEqual([]);
  });
});

/**
 * The distance goal is reached mid-run. The run does NOT stop — 4 of 6
 * reference apps announce and keep recording, 0 auto-finish (Garmin shipped
 * auto-finish on the 310XT and reversed it), and 0 ask mid-stride. So the
 * announcement is the whole of the app's response, and it has to survive
 * three things: firing once, not being buried by the split cue landing in
 * the same instant, and reaching a runner with audio off.
 */
describe("checkGoalReached — announce and continue", () => {
  it("announces the goal with its time, and says the run continues", () => {
    const { result } = mountCues();
    act(() => {
      result.current.checkGoalReached(5000, 5000, 1663);
    });
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toMatch(/^5 kilometres reached\./);
    // Spoken as a duration, not as a time of day: "27:43" is read by TTS
    // as "twenty-seven forty-three".
    expect(spoken[0]).toContain("27 minutes 43");
    // The one thing the runner cannot otherwise know.
    expect(spoken[0]).toMatch(/keep going/i);
  });

  it("returns the goal time, billing back the overshoot", () => {
    /* The goal fires on the first fix at or past the target, so the raw
       elapsed is a sample late. At 5:00/km, 25m of overshoot is 7.5s —
       visible enough to make "5 km goal in 27:50" disagree with a split
       table that says 27:43. */
    const { result } = mountCues();
    let goalTime: number | null = null;
    act(() => {
      goalTime = result.current.checkGoalReached(5025, 5000, 1507.5);
    });
    expect(goalTime).toBeCloseTo(1500, 0);
  });

  it("fires once, however many fixes land past the goal", () => {
    const { result } = mountCues();
    act(() => {
      result.current.checkGoalReached(5000, 5000, 1500);
      result.current.checkGoalReached(5100, 5000, 1530);
      result.current.checkGoalReached(6000, 5000, 1800);
    });
    expect(spoken).toHaveLength(1);
  });

  it("does not fire before the goal", () => {
    const { result } = mountCues();
    act(() => {
      result.current.checkGoalReached(4999, 5000, 1499);
    });
    expect(spoken).toEqual([]);
  });

  it("does nothing when there is no distance goal", () => {
    const { result } = mountCues();
    let goalTime: number | null = null;
    act(() => {
      goalTime = result.current.checkGoalReached(5000, 0, 1500);
    });
    expect(spoken).toEqual([]);
    expect(goalTime).toBeNull();
  });

  it("suppresses the split cue that lands in the same instant", () => {
    /* A 5 km goal coincides exactly with the 5 km split. Without this the
       runner hears "5 kilometres reached…" and then, immediately,
       "5 kilometres. Pace 5:32 per kilometre." — the routine cue burying
       the one that matters. */
    const { result } = mountCues();
    runKms(result.current, [300, 300, 300, 300]); // 4 km banked
    spoken = [];
    act(() => {
      result.current.checkGoalReached(5000, 5000, 1500);
      result.current.checkDistanceCue(5000, 1500);
    });
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toMatch(/reached/);
  });

  it("only suppresses the COINCIDENT split, not the next one", () => {
    /* The guard must not silence the rest of the run. */
    const { result } = mountCues();
    act(() => {
      result.current.checkGoalReached(5000, 5000, 1500);
      result.current.checkDistanceCue(5000, 1500);
      result.current.checkDistanceCue(6000, 1800);
    });
    expect(spoken).toHaveLength(2);
    expect(spoken[1]).toMatch(/^6 kilometres\./);
  });

  it("leaves the next split's PACE honest after a suppression", () => {
    /* Suppressing the 5 km cue must not make the 6 km cue measure its pace
       from the 4 km marker — that would announce a 2 km average as one
       kilometre's split, the exact class of bug this file's header is
       about.

       The paces have to DIFFER for this to test anything. A first version
       ran every kilometre at 5:00 and passed against a mutant that skipped
       the re-basing entirely, because the average of two identical splits
       is that split. So: km 5 at 4:00 and km 6 at 6:00. Re-based, the cue
       says 6:00; measured from the 4 km marker it would say 5:00. */
    const { result } = mountCues();
    runKms(result.current, [300, 300, 300, 300]); // 4 km at t=1200
    spoken = [];
    act(() => {
      result.current.checkGoalReached(5000, 5000, 1440); // km 5 in 4:00
      result.current.checkDistanceCue(5000, 1440);
      result.current.checkDistanceCue(6000, 1800); // km 6 in 6:00
    });
    const split = spoken.find((s) => s.startsWith("6 kilometres."));
    expect(split).toContain("Pace 6:00 per kilometre");
    expect(split).not.toContain("Pace 5:00 per kilometre");
  });

  it("does not suppress a split the goal does not coincide with", () => {
    /* A 5.5 km goal sits between markers, so the 5 km and 6 km cues both
       still belong to the runner. */
    const { result } = mountCues();
    runKms(result.current, [300, 300, 300, 300, 300]); // 5 km banked
    spoken = [];
    act(() => {
      result.current.checkGoalReached(5500, 5500, 1650);
      result.current.checkDistanceCue(6000, 1800);
    });
    expect(spoken).toHaveLength(2);
    expect(spoken[1]).toMatch(/^6 kilometres\./);
  });

  it("still reports the goal when cues are switched off", () => {
    /* Apple's goal cue is tone + haptic with NO speech, so the non-audio
       channel has to be complete on its own. With cues off the hook stays
       silent but must still return the time — that value drives the
       on-screen chip and the saved record, neither of which is an audio
       feature. */
    const { result } = renderHook(() => useAudioCues(false, "every_km"));
    let goalTime: number | null = null;
    act(() => {
      goalTime = result.current.checkGoalReached(5000, 5000, 1500);
    });
    expect(spoken).toEqual([]);
    expect(goalTime).toBeCloseTo(1500, 0);
  });

  it("re-arms on reset, so the next run announces its own goal", () => {
    const { result } = mountCues();
    act(() => {
      result.current.checkGoalReached(5000, 5000, 1500);
    });
    act(() => {
      result.current.reset();
    });
    act(() => {
      result.current.checkGoalReached(5000, 5000, 1500);
    });
    expect(spoken).toHaveLength(2);
  });
});
