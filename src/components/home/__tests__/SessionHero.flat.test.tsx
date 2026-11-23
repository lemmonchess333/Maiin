/**
 * Home's hero stands on the flat page (DESIGN_GUIDE §14o, owner 23
 * November 2026): nothing is drawn behind the session's picture, for a
 * lift, a run or a rest day.
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
      // The picture is its box's one child: no light layer beside it.
      expect(img.parentElement!.children).toHaveLength(1);
      expect(container.innerHTML).not.toMatch(/glow|radial-gradient/);
    });
  }
});
