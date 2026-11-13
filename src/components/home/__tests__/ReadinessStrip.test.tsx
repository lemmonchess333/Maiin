import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ReadinessStrip from "../ReadinessStrip";
import { readinessFor, type ReadinessInput } from "@/lib/readiness";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

const quiet: ReadinessInput = {
  feel: null,
  hardRunYesterday: false,
  legDayYesterday: false,
  todayLoadsLegs: false,
  todayHardRun: false,
  body: null,
};

function draw(input: ReadinessInput) {
  const onFeel = vi.fn();
  const onEasier = vi.fn();
  render(
    <ReadinessStrip
      readiness={readinessFor(input)}
      feel={input.feel}
      onFeel={onFeel}
      onEasier={onEasier}
      easierSummary="one set less per lift, lighter loads"
    />
  );
  return { onFeel, onEasier };
}

describe("ReadinessStrip", () => {
  it("asks how you feel when nothing is known, and keeps the answer", () => {
    const { onFeel } = draw(quiet);
    const group = screen.getByRole("group", { name: "How do you feel today?" });
    const answers = within(group)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(answers).toEqual(["Good", "Tired", "Rough"]);
    fireEvent.click(within(group).getByRole("button", { name: "Tired" }));
    expect(onFeel).toHaveBeenCalledWith("tired");
    // No word is claimed before anything is known.
    expect(screen.queryByText(/Ready|Steady|Go easy/)).toBeNull();
  });

  it("says the word and its fact, offers the easier session, and lets the answer change", () => {
    const { onFeel, onEasier } = draw({ ...quiet, feel: "tired" });
    expect(screen.getByText("Steady")).toBeInTheDocument();
    expect(screen.getByText(/You said you’re tired/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Go easier today · one set less per lift, lighter loads",
      })
    );
    expect(onEasier).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(onFeel).toHaveBeenCalledWith(null);
  });

  it("a Ready day offers no easier session", () => {
    draw({ ...quiet, feel: "good" });
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Go easier today/ })).toBeNull();
  });

  it("a fact the app read has no Change: only the person's own word does", () => {
    draw({ ...quiet, hardRunYesterday: true, todayLoadsLegs: true });
    expect(screen.getByText("Steady")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
    expect(
      screen.getByRole("button", { name: /Go easier today/ })
    ).toBeInTheDocument();
  });
});
