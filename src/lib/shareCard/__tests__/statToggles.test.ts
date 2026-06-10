import { describe, it, expect } from "vitest";
import {
  isStatVisible,
  toggleStat,
  visibleStatCount,
  TOGGLEABLE_STATS,
} from "../statToggles";

describe("statToggles", () => {
  it("empty hidden-set = everything visible (default card shows all)", () => {
    const hidden = new Set<string>();
    expect(isStatVisible(hidden, "distance")).toBe(true);
    expect(isStatVisible(hidden, "pace")).toBe(true);
  });

  it("toggle hides a visible stat and shows a hidden one", () => {
    let hidden = new Set<string>();
    hidden = toggleStat(hidden, "pace");
    expect(isStatVisible(hidden, "pace")).toBe(false);
    hidden = toggleStat(hidden, "pace");
    expect(isStatVisible(hidden, "pace")).toBe(true);
  });

  it("is immutable — returns a new set, never mutates the input", () => {
    const original = new Set<string>(["pace"]);
    const next = toggleStat(original, "distance");
    expect(next).not.toBe(original);
    expect(original.has("distance")).toBe(false); // input untouched
    expect(next.has("distance")).toBe(true);
    expect(next.has("pace")).toBe(true); // prior state carried forward
  });

  it("counts visible stats for a template", () => {
    const all = TOGGLEABLE_STATS.run.length;
    let hidden = new Set<string>();
    expect(visibleStatCount("run", hidden)).toBe(all);
    hidden = toggleStat(hidden, "splits");
    hidden = toggleStat(hidden, "elevation");
    expect(visibleStatCount("run", hidden)).toBe(all - 2);
  });

  it("visibleStatCount ignores hidden keys that aren't this template's stats", () => {
    const hidden = new Set<string>(["liftVolume"]); // a hybrid key
    expect(visibleStatCount("run", hidden)).toBe(TOGGLEABLE_STATS.run.length);
  });

  it("defines a stat set for each of the three templates", () => {
    expect(TOGGLEABLE_STATS.run.length).toBeGreaterThan(0);
    expect(TOGGLEABLE_STATS.lift.length).toBeGreaterThan(0);
    expect(TOGGLEABLE_STATS.hybrid.length).toBeGreaterThan(0);
  });
});
