/**
 * TrainingBlockCard — Blk1 hand-off behaviour pins.
 *
 *   1. goal-flavoured preset (Muscle Building) → block saves FIRST, then
 *      the in-sheet offer step appears ("Tune programme" / "Keep as is")
 *   2. "Tune programme" navigates to /settings/lift-plan with the
 *      validated route state (prefillGoal + source + blockTitle)
 *   3. habit preset (Consistency Reset) → one-tap create, NO offer step
 *   4. the offer is never a gate: "Keep programme as is" closes with the
 *      block already saved
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { TrainingBlock } from "@/features/program/trainingBlock";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

const createBlockMock = vi.fn();
vi.mock("@/features/program/useTrainingBlock", () => ({
  useTrainingBlock: () => ({
    loading: false,
    blocks: [],
    activeBlock: null,
    createBlock: (...args: unknown[]) => createBlockMock(...args),
    finishBlock: vi.fn(),
    loadReviewWorkouts: vi.fn(async () => []),
  }),
}));

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import TrainingBlockCard from "../TrainingBlockCard";

function makeBlock(preset: TrainingBlock["preset"]): TrainingBlock {
  return {
    id: `2026-07-11-${preset}`,
    preset,
    title:
      preset === "muscle_building" ? "Muscle Building" : "Consistency Reset",
    startDate: "2026-07-11",
    durationWeeks: 12,
    weeklyLiftTarget: 4,
    anchorExerciseIds: [],
    why: "",
    status: "active",
    createdAt: 1,
  };
}

function renderCard() {
  return render(
    <MemoryRouter>
      <TrainingBlockCard
        uid="u1"
        defaultWeeklyLiftTarget={4}
        mainCompoundIds={[]}
        trainingWhy=""
      />
    </MemoryRouter>
  );
}

async function openSheetAndPick(
  preset: "Muscle Building" | "Consistency Reset"
) {
  fireEvent.click(
    await screen.findByRole("button", { name: /start a training block/i })
  );
  fireEvent.click(await screen.findByText(new RegExp(`^${preset}$`)));
  fireEvent.click(screen.getByRole("button", { name: /^start block$/i }));
}

beforeEach(() => {
  navigateMock.mockClear();
  createBlockMock.mockReset();
});

describe("TrainingBlockCard (Blk1)", () => {
  it("goal preset → saves the block, then shows the in-sheet offer", async () => {
    createBlockMock.mockResolvedValue(makeBlock("muscle_building"));
    renderCard();
    await openSheetAndPick("Muscle Building");

    expect(
      await screen.findByText(/tune your programme for this focus/i)
    ).toBeInTheDocument();
    // The save happened BEFORE the offer.
    expect(createBlockMock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: /tune programme/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /keep programme as is/i })
    ).toBeInTheDocument();
  });

  it("Tune programme navigates to the lift-plan editor with the hand-off state", async () => {
    createBlockMock.mockResolvedValue(makeBlock("muscle_building"));
    renderCard();
    await openSheetAndPick("Muscle Building");
    fireEvent.click(
      await screen.findByRole("button", { name: /tune programme/i })
    );
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/settings/lift-plan", {
        state: {
          prefillGoal: "hypertrophy",
          source: "block",
          blockTitle: "Muscle Building",
        },
      })
    );
  });

  it("habit preset → one-tap create, no offer step", async () => {
    createBlockMock.mockResolvedValue(makeBlock("consistency_reset"));
    renderCard();
    await openSheetAndPick("Consistency Reset");
    await waitFor(() => expect(createBlockMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/tune your programme/i)).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("declining the offer closes the sheet without navigating; the block is already saved", async () => {
    createBlockMock.mockResolvedValue(makeBlock("muscle_building"));
    const { baseElement } = renderCard();
    await openSheetAndPick("Muscle Building");
    fireEvent.click(
      await screen.findByRole("button", { name: /keep programme as is/i })
    );
    // The sheet enters its closed state (vaul keeps it mounted through
    // the exit animation in jsdom — assert the state, not the unmount)…
    await waitFor(() =>
      expect(
        baseElement.querySelector('[data-vaul-drawer][data-state="closed"]')
      ).not.toBeNull()
    );
    // …and nothing else happened: no navigation, exactly one save.
    expect(navigateMock).not.toHaveBeenCalled();
    expect(createBlockMock).toHaveBeenCalledTimes(1);
  });
});
