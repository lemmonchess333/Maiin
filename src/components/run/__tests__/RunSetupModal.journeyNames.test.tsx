/**
 * A planned run onto the treadmill, by the names the E2E journeys use
 * (`src/test/journeyScreens.ts`, planned-run-treadmill.auth.spec.ts): the
 * run type, the "On a treadmill" switch beside it, its start, then the
 * distance and save on the treadmill screen. A renamed control fails here,
 * in the unit suite, not in a journey.
 *
 * Pgm8: the treadmill is where a run is done, not a run type, so a planned
 * run done on one is still the planned run.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import type { ManualDistanceDraft } from "@/lib/manualDistanceDraft";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { RUN } from "@/test/journeyScreens";

vi.mock("@/lib/weather", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/weather")>()),
  getCurrentWeather: vi.fn(async () => null),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "runner" }, profile: {} }),
}));
vi.mock("@/lib/savedRuns", () => ({
  fetchSavedRuns: vi.fn(async () => []),
}));
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));
vi.mock("@/components/run/ShoeSelector", () => ({ default: () => null }));

import RunSetupModal from "../RunSetupModal";
import TreadmillMode from "../TreadmillMode";
import type { RunConfig } from "../runConfigDefaults";
import {
  computePlanMetadata,
  finalisePlanMetadata,
  getAdherenceLabel,
} from "@/lib/runPlanMetadata";
import type { ScheduledRunDay } from "@/features/program/programTypes";

afterEach(cleanup);

/** Today's planned easy run, as the Run page opens the setup on it from
 *  its card (`?scheduledRunId=`): the plan's prefill and its metadata. */
function plannedEasyRun(): Partial<RunConfig> {
  const day: ScheduledRunDay = {
    id: "rd-easy",
    weekKey: "2027-03-01",
    date: "2027-03-03",
    dayIndex: 3,
    templateId: "easy_30",
    type: "easy",
    status: "planned",
  };
  const { metadata, prefill } = computePlanMetadata({
    displayUnit: "km",
    profileRunMode: "structured",
    todayDayIndex: 3,
    todayDate: "2027-03-03",
    runPlan: undefined,
    runDays: [day],
    paceTable: null,
    urlTemplateId: null,
    urlType: null,
    urlScheduledRunId: "rd-easy",
    raceTarget: null,
  });
  return { ...(prefill as Partial<RunConfig>), planMetadata: metadata };
}

/** The treadmill, chosen as the journey chooses it. */
function chooseTreadmill() {
  fireEvent.click(screen.getByRole("switch", { name: RUN.treadmill }));
}

describe("a planned run on the treadmill (Pgm8)", () => {
  it("is still the planned run: its type stays and the treadmill is where", () => {
    const onStart = vi.fn();
    render(
      <RunSetupModal
        onStart={onStart}
        onCancel={vi.fn()}
        savedPreferences={plannedEasyRun()}
      />
    );
    chooseTreadmill();
    // The setup still names the plan's type.
    expect(
      screen.getByRole("button", { name: RUN.runType("Easy Run") })
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: RUN.startTreadmill, hidden: true })
    );
    const config = onStart.mock.calls[0][0] as RunConfig;
    expect(config).toMatchObject({ activityType: "easy", place: "treadmill" });
    // Settled at Start as Run.tsx's handleStart settles it, by the type:
    // the planned run, with nothing for the summary to ask about.
    const settled = finalisePlanMetadata(
      config.planMetadata,
      config.activityType
    );
    expect(settled).toMatchObject({
      scheduledRunId: "rd-easy",
      actualTemplateId: "easy_30",
      matchedPlanExact: true,
      matchedPlanType: true,
      offPlan: false,
    });
    expect(getAdherenceLabel(settled)).toBe("Planned");
  });
});

describe("a run onto the treadmill, by the journeys' names", () => {
  it("the treadmill is a switch beside the run type, and the start says where", () => {
    const onStart = vi.fn();
    render(<RunSetupModal onStart={onStart} onCancel={vi.fn()} />);
    const treadmill = screen.getByRole("switch", { name: RUN.treadmill });
    expect(treadmill).toHaveAttribute("aria-checked", "false");
    fireEvent.click(treadmill);
    expect(treadmill).toHaveAttribute("aria-checked", "true");
    // The type is untouched: still the setup's Easy Run.
    expect(
      screen.getByRole("button", { name: RUN.runType("Easy Run") })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: RUN.startTreadmill }));
    expect(onStart).toHaveBeenLastCalledWith(
      expect.objectContaining({ activityType: "easy", place: "treadmill" })
    );

    // Off again, the run is outdoors and starts as its type.
    fireEvent.click(treadmill);
    expect(treadmill).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByRole("button", { name: "Start Easy Run" }));
    expect(onStart.mock.lastCall?.[0]).toMatchObject({ activityType: "easy" });
    expect(onStart.mock.lastCall?.[0].place).toBeUndefined();
  });

  it("the types are run types only, and picking one keeps the treadmill", () => {
    const onStart = vi.fn();
    render(<RunSetupModal onStart={onStart} onCancel={vi.fn()} />);
    chooseTreadmill();
    fireEvent.click(
      screen.getByRole("button", { name: RUN.runType("Easy Run") })
    );
    const types = screen.getByRole("dialog", { name: "Choose run type" });
    const long = within(types).getByRole("button", { name: /^Long Run/ });
    // No type is the treadmill any more: it is where any of them is run.
    expect(
      within(types).queryByRole("button", { name: /^Treadmill/ })
    ).toBeNull();
    fireEvent.click(long);
    // In a browser the types slide away and the setup is back; jsdom never
    // ends the slide, so the setup stays out of the accessible tree here
    // and is found with it.
    expect(
      screen.getByRole("switch", { name: RUN.treadmill, hidden: true })
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.click(
      screen.getByRole("button", { name: RUN.startTreadmill, hidden: true })
    );
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ activityType: "long", place: "treadmill" })
    );
  });

  it("the treadmill screen takes the distance and saves", () => {
    const onSave = vi.fn();
    function Entry() {
      const [draft, setDraft] = useState<ManualDistanceDraft | null>(null);
      return (
        <TreadmillMode
          elapsed={36 * 60}
          formatTime={String}
          onSave={onSave}
          onDiscard={vi.fn()}
          distanceDraft={draft}
          onDistanceDraftChange={setDraft}
        />
      );
    }
    render(<Entry />);
    fireEvent.change(screen.getByRole("textbox", { name: RUN.distance }), {
      target: { value: "6" },
    });
    fireEvent.click(screen.getByRole("button", { name: RUN.saveTreadmill }));
    expect(onSave).toHaveBeenCalledWith(6000);
  });
});
