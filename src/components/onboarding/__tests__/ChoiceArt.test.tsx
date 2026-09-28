/**
 * The drawing beside an onboarding choice (DS3): an exercise's cut-out,
 * a category's muscles, a route that grows with the running, or a level
 * as chevrons. Always decorative; the choice's words carry its name.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import ChoiceArt from "../ChoiceArt";

afterEach(cleanup);

describe("ChoiceArt", () => {
  it("draws an exercise as its cut-out, hidden from assistive tech", () => {
    const { container } = render(
      <ChoiceArt art={{ kind: "exercise", id: "db-curl" }} />
    );
    const tile = container.firstElementChild!;
    expect(tile).toHaveAttribute("aria-hidden", "true");
    expect(tile).toHaveAttribute("data-thumb", "drawing");
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(
      /\/form-art\/db-curl\.webp$/
    );
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("draws a category as the muscles it works", () => {
    const { container } = render(
      <ChoiceArt art={{ kind: "muscles", category: "Full Body" }} />
    );
    const tile = container.firstElementChild!;
    expect(tile).toHaveAttribute("aria-hidden", "true");
    expect(tile).toHaveAttribute("data-choice-art", "muscles");
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(
      /^data:image\/svg\+xml/
    );
  });

  it("gives each running level its own route, longer as it goes", () => {
    const routes = ([1, 2, 3] as const).map((distance) => {
      const { container } = render(
        <ChoiceArt art={{ kind: "route", distance }} />
      );
      const d = container.querySelector("path")!.getAttribute("d")!;
      expect(container.firstElementChild).toHaveAttribute(
        "aria-hidden",
        "true"
      );
      // It takes the card's tone rather than naming a colour.
      expect(container.querySelector("svg")).toHaveAttribute(
        "stroke",
        "currentColor"
      );
      cleanup();
      return d;
    });
    expect(new Set(routes).size).toBe(3);
    // More road for more running: each path carries more curve, counted
    // as the coordinates it is drawn through.
    const points = routes.map((d) => (d.match(/-?\d*\.?\d+/g) ?? []).length);
    expect(points[0]).toBeLessThan(points[1]);
    expect(points[1]).toBeLessThan(points[2]);
  });

  it("draws a level as that many solid chevrons out of three", () => {
    for (const level of [1, 2, 3] as const) {
      const { container } = render(
        <ChoiceArt art={{ kind: "level", level }} />
      );
      const chevrons = [...container.querySelectorAll("polyline")];
      expect(chevrons).toHaveLength(3);
      expect(
        chevrons.filter((c) => c.getAttribute("stroke-opacity") === "1")
      ).toHaveLength(level);
      cleanup();
    }
  });
});
