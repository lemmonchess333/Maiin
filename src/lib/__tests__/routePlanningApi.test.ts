/**
 * Road-aware route planning client transport (Run11/Mapbox) — the
 * callable payload shapes, the dark-by-default flag, and bounded
 * error copy (no raw provider/client error text reaches the toast).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: unknown[] = [];
vi.mock("firebase/functions", () => ({
  getFunctions: () => ({}),
  httpsCallable: () => async (payload: unknown) => {
    calls.push(payload);
    return {
      data: { points: [{ lat: 1, lon: 2 }], distanceM: 5000, durationS: 1800 },
    };
  },
}));

import {
  alignRouteToRoads,
  generateRouteLoop,
  isRoutePlanningEnabled,
  routePlanningErrorMessage,
} from "@/lib/routePlanningApi";

beforeEach(() => {
  calls.length = 0;
});

describe("routePlanningApi", () => {
  it("is disabled by default (dark until the operator flips the flag)", () => {
    expect(isRoutePlanningEnabled()).toBe(false);
  });

  it("align sends the bounded action payload", async () => {
    const result = await alignRouteToRoads([
      { lat: 51.5, lon: -0.12 },
      { lat: 51.51, lon: -0.13 },
    ]);
    expect(calls[0]).toEqual({
      action: "align",
      waypoints: [
        { lat: 51.5, lon: -0.12 },
        { lat: 51.51, lon: -0.13 },
      ],
    });
    expect(result.distanceM).toBe(5000);
  });

  it("loop sends start + offered distance only", async () => {
    await generateRouteLoop({ lat: 51.5, lon: -0.12 }, 5);
    expect(calls[0]).toEqual({
      action: "loop",
      start: { lat: 51.5, lon: -0.12 },
      targetKm: 5,
    });
  });

  it("maps callable codes to fixed copy — raw error text never surfaces", () => {
    const secret = new Error("token=sk.secret lat=51.5074");
    expect(routePlanningErrorMessage(secret)).toBe(
      "Route planning is unavailable right now."
    );
    expect(
      routePlanningErrorMessage(
        Object.assign(new Error("x"), { code: "functions/not-found" })
      )
    ).toContain("No road route");
    expect(
      routePlanningErrorMessage(
        Object.assign(new Error("x"), { code: "functions/permission-denied" })
      )
    ).toContain("Pro");
    expect(
      routePlanningErrorMessage(
        Object.assign(new Error("x"), {
          code: "functions/resource-exhausted",
        })
      )
    ).toContain("few minutes");
  });
});
