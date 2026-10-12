/**
 * The setup's Start button names a planned run as its launch card and Home
 * do ("Start Easy 30"). It said the run type's name ("Start Easy Run"), so
 * the same run changed its name between the card and Customise. Once the
 * run stops being the planned session it starts as its type.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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
import type { RunConfig } from "../runConfigDefaults";
import { computePlanMetadata } from "@/lib/runPlanMetadata";

afterEach(cleanup);

function openOnEasy30() {
  render(
    <RunSetupModal
      onStart={vi.fn()}
      onCancel={vi.fn()}
      sessionName="Easy 30"
      savedPreferences={{
        activityType: "easy",
        target: { type: "time", value: 1800 },
      }}
    />
  );
}

describe("RunSetupModal — the Start button's name", () => {
  it("names the planned session as its card does", () => {
    openOnEasy30();
    expect(
      screen.getByRole("button", { name: "Start Easy 30" })
    ).toBeInTheDocument();
  });

  it("names it from the plan's own prefill, as the Run page passes it", () => {
    const { metadata, prefill } = computePlanMetadata({
      displayUnit: "km",
      profileRunMode: "structured",
      todayDayIndex: 3,
      todayDate: "2027-03-03",
      runPlan: undefined,
      runDays: [
        {
          id: "rd-easy",
          weekKey: "2027-03-01",
          date: "2027-03-03",
          dayIndex: 3,
          templateId: "easy_30",
          type: "easy",
          status: "planned",
        },
      ],
      paceTable: null,
      urlTemplateId: null,
      urlType: null,
      urlScheduledRunId: "rd-easy",
      raceTarget: null,
    });
    render(
      <RunSetupModal
        onStart={vi.fn()}
        onCancel={vi.fn()}
        sessionName="Easy 30"
        savedPreferences={{
          autoPause: true,
          audioCues: true,
          ...(prefill as Partial<RunConfig>),
          planMetadata: metadata,
        }}
      />
    );
    expect(
      screen.getByRole("button", { name: "Start Easy 30" })
    ).toBeInTheDocument();
  });

  it("starts as its type once the goal changes", () => {
    openOnEasy30();
    fireEvent.click(screen.getByRole("radio", { name: "Distance" }));
    expect(
      screen.getByRole("button", { name: "Start Easy Run" })
    ).toBeInTheDocument();
  });

  it("is the type's name for a run with no planned session", () => {
    render(<RunSetupModal onStart={vi.fn()} onCancel={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Start Easy Run" })
    ).toBeInTheDocument();
  });
});
