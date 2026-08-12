/**
 * The shared source→amount derivation for lifetime totals.
 *
 * Small module, but it is the one ADR-0012 names: "The reversal MUST call
 * the same function that computed the accrual, not a copy of it." These
 * pin the `||` chain the create triggers ran inline before the extraction,
 * so a later tidy-up that "simplifies" the fallbacks into explicit
 * presence checks has to do it deliberately rather than by accident — the
 * accrual and the reversal would then disagree about legacy documents, and
 * the difference would sit in a user's lifetime total with nothing
 * pointing at it.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  liftVolumeKgFor,
  runMetersFor,
  lifetimeAmountFor,
} = require("../lib/lifetimeAccrual");

describe("liftVolumeKgFor", () => {
  it("reads totalVolume", () => {
    expect(liftVolumeKgFor({ totalVolume: 6000 })).toBe(6000);
  });

  it("coerces a numeric string, as the trigger's Number() always did", () => {
    expect(liftVolumeKgFor({ totalVolume: "6000" })).toBe(6000);
  });

  it("is zero for absent, zero, and unparseable volumes", () => {
    expect(liftVolumeKgFor({})).toBe(0);
    expect(liftVolumeKgFor({ totalVolume: 0 })).toBe(0);
    expect(liftVolumeKgFor({ totalVolume: "heavy" })).toBe(0);
    expect(liftVolumeKgFor(null)).toBe(0);
    expect(liftVolumeKgFor(undefined)).toBe(0);
  });
});

describe("runMetersFor", () => {
  it("prefers distance, which is metres on the doc", () => {
    expect(runMetersFor({ distance: 6000, distanceKm: 99 })).toBe(6000);
  });

  it("falls back to the legacy distanceKm field", () => {
    expect(runMetersFor({ distanceKm: 6 })).toBe(6000);
  });

  it("falls through to km when distance is absent, zero or unparseable", () => {
    // The `||` chain, stated. A zero `distance` is not "0 metres, done" —
    // it falls through, which is what the trigger has always done and what
    // legacy docs written with distance: 0 rely on.
    expect(runMetersFor({ distance: 0, distanceKm: 6 })).toBe(6000);
    expect(runMetersFor({ distance: "far", distanceKm: 6 })).toBe(6000);
  });

  it("is zero when neither field is usable", () => {
    expect(runMetersFor({})).toBe(0);
    expect(runMetersFor({ distanceKm: "six" })).toBe(0);
    expect(runMetersFor(null)).toBe(0);
  });
});

describe("lifetimeAmountFor", () => {
  it("dispatches on the kind used in the marker path", () => {
    expect(lifetimeAmountFor("lift", { totalVolume: 500 })).toBe(500);
    expect(lifetimeAmountFor("run", { distance: 5000 })).toBe(5000);
  });

  it("is zero for an unknown kind rather than guessing a field", () => {
    expect(lifetimeAmountFor("swim", { distance: 5000 })).toBe(0);
    expect(lifetimeAmountFor(undefined, { totalVolume: 500 })).toBe(0);
  });
});
