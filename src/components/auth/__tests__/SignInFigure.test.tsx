/**
 * The lifter on sign-in and sign-up (DS8 call 2): the overhead press,
 * front on, playing its rep through the hero's flipbook.
 */
import { describe, it, expect, afterEach } from "vitest";
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

  it("stands in one light", () => {
    const { container } = render(<SignInFigure />);
    expect(container.querySelectorAll(".hero-glow")).toHaveLength(1);
  });
});
