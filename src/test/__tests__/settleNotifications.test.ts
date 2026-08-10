/**
 * `settleNotifications` — the teardown primitive the reminder suites use
 * to guarantee no reschedule pass outlives the test that started one.
 *
 * Tested directly rather than only through its consumers, for the reason
 * `deferredReads.test.ts` gives: a subtly wrong ordering primitive makes
 * every suite built on it lie in the same direction, and they would all
 * still be green.
 *
 * The specific thing being pinned is the one that distinguishes this
 * from what it replaced. A fixed drain ("await ten microtask turns")
 * cannot fail — it returns after ten turns whether or not anything is
 * still running, so a pass that outlives the guess is invisible and
 * surfaces later, in whichever test happens to run next. The whole value
 * here is that a pass which never stops is REPORTED, against the test
 * that owns it. So the load-bearing case below is the throwing one.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/notifications");

import { scheduleNotification } from "@/lib/notifications";
import {
  resetNotifications,
  settleNotifications,
  scheduledIds,
  deferSchedules,
} from "@/test/notificationsHarness";

const payload = (id: number) => ({
  id,
  title: "t",
  body: "b",
  scheduleAt: new Date(2026, 6, 15, 9, 0, 0),
});

describe("settleNotifications", () => {
  beforeEach(() => {
    resetNotifications();
  });

  it("returns when nothing is running", async () => {
    await expect(settleNotifications()).resolves.toBeUndefined();
  });

  it("waits for an in-flight pass to finish, and its writes land", async () => {
    // A pass of the same shape the hooks run: a sequence of awaited
    // schedule calls, started but not awaited by the caller.
    const pass = (async () => {
      for (const id of [9001, 9002, 9003]) {
        await scheduleNotification(payload(id));
      }
    })();

    await settleNotifications();
    expect(scheduledIds()).toEqual([9001, 9002, 9003]);
    await pass;
  });

  it("releases a deferSchedules gate rather than waiting on it forever", async () => {
    // A gate-parked pass cannot be drained by microtasks at all. Leaving
    // it for the NEXT test's `resetNotifications` to release is exactly
    // the cross-test coupling this exists to remove — so settling has to
    // open the gate itself.
    deferSchedules();
    const pass = (async () => {
      await scheduleNotification(payload(9001));
    })();

    await settleNotifications();
    expect(scheduledIds()).toEqual([9001]);
    await pass;
  });

  /**
   * Run `body` alongside a pass that never stops on its own.
   *
   * The `finally` is not tidiness. Without it, a regression that makes
   * settling resolve leaves this loop running forever and the SUITE
   * HANGS rather than reporting a failure — which is exactly how the
   * mutation check for these two tests presented when the primitive was
   * swapped back for a fixed drain. A test whose failure mode is a
   * timeout tells the next person almost nothing.
   */
  async function withRunawayPass(body: () => Promise<void>): Promise<void> {
    let stop = false;
    const spinning = (async () => {
      while (!stop) await scheduleNotification(payload(9999));
    })();
    try {
      await body();
    } finally {
      stop = true;
      await spinning;
    }
  }

  it("THROWS when a pass never stops, naming what is still running", async () => {
    // The case a fixed drain silently tolerates. Without this assertion
    // the whole primitive could be a no-op and every consumer would
    // still pass.
    await withRunawayPass(async () => {
      await expect(settleNotifications()).rejects.toThrow(/never settled/i);
    });
  });

  it("settles once the runaway pass stops", async () => {
    // The control. Without it the throwing case above is satisfied by an
    // implementation that always throws.
    await withRunawayPass(async () => {
      await expect(settleNotifications()).rejects.toThrow();
    });

    await expect(settleNotifications()).resolves.toBeUndefined();
  });

  afterEach(async () => {
    resetNotifications();
  });
});
