/**
 * scripts/diff-screenshots.mjs — the classification maths behind the
 * capture channel's DIFF_REPORT. The script only ever runs in CI, which
 * is exactly where an unnoticed break rots (a report that says
 * "unchanged" forever reads as "covered" — the silent-cap rule); these
 * pin the thresholds and the report shape against synthetic PNGs.
 */
import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
// The script is plain ESM run under bare node in CI; the ambient
// declaration in src/types/diff-screenshots.d.ts types this import
// without dragging the scripts dir into the app's tsconfig.
import {
  comparePngs,
  renderReport,
} from "../../../scripts/diff-screenshots.mjs";

/** Solid-colour test frame. */
function frame(
  width: number,
  height: number,
  rgb: [number, number, number]
): PNG {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = rgb[0];
    png.data[i * 4 + 1] = rgb[1];
    png.data[i * 4 + 2] = rgb[2];
    png.data[i * 4 + 3] = 255;
  }
  return png;
}

/** Paint a rectangle of a frame a different colour. */
function paint(
  png: PNG,
  x0: number,
  y0: number,
  w: number,
  h: number,
  rgb: [number, number, number]
): PNG {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * png.width + x) * 4;
      png.data[i] = rgb[0];
      png.data[i + 1] = rgb[1];
      png.data[i + 2] = rgb[2];
    }
  }
  return png;
}

describe("comparePngs", () => {
  it("identical frames are unchanged at 0%", () => {
    const a = frame(100, 100, [26, 26, 31]);
    const b = frame(100, 100, [26, 26, 31]);
    const r = comparePngs(a, b);
    expect(r.status).toBe("unchanged");
    expect(r.pct).toBe(0);
  });

  it("a small region change classifies as minor", () => {
    const a = frame(100, 100, [26, 26, 31]);
    // 5×10 = 50px of 10,000 → 0.5%: past unchanged (0.05%), under 1%.
    const b = paint(frame(100, 100, [26, 26, 31]), 0, 0, 5, 10, [212, 99, 122]);
    const r = comparePngs(a, b);
    expect(r.status).toBe("minor");
    expect(r.pct).toBeGreaterThan(0.05);
    expect(r.pct).toBeLessThan(1);
  });

  it("a large region change classifies as changed, with a diff image", () => {
    const a = frame(100, 100, [26, 26, 31]);
    const b = paint(
      frame(100, 100, [26, 26, 31]),
      0,
      0,
      50,
      50,
      [255, 255, 255]
    );
    const r = comparePngs(a, b);
    expect(r.status).toBe("changed");
    expect(r.pct).toBeGreaterThanOrEqual(1);
    expect(r.diff).toBeTruthy();
  });

  it("dimension mismatch reports resized without pixel maths", () => {
    const r = comparePngs(
      frame(100, 100, [0, 0, 0]),
      frame(100, 120, [0, 0, 0])
    );
    expect(r.status).toBe("resized");
    expect(r.pct).toBeNull();
    expect(r.note).toBe("100×100 → 100×120");
  });

  it("sub-threshold pixel jitter stays unchanged", () => {
    const a = frame(100, 100, [26, 26, 31]);
    // One antialiasing-scale pixel: 1/10,000 = 0.01% < 0.05%.
    const b = paint(frame(100, 100, [26, 26, 31]), 0, 0, 1, 1, [255, 0, 0]);
    expect(comparePngs(a, b).status).toBe("unchanged");
  });
});

describe("renderReport", () => {
  it("collapses unchanged frames and orders the interesting ones", () => {
    const md = renderReport([
      { file: "home-light.png", status: "unchanged", pct: 0, note: null },
      { file: "home-dark.png", status: "changed", pct: 12.5, note: null },
      { file: "food-light.png", status: "minor", pct: 0.3, note: null },
      { file: "new-page.png", status: "added", pct: null, note: null },
      { file: "old-page.png", status: "removed", pct: null, note: null },
      {
        file: "run-light.png",
        status: "resized",
        pct: null,
        note: "375×800 → 375×900",
      },
    ]);
    expect(md).toContain(
      "6 frames compared — 5 with visible change, 1 unchanged."
    );
    // Resized/changed sort above minor; unchanged never gets a row.
    expect(md.indexOf("run-light.png")).toBeLessThan(
      md.indexOf("home-dark.png")
    );
    expect(md.indexOf("home-dark.png")).toBeLessThan(
      md.indexOf("food-light.png")
    );
    expect(md).not.toContain("home-light.png");
    expect(md).toContain(
      "| home-dark.png | changed | 12.50% | diffs/home-dark.png |"
    );
  });

  it("says so plainly when nothing changed", () => {
    const md = renderReport([
      { file: "a.png", status: "unchanged", pct: 0, note: null },
    ]);
    expect(md).toContain("No visible changes.");
  });
});
