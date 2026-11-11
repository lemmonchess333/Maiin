import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("workout completion's Node boundary", () => {
  it("lets journeys use plan helpers without initializing the browser Firebase app", () => {
    const moduleUrl = pathToFileURL(
      path.resolve(__dirname, "../workoutCompletion.ts")
    ).href;
    // Vitest supplies import.meta.env, which hides an eager browser import.
    // Journeys import these same helpers in plain Node during collection.
    // Use a fresh process with real imports, no Vite env or Firebase mocks.
    const script = `
      import { getApps } from "firebase/app";
      import {
        markDayDone,
        storeSessionProgression,
        workoutCompletionDayIdentity,
      } from ${JSON.stringify(moduleUrl)};
      const day = {
        dayName: "Push", dayType: "upper", completed: false, skipped: true,
        exercises: [{ instanceId: "bench-original" }],
      };
      const state = { workouts: [day], nextWorkoutOverride: 0 };
      const next = markDayDone(state, 0, "workout-one");
      process.stdout.write(JSON.stringify({
        firebaseApps: getApps().length,
        identity: workoutCompletionDayIdentity(day),
        completed: next.workouts[0].completed,
        skipped: next.workouts[0].skipped,
        workoutId: next.workouts[0].completedWorkoutId,
        hasOverride: "nextWorkoutOverride" in next,
        originalCompleted: day.completed,
        stored: storeSessionProgression({ setLogs: [[{ weight: 50, reps: 8 }]] }),
      }));
    `;
    const output = execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      {
        env: {
          ...process.env,
          TSX_TSCONFIG_PATH: path.resolve(__dirname, "../../../tsconfig.app.json"),
        },
        encoding: "utf8",
        timeout: 10_000,
      }
    );
    expect(JSON.parse(output)).toEqual({
      firebaseApps: 0,
      identity: '["Push","upper",["bench-original"]]',
      completed: true,
      skipped: false,
      workoutId: "workout-one",
      hasOverride: false,
      originalCompleted: false,
      stored: { setLogs: [{ sets: [{ weight: 50, reps: 8 }] }] },
    });
  });
});
