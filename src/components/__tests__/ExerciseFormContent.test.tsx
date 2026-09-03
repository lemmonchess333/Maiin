/**
 * ExerciseFormContent — the Form tab's reading surface.
 *
 * The 2026-09-03 placard layout (owner-directed, from a screenshot of
 * this very screen): the animation plays in the ordinary player with a
 * single label under it, and the STEPS are the numbered list below,
 * where they belong. Two things follow, and both are pinned here:
 *
 *   1. A placard's own positions ARE its instructions. They match the
 *      label under the figure word for word, so a reader can follow the
 *      animation down the list. Rendering them AND the catalogue's
 *      prose steps would be two numbered lists describing one movement.
 *   2. The active row lights up as the player reaches it — the "words
 *      appear in time" idea without its cost, since the whole list
 *      stays readable at the reader's own pace.
 *
 * The demo whose beats these are is not mounted here; the player is a
 * stub with a button that reports a step, because what is under test is
 * the LIST, not the animation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

const beatsRef = {
  current: null as { t: number; label: string; cue: string }[] | null,
};
vi.mock("@/lib/bodyRig", () => ({
  getBodyDemo: () => ({ view: "side", tint: {}, concentricTo: 0 }),
  getFormBeats: () => beatsRef.current,
}));

vi.mock("@/lib/exerciseDemo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/exerciseDemo")>()),
  getExerciseDemo: async () => ({
    name: "Dips",
    category: "Chest",
    equipment: "Bodyweight",
    primaryMuscles: ["Pectorals"],
    secondaryMuscles: ["Triceps"],
    images: [],
    instructions: ["Catalogue step one.", "Catalogue step two."],
    tip: "Watch the shoulders.",
    mediaKind: "reference-photos" as const,
  }),
}));

/** A stand-in player: one button per position, reporting it upward. */
let reportStep: ((i: number) => void) | undefined;
vi.mock("@/components/ExerciseRigDemo", () => ({
  default: ({ onStep }: { onStep?: (i: number) => void }) => {
    reportStep = onStep;
    return <div data-testid="player" />;
  },
}));

vi.mock("@/lib/exercises", () => ({
  EXERCISES: [{ id: "dips", name: "Dips" }],
}));

import ExerciseFormContent from "../ExerciseFormContent";

const BEATS = [
  { t: 0, label: "Top position", cue: "Arms locked, chest tall." },
  { t: 0.5, label: "Mid descent", cue: "Elbows travel back." },
  { t: 1, label: "Bottom position", cue: "Upper arms parallel." },
];

beforeEach(() => {
  beatsRef.current = null;
  reportStep = undefined;
});

describe("ExerciseFormContent — the instruction list", () => {
  it("a placard's positions replace the catalogue's prose steps", async () => {
    beatsRef.current = BEATS;
    render(<ExerciseFormContent exerciseName="Dips" />);
    for (const b of BEATS) {
      expect(await screen.findByText(b.cue)).toBeInTheDocument();
    }
    // Not both lists: the catalogue prose is gone from the numbered
    // steps (its tip still renders below, which is a different block).
    expect(screen.queryByText("Catalogue step one.")).toBeNull();
    // And the whole sequence is open — nothing to expand, because six
    // short positions are not a wall of text.
    expect(screen.queryByRole("button", { name: /all \d+ steps/i })).toBeNull();
    expect(screen.getByText("Watch the shoulders.")).toBeInTheDocument();
  });

  it("lights the row the player is on, and only that row", async () => {
    beatsRef.current = BEATS;
    render(<ExerciseFormContent exerciseName="Dips" />);
    const row = async (cue: string) => (await screen.findByText(cue)).className;

    // Opens on the first position.
    expect(await row(BEATS[0].cue)).toContain("text-foreground ");
    expect(await row(BEATS[1].cue)).toContain("text-foreground/80");

    await waitFor(() => expect(reportStep).toBeDefined());
    act(() => reportStep!(1));

    expect(await row(BEATS[0].cue)).toContain("text-foreground/80");
    expect(await row(BEATS[1].cue)).toContain("text-foreground ");
    expect(await row(BEATS[2].cue)).toContain("text-foreground/80");
  });

  it("an ordinary demo keeps the collapsed catalogue list", async () => {
    // The regression to watch: everything without beats must read
    // exactly as it did before the placard existed.
    beatsRef.current = null;
    render(<ExerciseFormContent exerciseName="Dips" />);
    expect(await screen.findByText("Catalogue step one.")).toBeInTheDocument();
    expect(screen.queryByText("Arms locked, chest tall.")).toBeNull();
    // Two steps is the collapse threshold, so nothing is hidden and no
    // disclosure appears — the pre-existing behaviour.
    expect(screen.getByText("Catalogue step two.")).toBeInTheDocument();
  });
});
