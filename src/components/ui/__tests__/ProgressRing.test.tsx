/**
 * ProgressRing draws its arc in from empty, and under Reduce Motion the
 * arc is simply there. The gate is the ring's own: the app's MotionConfig
 * settles only positional values, and a stroke offset is not one, so
 * without it the ring drew in for everyone (DS3, "off under Reduce
 * Motion").
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const motionPref = vi.hoisted(() => ({ reduce: false }));
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => motionPref.reduce,
}));

import ProgressRing from "../ProgressRing";

afterEach(() => {
  cleanup();
  motionPref.reduce = false;
});

const SIZE = 100;
const STROKE = 10;
const CIRCUMFERENCE = 2 * Math.PI * ((SIZE - STROKE) / 2);

function arcOffset(value: number) {
  const { container } = render(
    <ProgressRing
      value={value}
      size={SIZE}
      stroke={STROKE}
      color="currentColor"
    />
  );
  const arc = container.querySelectorAll("circle")[1];
  return Number(arc.getAttribute("stroke-dashoffset"));
}

describe("ProgressRing", () => {
  it("starts empty and draws in when motion is allowed", () => {
    expect(arcOffset(0.5)).toBeCloseTo(CIRCUMFERENCE, 5);
  });

  it("is settled at its value from the first paint under Reduce Motion", () => {
    motionPref.reduce = true;
    expect(arcOffset(0.5)).toBeCloseTo(CIRCUMFERENCE / 2, 5);
    cleanup();
    expect(arcOffset(0.25)).toBeCloseTo(CIRCUMFERENCE * 0.75, 5);
  });

  it("draws no arc at all for nothing done", () => {
    const { container } = render(
      <ProgressRing
        value={0}
        size={SIZE}
        stroke={STROKE}
        color="currentColor"
      />
    );
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });
});

describe("ProgressRing, cut into its card", () => {
  function ring(props: { cut?: boolean; trackColor?: string }) {
    const { container } = render(
      <ProgressRing
        value={0}
        size={SIZE}
        stroke={STROKE}
        color="currentColor"
        {...props}
      />
    );
    return {
      svg: container.querySelector("svg") as SVGSVGElement,
      lip: container.querySelector("circle[data-ring-lip]"),
      track: container.querySelector(
        "circle:not([data-ring-lip])"
      ) as SVGCircleElement,
    };
  }

  it("draws the plain groove unless asked", () => {
    const { lip, track, svg } = ring({});
    expect(lip).toBeNull();
    expect(track.getAttribute("stroke")).toBe(
      "hsl(var(--muted-foreground) / 0.22)"
    );
    expect(svg.getAttribute("class")).not.toContain("overflow-visible");
  });

  it("takes the groove and its lit lip from the theme's tokens", () => {
    const { lip, track, svg } = ring({ cut: true });
    expect(track.getAttribute("stroke")).toBe("var(--ds-ring-track)");
    expect(lip?.getAttribute("stroke")).toBe("var(--ds-ring-lip)");
    // Under the track, so only the pixel the track does not cover shows.
    expect(lip?.nextElementSibling).toBe(track);
    // The svg is turned a quarter: its -x is the screen's down. That
    // pixel is outside the viewBox, so the svg must not clip it.
    expect(lip?.getAttribute("transform")).toBe("translate(-1 0)");
    expect(svg.getAttribute("class")).toContain("overflow-visible");
  });

  it("leaves a ring with its own track colour alone", () => {
    // The lip is drawn under an opaque groove. Under a see-through track
    // it would tint the whole ring.
    const { lip, track } = ring({ cut: true, trackColor: "transparent" });
    expect(lip).toBeNull();
    expect(track.getAttribute("stroke")).toBe("transparent");
  });
});

describe("ProgressRing, sized with the reader's text", () => {
  function box(scaleWithText: boolean) {
    const { container } = render(
      <ProgressRing
        value={0.5}
        size={96}
        stroke={8}
        color="currentColor"
        scaleWithText={scaleWithText}
      >
        <span>92</span>
      </ProgressRing>
    );
    return {
      wrap: container.firstElementChild as HTMLElement,
      svg: container.querySelector("svg") as SVGSVGElement,
    };
  }

  it("is a fixed number of pixels unless asked", () => {
    const { wrap, svg } = box(false);
    expect(wrap.style.width).toBe("96px");
    expect(wrap.style.height).toBe("96px");
    expect(svg.getAttribute("width")).toBe("96");
  });

  it("grows with the text, so a figure inside it still fits at larger sizes", () => {
    /* A figure set in rem doubles at 200% text while a ring set in
       pixels does not, and the figure runs past it. In rem the two grow
       together; the drawing inside is the viewBox's, so its geometry is
       the same. */
    const { wrap, svg } = box(true);
    expect(wrap.style.width).toBe("6rem");
    expect(wrap.style.height).toBe("6rem");
    expect(svg.getAttribute("width")).toBe("100%");
    expect(svg.getAttribute("viewBox")).toBe("0 0 96 96");
  });
});
