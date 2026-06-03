import { describe, it, expect } from "vitest";
import {
  type SurfaceRegistration,
  initialState,
  pickNext,
  resolve,
  dismissActive,
  beginAppOpen,
  celebrationsToDrop,
} from "../surfaceCoordinator";

// The four real tier-4 surfaces, with their locked priorities (#995):
// Trial 40 > FellBehind 30 > Badge 20 > Priming 10. Badge is a celebration
// suppressed by fell-behind.
function trial(eligible = true): SurfaceRegistration {
  return { id: "trial-expired", priority: 40, eligible };
}
function fellBehind(eligible = true): SurfaceRegistration {
  return { id: "fell-behind", priority: 30, eligible };
}
function badge(eligible = true): SurfaceRegistration {
  return {
    id: "badge",
    priority: 20,
    eligible,
    suppressedBy: ["fell-behind"],
    dropWhenMissed: true,
  };
}
function priming(eligible = true): SurfaceRegistration {
  return { id: "priming", priority: 10, eligible };
}

describe("surfaceCoordinator — pickNext priority", () => {
  it("picks the highest-priority eligible surface", () => {
    expect(pickNext([priming(), fellBehind(), trial()], [])).toBe(
      "trial-expired"
    );
  });

  it("skips ineligible surfaces", () => {
    expect(pickNext([trial(false), fellBehind(), priming()], [])).toBe(
      "fell-behind"
    );
  });

  it("skips already-consumed surfaces", () => {
    expect(
      pickNext([trial(), fellBehind(), priming()], ["trial-expired"])
    ).toBe("fell-behind");
  });

  it("returns null when nothing is eligible", () => {
    expect(
      pickNext([trial(false), fellBehind(false), priming(false)], [])
    ).toBeNull();
  });

  it("returns null for an empty registry", () => {
    expect(pickNext([], [])).toBeNull();
  });
});

describe("surfaceCoordinator — suppression (no celebration-on-reprimand)", () => {
  it("suppresses the badge when fell-behind is eligible, even though badge would otherwise show next", () => {
    // Trial absent; badge (20) outranks priming (10) but fell-behind is up.
    const next = pickNext([fellBehind(), badge(), priming()], []);
    expect(next).toBe("fell-behind");
    // After fell-behind is consumed, the badge is STILL suppressed because
    // fell-behind remains eligible this open.
    expect(pickNext([fellBehind(), badge(), priming()], ["fell-behind"])).toBe(
      "priming"
    );
  });

  it("shows the badge normally when fell-behind is NOT eligible", () => {
    expect(pickNext([fellBehind(false), badge(), priming()], [])).toBe("badge");
  });
});

describe("surfaceCoordinator — per-open budget (≤1 blocking)", () => {
  it("spends the budget on the winner and shows nothing more this open", () => {
    const regs = [trial(), fellBehind(), badge(false), priming()];
    let s = resolve(regs, initialState());
    expect(s.active).toBe("trial-expired");
    expect(s.budgetSpent).toBe(true);

    // Trial dismissed — fell-behind is still eligible, but budget is spent.
    s = dismissActive(s);
    expect(s.active).toBeNull();
    s = resolve(regs, s);
    expect(s.active).toBeNull(); // deferred to next open
  });

  it("does not pick while a surface is already active", () => {
    const regs = [trial(), fellBehind()];
    const s = resolve(regs, initialState());
    const again = resolve(regs, s);
    expect(again).toEqual(s); // unchanged
  });

  it("resets the budget on a new app-open, re-showing a still-eligible decision", () => {
    const regs = [trial(), fellBehind()];
    const open1 = resolve(regs, initialState());
    expect(open1.active).toBe("trial-expired"); // fell-behind deferred
    dismissActive(open1);

    // Next app-open: trial resolved its own gate (no longer eligible), so the
    // deferred fell-behind now wins.
    const open2 = beginAppOpen();
    const s2 = resolve([trial(false), fellBehind()], open2);
    expect(s2.active).toBe("fell-behind");
  });
});

describe("surfaceCoordinator — defer vs drop", () => {
  it("flags an eligible celebration that won't show this open as droppable", () => {
    // Trial wins; badge is eligible but loses and is a celebration.
    const regs = [trial(), badge(), priming()];
    const s = resolve(regs, initialState());
    expect(s.active).toBe("trial-expired");
    expect(celebrationsToDrop(regs, s)).toEqual(["badge"]);
  });

  it("does not flag the active surface for drop", () => {
    const regs = [badge(), priming()];
    const s = resolve(regs, initialState()); // badge wins (no fell-behind)
    expect(s.active).toBe("badge");
    expect(celebrationsToDrop(regs, s)).toEqual([]);
  });

  it("does not flag decisions (no dropWhenMissed) for drop — they defer", () => {
    const regs = [trial(), fellBehind(), priming()];
    const s = resolve(regs, initialState());
    expect(s.active).toBe("trial-expired");
    // fell-behind + priming are decisions → not dropped, they re-register.
    expect(celebrationsToDrop(regs, s)).toEqual([]);
  });

  it("flags a suppressed celebration for drop (badge under fell-behind)", () => {
    const regs = [fellBehind(), badge(), priming()];
    const s = resolve(regs, initialState()); // fell-behind wins
    expect(s.active).toBe("fell-behind");
    // Badge was suppressed, will never show → drop it (don't defer a stale
    // celebration to next session).
    expect(celebrationsToDrop(regs, s)).toContain("badge");
  });
});
