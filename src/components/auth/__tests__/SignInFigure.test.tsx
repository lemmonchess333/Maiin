/**
 * The lifter on sign-in and sign-up (DS8 call 2): the overhead press,
 * front on, playing its rep through the hero's flipbook.
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, cleanup } from "@testing-library/react";
import SignInFigure from "../SignInFigure";
import { SIGN_IN_EXERCISE, authArtPath } from "@/lib/authArt";
import { heroMotionFor } from "@/lib/heroMotion";

afterEach(cleanup);

describe("SignInFigure", () => {
  it("draws the sign-in exercise's flipbook, hidden from a screen reader", () => {
    const { container } = render(<SignInFigure />);
    const figure = container.querySelector(".signin-figure");
    expect(figure).toHaveAttribute("aria-hidden", "true");
    const sheet = heroMotionFor(authArtPath(SIGN_IN_EXERCISE));
    const flipbook = container.querySelector<HTMLElement>("[data-hero-motion]");
    expect(flipbook).not.toBeNull();
    expect(flipbook?.style.backgroundImage).toContain(sheet!.src);
  });

  it("stands on the flat page, with nothing drawn behind the lifter", () => {
    const { container } = render(<SignInFigure />);
    const figure = container.querySelector(".signin-figure")!;
    // The flipbook is the box's one child: no light layer under it
    // (DESIGN_GUIDE §14o).
    expect(figure.children).toHaveLength(1);
    expect(figure.firstElementChild).toHaveAttribute("data-hero-motion");
    expect(container.innerHTML).not.toMatch(/glow|signin-light|radial/);
  });
});

/* DS9 STATUS (the TestFlight build): on iPhone the lifter drew nothing,
   and its light showed as a thin oval at the screen's right edge. The
   figure sits in the sign-in grid's `auto` column, which takes its width
   from what is in it, and the box had no width of its own: its drawing
   (HeroMotion) is sized by an aspect ratio under `max-width: 100%`, which
   Safari's engine counts as 0px wide when a column measures it (Chromium
   counts 121px, so no browser here showed it). Measured in WebKitGTK 2.52:
   the box was 0 by 176px before this and 121 by 176px after. jsdom does
   no layout, so these hold the box's lengths in the stylesheet. */
describe("the lifter's box", () => {
  const css = readFileSync(
    resolve(process.cwd(), "src/styles/components.css"),
    "utf8"
  );
  const rule = css.match(/\n\.signin-figure\s*\{([^}]*)\}/)?.[1] ?? "";
  const length = (property: string) =>
    rule.match(
      new RegExp(
        `(?:^|[;\\s])${property}:\\s*min\\((\\d+(?:\\.\\d+)?)px,\\s*var\\(--signin-room\\)\\)`
      )
    )?.[1];

  // Both lengths go to nothing with `--signin-room` under 14rem of
  // column, so the box leaves no column of its own beside the words.
  it("has a width of its own, in pixels, so no column asks the drawing for one", () => {
    expect(rule, "the .signin-figure rule").not.toBe("");
    expect(length("width")).toBeDefined();
    expect(length("height")).toBeDefined();
  });

  it("is the flipbook's frame at the box's height, to the pixel", () => {
    const sheet = heroMotionFor(authArtPath(SIGN_IN_EXERCISE))!;
    const height = Number(length("height"));
    const width = Number(length("width"));
    // A different drawing with other proportions fails here: resize the
    // box and the heading's `--signin-clear` with it.
    expect(
      Math.abs(width - (height * sheet.frameWidth) / sheet.frameHeight)
    ).toBeLessThan(1);
  });
});
