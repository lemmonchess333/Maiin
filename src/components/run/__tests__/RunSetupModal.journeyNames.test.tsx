/**
 * A planned run onto the treadmill, by the names the E2E journeys use
 * (`src/test/journeyScreens.ts`, planned-run-treadmill.auth.spec.ts): the
 * run type, the treadmill among the types, its start, then the distance
 * and save on the treadmill screen. A renamed control fails here, in the
 * unit suite, not in a journey.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
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

afterEach(cleanup);

describe("a run onto the treadmill, by the journeys' names", () => {
  it("the run type opens the types, and the treadmill starts as itself", () => {
    const onStart = vi.fn();
    render(<RunSetupModal onStart={onStart} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: RUN.runType }));
    const types = screen.getByRole("dialog", { name: "Choose run type" });
    fireEvent.click(within(types).getByRole("button", { name: RUN.treadmill }));
    // In a browser the types slide away and the setup is back; jsdom never
    // ends the slide, so the setup's Start stays out of the accessible
    // tree here and is found with it.
    fireEvent.click(
      screen.getByRole("button", { name: RUN.startTreadmill, hidden: true })
    );
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ activityType: "treadmill" })
    );
  });

  it("the treadmill screen takes the distance and saves", () => {
    const onSave = vi.fn();
    render(
      <TreadmillMode
        elapsed={36 * 60}
        formatTime={String}
        onSave={onSave}
        onDiscard={vi.fn()}
      />
    );
    fireEvent.change(screen.getByRole("spinbutton", { name: RUN.distance }), {
      target: { value: "6" },
    });
    fireEvent.click(screen.getByRole("button", { name: RUN.saveTreadmill }));
    expect(onSave).toHaveBeenCalledWith(6000);
  });
});
