import { describe, expect, it } from "vitest";
import { startOnArrival, withStartOnArrival } from "../startOnArrival";

describe("withStartOnArrival", () => {
  it("adds the start after the run's own query, or as the first one", () => {
    expect(
      withStartOnArrival("/run?template=easy_30&scheduledRunId=runday_1")
    ).toBe("/run?template=easy_30&scheduledRunId=runday_1&start=1");
    expect(withStartOnArrival("/run")).toBe("/run?start=1");
  });
});

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

  it("on a hot day, shows the run's card, whose heat offer is a choice to make", () => {
    expect(startOnArrival({ ...ready, heat: "show" })).toBe("show");
    expect(startOnArrival({ ...ready, plannedRun: false, heat: "show" })).toBe(
      "show"
    );
  });

  it("waits a moment for the weather before starting", () => {
    expect(startOnArrival({ ...ready, heat: "checking" })).toBe("wait");
  });

  it("starts the run when the weather has nothing to put first", () => {
    expect(startOnArrival({ ...ready, heat: "none" })).toBe("planned");
    expect(startOnArrival({ ...ready, plannedRun: false, heat: "none" })).toBe(
      "free"
    );
  });

  it("lets the first-run hint and an interrupted run come before the weather", () => {
    expect(
      startOnArrival({ ...ready, firstRunHint: "checking", heat: "show" })
    ).toBe("wait");
    expect(
      startOnArrival({ ...ready, interruptedRun: true, heat: "checking" })
    ).toBe("show");
  });
});
