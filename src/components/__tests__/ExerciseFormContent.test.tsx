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
import {
  render,
  screen,
  waitFor,
  act,
  fireEvent,
} from "@testing-library/react";

const beatsRef = {
  current: null as { t: number; label: string; cue: string }[] | null,
};
const keyRef = {
  current: null as {
    primary: string[];
    secondary: string[];
    secondaryFill: "solid" | "hatch";
  } | null,
};
vi.mock("@/lib/bodyRig", () => ({
  getBodyDemo: () => ({ view: "side", tint: {}, concentricTo: 0 }),
  getFormBeats: () => beatsRef.current,
  getDemoMuscleKey: () => keyRef.current,
}));

vi.mock("@/lib/exerciseDemo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/exerciseDemo")>()),
  getExerciseDemo: async () => ({
    name: "Dips",
    category: "Chest",
    equipment: "Bodyweight",
    primaryMuscles: ["Pectorals"],
    secondaryMuscles: ["Triceps", "Pectorals"],
    images: [],
    instructions: ["Catalogue step one.", "Catalogue step two."],
    tip: "Watch the shoulders.",
    mediaKind: "reference-photos" as const,
  }),
}));

/** A stand-in player: one button per position, reporting it upward. */
let requestedStep: { index: number; serial: number } | undefined;
let reportStep: ((i: number) => void) | undefined;
vi.mock("@/components/ExerciseRigDemo", () => ({
  default: ({
    onStep,
    stepRequest,
  }: {
    onStep?: (i: number) => void;
    stepRequest?: { index: number; serial: number };
  }) => {
    reportStep = onStep;
    requestedStep = stepRequest;
    return <div data-testid="player" />;
  },
}));

vi.mock("@/lib/exercises", () => ({
  EXERCISES: [{ id: "dips", name: "Dips" }],
}));

import ExerciseFormContent from "../ExerciseFormContent";
import * as exerciseDemoModule from "@/lib/exerciseDemo";

const BEATS = [
  { t: 0, label: "Top position", cue: "Arms locked, chest tall." },
  { t: 0.5, label: "Mid descent", cue: "Elbows travel back." },
  { t: 1, label: "Bottom position", cue: "Upper arms parallel." },
];

beforeEach(() => {
  beatsRef.current = null;
  keyRef.current = null;
  reportStep = undefined;
  requestedStep = undefined;
});

describe("ExerciseFormContent — the instruction list", () => {
  it("requests local instructions when the form surface owns a rig/placard", async () => {
    const lookup = vi.spyOn(exerciseDemoModule, "getExerciseDemo");
    try {
      render(<ExerciseFormContent exerciseName="Dips" />);
      expect(
        await screen.findByText("Catalogue step one.")
      ).toBeInTheDocument();
      expect(lookup).toHaveBeenCalledWith("Dips", { preferLocal: true });
    } finally {
      lookup.mockRestore();
    }
  });

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

  it("lets a reader select a cue and exposes its instruction accessibly", async () => {
    beatsRef.current = BEATS;
    render(<ExerciseFormContent exerciseName="Dips" />);
    const button = await screen.findByRole("button", {
      name: "Show frame 2: Mid descent",
    });
    expect(button).toHaveAccessibleDescription("Elbows travel back.");
    fireEvent.click(button);
    expect(requestedStep).toEqual({ index: 1, serial: 1 });
    fireEvent.click(button);
    expect(requestedStep).toEqual({ index: 1, serial: 2 });
    act(() => reportStep!(1));
    expect(button).toHaveAttribute("aria-current", "step");
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

describe("ExerciseFormContent — the muscle key", () => {
  it("falls back to the catalogue, deduped and title-cased", async () => {
    /* LOCAL_MUSCLE_MAP expands some groups, which can put the same
       muscle in both tiers; primary wins, being the more emphatic
       categorisation. And the borrowed database supplies lowercase
       names, which used to render as "chest" beside another exercise's
       "Pectorals". */
    render(<ExerciseFormContent exerciseName="Dips" />);
    expect(await screen.findByText("Primary")).toBeInTheDocument();
    expect(screen.getByText("Pectorals")).toBeInTheDocument();
    expect(screen.getByText("Triceps")).toBeInTheDocument();
  });

  it("supplied card art overrides it, because a key describes the PICTURE", async () => {
    /* The catalogue names what the exercise trains; the dips card
       shades a pec solid and hatches the serratus. Both are true, but
       only one of them is on screen. */
    beatsRef.current = BEATS;
    keyRef.current = {
      primary: ["Pectoralis major"],
      secondary: ["Serratus anterior"],
      secondaryFill: "hatch",
    };
    const { container } = render(<ExerciseFormContent exerciseName="Dips" />);
    expect(await screen.findByText("Pectoralis Major")).toBeInTheDocument();
    expect(screen.getByText("Serratus Anterior")).toBeInTheDocument();
    expect(screen.queryByText("Pectorals")).toBeNull();
    /* Scoped to the KEY's swatches: the numbered step chips in the
       instruction list are round too, and matching them made this
       assertion read an empty background from the wrong element. */
    const swatches = [
      ...container.querySelectorAll<HTMLElement>("span.size-2\\.5"),
    ];
    expect(swatches[1].style.background).toContain("repeating-linear-gradient");
  });
});
