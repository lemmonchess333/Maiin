import { describe, it, expect } from "vitest";
import {
  resolveRunStatus,
  GPS_LOST_AFTER_SECONDS,
  type RunStatusInput,
} from "../runStatusBanner";

const NOW = 1_700_000_000_000;

function input(over: Partial<RunStatusInput> = {}): RunStatusInput {
  return {
    phase: "active",
    lastFixAt: NOW - 1000,
    now: NOW,
    gpsBannerSuppressedUntil: 0,
    autoPaused: false,
    backgroundGapMessage: null,
    ...over,
  };
}

/** Every condition true at once — the state the old stack rendered whole. */
const ALL = input({
  lastFixAt: NOW - 30_000,
  autoPaused: true,
  backgroundGapMessage: "Recording gap · 40s missed while backgrounded",
});

describe("resolveRunStatus", () => {
  it("says nothing when nothing is wrong", () => {
    expect(resolveRunStatus(input())).toBeNull();
  });

  it("returns AT MOST ONE status, however many conditions hold", () => {
    /* The whole point. Previously all three of these rendered as separate
       pills, stacked, over the map — plus a nav chip above them and a
       permission card below. */
    const status = resolveRunStatus(ALL);
    expect(status).not.toBeNull();
    expect(Object.keys(status!)).toEqual(["kind", "severity", "message"]);
  });

  it("ranks by what the runner can still affect", () => {
    /* Source order used to decide this, which put a back-to-start chip
       above "your GPS is gone". */
    expect(resolveRunStatus(ALL)!.kind).toBe("gps-lost");

    // Without the GPS loss, the live timer state outranks the past gap.
    expect(
      resolveRunStatus({ ...ALL, lastFixAt: NOW - 1000 })!.kind
    ).toBe("auto-paused");

    // And the gap notice surfaces only when it is the only thing to say.
    expect(
      resolveRunStatus({ ...ALL, lastFixAt: NOW - 1000, autoPaused: false })!
        .kind
    ).toBe("background-gap");
  });

  it("only the GPS loss is critical — so only one thing pulses", () => {
    expect(resolveRunStatus(ALL)!.severity).toBe("critical");
    expect(
      resolveRunStatus({ ...ALL, lastFixAt: NOW - 1000 })!.severity
    ).toBe("warning");
    expect(
      resolveRunStatus({ ...ALL, lastFixAt: NOW - 1000, autoPaused: false })!
        .severity
    ).toBe("warning");
  });

  it("stays quiet on a run that is not active", () => {
    /* A paused or finished run has no live status to report, and the old
       IIFE's `phase !== "active"` guard covered ONLY the GPS banner —
       auto-paused and the gap notice rendered regardless. */
    for (const phase of ["paused", "acquiring", "finished", "idle"]) {
      expect(resolveRunStatus({ ...ALL, phase })).toBeNull();
    }
  });

  it("waits the full threshold before calling GPS lost", () => {
    const at = (secondsAgo: number) =>
      resolveRunStatus(input({ lastFixAt: NOW - secondsAgo * 1000 }));
    expect(at(GPS_LOST_AFTER_SECONDS - 0.1)).toBeNull();
    expect(at(GPS_LOST_AFTER_SECONDS)!.kind).toBe("gps-lost");
    expect(at(GPS_LOST_AFTER_SECONDS + 30)!.message).toContain("38s ago");
  });

  it("says nothing about GPS before the first fix has ever landed", () => {
    /* `lastFixAt: null` is the pre-first-fix state, which the acquiring
       screen already owns. Reporting "last fix NaNs ago" there would be
       both wrong and alarming. */
    expect(resolveRunStatus(input({ lastFixAt: null }))).toBeNull();
    expect(
      resolveRunStatus({ ...ALL, lastFixAt: null })!.kind
    ).toBe("auto-paused");
  });

  it("honours the post-resume suppression window", () => {
    /* Resuming restores a trail whose `lastFixAt` is old, so without this
       every resume would flash a false GPS-loss banner during the cold-start
       window. */
    const stale = input({ lastFixAt: NOW - 60_000 });
    expect(resolveRunStatus(stale)!.kind).toBe("gps-lost");
    expect(
      resolveRunStatus({ ...stale, gpsBannerSuppressedUntil: NOW + 5000 })
    ).toBeNull();
    // And the window expiring re-arms it rather than disabling it for good.
    expect(
      resolveRunStatus({ ...stale, gpsBannerSuppressedUntil: NOW - 1 })!.kind
    ).toBe("gps-lost");
  });

  it("suppression silences the GPS banner without silencing the screen", () => {
    /* The suppression is about ONE signal being untrustworthy for a few
       seconds, not about the screen going quiet — an auto-pause during that
       window is still real and still worth saying. */
    const status = resolveRunStatus({
      ...ALL,
      gpsBannerSuppressedUntil: NOW + 5000,
    });
    expect(status!.kind).toBe("auto-paused");
  });

  it("passes the background-gap copy through verbatim", () => {
    /* The message is composed at the call site (it carries a measured
       duration), so this module must not rewrite it. */
    const msg = "Recording gap · 2m 14s missed while backgrounded";
    expect(
      resolveRunStatus(input({ backgroundGapMessage: msg }))!.message
    ).toBe(msg);
  });
});
