/**
 * RunReturnSheet: the free runner's welcome back.
 *
 * What a later edit could quietly break:
 *   1. It offers two things. "Start with an easy run" starts one; "Not now"
 *      closes the sheet and starts nothing.
 *   2. It states the gap and nothing else: no missed-run count, no streak,
 *      no loss framing, for the person who has just come back.
 *   3. Each opening reports one answer, paired with the coordinator's
 *      `return_surface_shown` for the `run-return` surface.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RUN_RETURN } from "@/test/journeyScreens";

const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/lifecycleAnalytics", () => ({ track }));
const unlockSpeech = vi.hoisted(() => vi.fn());
vi.mock("@/lib/speechUnlock", () => ({ unlockSpeech }));

import RunReturnSheet from "../RunReturnSheet";

/** A paragraph by its whole text: the sheet sets its numerals in their own
 *  font (`InlineNumerals`), so the words and the figure are separate nodes. */
const paragraph = (text: string | RegExp) =>
  screen.getByText((_, el) => {
    if (el?.tagName !== "P") return false;
    const content = el.textContent ?? "";
    return typeof text === "string" ? content === text : text.test(content);
  });

function setup(daysAway = 24) {
  const onClose = vi.fn();
  const onEasyRun = vi.fn();
  render(
    <RunReturnSheet
      open
      onClose={onClose}
      onEasyRun={onEasyRun}
      daysAway={daysAway}
    />
  );
  return { onClose, onEasyRun };
}

beforeEach(() => {
  track.mockClear();
  unlockSpeech.mockClear();
});

describe("RunReturnSheet — what it offers", () => {
  it("starts the easy run, then closes", async () => {
    const { onClose, onEasyRun } = setup();
    // The E2E journeys find the sheet and its choices by these
    // (src/test/journeyScreens.ts).
    expect(
      screen.getByRole("dialog", { name: RUN_RETURN.sheet })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: RUN_RETURN.easyRun }));
    expect(onEasyRun).toHaveBeenCalledTimes(1);
    // The run starts as the Run page opens, so its voice is unlocked here,
    // inside the tap, as the run card's Start does.
    expect(unlockSpeech).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("return_choice", {
      surface: "run-return",
      choice: "easy_run",
    });
  });

  it("closes on Not now without starting anything", async () => {
    const { onClose, onEasyRun } = setup();
    fireEvent.click(screen.getByRole("button", { name: RUN_RETURN.notNow }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onEasyRun).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("return_choice", {
      surface: "run-return",
      choice: "skip",
    });
  });

  it("offers exactly those two, the run first", () => {
    setup();
    const labels = screen
      .getAllByRole("button")
      .map((b) => b.textContent ?? "")
      .filter((t) => /easy run|not now/i.test(t));
    expect(labels).toEqual(["Start with an easy run", "Not now"]);
  });
});

describe("RunReturnSheet — what it says", () => {
  it("states the gap as a time, not a count", () => {
    setup(24);
    expect(
      paragraph("It's been about 3 weeks since your last run")
    ).toBeInTheDocument();
  });

  it("says months after a long break", () => {
    setup(130);
    expect(
      paragraph("It's been about 4 months since your last run")
    ).toBeInTheDocument();
  });

  it("says what the easy run is before it starts", () => {
    setup();
    expect(
      paragraph(/20 minutes at a pace you could talk at/i)
    ).toBeInTheDocument();
  });

  it("does not count misses, keep score or cheer", () => {
    setup();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/missed|streak|lost|behind|!/i);
  });
});
