/**
 * Badges are the server's (App1 Q33): the streak hook writes no earned
 * badge, and reveals the server's awards from its record — pinned here
 * through the provider and the one Firestore fake (ADR-0009).
 *
 * What the reveal must survive, each its own case: an award landing while
 * the app watches; one earned while the app was closed (offline, another
 * phone), already in the first read; a badge from before the server
 * awarded them (no `earnedBy`), never revealed again; an award older than
 * the window; and a second mount, which must not queue a reveal twice.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
  seedFirestore,
  resetFirestore,
  readDoc,
  writeLog,
} from "@/test/firestoreHarness";
import { doc, setDoc } from "firebase/firestore";
import { pendingBadgeIds } from "../pendingBadgeReveals";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

const h = vi.hoisted(() => ({ uid: "u1" }));
vi.mock("@/lib/auth", () => ({ useUid: () => h.uid }));
vi.mock("@/hooks/useNutritionBadgeData", () => ({
  useNutritionBadgeData: () => ({
    macroTargetsByDay: new Map(),
    waterByDay: new Map(),
    loaded: true,
  }),
}));

import { StreaksProvider, useStreaks } from "../useStreaks";

const streaksPath = (uid: string) => `users/${uid}/streaks/data`;
const DAY_MS = 86_400_000;
/** An award as the server writes it, `agoDays` days ago. */
const serverAward = (id: string, agoDays = 0) => ({
  id,
  earnedAt: new Date(Date.now() - agoDays * DAY_MS).toISOString(),
  earnedBy: { kind: "workout", id: "w1" },
});

function mount() {
  return renderHook(() => useStreaks(), { wrapper: StreaksProvider });
}

async function loaded(view: ReturnType<typeof mount>) {
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Writes to the record's badges or early days, or the public summary. */
const badgeWrites = () =>
  writeLog().filter((w) => {
    const keys = Object.keys((w.data as Record<string, unknown>) ?? {});
    return (
      keys.includes("badges") ||
      keys.includes("earlyLogDays") ||
      keys.includes("badgeSummary")
    );
  });

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
});
afterEach(() => cleanup());

describe("the streak hook awards nothing", () => {
  it("writes no badge for a history that qualifies for several", async () => {
    // A streak certificate past a week, and early days past five: the app
    // used to award week_warrior and early_bird from these on load.
    h.uid = "n1";
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    seedFirestore({
      [streaksPath("n1")]: {
        badges: [],
        currentStreak: 9,
        anchorStreak: 9,
        anchorDate: key,
        lastActiveDate: key,
        longestStreak: 9,
        earlyLogDays: [
          "2026-01-01",
          "2026-01-02",
          "2026-01-03",
          "2026-01-04",
          "2026-01-05",
        ],
      },
    });
    const view = mount();
    await loaded(view);
    // POSITIVE anchor: the hook read the record and counts the rings full.
    expect(view.result.current.badgeProgressCtx.earlyLogDays).toHaveLength(5);
    expect(
      view.result.current.allBadges.find((b) => b.id === "week_warrior")
        ?.earnedAt
    ).toBeNull();
    expect(badgeWrites()).toEqual([]);
    expect(
      (readDoc(streaksPath("n1")) as { badges: unknown[] }).badges
    ).toEqual([]);
  });

  it("offers no way to award one", async () => {
    h.uid = "n2";
    seedFirestore({ [streaksPath("n2")]: { badges: [] } });
    const view = mount();
    await loaded(view);
    expect(Object.keys(view.result.current)).not.toContain("awardEventBadge");
    expect(Object.keys(view.result.current)).not.toContain("awardEventBadges");
    expect(Object.keys(view.result.current)).toContain("newBadge");
  });
});

describe("the reveal comes from the server's record", () => {
  it("reveals an award that lands while the app watches", async () => {
    h.uid = "r1";
    seedFirestore({ [streaksPath("r1")]: { badges: [] } });
    const view = mount();
    await loaded(view);
    expect(view.result.current.newBadge).toBeNull();

    await act(async () => {
      await setDoc(
        doc({} as never, "users", "r1", "streaks", "data"),
        { badges: [serverAward("plate_club")] },
        { merge: true }
      );
    });
    await waitFor(() =>
      expect(view.result.current.newBadge?.id).toBe("plate_club")
    );
    expect(view.result.current.newBadge?.name).toBe("Plate Club");
  });

  it("reveals an award earned while the app was closed, from the first read", async () => {
    // The case the old first-snapshot baseline lost: a run synced from the
    // watch, or a workout on another phone, awarded before this app opened.
    h.uid = "r2";
    seedFirestore({
      [streaksPath("r2")]: { badges: [serverAward("first_5k", 2)] },
    });
    const view = mount();
    await loaded(view);
    expect(view.result.current.newBadge?.id).toBe("first_5k");
  });

  it("does not reveal a badge from before the server awarded them, or one past the window", async () => {
    h.uid = "r3";
    seedFirestore({
      [streaksPath("r3")]: {
        badges: [
          { id: "week_warrior", earnedAt: new Date().toISOString() },
          serverAward("three_day", 20),
          serverAward("first_step", 1),
        ],
      },
    });
    const view = mount();
    await loaded(view);
    // POSITIVE anchor: the one that qualifies is revealed…
    expect(view.result.current.newBadge?.id).toBe("first_step");
    // …and only it is waiting.
    expect([...pendingBadgeIds("r3")]).toEqual(["first_step"]);
  });

  it("reveals each badge once per device: a dismissed one does not come back", async () => {
    h.uid = "r4";
    seedFirestore({
      [streaksPath("r4")]: { badges: [serverAward("first_pr")] },
    });
    const first = mount();
    await loaded(first);
    expect(first.result.current.newBadge?.id).toBe("first_pr");
    act(() => first.result.current.dismissNewBadge());
    await waitFor(() => expect(first.result.current.newBadge).toBeNull());
    first.unmount();

    const second = mount();
    await loaded(second);
    // POSITIVE anchor: the record still holds the badge, earned.
    expect(second.result.current.earnedBadges.map((b) => b.id)).toContain(
      "first_pr"
    );
    expect(second.result.current.newBadge).toBeNull();
  });
});
