/**
 * "Your week so far" in the reader's unit.
 *
 * `pulse.runs.km` is stored KILOMETRES and printed a literal `km`, so a
 * miles reader saw the metric figure for their own week. Same shape as the
 * Weekly Review's run lane and the Programme Run tab's "This week" line —
 * all three read an already-kilometre aggregate, which is why the
 * metres→km gate never saw any of them.
 *
 * Both units are asserted: a miles-only test passes if the conversion runs
 * twice.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { UserProfile } from "@/lib/auth";

let mockProfile: Partial<UserProfile> | null = null;
const pulse = {
  lifts: null,
  runs: { count: 3, km: 42.195, planned: null },
  streak: null,
};

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "u-1" }, profile: mockProfile }),
  useUid: () => "u-1",
}));
vi.mock("@/hooks/useWeekPulse", () => ({ useWeekPulse: () => pulse }));

import WeekPulseCard from "../WeekPulseCard";

function renderAt(unit: "km" | "mi") {
  mockProfile = { preferredDistanceUnit: unit } as Partial<UserProfile>;
  return render(<WeekPulseCard />);
}

afterEach(() => {
  cleanup();
  mockProfile = null;
});

describe("WeekPulseCard — week distance follows the reader's unit", () => {
  it("prints kilometres for a metric reader", () => {
    renderAt("km");
    expect(screen.getByText(/42\.2 km/)).toBeTruthy();
  });

  it("converts for a miles reader instead of relabelling", () => {
    renderAt("mi");
    expect(screen.getByText(/26\.2 mi/)).toBeTruthy();
    expect(screen.queryByText(/42\.2/)).toBeNull();
    expect(screen.queryByText(/\bkm\b/)).toBeNull();
  });
});
