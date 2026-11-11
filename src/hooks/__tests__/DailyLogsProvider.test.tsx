/**
 * The daily logs read reaches back only as far as its widest slice: the
 * earlier of this week's Monday and this month's first day.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { Timestamp } from "firebase/firestore";
import { act, cleanup, renderHook } from "@testing-library/react";
import {
  flushSnapshots,
  resetFirestore,
  seedFirestore,
  readDoc,
} from "@/test/firestoreHarness";
import {
  DailyLogsProvider,
  dailyLogsFrom,
  useDailyLogs,
  useWeeklyDayMap,
} from "../DailyLogsProvider";
import { flushQueue } from "@/lib/offlineQueue";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1" } },
}));
// One object for the session, as AuthProvider holds it: the provider
// subscribes again whenever `user` changes.
const session = vi.hoisted(() => ({ user: { uid: "u1" }, profile: null }));
vi.mock("@/lib/auth", () => ({ useAuth: () => session }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

const log = (date: string, meals: number) => ({
  date,
  workouts: 0,
  meals,
  hasPR: false,
  notes: "",
});
const wrapper = ({ children }: { children: ReactNode }) => (
  <DailyLogsProvider>{children}</DailyLogsProvider>
);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  resetFirestore();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("dailyLogsFrom", () => {
  it("is the month's first day, or the week's Monday when that is earlier", () => {
    expect(dailyLogsFrom("2026-10-15")).toBe("2026-10-01");
    expect(dailyLogsFrom("2026-10-02")).toBe("2026-09-28");
    expect(dailyLogsFrom("2026-10-05")).toBe("2026-10-01");
  });
});

describe("DailyLogsProvider", () => {
  it("keeps a food-day save's createdAt as a timestamp after offline sync", async () => {
    const originalNavigator = navigator;
    localStorage.clear();
    vi.stubGlobal("navigator", { onLine: false });
    try {
      vi.setSystemTime(new Date(2026, 9, 23, 12, 30, 0, 456));
      const { result } = renderHook(() => useDailyLogs(), { wrapper });
      await act(async () => {
        await result.current.saveLog({ date: "2026-10-23", meals: 2 });
      });
      vi.stubGlobal("navigator", { onLine: true });
      await act(async () => {
        await flushQueue({} as Parameters<typeof flushQueue>[0], "u1");
      });
      const saved = readDoc("users/u1/logs/2026-10-23")!;
      expect(saved.meals).toBe(2);
      expect(saved.createdAt).toBeInstanceOf(Timestamp);
      expect((saved.createdAt as Timestamp).toMillis()).toBe(Date.now());
    } finally {
      localStorage.clear();
      vi.stubGlobal("navigator", originalNavigator);
    }
  });

  it("updates an emptied food day without erasing its training, PR, weight or notes", async () => {
    vi.setSystemTime(new Date(2026, 9, 15, 12));
    const date = "2026-10-15";
    seedFirestore({
      [`users/u1/logs/${date}`]: {
        ...log(date, 1),
        workouts: 2,
        hasPR: true,
        weightKg: 80,
        notes: "Felt strong",
      },
    });
    const { result } = renderHook(
      () => ({ daily: useDailyLogs(), week: useWeeklyDayMap() }),
      { wrapper }
    );
    await flushSnapshots();

    await act(async () => {
      await result.current.daily.saveLog({ date, meals: 0 });
    });
    await flushSnapshots();

    expect(readDoc(`users/u1/logs/${date}`)).toMatchObject({
      meals: 0,
      workouts: 2,
      hasPR: true,
      weightKg: 80,
      notes: "Felt strong",
    });
    expect(result.current.week.get(date)?.meals).toBe(0);
  });

  it("reads this month and this week, and nothing older", async () => {
    // Local noon, so no timezone moves the day.
    vi.setSystemTime(new Date(2026, 9, 15, 12));
    seedFirestore({
      "users/u1/logs/2026-09-28": log("2026-09-28", 3),
      "users/u1/logs/2026-10-02": log("2026-10-02", 2),
      "users/u1/logs/2026-10-13": log("2026-10-13", 1),
    });
    const { result } = renderHook(
      () => ({ daily: useDailyLogs(), week: useWeeklyDayMap() }),
      { wrapper }
    );
    await flushSnapshots();
    expect(result.current.daily.logs.map((l) => l.date)).toEqual([
      "2026-10-13",
      "2026-10-02",
    ]);
    expect(result.current.week.get("2026-10-13")?.meals).toBe(1);
  });
});
