/**
 * The circuit marker, on both sides (Circ1 (4), (6)). The app writes
 * `format: "circuit"` (`CIRCUIT_FORMAT`) and reads it back through
 * `workoutCircuit`; the server's performance index reads the same field
 * to count a circuit for adherence and leave it out of lift load
 * (`isCircuitWorkout` in `functions/performanceEngine.js`). A spelling
 * changed on one side alone would count every circuit as a lift again,
 * so this asks the RUNNING server module, not a copy (ADR-0008).
 */
import { describe, expect, it } from "vitest";
import Module, { createRequire } from "node:module";
import { builtInCircuit } from "../builtInCircuits";
import { circuitWorkoutFields } from "@/lib/circuitCompletion";

const require = createRequire(import.meta.url);

/* `functions/performanceEngine.js` calls `admin.firestore()` as it loads,
   so requiring it takes the specifier stub `performanceBaselineParity
   .cross.test.ts` uses. The stub covers loading only: `isCircuitWorkout`
   and `aggregateWindow` are pure and touch neither Firestore nor logging. */
type Loader = (this: unknown, request: string, ...rest: unknown[]) => unknown;
const loaderHost = Module as unknown as { _load: Loader };
const realLoad = loaderHost._load;
loaderHost._load = function (request, ...rest) {
  if (request === "./lib/adminSdk") {
    const firestore = () => ({});
    firestore.Timestamp = { fromDate: (d: Date) => d };
    firestore.FieldValue = { serverTimestamp: () => null };
    return { firestore };
  }
  if (request === "firebase-functions/v1" || request === "firebase-functions") {
    return { https: { HttpsError: class extends Error {} }, logger: console };
  }
  return realLoad.call(this, request, ...rest);
};
const serverEngine = require("../../../../functions/performanceEngine.js");
loaderHost._load = realLoad;

const server = serverEngine._internal as {
  isCircuitWorkout: (workout: unknown) => boolean;
  aggregateWindow: (
    start: Date,
    end: Date,
    workouts: unknown[],
    runs: unknown[],
    meals: unknown[],
    bodyweight: unknown[]
  ) => { liftSessions: number; circuitSessions: number };
};

describe("the circuit marker, app and server (Circ1 (4), (6))", () => {
  // The workout the app saves for a circuit, as it is written.
  const saved = {
    ...circuitWorkoutFields({
      uid: "u",
      completionId: "c1",
      startedAt: new Date(2026, 4, 15, 7).getTime(),
      circuit: builtInCircuit({ kit: "minimal", minutes: 20 }),
      outcome: {
        intervalsDone: 20,
        roundsDone: 4,
        workSecondsDone: 800,
        activeSeconds: 1180,
        finished: true,
      },
      bodyweightKg: 70,
    }),
  };

  it("is read as a circuit by the running server module", () => {
    expect(server.isCircuitWorkout(saved)).toBe(true);
    expect(server.isCircuitWorkout({ ...saved, format: undefined })).toBe(
      false
    );
  });

  it("is counted by the server as a circuit, not a lift", () => {
    const day = saved.date as string;
    const start = new Date(`${day}T00:00:00Z`);
    const end = new Date(start.getTime() + 86400000);
    const agg = server.aggregateWindow(start, end, [saved], [], [], []);
    expect(agg).toMatchObject({ circuitSessions: 1, liftSessions: 0 });
  });
});
