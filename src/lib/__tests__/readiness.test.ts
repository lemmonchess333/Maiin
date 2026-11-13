import { describe, it, expect } from "vitest";
import {
  readinessFor,
  type BodySignals,
  type ReadinessInput,
} from "../readiness";

const quiet: ReadinessInput = {
  feel: null,
  hardRunYesterday: false,
  legDayYesterday: false,
  todayLoadsLegs: false,
  todayHardRun: false,
  body: null,
};

const usualBody: BodySignals = {
  sleepMinutes: 450,
  usualSleepMinutes: 450,
  restingHr: 54,
  usualRestingHr: 54,
  hrv: 52,
  usualHrv: 52,
};

describe("readiness with nothing known", () => {
  it("has no word, so the card asks how you feel instead of guessing", () => {
    expect(readinessFor(quiet)).toEqual({
      word: null,
      line: null,
      reasons: [],
      offerEasier: false,
    });
  });
});

describe("readiness from the morning question (free)", () => {
  it("good is Ready, on the person's own word", () => {
    const r = readinessFor({ ...quiet, feel: "good" });
    expect(r.word).toBe("Ready");
    expect(r.line).toBe("You said you feel good");
    expect(r.offerEasier).toBe(false);
  });

  it("tired is Steady, and offers the easier session", () => {
    const r = readinessFor({ ...quiet, feel: "tired" });
    expect(r.word).toBe("Steady");
    expect(r.line).toBe("You said you’re tired");
    expect(r.offerEasier).toBe(true);
  });

  it("rough is Go easy on its own", () => {
    const r = readinessFor({ ...quiet, feel: "rough" });
    expect(r.word).toBe("Go easy");
    expect(r.line).toBe("You said you feel rough");
    expect(r.offerEasier).toBe(true);
  });
});

describe("readiness from training (free)", () => {
  it("a hard run yesterday matters only before a day that loads the legs", () => {
    expect(readinessFor({ ...quiet, hardRunYesterday: true }).word).toBeNull();
    const r = readinessFor({
      ...quiet,
      hardRunYesterday: true,
      todayLoadsLegs: true,
    });
    expect(r.word).toBe("Steady");
    expect(r.line).toBe("Hard run yesterday, and today loads the same legs");
  });

  it("a leg day yesterday matters only before a hard run", () => {
    expect(readinessFor({ ...quiet, legDayYesterday: true }).word).toBeNull();
    const r = readinessFor({ ...quiet, legDayYesterday: true, todayHardRun: true });
    expect(r.word).toBe("Steady");
    expect(r.line).toBe("Leg day yesterday, before today’s hard run");
  });

  it("two mild reasons make Go easy, and the person's own answer leads", () => {
    const r = readinessFor({
      ...quiet,
      feel: "tired",
      hardRunYesterday: true,
      todayLoadsLegs: true,
    });
    expect(r.word).toBe("Go easy");
    expect(r.reasons.map((x) => x.kind)).toEqual(["feel", "hard_run_yesterday"]);
    expect(r.line).toBe("You said you’re tired");
  });

  it("a training reason outweighs a good answer: the fact still stands", () => {
    const r = readinessFor({
      ...quiet,
      feel: "good",
      hardRunYesterday: true,
      todayLoadsLegs: true,
    });
    expect(r.word).toBe("Steady");
  });
});

describe("readiness from sleep and heart (Pro)", () => {
  it("readings in range are Ready, and say what was read", () => {
    const r = readinessFor({ ...quiet, body: usualBody });
    expect(r.word).toBe("Ready");
    expect(r.line).toBe("7 h 30 min of sleep, resting heart rate as usual");
  });

  it("a short night against the usual is Steady, with both numbers", () => {
    const r = readinessFor({
      ...quiet,
      body: { ...usualBody, sleepMinutes: 340 },
    });
    expect(r.word).toBe("Steady");
    expect(r.line).toBe(
      "5 h 40 min of sleep last night, against your usual 7 h 30 min"
    );
  });

  it("under six hours is short whatever the usual, and with no usual yet", () => {
    const r = readinessFor({
      ...quiet,
      body: { ...usualBody, sleepMinutes: 350, usualSleepMinutes: null },
    });
    expect(r.word).toBe("Steady");
    expect(r.line).toBe("5 h 50 min of sleep last night");
  });

  it("under five hours is Go easy on its own", () => {
    const r = readinessFor({
      ...quiet,
      body: { ...usualBody, sleepMinutes: 290 },
    });
    expect(r.word).toBe("Go easy");
  });

  it("a short night for a long sleeper still counts: 90 minutes under the usual", () => {
    const r = readinessFor({
      ...quiet,
      body: { ...usualBody, sleepMinutes: 420, usualSleepMinutes: 510 },
    });
    expect(r.word).toBe("Steady");
    expect(r.reasons[0].kind).toBe("sleep");
  });

  it("resting heart rate 5 over the usual is mild, 8 over is strong", () => {
    expect(
      readinessFor({ ...quiet, body: { ...usualBody, restingHr: 58 } }).word
    ).toBe("Ready");
    const mild = readinessFor({ ...quiet, body: { ...usualBody, restingHr: 59 } });
    expect(mild.word).toBe("Steady");
    expect(mild.line).toBe("Resting heart rate 59, against your usual 54");
    expect(
      readinessFor({ ...quiet, body: { ...usualBody, restingHr: 62 } }).word
    ).toBe("Go easy");
  });

  it("heart rate variability well under the usual is only ever mild", () => {
    const r = readinessFor({ ...quiet, body: { ...usualBody, hrv: 30 } });
    expect(r.word).toBe("Steady");
    expect(r.line).toBe("Heart rate variability 30 ms, under your usual 52 ms");
    expect(r.reasons[0].weight).toBe("mild");
  });

  it("with no usual yet, heart readings say nothing either way", () => {
    const r = readinessFor({
      ...quiet,
      body: {
        sleepMinutes: null,
        usualSleepMinutes: null,
        restingHr: 70,
        usualRestingHr: null,
        hrv: 20,
        usualHrv: null,
      },
    });
    expect(r.word).toBeNull();
  });

  it("a strong reason leads, ahead of the person's mild answer", () => {
    const r = readinessFor({
      ...quiet,
      feel: "tired",
      body: { ...usualBody, sleepMinutes: 270 },
    });
    expect(r.word).toBe("Go easy");
    expect(r.reasons[0].kind).toBe("sleep");
  });
});
