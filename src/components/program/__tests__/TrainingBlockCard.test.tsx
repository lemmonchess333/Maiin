/**
 * TrainingBlockCard — Blk2 behaviour pins.
 *
 * The Blk1 hand-off tests this file used to carry are GONE, and their
 * removal is the point rather than collateral: they pinned an in-sheet
 * "Tune programme?" offer shown AFTER the block was saved, routing to
 * /settings/lift-plan with a `prefillGoal`. Blk2 deletes that whole
 * mechanism — the block IS the programme change, so there is nothing left
 * to hand off to, and the consequence line states the change BEFORE the
 * write instead of asking about it afterwards.
 *
 * What is pinned here is what replaced them, plus the one thing that must
 * NOT have changed: PROGRAM-CIRCLE-01's privacy fence.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ActiveTrainingBlock } from "@/features/program/programTypes";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

const archiveBlockMock = vi.fn(async (_block: unknown) => true);
/** Archive rows the hook reports — set per test for the adoption cases. */
const archiveRows: { current: unknown[] } = { current: [] };
vi.mock("@/features/program/useTrainingBlock", () => ({
  useTrainingBlock: () => ({
    loading: false,
    blocks: archiveRows.current,
    archiveBlock: (block: unknown) => archiveBlockMock(block),
    loadReviewWorkouts: vi.fn(async () => []),
  }),
}));

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import TrainingBlockCard from "../TrainingBlockCard";
import { blockEndDate } from "@/features/program/trainingBlock";

const onStart = vi.fn(async (_input: unknown) => true);
const onRelease = vi.fn(async () => true);
const onKeepFocus = vi.fn(async () => true);
const onAdoptLegacy = vi.fn(async (_legacy: unknown) => true);

function localToday(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function activeBlock(
  over: Partial<ActiveTrainingBlock> = {}
): ActiveTrainingBlock {
  return {
    id: "2026-07-11-1",
    owned: true,
    focus: "strength",
    pace: "full",
    durationWeeks: 12,
    startDate: localToday(),
    goalBefore: "hypertrophy",
    amnestyWeeksLeft: 3,
    weeklyLiftTarget: 4,
    anchorExerciseIds: [],
    why: "",
    createdAt: 1,
    schemaVersion: 1,
    ...over,
  };
}

function renderCard(
  over: Partial<React.ComponentProps<typeof TrainingBlockCard>> = {}
) {
  return render(
    <MemoryRouter>
      <TrainingBlockCard
        uid="u1"
        block={undefined}
        currentFocus="hypertrophy"
        liftDaysPerWeek={4}
        mainCompoundIds={[]}
        trainingWhy=""
        onStart={onStart}
        onAdoptLegacy={onAdoptLegacy}
        onRelease={onRelease}
        onKeepFocus={onKeepFocus}
        {...over}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  archiveRows.current = [];
});

describe("TrainingBlockCard (Blk2) — legacy adoption", () => {
  // Blk2 moved the active block onto programState. A user who had one open
  // when it shipped has an archive row saying status:"active" and no live
  // block, so without adoption this card offers "Start a training block" to
  // someone who already has one running — their block silently vanished.
  const legacyRow = (over: Record<string, unknown> = {}) => ({
    id: "2026-07-06-strength_foundation",
    preset: "strength_foundation",
    title: "Strength Foundation",
    startDate: localToday(),
    durationWeeks: 8,
    weeklyLiftTarget: 3,
    anchorExerciseIds: [],
    why: "",
    status: "active",
    createdAt: 42,
    ...over,
  });

  it("adopts an open legacy block exactly once", async () => {
    archiveRows.current = [legacyRow()];
    renderCard({ block: undefined });
    await waitFor(() => expect(onAdoptLegacy).toHaveBeenCalledTimes(1));
    expect((onAdoptLegacy.mock.calls[0][0] as { id: string }).id).toBe(
      "2026-07-06-strength_foundation"
    );
  });

  it("does not adopt when a live block already exists", async () => {
    archiveRows.current = [legacyRow()];
    renderCard({ block: activeBlock() });
    await waitFor(() => expect(screen.getByText(/Get stronger/)).toBeVisible());
    expect(onAdoptLegacy).not.toHaveBeenCalled();
  });

  it("does not resurrect a legacy block whose window has already elapsed", async () => {
    // An elapsed block is history. Adopting it would re-open something the
    // user finished weeks ago.
    archiveRows.current = [legacyRow({ startDate: "2020-01-06" })];
    renderCard({ block: undefined });
    await waitFor(() =>
      expect(screen.getByText("Start a training block")).toBeVisible()
    );
    expect(onAdoptLegacy).not.toHaveBeenCalled();
  });

  it("does not adopt for a run-only athlete", async () => {
    archiveRows.current = [legacyRow()];
    renderCard({ block: undefined, liftDaysPerWeek: 0 });
    await waitFor(() => expect(onAdoptLegacy).not.toHaveBeenCalled());
  });
});

describe("TrainingBlockCard (Blk2) — the create moment", () => {
  it("opens on the user's CURRENT focus, not a hardcoded default", async () => {
    // The old sheet always reset to "strength_foundation". Harmless when a
    // preset changed nothing; under Blk2 an idle tap would re-prescribe a
    // hypertrophy user's whole week as strength.
    renderCard({ currentFocus: "hypertrophy" });
    fireEvent.click(screen.getByText("Start a training block"));
    await waitFor(() =>
      expect(screen.getByText("Your focus now")).toBeInTheDocument()
    );
    const buildMuscle = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("Build muscle"));
    expect(buildMuscle).toHaveAttribute("aria-pressed", "true");
  });

  it("states the exact prescription change BEFORE the write", async () => {
    // GsPb1's "never a silent programme rewrite", upheld. The user is told
    // what changes while they can still decline it.
    renderCard({ currentFocus: "hypertrophy" });
    fireEvent.click(screen.getByText("Start a training block"));
    fireEvent.click(await screen.findByText("Get stronger"));
    await waitFor(() =>
      expect(
        screen.getByText(/main lifts move to sets of 5-7 for 8 weeks/i)
      ).toBeInTheDocument()
    );
    expect(onStart).not.toHaveBeenCalled();
  });

  it("says plainly that a same-focus block changes nothing", async () => {
    // The habit paces are only honest if "showing up is the whole goal" is
    // literally true, so the copy must not overstate.
    renderCard({ currentFocus: "hypertrophy" });
    fireEvent.click(screen.getByText("Start a training block"));
    expect(
      await screen.findByText(/Nothing about your sessions changes/i)
    ).toBeInTheDocument();
  });

  it("passes focus, pace and duration through to the writer", async () => {
    renderCard({ currentFocus: "hypertrophy" });
    fireEvent.click(screen.getByText("Start a training block"));
    fireEvent.click(await screen.findByText("Get stronger"));
    fireEvent.click(screen.getByText("Training around something?"));
    fireEvent.click(await screen.findByText("Easing back in"));
    fireEvent.click(screen.getByRole("button", { name: "Start block" }));
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
    expect(onStart.mock.calls[0][0]).toMatchObject({
      focus: "strength",
      pace: "easing",
      durationWeeks: 8,
    });
  });

  it("hides pace behind a disclosure — most blocks are just 'full'", async () => {
    renderCard();
    fireEvent.click(screen.getByText("Start a training block"));
    await screen.findByText("Training around something?");
    expect(screen.queryByText("Easing back in")).not.toBeInTheDocument();
  });
});

describe("TrainingBlockCard (Blk2) — who is offered a block", () => {
  it("offers nothing to a run-only athlete", () => {
    // The old card rendered the row and seeded a weekly target of 1 lift
    // onto a plan with no lifts.
    renderCard({ liftDaysPerWeek: 0 });
    expect(
      screen.queryByText("Start a training block")
    ).not.toBeInTheDocument();
  });

  it("offers nothing inside a race taper or race week", () => {
    renderCard({ raceTaperActive: true });
    expect(
      screen.queryByText("Start a training block")
    ).not.toBeInTheDocument();
  });

  it("still shows an ACTIVE block during a taper — only starting is blocked", () => {
    renderCard({ raceTaperActive: true, block: activeBlock() });
    expect(screen.getByText(/Get stronger/)).toBeInTheDocument();
  });
});

describe("TrainingBlockCard (Blk2) — the active block", () => {
  it("labels the row by focus and counts BLOCK weeks", () => {
    renderCard({ block: activeBlock() });
    expect(screen.getByText(/Get stronger/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Week 1 of 12 · Get stronger/ })
    ).toBeInTheDocument();
  });

  it("claims no prescription for an adopted legacy block", () => {
    // `owned: false` means the block never represcribed anything, so the
    // row must not tell the user their lifts are at a focus's rep range.
    renderCard({ block: activeBlock({ owned: false }) });
    expect(screen.queryByText(/Main lifts at/)).not.toBeInTheDocument();
  });

  it("says weights are holding during an easing block's first two weeks", () => {
    renderCard({ block: activeBlock({ pace: "easing" }) });
    expect(screen.getByText(/Weights holding steady/)).toBeInTheDocument();
  });

  it("keeps the Circles hand-off, and leaks only type/title/date", async () => {
    // PROGRAM-CIRCLE-01's privacy fence is unchanged by Blk2 — the focus's
    // prescription, exercises and loads must never travel.
    const block = activeBlock();
    renderCard({ block });
    fireEvent.click(screen.getByText(/Get stronger/));
    fireEvent.click(await screen.findByText("Train together"));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(1));
    const url = navigateMock.mock.calls[0][0] as string;
    expect(url).toContain("circleCreate=strength_block");
    expect(url).toContain(`circleDate=${blockEndDate(block)}`);
    expect(url).not.toContain("pace");
    expect(url).not.toContain("goalBefore");
  });

  it("ending early archives BEFORE releasing the programme", async () => {
    // Archive first: the reverse order loses the record of what was
    // trained if the second write fails.
    renderCard({ block: activeBlock() });
    fireEvent.click(screen.getByText(/Get stronger/));
    fireEvent.click(await screen.findByText("End block early"));
    // `hidden: true` because vaul keeps the drawer mounted through its exit
    // animation in jsdom, so the aria-hidden it puts on outside content
    // outlives the close. The component DOES close the sheet before raising
    // this dialog — without that a screen-reader user genuinely could not
    // reach the confirm button.
    fireEvent.click(
      await screen.findByRole("button", { name: "End block", hidden: true })
    );
    await waitFor(() => expect(onRelease).toHaveBeenCalledTimes(1));
    expect(archiveBlockMock).toHaveBeenCalledTimes(1);
    expect(archiveBlockMock.mock.invocationCallOrder[0]).toBeLessThan(
      onRelease.mock.invocationCallOrder[0]
    );
    expect(archiveBlockMock.mock.calls[0][0]).toMatchObject({
      status: "abandoned",
      endedEarly: true,
      focus: "strength",
      goalBefore: "hypertrophy",
    });
  });
});
