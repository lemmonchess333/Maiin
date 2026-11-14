/**
 * The planned run's card on a hot day (heatAdjustment.ts, the owner's heat
 * adjustment): the heat line naming its rule of thumb, with MET Norway's
 * credit; the offer to adjust the run for heat, which is never applied by
 * itself and is cleared as easily; the work pace as a range once adjusted;
 * a swap beside it; and on an extreme day the advice not to run outside,
 * with Start still there. Nothing of it on a mild day.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";
import { useState } from "react";
import RunLaunchCard from "../RunLaunchCard";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  EXTREME_HEAT_LINE,
  HEAT_SWAP_START,
  heatSwapLine,
} from "@/lib/heatAdjustment";

vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));
vi.mock("../ShoeSelector", () => ({
  default: () => <div data-testid="shoe" />,
}));

afterEach(() => cleanup());

const tempo = RUN_TEMPLATES.find((t) => t.id === "tempo_30")!;
const HOT_LINE =
  "By a common rule of thumb, this heat slows the same effort by 2–3%.";

/** The card as the run page draws it: the offer's state is the page's. */
function HotCard(props: {
  onStart: () => void;
  onSwap: () => void;
  level?: "hot" | "extreme";
}) {
  const [accepted, setAccepted] = useState(false);
  return (
    <RunLaunchCard
      workout={tempo}
      prefill={{ activityType: "tempo", target: { type: "pace", value: 300 } }}
      strip={null}
      isExtra={false}
      selectedShoeId={null}
      onSelectShoe={vi.fn()}
      onStart={props.onStart}
      onCustomize={vi.fn()}
      onBack={vi.fn()}
      heat={{
        level: props.level ?? "hot",
        line: props.level === "extreme" ? EXTREME_HEAT_LINE : HOT_LINE,
        adjust: {
          accepted,
          adjustedLine: "Adjusted for heat: work at 5:06–5:09 /km.",
          onAccept: () => setAccepted(true),
          onClear: () => setAccepted(false),
        },
        swap: {
          line: heatSwapLine(45),
          label: HEAT_SWAP_START,
          onSwap: props.onSwap,
        },
      }}
      paceRange={accepted ? "5:06–5:09 /km" : null}
    />
  );
}

function hotCard(level?: "hot" | "extreme") {
  const onStart = vi.fn();
  const onSwap = vi.fn();
  render(<HotCard onStart={onStart} onSwap={onSwap} level={level} />);
  return {
    onStart,
    onSwap,
    note: screen.getByRole("note", { name: "Hot day" }),
  };
}

describe("RunLaunchCard on a hot day", () => {
  it("says it is hot, by the rule of thumb's range, with MET Norway's credit, and offers the adjustment", () => {
    const { note, onStart } = hotCard();
    expect(within(note).getByText("Hot today")).toBeInTheDocument();
    expect(within(note).getByText(HOT_LINE)).toBeInTheDocument();
    expect(
      within(note).getByText("Weather data from MET Norway")
    ).toBeInTheDocument();
    expect(
      within(note).getByRole("button", { name: "Adjust for heat" })
    ).toBeInTheDocument();
    // Offered, never applied by itself: the card still shows the plan's pace.
    expect(screen.getByText("5:00 /km")).toBeInTheDocument();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("shows the eased work pace as a range once adjusted, and clears back to the plan's", () => {
    const { note } = hotCard();
    fireEvent.click(
      within(note).getByRole("button", { name: "Adjust for heat" })
    );
    expect(
      within(note).getByText("Adjusted for heat: work at 5:06–5:09 /km.")
    ).toBeInTheDocument();
    expect(screen.getByText("5:06–5:09 /km")).toBeInTheDocument();
    expect(screen.queryByText("5:00 /km")).toBeNull();

    fireEvent.click(
      within(note).getByRole("button", { name: "Clear adjustment" })
    );
    expect(screen.getByText("5:00 /km")).toBeInTheDocument();
    expect(
      within(note).getByRole("button", { name: "Adjust for heat" })
    ).toBeInTheDocument();
  });

  it("offers the tempo as an easy run of its minutes, which starts it", () => {
    const { note, onSwap, onStart } = hotCard();
    expect(
      within(note).getByText("Or run easy for the same 45 min.")
    ).toBeInTheDocument();
    fireEvent.click(
      within(note).getByRole("button", { name: "Run easy instead" })
    );
    expect(onSwap).toHaveBeenCalledOnce();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("advises against running outside on an extreme day, and Start still runs it", () => {
    const { note, onStart } = hotCard("extreme");
    expect(within(note).getByText("Too hot to run hard")).toBeInTheDocument();
    expect(within(note).getByText(EXTREME_HEAT_LINE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Start / }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("says nothing of heat on a mild day", () => {
    render(
      <RunLaunchCard
        workout={tempo}
        prefill={{ activityType: "tempo" }}
        strip={null}
        isExtra={false}
        selectedShoeId={null}
        onSelectShoe={vi.fn()}
        onStart={vi.fn()}
        onCustomize={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(screen.queryByRole("note", { name: "Hot day" })).toBeNull();
  });
});
