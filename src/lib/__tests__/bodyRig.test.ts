import { describe, it, expect } from "vitest";
import { BODY_DEMOS, getBodyDemo, renderBodyDemo } from "../bodyRig";
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

  it("aliased exercises render (renderBodyDemo is alias-aware)", () => {
    // db-curl aliases barbell-curl — a direct-registry lookup would blank.
    expect(renderBodyDemo("db-curl", 0.5)).not.toBe("");
    expect(renderBodyDemo("goblet-squat", 0.5)).not.toBe("");
  });

  it("effort brightens the working-muscle fill", () => {
    const soft = renderBodyDemo("squat", 0.5, 0);
    const hard = renderBodyDemo("squat", 0.5, 1);
    const firstOpacity = (svg: string) =>
      Number(svg.match(/fill-opacity="([\d.]+)"/)![1]);
    expect(firstOpacity(hard)).toBeGreaterThan(firstOpacity(soft));
  });

  it("pull-up: the body rises toward the fixed bar", () => {
    // Hands stay ON the bar, so the FEET are the travel signal.
    const maxY = (svg: string) => Math.max(...polyYs(svg));
    const hang = renderBodyDemo("pull-ups", 0);
    const top = renderBodyDemo("pull-ups", 1);
    expect(maxY(hang) - maxY(top)).toBeGreaterThan(15); // feet travelled up
    // The bar itself never moves.
    const barY = (svg: string) => svg.match(/<line[^>]*y1="(-?[\d.]+)"/)![1];
    expect(barY(hang)).toBe(barY(top));
  });

  it("lat pulldown: the bar travels from overhead to the chest", () => {
    // Last <line> is the moving bar (the first is the static cable).
    const lastLineY = (svg: string) => {
      const ys = [...svg.matchAll(/<line[^>]*y1="(-?[\d.]+)"/g)];
      return Number(ys[ys.length - 1][1]);
    };
    const start = lastLineY(renderBodyDemo("lat-pulldown", 0));
    const end = lastLineY(renderBodyDemo("lat-pulldown", 1));
    expect(end - start).toBeGreaterThan(50);
  });

  it("calf raise: body rises but the feet stay planted", () => {
    const maxY = (svg: string) => Math.max(...polyYs(svg));
    const minY = (svg: string) => Math.min(...polyYs(svg));
    const down = renderBodyDemo("calf-raise", 0);
    const up = renderBodyDemo("calf-raise", 1);
    expect(minY(down) - minY(up)).toBeGreaterThan(4); // head rose
    expect(Math.abs(maxY(down) - maxY(up))).toBeLessThan(1); // toes didn't
  });
});

describe("registry", () => {
  it("all demos are defined with tints and a concentric direction", () => {
    for (const id of [
      "squat",
      "deadlift",
      "overhead-press",
      "barbell-curl",
      "lateral-raise",
      "calf-raise",
      "pull-ups",
      "lat-pulldown",
    ]) {
      const d = BODY_DEMOS[id];
      expect(d, id).toBeTruthy();
      expect(Object.keys(d.tint).length, id).toBeGreaterThan(0);
      expect([0, 1], id).toContain(d.concentricTo);
    }
  });
});
