// @vitest-environment node
/**
 * The streak a bounded window and the stored pair give, visit after visit,
 * is the streak the whole history gives.
 *
 * The app never sees a person's whole history: it reads a window (~167 days
 * for a 3-meal-a-day logger) and carries the rest in the stored pair, saved
 * on every visit. Three defects lived in the seam between the two, each
 * invisible to a test of one walk: the morning after a rest day saved 0 over
 * a long streak's certificate; a backfilled yesterday saved a count against
 * the wrong day; and the anchor was credited past a forgiven day the walk had
 * just spent, so every-other-day logging grew a full daily streak.
 *
 * Here a seeded history is replayed a day at a time, a morning and an
 * evening visit each day (some skipped, some days backfilled the next
 * morning), each visit computing from a 30-day window and the pair the last
 * visit stored. Every visit must agree with the walk over everything logged
 * so far. Dates are built in local time from a mid-May start, clear of DST.
 */
import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import {
  computeStreakSpan,
  computeStreakState,
  type StreakAnchor,
} from "../useStreaks";
import { mulberry32 } from "@/test/prng";

const START = new Date(2026, 4, 1, 12);
const DAYS = 120;
const WINDOW = 30;

const dateOf = (day: number) => {
  const d = new Date(START);
  d.setDate(d.getDate() + day);
  return d;
};
const keyOf = (day: number) => format(dateOf(day), "yyyy-MM-dd");

interface Day {
  active: boolean;
  /** Logged the next morning instead of on the day. */
  late: boolean;
}

function history(rnd: () => number): Day[] {
  const p = 0.35 + rnd() * 0.6;
  return Array.from({ length: DAYS }, () => ({
    active: rnd() < p,
    late: rnd() < 0.1,
  }));
}

/** Every day logged by this visit: up to yesterday in the morning (a late
 *  day arrives then), today too in the evening unless it is logged late. */
function loggedBy(days: Day[], day: number, evening: boolean): number[] {
  const out: number[] = [];
  for (let d = 0; d <= day; d++) {
    if (!days[d].active) continue;
    if (d < day || (evening && !days[d].late)) out.push(d);
  }
  return out;
}

function replay(seed: number) {
  const rnd = mulberry32(seed);
  const days = history(rnd);
  let stored: StreakAnchor | null = null;
  const mismatches: string[] = [];
  for (let day = 0; day < DAYS; day++) {
    for (const evening of [false, true]) {
      if (rnd() < 0.2) continue; // not opened this time
      const logged = loggedBy(days, day, evening);
      const all = new Set(logged.map(keyOf));
      const windowed = new Set(
        logged.filter((d) => d > day - WINDOW).map(keyOf)
      );
      const now = dateOf(day);
      const truth = computeStreakSpan(all, now).streak;
      const state = computeStreakState(windowed, stored, now);
      if (state.live.streak !== truth) {
        mismatches.push(
          `seed ${seed} day ${day} ${evening ? "evening" : "morning"}: ${state.live.streak} vs ${truth}`
        );
      }
      stored = state.anchor ?? stored;
    }
  }
  return mismatches;
}

describe("the windowed streak and the stored pair agree with the whole history", () => {
  // 120 histories of 240 visits each. 400 also agree (measured: 19 s).
  it("on 120 seeded histories, at every visit", { timeout: 60_000 }, () => {
    const mismatches: string[] = [];
    for (let seed = 1; seed <= 120; seed++) mismatches.push(...replay(seed));
    expect(mismatches.slice(0, 10)).toEqual([]);
  });

  it("every-other-day logging stays at 3, however long it goes on", () => {
    let stored: StreakAnchor | null = null;
    const logged: number[] = [];
    for (let day = 0; day < 60; day++) {
      if (day % 2 === 0) logged.push(day);
      const state = computeStreakState(
        new Set(logged.filter((d) => d > day - WINDOW).map(keyOf)),
        stored,
        dateOf(day)
      );
      stored = state.anchor ?? stored;
      if (day >= 2 && day % 2 === 0) expect(state.live.streak).toBe(3);
    }
  });
});
