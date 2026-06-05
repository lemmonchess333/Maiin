/**
 * Activation tracker — the baseline + dedup logic that lets the live
 * useMeals/useWorkouts snapshots fire one activity event per newly-created
 * doc without (a) firing for pre-existing history, (b) double-firing across
 * the several concurrent subscriptions, or (c) leaking one user's history
 * into another's funnel after an account switch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const track = vi.fn();
vi.mock("../lifecycleAnalytics", () => ({ track: (e: string) => track(e) }));

import {
  noteActivitySnapshot,
  __resetActivationTracker,
} from "../activationTracker";

beforeEach(() => {
  __resetActivationTracker();
  track.mockReset();
});

describe("noteActivitySnapshot", () => {
  it("first snapshot is the baseline — records ids, fires nothing", () => {
    const fired = noteActivitySnapshot("food", "u1", ["a", "b"]);
    expect(fired).toEqual([]);
    expect(track).not.toHaveBeenCalled();
  });

  it("fires once for a new id after the baseline", () => {
    noteActivitySnapshot("food", "u1", ["a"]); // baseline
    const fired = noteActivitySnapshot("food", "u1", ["b", "a"]); // b is new
    expect(fired).toEqual(["b"]);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("food_logged");
  });

  it("does not re-fire an id already seen (dedup across snapshots)", () => {
    noteActivitySnapshot("food", "u1", ["a"]); // baseline
    noteActivitySnapshot("food", "u1", ["b", "a"]); // fires b
    const fired = noteActivitySnapshot("food", "u1", ["b", "a"]); // nothing new
    expect(fired).toEqual([]);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("workout maps to workout_completed", () => {
    noteActivitySnapshot("workout", "u1", ["w0"]); // baseline
    noteActivitySnapshot("workout", "u1", ["w1", "w0"]);
    expect(track).toHaveBeenCalledWith("workout_completed");
  });

  it("a concurrent second subscription (same key, post-baseline) does not double-fire", () => {
    noteActivitySnapshot("food", "u1", ["a"]); // sub A baseline
    noteActivitySnapshot("food", "u1", ["b", "a"]); // sub A sees new b → fires
    // sub B delivers the same snapshot; b already seen → no fire.
    const fired = noteActivitySnapshot("food", "u1", ["b", "a"]);
    expect(fired).toEqual([]);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("account switch re-baselines under the new uid (no false fires for u2 history)", () => {
    noteActivitySnapshot("food", "u1", ["a"]); // u1 baseline
    noteActivitySnapshot("food", "u1", ["b", "a"]); // u1 fires b
    track.mockReset();
    // u2 logs in with existing meals — first u2 snapshot is its own baseline.
    const fired = noteActivitySnapshot("food", "u2", ["x", "y"]);
    expect(fired).toEqual([]);
    expect(track).not.toHaveBeenCalled();
  });

  it("types are independent (food baseline doesn't suppress workouts)", () => {
    noteActivitySnapshot("food", "u1", ["a"]); // food baseline
    const fired = noteActivitySnapshot("workout", "u1", ["a"]); // workout baseline (same id, diff type)
    expect(fired).toEqual([]);
    expect(track).not.toHaveBeenCalled();
  });

  it("no uid → no-op", () => {
    expect(noteActivitySnapshot("food", "", ["a"])).toEqual([]);
    expect(track).not.toHaveBeenCalled();
  });
});
