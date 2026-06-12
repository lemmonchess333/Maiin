import { describe, it, expect } from "vitest";
import {
  computeProgrammeChanges,
  programmePreservationNote,
  type ProgrammeSnapshot,
} from "../programmeChanges";

describe("programmePreservationNote (D5 — Pgm5 made visible)", () => {
  it("content edit (no lift-days change) reassures workouts are kept, names the week", () => {
    const note = programmePreservationNote({
      liftDaysChanged: false,
      weekNumber: 6,
    });
    expect(note).toMatch(/keep your current workouts/);
    expect(note).toMatch(/Week 6/);
    expect(note).toMatch(/logged sessions stay/);
  });

  it("lift-days change names the skeleton reset AND the preserved history", () => {
    const note = programmePreservationNote({
      liftDaysChanged: true,
      weekNumber: 3,
    });
    expect(note).toMatch(/rebuilds your weekly structure/);
    expect(note).toMatch(/reset to the new plan/);
    expect(note).toMatch(/Week 3, your history, and logged sessions are kept/);
  });

  it("falls back to 'Your current week' when weekNumber is missing/zero", () => {
    expect(programmePreservationNote({ liftDaysChanged: false })).toMatch(
      /Your current week/
    );
    expect(
      programmePreservationNote({ liftDaysChanged: true, weekNumber: 0 })
    ).toMatch(/Your current week/);
  });
});

const base: ProgrammeSnapshot = {
  primaryGoal: "hypertrophy",
  nutritionPhase: "recomp",
  experience: "intermediate",
  liftDays: 3,
  preferredSplit: "auto",
  equipment: "full_gym",
  injuries: [],
  runMode: "freeform",
  weeklyRunDays: 2,
  raceDistance: "10k",
  raceTargetDate: "",
};

describe("computeProgrammeChanges", () => {
  it("returns [] when nothing changed (drives the dirty=false state)", () => {
    expect(computeProgrammeChanges(base, { ...base })).toEqual([]);
  });

  it("reports lift-day and nutrition changes with readable labels", () => {
    const changes = computeProgrammeChanges(base, {
      ...base,
      liftDays: 4,
      nutritionPhase: "cut",
    });
    expect(changes).toEqual([
      { label: "Nutrition phase", from: "Recomp", to: "Cutting" },
      { label: "Lift days", from: "3", to: "4" },
    ]);
  });

  it("shows the picked split label, not the resolved value (auto stays 'No preference')", () => {
    const changes = computeProgrammeChanges(base, {
      ...base,
      preferredSplit: "upper_lower",
    });
    expect(changes).toEqual([
      { label: "Preferred split", from: "No preference", to: "Upper / Lower" },
    ]);
  });

  // ── Gating: must mirror the engine's dirty predicate exactly ──────────────

  it("ignores run-day changes while freeform (phantom-change guard)", () => {
    const changes = computeProgrammeChanges(base, {
      ...base,
      runMode: "freeform",
      weeklyRunDays: 5,
    });
    expect(changes).toEqual([]);
  });

  it("reports run-day changes once outside freeform", () => {
    const saved = { ...base, runMode: "race_prep", weeklyRunDays: 2 };
    const changes = computeProgrammeChanges(saved, {
      ...saved,
      weeklyRunDays: 4,
    });
    expect(changes).toEqual([{ label: "Run days", from: "2", to: "4" }]);
  });

  it("ignores race distance/date drift unless in race_prep", () => {
    const changes = computeProgrammeChanges(base, {
      ...base,
      runMode: "freeform",
      raceDistance: "marathon",
      raceTargetDate: "2026-09-01",
    });
    expect(changes).toEqual([]);
  });

  it("surfaces a freeform → race_prep switch with its race fields", () => {
    const changes = computeProgrammeChanges(base, {
      ...base,
      runMode: "race_prep",
      raceDistance: "marathon",
      raceTargetDate: "2026-09-01",
    });
    expect(changes).toEqual([
      { label: "Running", from: "Freeform", to: "Race prep" },
      { label: "Race distance", from: "10K", to: "Marathon" },
      { label: "Race date", from: "Not set", to: "1 Sep 2026" },
    ]);
  });

  it("formats race dates by parts (no UTC off-by-one)", () => {
    const saved = {
      ...base,
      runMode: "race_prep",
      raceTargetDate: "2026-01-31",
    };
    const changes = computeProgrammeChanges(saved, {
      ...saved,
      raceTargetDate: "2026-12-01",
    });
    expect(changes).toEqual([
      { label: "Race date", from: "31 Jan 2026", to: "1 Dec 2026" },
    ]);
  });

  // ── Injuries: order-insensitive array compare + readable join ─────────────

  it("treats injuries as a set (reorder is not a change)", () => {
    const saved = { ...base, injuries: ["shoulder", "knee"] };
    const changes = computeProgrammeChanges(saved, {
      ...saved,
      injuries: ["knee", "shoulder"],
    });
    expect(changes).toEqual([]);
  });

  it("joins injury labels and renders an empty/none list as 'None'", () => {
    const saved = { ...base, injuries: ["lower_back", "shoulder"] };
    const changes = computeProgrammeChanges(saved, {
      ...saved,
      injuries: ["none"],
    });
    expect(changes).toEqual([
      { label: "Injuries", from: "Lower back, Shoulder", to: "None" },
    ]);
  });

  it("degrades gracefully on an unmapped enum value", () => {
    const changes = computeProgrammeChanges(base, {
      ...base,
      nutritionPhase: "keto_experiment",
    });
    expect(changes).toEqual([
      { label: "Nutrition phase", from: "Recomp", to: "keto_experiment" },
    ]);
  });
});
