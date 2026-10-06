import { describe, it, expect } from "vitest";
import { suggestedRestSeconds } from "../restTime";

describe("suggestedRestSeconds — rest by role and reps (Lift4 (5))", () => {
  it("rests a heavy main lift 3 minutes and other main lifts 2½", () => {
    expect(suggestedRestSeconds({ exerciseId: "bench-press", reps: 5 })).toBe(
      180
    );
    expect(suggestedRestSeconds({ exerciseId: "bench-press", reps: 8 })).toBe(
      150
    );
  });

  it("rests another compound 2 minutes and an isolation 75 seconds", () => {
    expect(
      suggestedRestSeconds({
        exerciseId: "romanian-deadlift",
        reps: 10,
        isAccessory: true,
      })
    ).toBe(120);
    // An isolation in a main slot is still an isolation.
    expect(suggestedRestSeconds({ exerciseId: "lateral-raise", reps: 5 })).toBe(
      75
    );
  });

  it("rests less in a plan built for 30-minute sessions", () => {
    const short = (ex: Parameters<typeof suggestedRestSeconds>[0]) =>
      suggestedRestSeconds(ex, 30);
    expect(short({ exerciseId: "bench-press", reps: 5 })).toBe(120);
    expect(short({ exerciseId: "bench-press", reps: 8 })).toBe(90);
    expect(
      short({ exerciseId: "romanian-deadlift", reps: 10, isAccessory: true })
    ).toBe(90);
    expect(short({ exerciseId: "lateral-raise", reps: 12 })).toBe(60);
    // 45 minutes and up keep the full rests
    expect(
      suggestedRestSeconds({ exerciseId: "bench-press", reps: 5 }, 45)
    ).toBe(180);
  });

  it("keeps a rest an older plan's template wrote", () => {
    expect(
      suggestedRestSeconds({
        exerciseId: "bench-press",
        reps: 5,
        restSeconds: 90,
      })
    ).toBe(90);
  });
});
