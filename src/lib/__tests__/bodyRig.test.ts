import { describe, it, expect } from "vitest";
import {
  BODY_DEMOS,
  getBodyDemo,
  renderBodyDemo,
} from "../bodyRig";
import { ANTERIOR, POSTERIOR } from "../bodyModelData";

function polyYs(svg: string): number[] {
  return [...svg.matchAll(/points="([^"]+)"/g)]
    .flatMap((m) => m[1].trim().split(" "))
    .map((pair) => Number(pair.split(",")[1]));
}

describe("vendored body model", () => {
  it("carries the full figure for both views", () => {
    expect(ANTERIOR.length).toBe(33);
    expect(POSTERIOR.length).toBe(33);
    expect(ANTERIOR.some((p) => p.muscle === "head")).toBe(true);
    expect(POSTERIOR.some((p) => p.muscle === "gluteal")).toBe(true);
  });
});

describe("renderBodyDemo", () => {
  it("t=0 renders the untransformed figure (identity)", () => {
    const svg = renderBodyDemo("squat", 0);
    // The head's top vertex sits at the model's y≈0 when nothing moved.
    const ys = polyYs(svg);
    expect(Math.min(...ys)).toBeLessThan(1);
    expect(svg.match(/<polygon/g)!.length).toBe(35); // 33 body + 2 feet
  });

  it("squat: the body visibly sinks at the bottom", () => {
    const top = Math.min(...polyYs(renderBodyDemo("squat", 0)));
    const bottom = Math.min(...polyYs(renderBodyDemo("squat", 1)));
    expect(bottom - top).toBeGreaterThan(12); // head dropped by the dive
  });

  it("overhead press: the hands finish above the head", () => {
    const svg = renderBodyDemo("overhead-press", 1);
    // The bar line's y must sit above (smaller than) the head top (~0).
    const barY = Number(svg.match(/<line[^>]*y1="(-?[\d.]+)"/)![1]);
    expect(barY).toBeLessThan(6);
  });

  it("deadlift: hinge compresses the torso and lowers the bar", () => {
    const start = Number(
      renderBodyDemo("deadlift", 0).match(/<line[^>]*y1="(-?[\d.]+)"/)![1]
    );
    const end = Number(
      renderBodyDemo("deadlift", 1).match(/<line[^>]*y1="(-?[\d.]+)"/)![1]
    );
    expect(end).toBeGreaterThan(start + 8);
  });

  it("tints exactly the declared muscles (honest fill)", () => {
    const svg = renderBodyDemo("squat", 0);
    const purples = (svg.match(/#7B72E9/g) || []).length;
    const quadPolys = ANTERIOR.filter((p) => p.muscle === "quadriceps").length;
    expect(purples).toBe(quadPolys); // primary tint = quadriceps only
    expect(svg.includes("#B6BDC3")).toBe(true); // library body grey everywhere else
  });

  it("unknown exercise renders nothing", () => {
    expect(renderBodyDemo("zercher-yodel", 0.5)).toBe("");
    expect(getBodyDemo("zercher-yodel")).toBeNull();
  });
});

describe("registry", () => {
  it("all four pilot demos are defined with tints", () => {
    for (const id of ["squat", "deadlift", "overhead-press", "barbell-curl"]) {
      const d = BODY_DEMOS[id];
      expect(d, id).toBeTruthy();
      expect(Object.keys(d.tint).length, id).toBeGreaterThan(0);
    }
  });
});
