import { beforeEach, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAdaptiveEvidence } from "../useAdaptiveEvidence";
import {
  resetFirestore,
  seedFirestore,
  readsAt,
  flushSnapshots,
} from "@/test/firestoreHarness";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
beforeEach(resetFirestore);

it("shares subscriptions, updates corrected/deleted evidence and releases the old account", async () => {
  seedFirestore({
    "users/u1/meals/a": { date: "2026-09-09", totalCalories: 2100 },
    "users/u1/bodyweightLogs/2026-09-10": { date: "2026-09-10", weight: 80 },
  });
  const first = renderHook(({ uid, date }) => useAdaptiveEvidence(uid, date), {
    initialProps: { uid: "u1", date: "2026-09-10" },
  });
  const second = renderHook(() => useAdaptiveEvidence("u1", "2026-09-10"));
  await waitFor(() => expect(first.result.current.loaded).toBe(true));
  expect(first.result.current).toBe(second.result.current);
  expect(
    readsAt("users/u1/meals").filter((read) => read.op === "onSnapshot")
  ).toHaveLength(1);
  await act(async () =>
    seedFirestore({
      "users/u1/meals/a": { date: "2026-09-09", totalCalories: 1500 },
      "users/u1/bodyweightLogs/2026-09-10": { date: "2026-09-10", weight: 79 },
    })
  );
  await flushSnapshots();
  expect(first.result.current.intakeByDay[0].kcal).toBe(1500);
  expect(first.result.current.weighIns[0].weightKg).toBe(79);
  second.unmount();
  first.rerender({ uid: "u2", date: "2026-09-11" });
  await waitFor(() => expect(first.result.current.loaded).toBe(true));
  expect(first.result.current.intakeByDay).toEqual([]);
  expect(first.result.current.weighIns).toEqual([]);
  first.rerender({ uid: "u1", date: "2026-09-11" });
  await waitFor(() => expect(first.result.current.weighIns).toHaveLength(1));
  expect(
    readsAt("users/u1/meals").filter((read) => read.op === "onSnapshot")
  ).toHaveLength(2);
  first.unmount();
});

it("counts intake up to yesterday and weigh-ins up to today", async () => {
  /* Today is not over. Read through today, a lunchtime 1,100 kcal passed the
     800 kcal floor and counted as a whole day: 14 days at 2,400 learned 2,313
     instead of 2,400, and recovered at midnight. The window is 21 days of
     intake, today excluded, and the first day of it still counts. */
  seedFirestore({
    "users/u1/meals/today": { date: "2026-09-22", totalCalories: 1100 },
    "users/u1/meals/yesterday": { date: "2026-09-21", totalCalories: 2400 },
    "users/u1/meals/first": { date: "2026-09-01", totalCalories: 2400 },
    "users/u1/meals/before": { date: "2026-08-31", totalCalories: 2400 },
    "users/u1/bodyweightLogs/2026-09-22": { date: "2026-09-22", weight: 80 },
  });
  const { result } = renderHook(() => useAdaptiveEvidence("u1", "2026-09-22"));
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.intakeByDay.map((d) => d.dateKey).sort()).toEqual([
    "2026-09-01",
    "2026-09-21",
  ]);
  expect(result.current.weighIns.map((w) => w.dateKey)).toEqual(["2026-09-22"]);
});
