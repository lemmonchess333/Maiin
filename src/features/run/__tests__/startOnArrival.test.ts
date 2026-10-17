import { describe, expect, it } from "vitest";
import { startOnArrival } from "../startOnArrival";

const ready = {
  planReady: true,
  interruptedRun: false,
  routeToFollow: false,
  firstRunHint: "not-due" as const,
  plannedRun: true,
};

describe("startOnArrival", () => {
  it("starts the planned run the page names", () => {
    expect(startOnArrival(ready)).toBe("planned");
  });

  it("starts a free run when the page names none", () => {
    expect(startOnArrival({ ...ready, plannedRun: false })).toBe("free");
  });

  it("waits for the plan, which names the run", () => {
    expect(startOnArrival({ ...ready, planReady: false })).toBe("wait");
  });

  it("waits while it reads whether this is the first run", () => {
    expect(startOnArrival({ ...ready, firstRunHint: "checking" })).toBe("wait");
  });

  it("shows the run's card on a first run, for its hint", () => {
    expect(startOnArrival({ ...ready, firstRunHint: "due" })).toBe("show");
  });

  it("shows the page, and waits for nothing, when a run was interrupted or a route is to be followed", () => {
    for (const over of [{ interruptedRun: true }, { routeToFollow: true }]) {
      expect(
        startOnArrival({
          ...ready,
          ...over,
          planReady: false,
          firstRunHint: "checking",
        })
      ).toBe("show");
    }
  });
});
