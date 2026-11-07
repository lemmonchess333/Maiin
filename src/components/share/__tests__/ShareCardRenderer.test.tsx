import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { createRef } from "react";
import ShareCardRenderer, {
  type ShareCardRenderData,
  type ShareTemplate,
  type ShareFormat,
  type ShareBackground,
} from "../ShareCardRenderer";
import { groupText, groupTextRe } from "@/test/localeGrouping";

afterEach(() => cleanup());

const base: ShareCardRenderData = {
  unit: "km" as const,
  template: "run",
  format: "story",
  background: "dark",
  handle: "Alex",
  date: "12 Jun 2026",
  distanceKm: 10.42,
  durationSec: 3245,
  paceSecPerKm: 312,
  elevationM: 84,
  routePath: "M100,100L500,300L800,900",
  totalVolumeKg: 12400,
  exerciseCount: 6,
  prCount: 2,
  prExercise: "Back Squat",
  splits: [
    { lap: 1, paceSecPerKm: 305 },
    { lap: 2, paceSecPerKm: 318 },
  ],
};

describe("ShareCardRenderer — the sharer's unit", () => {
  /* A share card is an IMAGE, so the unit is fixed at export and cannot
     depend on who opens it. That makes the sharer's preference the only
     answer available — and it is the one that matches what the numbers
     mean to the person posting them. */
  function renderUnit(unit: "km" | "mi") {
    const { container } = render(
      <ShareCardRenderer data={{ ...base, unit, template: "run" }} />
    );
    return container.textContent ?? "";
  }

  it("renders a run card in metric", () => {
    const text = renderUnit("km");
    expect(text).toContain("10.42"); // 10.42 km, two decimals
    expect(text).toContain("5:12"); // 312 s/km
    expect(text).toContain("84m"); // climb
  });

  it("renders the same run in miles — every stat, not just the distance", () => {
    /* The failure this guards is a PARTIAL conversion: one stat converted
       and the four beside it left metric is worse than a fully metric
       card, because nothing on the image says which is which. */
    const text = renderUnit("mi");
    expect(text).toContain("6.47"); // 10.42 km → 6.47 mi
    expect(text).toContain("8:22"); // 312 s/km → 8:22 /mi
    expect(text).toContain("276ft"); // 84 m → 276 ft
    expect(text).not.toMatch(/\bkm\b/);
  });

  it("splits are laps in the sharer's unit, paced in it too", () => {
    expect(renderUnit("km")).toContain("5:05");
    expect(renderUnit("mi")).toContain("8:11"); // 305 s/km → 8:11 /mi
  });
});

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
              data={{
                ...base,
                template,
                format,
                background,
                photoUrl: "x.jpg",
              }}
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

  /* DS4 (§0 rules 1 and 2, §14m rules 12-14 and 31): the card wears the
     session's meaning colour on the app's dark stage, as the finish screen
     does. A run's route is running's coral and a new best's is gold;
     never the lifting purple on a run, and never a field of colour. */
  it("draws a run in running's coral and a new best in gold, on the dark stage", () => {
    const card = (data: Partial<ShareCardRenderData>) => {
      const { container, unmount } = render(
        <ShareCardRenderer
          data={{ ...base, background: "brand", ...data }}
          offscreen={false}
        />
      );
      const root = container.firstElementChild as HTMLElement;
      const look = {
        stage: root.style.backgroundColor,
        light: root.style.backgroundImage,
        route: document.querySelector("path[d]")?.getAttribute("stroke"),
      };
      unmount();
      return look;
    };
    const run = card({ template: "run" });
    expect(run.route?.toLowerCase()).toBe("#d4637a");
    expect(run.stage).not.toBe("");
    // One hue, fading out: a radial light of the route's own colour.
    expect(run.light).toMatch(/^radial-gradient/);
    expect(run.light.toLowerCase()).not.toContain("7b72e9");
    const best = card({ template: "run", tone: "achievement" });
    expect(best.route?.toLowerCase()).toBe("#ffd700");
    expect(card({ template: "lift" }).light.toLowerCase()).not.toContain(
      "d4637a"
    );
  });

  it("LIFT heads the card with the session done, its drawing and the reward's sentence", () => {
    render(
      <ShareCardRenderer
        data={{
          ...base,
          template: "lift",
          headline: "Pull A done",
          line: "You rowed 35 kg × 8, a new best by 2.5 kg.",
          tone: "achievement",
          artSrc: "/form-art/barbell-row.webp",
        }}
        offscreen={false}
      />
    );
    expect(screen.getByText("Pull A done")).toBeTruthy();
    expect(
      screen.getByText("You rowed 35 kg × 8, a new best by 2.5 kg.")
    ).toBeTruthy();
    expect(document.querySelector("img")?.getAttribute("src")).toBe(
      "/form-art/barbell-row.webp"
    );
    // The sentence says the best, so the PR pill does not say it twice.
    expect(screen.queryByText(/2 PRs/)).toBeNull();
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
    expect(screen.getByText(/^kg lifted/)).toBeTruthy();
    unmount();

    render(
      <ShareCardRenderer
        data={{ ...base, template: "lift", prCount: 0 }}
        offscreen={false}
      />
    );
    expect(screen.queryByText(/Back Squat/)).toBeNull();
  });

  /* Lift18: the volume in the SHARER's lifting unit, as the distance is
     in theirs. 12,400 kg is 27,337 lb. */
  it("LIFT reads the volume in the sharer's lifting unit", () => {
    const { container, unmount } = render(
      <ShareCardRenderer
        data={{ ...base, template: "lift" }}
        offscreen={false}
      />
    );
    // The hero figure in full, grouped, as the finish screen writes it.
    expect(container.textContent).toMatch(/12\D400kg lifted/);
    unmount();
    const lb = render(
      <ShareCardRenderer
        data={{ ...base, template: "lift", liftUnit: "lbs" }}
        offscreen={false}
      />
    );
    expect(lb.container.textContent).toMatch(/27\D337lb lifted/);
    expect(lb.container.textContent).not.toMatch(/12\D400/);
    lb.unmount();
    const small = render(
      <ShareCardRenderer
        data={{
          ...base,
          template: "lift",
          liftUnit: "lbs",
          totalVolumeKg: 400,
        }}
        offscreen={false}
      />
    );
    expect(small.container.textContent).toContain("882lb lifted");
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

  it("NUTRITION renders the calories hero + macro line (S2 macro-day card)", () => {
    render(
      <ShareCardRenderer
        data={{
          ...base,
          template: "nutrition",
          calories: 2284,
          calorieTarget: 2300,
          protein: 162,
          carbs: 248,
          fat: 61,
        }}
        offscreen={false}
      />
    );
    expect(screen.getByText(groupText(2284))).toBeTruthy();
    expect(
      screen.getByText(new RegExp(`of ${groupTextRe(2300)} kcal`))
    ).toBeTruthy();
    expect(screen.getByText(/162P/)).toBeTruthy();
    expect(screen.getByText(/248C/)).toBeTruthy();
  });

  it("forwards a ref to the root node (for html-to-image rasterisation)", () => {
    const ref = createRef<HTMLDivElement>();
    render(<ShareCardRenderer data={base} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
