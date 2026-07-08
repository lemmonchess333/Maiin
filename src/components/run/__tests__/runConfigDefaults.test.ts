/**
 * runConfigDefaults — the shared config-from-type builders (run fast-launch
 * arc). These pin the "identical config" invariant: the launch card, tile
 * picker, and modal all produce a RunConfig through the SAME functions, so
 * they can't drift. See scratchpad spec `spec-run-fast-launch.md` §3, §10.3.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONFIG,
  buildLaunchConfig,
  buildTileConfig,
  pacePatchForType,
  chooserPaceFor,
} from "../runConfigDefaults";
import { freeformPlanMetadata } from "@/lib/runPlanMetadata";
import { paceTableFromFitness } from "@/lib/runPaces";

const meta = freeformPlanMetadata("freeform");

describe("buildLaunchConfig", () => {
  it("merges DEFAULT_CONFIG + prefill + metadata and honours audioCues/autoPause", () => {
    const prefill = {
      activityType: "tempo" as const,
      target: { type: "distance" as const, value: 5500 },
    };
    const cfg = buildLaunchConfig({ prefill, metadata: meta }, true);
    expect(cfg.activityType).toBe("tempo");
    expect(cfg.target).toEqual({ type: "distance", value: 5500 });
    expect(cfg.planMetadata).toBe(meta);
    expect(cfg.audioCues).toBe(true);
    expect(cfg.autoPause).toBe(true);
    expect(cfg.shoeId).toBeUndefined();
  });

  it("respects audioCues=false", () => {
    const cfg = buildLaunchConfig({ prefill: {}, metadata: meta }, false);
    expect(cfg.audioCues).toBe(false);
  });

  it("empty prefill falls back to the DEFAULT_CONFIG shape", () => {
    const cfg = buildLaunchConfig({ prefill: {}, metadata: meta }, true);
    expect(cfg.activityType).toBe(DEFAULT_CONFIG.activityType);
    expect(cfg.displayStats).toEqual(DEFAULT_CONFIG.displayStats);
    expect(cfg.target).toEqual(DEFAULT_CONFIG.target);
  });

  it("applies shoeId when provided and omits the key when null", () => {
    expect(
      buildLaunchConfig({ prefill: {}, metadata: meta }, true, "shoe-1").shoeId
    ).toBe("shoe-1");
    const noShoe = buildLaunchConfig(
      { prefill: {}, metadata: meta },
      true,
      null
    );
    expect("shoeId" in noShoe).toBe(false);
  });

  it("carries an intervals prefill through unchanged", () => {
    const prefill = {
      activityType: "intervals" as const,
      intervals: {
        reps: 5,
        workDistance: 1000,
        workPace: 270,
        restDuration: 90,
      },
    };
    const cfg = buildLaunchConfig({ prefill, metadata: meta }, true);
    expect(cfg.intervals).toEqual(prefill.intervals);
  });
});

describe("buildTileConfig", () => {
  it("no benchmark → activityType only + threaded metadata", () => {
    const cfg = buildTileConfig("easy", null, meta, true);
    expect(cfg.activityType).toBe("easy");
    expect(cfg.planMetadata).toBe(meta);
    expect(cfg.target).toEqual({ type: "none" });
  });

  it("tempo with a benchmark personalises the pace target", () => {
    const table = paceTableFromFitness({ vdot: 50, benchmark: null });
    expect(table).not.toBeNull();
    const cfg = buildTileConfig("tempo", table, meta, true);
    expect(cfg.activityType).toBe("tempo");
    expect(cfg.target.type).toBe("pace");
    expect(typeof cfg.target.value).toBe("number");
  });

  it("shoeId flows through", () => {
    expect(buildTileConfig("long", null, meta, true, "s2").shoeId).toBe("s2");
  });
});

describe("pacePatchForType / chooserPaceFor", () => {
  it("null table → activityType only, no personalisation", () => {
    expect(pacePatchForType("tempo", null)).toEqual({ activityType: "tempo" });
    expect(pacePatchForType("intervals", null)).toEqual({
      activityType: "intervals",
    });
    expect(chooserPaceFor("tempo", null)).toBeNull();
  });

  it("chooserPaceFor returns a band for pace types, null for others", () => {
    const table = paceTableFromFitness({ vdot: 50, benchmark: null });
    expect(chooserPaceFor("easy", table)).not.toBeNull();
    expect(chooserPaceFor("freerun", table)).toBeNull();
    expect(chooserPaceFor("treadmill", table)).toBeNull();
  });
});
