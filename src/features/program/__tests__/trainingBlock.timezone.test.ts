import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// A fresh process makes the timezone effective before either date module loads.
// These dates cover spring and autumn clock changes in both the US and UK.
const cases = [
  ["2026-03-02", "2026-03-09", "2026-03-16", "2026-03-29", "2026-03-30"],
  ["2026-03-23", "2026-03-30", "2026-04-06", "2026-04-19", "2026-04-20"],
  ["2026-10-05", "2026-10-12", "2026-10-19", "2026-11-01", "2026-11-02"],
  ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-08", "2026-11-09"],
];

describe("training block calendar dates across timezones", () => {
  it.each(["UTC", "America/Chicago", "Europe/London"])(
    "keeps week boundaries, progression holds and end dates in %s",
    (timezone) => {
      const output = execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `
        import { blockEndDate, blockWeekOf, isBlockFinished } from "./src/features/program/trainingBlock.ts";
        import { isProgressionHeld } from "./src/features/program/represcribe.ts";
        import cf from "./functions/lib/progressionHold.js";
        const results = ${JSON.stringify(cases)}.map(([startDate, week2, week3, last, end]) => {
          const block = { startDate, durationWeeks: 4, pace: "easing" };
          const dates = [startDate, week2, week3, last, end];
          return {
            weeks: dates.map(date => blockWeekOf(block, date)),
            serverWeeks: dates.map(date => cf.blockWeekOf(block, date)),
            holds: dates.map(date => isProgressionHeld(block, blockWeekOf(block, date))),
            serverHolds: dates.map(date => cf.holdsProgression(block, date)),
            end: blockEndDate(block),
            finished: [isBlockFinished(block, last), isBlockFinished(block, end)],
          };
        });
        process.stdout.write(JSON.stringify(results));
      `,
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            TZ: timezone,
            TSX_TSCONFIG_PATH: "tsconfig.app.json",
          },
          timeout: 15000,
        }
      );
      expect(JSON.parse(output)).toEqual(
        cases.map((dates) => ({
          weeks: [1, 2, 3, 4, null],
          serverWeeks: [1, 2, 3, 4, null],
          holds: [true, true, false, false, false],
          serverHolds: [true, true, false, false, false],
          end: dates[4],
          finished: [false, true],
        }))
      );
    },
    // Includes a separate Node/TS loader startup on a loaded full-suite worker.
    20000
  );
});
