/**
 * usePulse (Soc15): today's count of sessions across Tropos, read live from
 * `pulse/{the viewer's local today}`, following the clock past midnight,
 * and null when the day cannot be read.
 *
 * Firestore runs on the one fake (ADR-0009). Every day key is built here
 * from the clock with the Date's own local getters, not with the app's
 * helper, so the test says which day the viewer's is rather than agreeing
 * with whatever the app computes. CI runs it under TZ=Pacific/Kiritimati
 * (UTC+14) and TZ=Pacific/Midway (UTC-11), where the local day and UTC's
 * differ for most of every day.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, renderHook, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => "viewer" }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import { usePulse } from "../usePulse";
import { logger } from "@/lib/logger";
import {
  failNextFirestore,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";
import { restoreRealTimers } from "@/test/fakeTimers";

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
/** The day key of `d` on this machine's wall clock. */
const localKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const utcKey = (d: Date) => d.toISOString().slice(0, 10);

const day = (sessions: number) => ({
  sessions,
  updatedAt: new Date(),
  expiresAt: new Date(Date.now() + 8 * DAY),
});
const today = () => `pulse/${localKey(new Date())}`;

beforeEach(() => {
  resetFirestore();
  vi.mocked(logger.warn).mockClear();
});
afterEach(restoreRealTimers);

describe("usePulse", () => {
  it("reads today's count, and moves with it", async () => {
    seedFirestore({ [today()]: day(12) });
    const { result } = renderHook(() => usePulse());
    await waitFor(() => expect(result.current).toBe(12));
    seedFirestore({ [today()]: day(13) });
    await waitFor(() => expect(result.current).toBe(13));
  });

  it("is 0 on a day nobody has saved a session for, whatever yesterday was", async () => {
    seedFirestore({
      [`pulse/${localKey(new Date(Date.now() - DAY))}`]: day(40),
    });
    const { result } = renderHook(() => usePulse());
    // 0, not null: the day was read and holds nothing.
    await waitFor(() => expect(result.current).toBe(0));
  });

  it("reads the viewer's own local day, not UTC's", async () => {
    const now = new Date();
    // Neighbouring days and UTC's carry other counts; under Kiritimati
    // and Midway UTC's day is one of the neighbours most of the time.
    seedFirestore({
      [`pulse/${utcKey(now)}`]: day(31),
      [`pulse/${localKey(new Date(now.getTime() - DAY))}`]: day(52),
      [`pulse/${localKey(new Date(now.getTime() + DAY))}`]: day(73),
    });
    seedFirestore({ [`pulse/${localKey(now)}`]: day(14) });
    const { result } = renderHook(() => usePulse());
    await waitFor(() => expect(result.current).toBe(14));
  });

  it("moves on to the next day's count past the viewer's midnight", async () => {
    const now = new Date();
    const beforeMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      30
    );
    const afterMidnight = new Date(beforeMidnight.getTime() + 60_000);
    vi.useFakeTimers({ toFake: ["Date"], now: beforeMidnight });
    seedFirestore({
      [`pulse/${localKey(beforeMidnight)}`]: day(25),
      [`pulse/${localKey(afterMidnight)}`]: day(11),
    });
    const { result } = renderHook(() => usePulse());
    await waitFor(() => expect(result.current).toBe(25));
    vi.setSystemTime(afterMidnight);
    // A return to the app checks the day; fired until the hook hears it.
    await waitFor(() => {
      fireEvent(document, new Event("visibilitychange"));
      expect(result.current).toBe(11);
    });
  });

  it("is null when the day cannot be read", async () => {
    seedFirestore({ [today()]: day(40) });
    failNextFirestore("onSnapshot", { path: today(), code: "unavailable" });
    const { result } = renderHook(() => usePulse());
    await waitFor(() =>
      expect(logger.warn).toHaveBeenCalledWith(
        "[pulse] read failed",
        expect.anything()
      )
    );
    expect(unfiredFailures()).toEqual([]);
    expect(result.current).toBeNull();
  });
});
