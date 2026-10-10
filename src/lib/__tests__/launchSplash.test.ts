/**
 * The launch animation's arithmetic, and the four places that must draw
 * its first frame identically: the native launch image
 * (scripts/art/gen-splash.mjs), index.html's static frame, the overlay's
 * CSS size, and src/lib/brandMark.ts. A drift between any two of them is
 * a visible jump on every cold start, and nothing else would notice it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  flightBetween,
  flightFrames,
  hexagonClipPath,
  isAutomated,
  settled,
  springOut,
} from "../launchSplash";
import {
  LAUNCH_MARK_SHARE,
  MARK_CORNER,
  MARK_HEXAGON,
  MARK_VIEWBOX,
} from "../brandMark";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("flightBetween", () => {
  it("moves the mark's centre onto the target's and scales it to fit", () => {
    const from = { left: 150, top: 370, width: 90, height: 104 };
    const to = { left: 18, top: 97, width: 13.5, height: 16 };
    const f = flightBetween(from, to);
    expect(f.x).toBeCloseTo(18 + 6.75 - (150 + 45));
    expect(f.y).toBeCloseTo(97 + 8 - (370 + 52));
    expect(f.scale).toBeCloseTo(16 / 104);
  });
});

describe("springOut", () => {
  it("starts from standstill, ends exactly on 1, and never turns back", () => {
    expect(springOut(0)).toBe(0);
    expect(springOut(1)).toBe(1);
    // From rest: the first hundredth covers almost nothing.
    expect(springOut(0.01)).toBeLessThan(0.005);
    let prev = 0;
    for (let i = 1; i <= 100; i += 1) {
      const p = springOut(i / 100);
      expect(p).toBeGreaterThanOrEqual(prev);
      expect(p).toBeLessThanOrEqual(1);
      prev = p;
    }
  });

  it("is under way at once and slows into the target", () => {
    // An ease-in-out idles for its first tenth; this is well started.
    expect(springOut(0.1)).toBeGreaterThan(0.1);
    // Most of the way by mid-flight, the rest a soft landing.
    expect(springOut(0.5)).toBeGreaterThan(0.8);
    expect(springOut(0.9) - springOut(0.8)).toBeLessThan(0.05);
  });
});

describe("flightFrames", () => {
  const from = { left: 150, top: 370, width: 90, height: 104 };
  const to = { left: 18, top: 97, width: 13.5, height: 16 };
  const flight = flightBetween(from, to);
  const frames = flightFrames(flight);
  const parse = (frame: string) => {
    const m =
      /^translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)$/.exec(frame);
    expect(m).not.toBeNull();
    return { x: Number(m![1]), y: Number(m![2]), s: Number(m![3]) };
  };
  const points = frames.map(parse);

  it("starts where the mark is and lands exactly on the target", () => {
    expect(points[0]).toEqual({ x: 0, y: 0, s: 1 });
    const last = points[points.length - 1];
    expect(last.x).toBeCloseTo(flight.x, 1);
    expect(last.y).toBeCloseTo(flight.y, 1);
    expect(last.s).toBeCloseTo(flight.scale, 4);
  });

  it("shrinks by the same ratio for the same progress", () => {
    // Geometric, not linear: at each frame the scale is the target scale
    // raised to how far along the spring is.
    frames.forEach((_, i) => {
      const p = springOut(i / (frames.length - 1));
      expect(points[i].s).toBeCloseTo(flight.scale ** p, 3);
    });
  });

  it("leaves upward and bows away from the straight line", () => {
    // The first step is mostly a climb, as the chevron's was.
    expect(Math.abs(points[1].y)).toBeGreaterThan(Math.abs(points[1].x) * 2);
    // Halfway, the centre is above the straight line from start to target
    // (y on the line at that x, in screen terms, is larger).
    const mid = points[Math.floor(points.length / 2)];
    const lineY = (mid.x / flight.x) * flight.y;
    expect(mid.y).toBeLessThan(lineY);
  });
});

describe("hexagonClipPath", () => {
  it("is brandMark.ts's inset hexagon, in the mark's box", () => {
    const [vx, vy, vw, vh] = MARK_VIEWBOX.split(" ").map(Number);
    const points = /^polygon\((.*)\)$/
      .exec(hexagonClipPath())![1]
      .split(", ")
      .map((pair) => pair.split(" ").map((v) => parseFloat(v) / 100));
    const hexagon = MARK_HEXAGON.split(" ").map((pair) =>
      pair.split(",").map(Number)
    );
    expect(points).toHaveLength(hexagon.length);
    points.forEach(([px, py], i) => {
      expect(vx + px * vw).toBeCloseTo(hexagon[i][0], 1);
      expect(vy + py * vh).toBeCloseTo(hexagon[i][1], 1);
    });
  });
});

describe("settled", () => {
  const box = { left: 18, top: 97, width: 13.5, height: 16 };
  it("waits for a second sighting before trusting a box", () => {
    expect(settled(null, box)).toBe(false);
    expect(settled(box, { ...box })).toBe(true);
  });
  it("does not trust a box that is still sliding into place", () => {
    expect(settled(box, { ...box, top: box.top + 3 })).toBe(false);
    expect(settled(box, { ...box, height: 14 })).toBe(false);
    // The last frames of an ease-out move by fractions of a pixel.
    expect(settled(box, { ...box, top: box.top + 0.4 })).toBe(false);
  });
});

describe("isAutomated", () => {
  it("is true only for a browser that says a harness drives it", () => {
    expect(isAutomated({ webdriver: true })).toBe(true);
    expect(isAutomated({ webdriver: false })).toBe(false);
    expect(isAutomated(undefined)).toBe(false);
  });
});

describe("the launch frame is drawn the same everywhere", () => {
  it("index.html's static frame is brandMark.ts's hexagon", () => {
    const html = read("index.html");
    const frame = /<div id="boot-splash"[\s\S]*?<\/div>\s*<div id="root">/.exec(
      html
    )?.[0];
    expect(frame).toBeTruthy();
    expect(frame).toContain(`viewBox="${MARK_VIEWBOX}"`);
    expect(frame).toContain(`points="${MARK_HEXAGON}"`);
    expect(frame).toContain(`stroke-width="${MARK_CORNER}"`);
    // The hexagon alone: the chevron is what the animation adds.
    expect(frame).not.toContain("<polyline");
  });

  it("the web size is the native launch image's size", () => {
    const share = Number(
      /const MARK_SHARE = ([\d.]+);/.exec(
        read("scripts/art/gen-splash.mjs")
      )?.[1]
    );
    const boxHeight = Number(MARK_VIEWBOX.split(" ")[3]);
    expect(LAUNCH_MARK_SHARE).toBeCloseTo((share * boxHeight) / 1024, 6);
    const css = read("src/styles/components.css");
    const factor = Number(
      /\.launch-splash-mark\s*\{[^}]*height:\s*calc\(max\(100vw, 100vh\) \* ([\d.]+)\)/.exec(
        css
      )?.[1]
    );
    expect(factor).toBeCloseTo(LAUNCH_MARK_SHARE, 3);
  });

  it("the ground is the launch colour, not the theme's page", () => {
    // coldStartChrome.test.ts pins --launch to the launch image's colour.
    const css = read("src/styles/components.css");
    const ground = /\.launch-splash-ground\s*\{([^}]*)\}/.exec(css)?.[1];
    expect(ground).toMatch(/background:\s*hsl\(var\(--launch\)\);/);
  });

  it("the static frame never shows under automation or without JS", () => {
    const css = read("src/styles/components.css");
    expect(css).toMatch(/#boot-splash\s*\{\s*display:\s*none;\s*\}/);
    expect(css).toMatch(/html\.booting #boot-splash\s*\{\s*display:\s*grid;/);
    const init = read("public/init.js");
    const gate = /if \(!navigator\.webdriver\) \{([\s\S]*?)\n {2}\}/.exec(
      init
    )?.[1];
    expect(gate).toContain('classList.add("booting")');
  });
});
