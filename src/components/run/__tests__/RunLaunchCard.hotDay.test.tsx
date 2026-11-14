/**
 * The planned run's card on a hot day (Pgm8 (E8), kept with actions): the
 * heat line, with no number, and MET Norway's credit with it; for a tempo
 * or interval session, an easy run of the session's minutes, whose button
 * starts it. Nothing of it on a mild day.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";
import RunLaunchCard from "../RunLaunchCard";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";

vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));
vi.mock("../ShoeSelector", () => ({
  default: () => <div data-testid="shoe" />,
}));

afterEach(() => cleanup());

const tempo = RUN_TEMPLATES.find((t) => t.id === "tempo_30")!;
const easy = RUN_TEMPLATES.find((t) => t.id === "easy_30")!;

function setup(
  overrides: Partial<React.ComponentProps<typeof RunLaunchCard>> = {}
) {
  const onStart = vi.fn();
  const onHeatSwap = vi.fn();
  render(
    <RunLaunchCard
      workout={tempo}
      prefill={{ activityType: "tempo" }}
      strip={null}
      isExtra={false}
      selectedShoeId={null}
      onSelectShoe={vi.fn()}
      onStart={onStart}
      onCustomize={vi.fn()}
      onBack={vi.fn()}
      onHeatSwap={onHeatSwap}
      {...overrides}
    />
  );
  return { onStart, onHeatSwap };
}

describe("RunLaunchCard on a hot day", () => {
  it("says to run by feel, with MET Norway's credit, and offers a tempo as an easy run of its minutes", () => {
    const { onStart, onHeatSwap } = setup({
      hotDay: true,
      heatSwapMinutes: 45,
    });
    const note = screen.getByRole("note", { name: "Hot day" });
    expect(
      within(note).getByText("Hot today: run by feel, not by pace")
    ).toBeInTheDocument();
    expect(
      within(note).getByText("Or run easy for the same 45 min.")
    ).toBeInTheDocument();
    expect(
      within(note).getByText("Weather data from MET Norway")
    ).toBeInTheDocument();
    // The minutes are the only number: no pace, no %.
    expect(note.textContent).not.toMatch(/%|\/km|\/mi|\d:\d\d/);

    fireEvent.click(
      within(note).getByRole("button", { name: "Run easy instead" })
    );
    expect(onHeatSwap).toHaveBeenCalledOnce();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("keeps the session's own Start beside the swap", () => {
    const { onStart, onHeatSwap } = setup({
      hotDay: true,
      heatSwapMinutes: 45,
    });
    fireEvent.click(screen.getByRole("button", { name: /^Start / }));
    expect(onStart).toHaveBeenCalledOnce();
    expect(onHeatSwap).not.toHaveBeenCalled();
  });

  it("offers an easy run no swap, and says only the heat line", () => {
    setup({
      workout: easy,
      prefill: { activityType: "easy", target: { type: "time", value: 1800 } },
      hotDay: true,
      heatSwapMinutes: null,
    });
    const note = screen.getByRole("note", { name: "Hot day" });
    expect(note).toHaveTextContent("Hot today: run by feel, not by pace");
    expect(within(note).queryByRole("button")).toBeNull();
    expect(note).not.toHaveTextContent(/run easy for/i);
  });

  it("says nothing of heat on a mild day", () => {
    setup({ hotDay: false, heatSwapMinutes: 45 });
    expect(screen.queryByRole("note", { name: "Hot day" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Run easy instead" })
    ).toBeNull();
  });
});
