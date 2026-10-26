// @vitest-environment jsdom
/**
 * The run return's read: what Home asks for, and when it may answer.
 *
 * The rule is `runReturn.test.ts`'s. What this pins is the read around it,
 * against the one Firestore fake (ADR-0009):
 *   - a lift-only plan reads no runs at all;
 *   - a runner's last run is read through the saved-run reader, the same
 *     window the race plan's re-entry reads;
 *   - nothing is offered from a cached answer, which can be missing the run
 *     someone logged on another phone.
 *
 * Every run is dated from the clock, so the suite holds on any day CI runs
 * it, the +90-day run included.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import {
  flushSnapshots,
  readLog,
  resetFirestore,
  seedFirestore,
  setSnapshotMetadata,
} from "@/test/firestoreHarness";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";
import type { UserProfile } from "@/lib/auth";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1" } },
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "u1" }));

import { useRunReturn } from "../useRunReturn";

const RUNS = "users/u1/runs";

/** A day n days before today, and a saved run on it as RunSummary writes
 *  one: dated, completed, and past the distance and duration floors. */
function dayBefore(n: number): string {
  return localDateString(addLocalDays(new Date(), -n));
}
function seedRunDaysAgo(id: string, n: number) {
  const day = addLocalDays(new Date(), -n);
  day.setHours(8, 0, 0, 0);
  seedFirestore({
    [`${RUNS}/${id}`]: {
      completedAt: Timestamp.fromDate(day),
      date: localDateString(day),
      distance: 5000,
      duration: 1800,
      activityType: "easy",
    },
  });
}

const runner = { athleteType: "Runner", runMode: "freeform" } as UserProfile;
const lifter = {
  athleteType: "Lifter",
  runMode: "freeform",
  weekSchedule: [{ day: 1, type: "lift" }],
} as UserProfile;

function render(profile: UserProfile, programLoading = false) {
  return renderHook(() =>
    useRunReturn({
      profile,
      programState: null,
      programLoading,
      todayKey: localDateString(new Date()),
    })
  );
}

const runReads = () =>
  readLog().filter((r) => r.op === "onSnapshot" && r.path === RUNS).length;

describe("useRunReturn", () => {
  beforeEach(() => resetFirestore());

  it("offers a free runner the easy run, keyed on their last run", async () => {
    seedRunDaysAgo("old", 40);
    seedRunDaysAgo("last", 16);
    const { result } = render(runner);
    await waitFor(() => expect(result.current.offer).toBe("easy-run"));
    expect(result.current.daysAway).toBe(16);
    expect(result.current.dismissKey).toBe(dayBefore(16));
  });

  it("offers nothing to someone who ran this week", async () => {
    seedRunDaysAgo("last", 3);
    const { result } = render(runner);
    // Anchored on the read landing: the days away are known before the
    // absence of an offer means anything.
    await waitFor(() => expect(result.current.daysAway).toBe(3));
    expect(result.current.offer).toBeNull();
  });

  it("reads no runs for a lift-only plan", async () => {
    seedRunDaysAgo("last", 40);
    const { result, rerender } = render(lifter);
    rerender();
    expect(runReads()).toBe(0);
    expect(result.current.offer).toBeNull();

    // The positive control: the same store, read for a runner, is read.
    render(runner);
    await waitFor(() => expect(runReads()).toBe(1));
  });

  it("waits for the server before greeting anyone", async () => {
    seedRunDaysAgo("last", 30);
    setSnapshotMetadata(RUNS, { fromCache: true });
    const { result } = render(runner);
    await waitFor(() => expect(runReads()).toBe(1));
    await flushSnapshots();
    expect(result.current.offer).toBeNull();
    expect(result.current.daysAway).toBeNull();

    // The server's answer, the same runs confirmed: now it greets. Without
    // this the silence above would also pass for a read that never landed.
    setSnapshotMetadata(RUNS, { fromCache: false });
    seedRunDaysAgo("older", 45);
    await waitFor(() => expect(result.current.offer).toBe("easy-run"));
  });

  it("waits for the programme, which can say the race is over", async () => {
    seedRunDaysAgo("last", 30);
    const { result, rerender } = renderHook(
      ({ loading }) =>
        useRunReturn({
          profile: runner,
          programState: null,
          programLoading: loading,
          todayKey: localDateString(new Date()),
        }),
      { initialProps: { loading: true } }
    );
    await waitFor(() => expect(runReads()).toBe(1));
    expect(result.current.offer).toBeNull();
    rerender({ loading: false });
    await waitFor(() => expect(result.current.offer).toBe("easy-run"));
  });
});
