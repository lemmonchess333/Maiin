import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetFirestore,
  readDoc,
  failNextFirestore,
} from "@/test/firestoreHarness";

const h = vi.hoisted(() => ({
  complete: undefined as
    | undefined
    | ((
        index: number,
        data: unknown
      ) => Promise<{
        syncStatus: string;
        sync: Promise<string>;
        share: { post: () => Promise<unknown> };
      }>),
  user: { uid: "routine-user", emailVerified: true },
  compose: vi.fn(),
  routineName: "Bench day",
}));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: {
    get currentUser() {
      return h.user;
    },
  },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: h.user, profile: { weightKg: 80 } }),
}));
vi.mock("@/lib/savedRoutines", () => ({
  getSavedRoutine: async () => ({
    id: "r1",
    name: h.routineName,
    sourceAuthorName: "Athlete",
    exercises: [
      {
        name: "Bench Press",
        exerciseId: "bench-press",
        setCount: 3,
        targetReps: 8,
        targetWeightKg: 50,
      },
      {
        name: "Barbell Row",
        exerciseId: "barbell-row",
        setCount: 3,
        targetReps: 10,
        targetWeightKg: 40,
      },
    ],
  }),
}));
vi.mock("@/components/WorkoutSession", () => ({
  default: (props: { onCompleteDay: typeof h.complete }) => {
    h.complete = props.onCompleteDay;
    return <div>Routine session</div>;
  },
}));
vi.mock("@/lib/shareComposer", () => ({
  compose: h.compose,
  enqueueShare: vi.fn(),
  showQueuedToast: vi.fn(),
}));
import Routine from "../Routine";
import { workoutTitle } from "@/lib/workoutLabels";

const session = {
  completionId: "stable-routine",
  durationMinutes: 25,
  startedAt: new Date("2026-09-06T12:00:00").getTime(),
  exerciseNotes: { 0: " Seat at 4 " },
  // The bench done; the row left out on the day.
  setLogs: [[{ weight: 50, reps: 8, completed: true }], []],
};
async function openRoutine() {
  render(
    <MemoryRouter initialEntries={["/routine/r1"]}>
      <Routes>
        <Route path="/routine/:routineId" element={<Routine />} />
      </Routes>
    </MemoryRouter>
  );
  await waitFor(() => expect(h.complete).toBeTypeOf("function"));
}
beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  vi.clearAllMocks();
  h.complete = undefined;
  h.routineName = "Bench day";
});

describe("routine completion receipt", () => {
  it("titles the saved workout with the routine's whole name, a dash in it too", async () => {
    // History titles a workout up to the first " — " of its notes, and a
    // phone's keyboard makes a typed "--" one.
    h.routineName = "Push — heavy";
    await openRoutine();
    await act(async () => {
      await h.complete!(-1, session);
    });
    const saved = readDoc(
      "users/routine-user/workouts/routine-stable-routine"
    ) as { notes: string };
    expect(workoutTitle(saved)).toBe(
      "Routine: Push – heavy (saved from Athlete)"
    );
  });

  it("preserves the note and offers sharing only when requested after saving", async () => {
    await openRoutine();
    await act(async () => {
      const receipt = await h.complete!(-1, session);
      expect(receipt.syncStatus).toBe("synced");
      expect(h.compose).not.toHaveBeenCalled();
      await receipt.share.post();
      // What was done, not the routine as written: the row was left out.
      expect(h.compose).toHaveBeenCalledWith("routine-user", {
        type: "workout",
        title: "Bench day",
        meta: ["1 exercise", "400 kg volume", "25 min"],
      });
    });
    expect(
      readDoc("users/routine-user/workouts/routine-stable-routine")
    ).toMatchObject({
      date: "2026-09-06",
      source: "routine",
      routineId: "r1",
      exercises: [
        expect.objectContaining({ notes: "Seat at 4", plannedSetCount: 3 }),
        expect.objectContaining({ sets: [], plannedSetCount: 3 }),
      ],
    });
  });

  it("reports an offline rejection to the common completion screen", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    try {
      await openRoutine();
      failNextFirestore("commit");
      await act(async () => {
        const receipt = await h.complete!(-1, session);
        expect(receipt.syncStatus).toBe("queued");
        online.mockReturnValue(true);
        const { flushQueue } = await import("@/lib/offlineQueue");
        await flushQueue(
          {} as Parameters<typeof flushQueue>[0],
          "routine-user"
        );
        await expect(receipt.sync).resolves.toBe("failed");
      });
    } finally {
      online.mockRestore();
    }
  });
});
