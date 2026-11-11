/**
 * The welcome's picture (DS8 call 1): an example of what setup makes,
 * read as one image and never as the visitor's own numbers.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import WelcomePreview from "../WelcomePreview";
import { group } from "@/test/localeGrouping";

afterEach(cleanup);

describe("WelcomePreview", () => {
  it("is one picture to a screen reader, and says it is an example", () => {
    render(<WelcomePreview />);
    const picture = screen.getByRole("img");
    const name = picture.getAttribute("aria-label") ?? "";
    expect(name).toMatch(/^An example plan:/);
    // What it draws, in words: the week, today's session and the target.
    expect(name).toContain("three lifts and two runs");
    expect(name).toContain("45-minute leg session");
    expect(name).toContain(`${group(2450)} kcal a day`);
  });

  it("draws the week it describes: three lifts, two runs, two rest days", () => {
    const { container } = render(<WelcomePreview />);
    const days = (kind: string) =>
      container.querySelectorAll(`[data-day="${kind}"]`).length;
    expect(days("lift")).toBe(3);
    expect(days("run")).toBe(2);
    expect(days("rest")).toBe(2);
  });

  it("shows today's session with its drawing, and the target with its unit spaced", () => {
    const { container } = render(<WelcomePreview />);
    expect(screen.getByText("Legs")).toBeInTheDocument();
    expect(screen.getByText("45 min · 4 lifts")).toBeInTheDocument();
    expect(container.querySelector("img")?.getAttribute("src") ?? "").toMatch(
      /form-art\/squat\.webp$/
    );
    expect(container.querySelector(".welcome-figure")?.textContent).toBe(
      `${group(2450)} kcal`
    );
  });
});
