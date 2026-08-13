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
