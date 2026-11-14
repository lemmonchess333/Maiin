/**
 * What the Lock Screen calls a run in progress (Wid2). The card said
 * "Recording", which the card's being there already says; it names the
 * session the way the setup's Start button did.
 */
import { describe, it, expect } from "vitest";
import { runInProgressName } from "../runPlanMetadata";

/** A long run's race-pace finish, as `racePaceWorkFor` gives one. */
const FINISH = { kind: "finish" as const, blockKm: 5, goalPaceS: 300 };
const noLaunch = { templateId: null, racePace: null };

describe("runInProgressName", () => {
  it("names the session the run was started as", () => {
    expect(
      runInProgressName({
        metadata: { actualTemplateId: "easy_30" },
        launch: { templateId: "easy_30", racePace: null },
        unit: "km",
        typeName: "Easy run",
      })
    ).toBe("Easy 30");
  });

  it("names a long run in the reader's unit, with its race-pace finish", () => {
    const run = {
      metadata: { actualTemplateId: "long_15k" },
      launch: { templateId: "long_15k", racePace: FINISH },
      typeName: "Long run",
    };
    expect(runInProgressName({ ...run, unit: "km" })).toBe(
      "Long 15K with race pace"
    );
    expect(runInProgressName({ ...run, unit: "mi" })).toBe(
      "Long 9.3 mi with race pace"
    );
  });

  it("leaves the race pace off a session the launch card did not offer", () => {
    // Opened from a template link on a day whose plan has a race-pace long
    // run: the pace work is the plan's session's, not this one's.
    expect(
      runInProgressName({
        metadata: { actualTemplateId: "easy_30" },
        launch: { templateId: "long_15k", racePace: FINISH },
        unit: "km",
        typeName: "Easy run",
      })
    ).toBe("Easy 30");
  });

  it("names the type once the run stops being the planned session", () => {
    // Changing the type at the setup clears actualTemplateId
    // (finalisePlanMetadata), and the Start button said "Start tempo run".
    expect(
      runInProgressName({
        metadata: { actualTemplateId: null },
        launch: { templateId: "easy_30", racePace: null },
        unit: "km",
        typeName: "Tempo run",
      })
    ).toBe("Tempo run");
  });

  it("names a free run by its type, and falls back to Run", () => {
    expect(
      runInProgressName({
        metadata: { actualTemplateId: null },
        launch: noLaunch,
        unit: "km",
        typeName: "Free run",
      })
    ).toBe("Free run");
    expect(
      runInProgressName({
        metadata: null,
        launch: noLaunch,
        unit: "km",
        typeName: undefined,
      })
    ).toBe("Run");
    // A template id that is no longer in the library is no session.
    expect(
      runInProgressName({
        metadata: { actualTemplateId: "gone_template" },
        launch: noLaunch,
        unit: "km",
        typeName: "Easy run",
      })
    ).toBe("Easy run");
  });
});
