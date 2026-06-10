import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { createRef } from "react";
import ShareCardRenderer, {
  type ShareCardRenderData,
  type ShareTemplate,
  type ShareFormat,
  type ShareBackground,
} from "../ShareCardRenderer";

afterEach(() => cleanup());

const base: ShareCardRenderData = {
  template: "run",
  format: "story",
  background: "dark",
  handle: "Alex",
  date: "12 Jun 2026",
  distanceKm: 10.42,
  durationSec: 3245,
  pace: "5:12",
  elevationM: 84,
  routePath: "M100,100L500,300L800,900",
  totalVolumeKg: 12400,
  exerciseCount: 6,
  prCount: 2,
  prExercise: "Back Squat",
  splits: [
    { km: 1, pace: "5:05" },
    { km: 2, pace: "5:18" },
  ],
};

describe("ShareCardRenderer", () => {
  const templates: ShareTemplate[] = ["run", "lift", "hybrid"];
  const formats: ShareFormat[] = ["story", "square"];
  const backgrounds: ShareBackground[] = [
    "brand",
    "dark",
    "transparent",
    "photo",
  ];

  it("renders every template × format × background without throwing", () => {
    for (const template of templates) {
      for (const format of formats) {
        for (const background of backgrounds) {
          const { unmount } = render(
            <ShareCardRenderer
              data={{ ...base, template, format, background, photoUrl: "x.jpg" }}
              offscreen={false}
            />
          );
          unmount();
        }
      }
    }
    expect(true).toBe(true);
  });

  it("brands with a small hexagon mark + handle — NOT an oversized wordmark", () => {
    render(<ShareCardRenderer data={base} offscreen={false} />);
    // The corner mark is an inline SVG hexagon (polygon), not big text.
    const polys = document.querySelectorAll("polygon");
    expect(polys.length).toBeGreaterThan(0);
    expect(screen.getByText("Alex")).toBeTruthy();
    expect(screen.getByText("12 Jun 2026")).toBeTruthy();
    // The old card's giant "TROPOS" header is gone.
    expect(screen.queryByText("TROPOS")).toBeNull();
  });

  it("RUN draws the abstract route polyline from the supplied path", () => {
    render(<ShareCardRenderer data={base} offscreen={false} />);
    const path = document.querySelector("path");
    expect(path?.getAttribute("d")).toBe("M100,100L500,300L800,900");
  });

  it("RUN with no routePath omits the route svg (manual / GPS-less run)", () => {
    render(
      <ShareCardRenderer
        data={{ ...base, routePath: undefined }}
        offscreen={false}
      />
    );
    expect(document.querySelector("path")).toBeNull();
    // Stats still render — the card stands on the numbers.
    expect(screen.getByText("kilometres")).toBeTruthy();
  });

  it("hidden stats are omitted from the card", () => {
    render(
      <ShareCardRenderer
        data={{ ...base, hiddenStats: new Set(["distance", "pace"]) }}
        offscreen={false}
      />
    );
    expect(screen.queryByText("kilometres")).toBeNull();
    expect(screen.queryByText("/km pace")).toBeNull();
    // Un-hidden stat still shows.
    expect(screen.getByText("time")).toBeTruthy();
  });

  it("LIFT shows a PR callout when PRs were set, hides it otherwise", () => {
    const { unmount } = render(
      <ShareCardRenderer
        data={{ ...base, template: "lift" }}
        offscreen={false}
      />
    );
    expect(screen.getByText(/Back Squat/)).toBeTruthy();
    expect(screen.getByText("total volume")).toBeTruthy();
    unmount();

    render(
      <ShareCardRenderer
        data={{ ...base, template: "lift", prCount: 0 }}
        offscreen={false}
      />
    );
    expect(screen.queryByText(/Back Squat/)).toBeNull();
  });

  it("HYBRID surfaces the combined lift + run rhythm (the differentiator)", () => {
    render(
      <ShareCardRenderer
        data={{ ...base, template: "hybrid" }}
        offscreen={false}
      />
    );
    expect(screen.getByText("Lift + Run")).toBeTruthy();
    expect(screen.getByText("lifted")).toBeTruthy();
    expect(screen.getByText("ran")).toBeTruthy();
    expect(screen.getByText("total time")).toBeTruthy();
  });

  it("forwards a ref to the root node (for html-to-image rasterisation)", () => {
    const ref = createRef<HTMLDivElement>();
    render(<ShareCardRenderer data={base} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
