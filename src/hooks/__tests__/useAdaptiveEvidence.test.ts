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
    "users/u1/meals/a": { date: "2026-09-10", totalCalories: 2100 },
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
      "users/u1/meals/a": { date: "2026-09-10", totalCalories: 1500 },
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
