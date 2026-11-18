// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allPaths, readDoc, resetFirestore } from "@/test/firestoreHarness";
import { localDateString } from "@/lib/dateHelpers";

/**
 * Finishing a circuit (Circ1 (11)): saved as a workout through the lift's
 * own save, marked a circuit, with no exercises, no plan moved and the
 * Compendium's calories; nothing under 7 minutes. Driven through the one
 * Firestore fake (ADR-0009).
 */
vi.mock("firebase/firestore");
const h = vi.hoisted(() => ({
  user: { uid: "lifter" } as { uid: string } | null,
}));
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: {
    get currentUser() {
      return h.user;
    },
  },
}));

import {
  CIRCUIT_TOO_SHORT,
  circuitWorkoutFields,
  completeCircuit,
  type FinishedCircuit,
} from "../circuitCompletion";
import { builtInCircuit } from "@/features/circuit/builtInCircuits";
import { workoutCircuit } from "@/features/circuit/savedCircuit";
import { hasQueuedWorkoutCompletion } from "../offlineQueue";

const STARTED = new Date(2026, 4, 12, 7, 30).getTime();
const circuit = builtInCircuit({ kit: "minimal", minutes: 20 });

const finished = (over: Partial<FinishedCircuit> = {}): FinishedCircuit => ({
  uid: "lifter",
  completionId: "c1",
  startedAt: STARTED,
  circuit,
  outcome: {
    intervalsDone: 20,
    roundsDone: 4,
    workSecondsDone: 800,
    activeSeconds: 1180,
    finished: true,
    effort: "hard",
  },
  bodyweightKg: 80,
  author: { displayName: "Sam Lee" },
  ...over,
});

let online: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  h.user = { uid: "lifter" };
  online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => online.mockRestore());

describe("completeCircuit (Circ1 (11))", () => {
  it("saves a workout marked a circuit, with no exercises and no plan moved", async () => {
    const receipt = await completeCircuit(finished());
    expect(receipt).toMatchObject({
      workoutId: "free-c1",
      syncStatus: "synced",
      committed: null,
    });
    const saved = readDoc("users/lifter/workouts/free-c1");
    expect(saved).toMatchObject({
      date: localDateString(new Date(STARTED)),
      format: "circuit",
      exercises: [],
      source: "free",
      completionId: "c1",
      totalVolume: 0,
      notes: "20-minute circuit",
      durationMinutes: 20,
      burnContext: { bodyweightKg: 80 },
    });
    expect(saved).not.toHaveProperty("programmeCompletion");
    expect(workoutCircuit(saved ?? {})).toMatchObject({
      circuitId: circuit.id,
      roundsDone: 4,
      activeSeconds: 1180,
      finished: true,
      effort: "hard",
    });
    // A plan day is never ticked (Circ1 (6)): the save writes the workout
    // and nothing else.
    expect(allPaths()).toEqual(["users/lifter/workouts/free-c1"]);
  });

  it("counts calories from the Compendium's circuit METs, not the 4.5 a zero-tonnage lift gets", () => {
    const kcal = (effort?: "easy" | "right" | "hard") =>
      circuitWorkoutFields(
        finished({ outcome: { ...finished().outcome, effort } })
      ).totalCalories;
    // 1180 s at 80 kg: MET × 80 × 1180 / 3600.
    expect(kcal("easy")).toBe(Math.round((5.0 * 80 * 1180) / 3600));
    expect(kcal("right")).toBe(Math.round((6.0 * 80 * 1180) / 3600));
    expect(kcal(undefined)).toBe(Math.round((6.0 * 80 * 1180) / 3600));
    expect(kcal("hard")).toBe(Math.round((7.5 * 80 * 1180) / 3600));
    expect(kcal("easy")).toBeGreaterThan(Math.round((4.5 * 80 * 1180) / 3600));
  });

  it("writes nothing under 7 minutes of the session clock", async () => {
    await expect(
      completeCircuit(
        finished({
          outcome: { ...finished().outcome, activeSeconds: 419 },
        })
      )
    ).rejects.toThrow(CIRCUIT_TOO_SHORT);
    expect(allPaths()).toEqual([]);
    await completeCircuit(
      finished({ outcome: { ...finished().outcome, activeSeconds: 420 } })
    );
    expect(allPaths()).toEqual(["users/lifter/workouts/free-c1"]);
  });

  it("waits in the offline queue, as a lift does", async () => {
    online.mockReturnValue(false);
    const receipt = await completeCircuit(finished());
    expect(receipt.syncStatus).toBe("queued");
    expect(receipt).not.toHaveProperty("committed");
    expect(hasQueuedWorkoutCompletion("lifter", "free-c1")).toBe(true);
  });

  it("shares the circuit's own post: rounds, interval and moves, no exercise rows", async () => {
    const receipt = await completeCircuit(finished());
    expect(receipt.share.source).toEqual({ kind: "workout", id: "free-c1" });
    const outcome = await receipt.share.post({ visibility: "followers" });
    expect(outcome.status).toBe("posted");
    const path = allPaths().find((p) => p.startsWith("activities/"));
    expect(readDoc(path!)).toMatchObject({
      authorId: "lifter",
      authorName: "Sam Lee",
      type: "workout",
      visibility: "followers",
      workoutName: "20-minute circuit",
      exerciseCount: 5,
      duration: 1180,
      circuit: {
        rounds: 4,
        workSeconds: circuit.workSeconds,
        restSeconds: circuit.restSeconds,
        moves: circuit.moves.map((move) => move.exerciseId),
      },
    });
    expect(readDoc(path!)).not.toHaveProperty("exercises");
  });

  it("refuses to save for another account", async () => {
    h.user = { uid: "someone-else" };
    await expect(completeCircuit(finished())).rejects.toThrow(
      "Sign in again to save your workout."
    );
    expect(allPaths()).toEqual([]);
  });
});
