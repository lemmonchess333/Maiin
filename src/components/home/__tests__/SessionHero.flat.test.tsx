/**
 * Home's hero stands on the flat page (DESIGN_GUIDE §14o, owner 23
 * November 2026): nothing is drawn behind the session's picture, for a
 * lift, a run or a rest day, and the drawing stands on its floor.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import SessionHero, { type HeroSport } from "../SessionHero";

afterEach(cleanup);

describe("SessionHero — the picture on the flat page", () => {
  for (const sport of ["lift", "run", "rest"] as HeroSport[]) {
    it(`draws only the picture in its box on a ${sport} day`, () => {
      const { container } = render(
        <SessionHero
          sport={sport}
          title="Pull A"
          meta={["Back and biceps", "about 26 min"]}
          picture={{ src: "/form-art/barbell-row.webp" }}
        />
      );
      const img = container.querySelector("img")!;
      expect(img).not.toBeNull();
      // The drawing's box holds the drawing and its floor, nothing else:
      // no light layer beside it.
      const box = img.parentElement!;
      expect(box).toHaveAttribute("data-hero-figure");
      expect(box.children).toHaveLength(2);
      expect(box.querySelector(".figure-floor")).toHaveAttribute(
        "aria-hidden",
        "true"
      );
      expect(container.innerHTML).not.toMatch(/glow|radial-gradient/);
    });
  }
});
