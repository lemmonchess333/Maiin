/**
 * A8 — fueling. Pins the duration gates on the consensus line, the
 * eve-of-long-run detection (long only, big enough only, override-aware,
 * local-date matching), the macro floor, and the honest register.
 */
import { describe, it, expect } from "vitest";
import {
  applyEveFuelFloor,
  eveOfLongRun,
  sessionFuelingLine,
  FUELING_MIN_MINUTES,
} from "../fueling";
import type { ProgramState } from "@/features/program/programTypes";

describe("sessionFuelingLine", () => {
  it("silent under 75 minutes; steps up past 2.5 hours", () => {
    expect(sessionFuelingLine(55)).toBeNull();
    expect(sessionFuelingLine(74)).toBeNull();
    expect(sessionFuelingLine(null)).toBeNull();
    expect(sessionFuelingLine(undefined)).toBeNull();
    expect(sessionFuelingLine(FUELING_MIN_MINUTES)).toMatch(/30–60g/);
    expect(sessionFuelingLine(110)).toMatch(/30–60g/);
    expect(sessionFuelingLine(170)).toMatch(/60–90g/);
    expect(sessionFuelingLine(240)).toMatch(/60–90g/);
  });

  it("always says to practise in training, and stays in the register", () => {
    for (const line of [sessionFuelingLine(90)!, sessionFuelingLine(200)!]) {
      expect(line).toMatch(/practised?\b.*training runs/i);
      expect(line).toMatch(/standard/i);
      expect(line).not.toMatch(/gel|brand|product|supplement|injur|guarantee/i);
    }
  });
});

describe("eveOfLongRun", () => {
  const program = (
    runDays: NonNullable<ProgramState["runDays"]>
  ): ProgramState => ({ runDays }) as unknown as ProgramState;
  const day = (date: string, templateId: string, userOverride?: string) => ({
    dayIndex: 0,
    templateId,
    type: "long",
    ...(userOverride ? { userOverride } : {}),
    date,
  });

  it("detects tomorrow's big long run by local date", () => {
    const eve = eveOfLongRun(
      "2026-07-11",
      program([day("2026-07-12", "long_20k")])
    );
    expect(eve).toEqual({ templateName: "Long 20K", estimatedDuration: 110 });
  });

  it("null when tomorrow is not a long run, or the long run is small", () => {
    expect(
      eveOfLongRun("2026-07-11", program([day("2026-07-12", "tempo_20")]))
    ).toBeNull();
    // Long 10K = 55 min — under the fueling threshold, no eve treatment.
    expect(
      eveOfLongRun("2026-07-11", program([day("2026-07-12", "long_10k")]))
    ).toBeNull();
    // Long run is TODAY (day-of fueling is the classifier's job), not eve.
    expect(
      eveOfLongRun("2026-07-11", program([day("2026-07-11", "long_20k")]))
    ).toBeNull();
    expect(eveOfLongRun("2026-07-11", null)).toBeNull();
  });

  it("userOverride wins over the scheduled templateId", () => {
    // Scheduled long, overridden to easy → no eve.
    expect(
      eveOfLongRun(
        "2026-07-11",
        program([day("2026-07-12", "long_20k", "easy_30")])
      )
    ).toBeNull();
    // Scheduled easy, overridden to a big long → eve.
    expect(
      eveOfLongRun(
        "2026-07-11",
        program([day("2026-07-12", "easy_30", "long_25k")])
      )?.templateName
    ).toBe("Long 25K");
  });
});

describe("applyEveFuelFloor", () => {
  const eve = { templateName: "Long 20K", estimatedDuration: 110 };
  it("floors quiet days to MODERATE; leaves training days alone", () => {
    expect(applyEveFuelFloor("REST", eve)).toBe("MODERATE");
    expect(applyEveFuelFloor("EASY", eve)).toBe("MODERATE");
    expect(applyEveFuelFloor("MODERATE", eve)).toBe("MODERATE");
    expect(applyEveFuelFloor("HARD", eve)).toBe("HARD");
    expect(applyEveFuelFloor("REST", null)).toBe("REST");
  });
});
