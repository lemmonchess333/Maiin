/**
 * MuscleKey — the Form tab's muscles-worked row.
 *
 * It was two rows of chips until 2026-09-03. Owner, comparing it with a
 * printed form card: "the pills we have aren't that good, I think these
 * look better." The card's version is better for one reason that is not
 * styling — its swatches tie each tier to a colour on the figure, so it
 * explains the picture rather than just naming muscles. These pin that
 * link, and the two things the swatch has to get right: the tier's own
 * paint, and the HATCH where the art hatches.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { THEME } from "@/lib/theme";
import { titleCaseMuscle } from "@/lib/muscleNames";
import MuscleKey from "../MuscleKey";

const swatches = (c: HTMLElement) => [
  ...c.querySelectorAll<HTMLElement>("span.size-2\\.5"),
];

/** jsdom normalises a hex background to `rgb(...)`, so the expectation
 *  is DERIVED from the theme value rather than written out — a token
 *  change still has to move this test. */
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe("MuscleKey", () => {
  it("names both tiers, each with a swatch in its own paint", () => {
    const { container } = render(
      <MuscleKey primary={["Chest"]} secondary={["Triceps", "Front Delts"]} />
    );
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.getByText("Chest")).toBeInTheDocument();
    expect(screen.getByText("Triceps, Front Delts")).toBeInTheDocument();
    const [p, s] = swatches(container);
    // The rig paints primary in the brand purple and secondary in the
    // lighter step; the key repeats exactly those, so it cannot drift
    // from the figure it explains.
    expect(p.style.background).toContain(rgb(THEME.lifting));
    expect(s.style.background).toContain(rgb(THEME.liftingLight));
  });

  it("hatches the secondary swatch where the art hatches", () => {
    // Supplied card art hatches its secondaries. A solid dot beside a
    // striped muscle is a key describing something that is not there.
    const { container } = render(
      <MuscleKey
        primary={["Pectoralis Major"]}
        secondary={["Serratus Anterior"]}
        secondaryFill="hatch"
      />
    );
    const [, s] = swatches(container);
    expect(s.style.background).toContain("repeating-linear-gradient");
    expect(s.style.background).toContain(rgb(THEME.lifting));
  });

  it("omits a tier it has no muscles for", () => {
    // Not an empty row with a dangling swatch: several exercises name
    // no secondary at all.
    render(<MuscleKey primary={["Calves"]} secondary={[]} />);
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.queryByText("Secondary")).toBeNull();
  });

  it("reads the same whichever data source the names came from", () => {
    /* The catalogue title-cases ("Rear Delts"); the borrowed
       free-exercise-db does not ("chest"), and which one an exercise
       resolves to depends on whether it carries local instructions. So
       the same row rendered differently between two exercises for a
       reason no reader could infer. */
    render(<MuscleKey primary={["chest"]} secondary={["front delts"]} />);
    expect(screen.getByText("Chest")).toBeInTheDocument();
    expect(screen.getByText("Front Delts")).toBeInTheDocument();
  });
});

describe("titleCaseMuscle", () => {
  it("capitalises words without mangling names already correct", () => {
    expect(titleCaseMuscle("chest")).toBe("Chest");
    expect(titleCaseMuscle("front delts")).toBe("Front Delts");
    expect(titleCaseMuscle("teres major")).toBe("Teres Major");
    expect(titleCaseMuscle("Rear Delts")).toBe("Rear Delts");
    // Hyphens are word breaks too, and an interior capital survives.
    expect(titleCaseMuscle("lower-back")).toBe("Lower-Back");
    expect(titleCaseMuscle("Pectoralis major")).toBe("Pectoralis Major");
  });
});
