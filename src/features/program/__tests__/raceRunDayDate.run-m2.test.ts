/**
 * RUN-M2 (#1115) — the final-week race runDay's `date` MUST equal
 * `raceGoal.targetDate` for every distance × schedule, in both normal and
 * belowFloor (finish-safely) plans. The server reconciliation
 * (`_needsRaceNoShowEvaluation` / `_decideRecoveryEntry`) finds the race day by
 * that exact equality; before the fix the race was placed on the long-run slot,
 * so the date matched only when the race happened to fall on the long-run
 * weekday — every other day-of-week silently broke no-show / recovery entry.
 */
import { describe, it, expect } from "vitest";
import { generateRacePlanV2 } from "../runScheduler";
import { generateSchedule } from "@/lib/scheduleUtils";

// Add N days to a YYYY-MM-DD (noon-anchored so DST can't shift the date).
function addDays(d: string, n: number): string {
  const dt = new Date(d + "T12:00:00");
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate()
  ).padStart(2, "0")}`;
}

const DISTANCES = ["5k", "10k", "half", "marathon"] as const;
const MIN_WEEKS = { "5k": 4, "10k": 6, half: 8, marathon: 12 } as const;
const FLOOR_WEEKS = { "5k": 2, "10k": 2, half: 3, marathon: 4 } as const;

const weekStart = "2026-05-10"; // Sunday
// Vary which / how many days are run-eligible (long-run slot + others differ).
const SCHEDULES = [
  generateSchedule(2, 3),
  generateSchedule(3, 3),
  generateSchedule(2, 4),
  generateSchedule(4, 2),
];

function raceDate(
  plan: ReturnType<typeof generateRacePlanV2>
): string | undefined {
  const finalWeek = plan.weeks[plan.weeks.length - 1] ?? [];
  return finalWeek.find((d) => d.type === "race")?.date;
}

describe("RUN-M2 — race runDay date === targetDate (normal plans)", () => {
  for (const distance of DISTANCES) {
    for (let dow = 0; dow < 7; dow++) {
      const targetDate = addDays(
        weekStart,
        (MIN_WEEKS[distance] + 1) * 7 + dow
      );
      it(`${distance} · race +${dow}d → race day is on targetDate`, () => {
        for (const weekSchedule of SCHEDULES) {
          const plan = generateRacePlanV2({
            weekSchedule,
            raceGoal: { distance, targetDate },
            weeklyRunDays: 3,
            currentDate: weekStart,
            weekStart,
          });
          expect(plan.belowFloor).toBe(false);
          expect(raceDate(plan)).toBe(targetDate);
        }
      });
    }
  }
});

describe("RUN-M2 — race runDay date === targetDate (belowFloor plans)", () => {
  for (const distance of DISTANCES) {
    for (let dow = 0; dow < 7; dow++) {
      const targetDate = addDays(
        weekStart,
        (FLOOR_WEEKS[distance] - 1) * 7 + dow
      );
      it(`${distance} · belowFloor race +${dow}d → race day is on targetDate`, () => {
        for (const weekSchedule of SCHEDULES) {
          const plan = generateRacePlanV2({
            weekSchedule,
            raceGoal: { distance, targetDate },
            weeklyRunDays: 3,
            currentDate: weekStart,
            weekStart,
          });
          expect(raceDate(plan)).toBe(targetDate);
        }
      });
    }
  }
});

describe("RUN-M2 — race week keeps exactly one race + no double-booking", () => {
  it("one race day on targetDate; nothing shares its slot", () => {
    const targetDate = addDays(weekStart, 6 * 7 + 3); // 10k, mid-week race
    const plan = generateRacePlanV2({
      weekSchedule: generateSchedule(2, 3),
      raceGoal: { distance: "10k", targetDate },
      weeklyRunDays: 3,
      currentDate: weekStart,
      weekStart,
    });
    const finalWeek = plan.weeks[plan.weeks.length - 1];
    const races = finalWeek.filter((d) => d.type === "race");
    expect(races).toHaveLength(1);
    expect(races[0].date).toBe(targetDate);
    const onRaceDay = finalWeek.filter((d) => d.dayIndex === races[0].dayIndex);
    expect(onRaceDay).toHaveLength(1);
  });
});
