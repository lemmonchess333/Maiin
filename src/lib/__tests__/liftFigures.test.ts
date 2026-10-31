/**
 * The three figures a lift session leads with, on the finish screen and on
 * the saved session's page. One rule for both: the page you come back to
 * says what the finish said.
 */
import { describe, expect, it } from "vitest";
import { durationFigure, setsFigure, workFigure } from "../liftFigures";

const written = (figure: { to: number; format: (n: number) => string }) =>
  figure.format(figure.to);

describe("lift figures", () => {
  it.each([
    { minutes: 0.2, value: "<1", unit: "minute" },
    { minutes: 0.9, value: "1", unit: "minute" },
    { minutes: 1.2, value: "1", unit: "minute" },
    { minutes: 59.6, value: "1:00", unit: "hr:min" },
    { minutes: 60.2, value: "1:00", unit: "hr:min" },
  ])(
    "keeps the displayed value and unit together for $minutes minutes",
    ({ minutes, value, unit }) => {
      const figure = durationFigure(minutes);
      expect(written(figure)).toBe(value);
      expect(figure.unit).toBe(unit);
    }
  );

  it("writes the time in minutes, and as a clock past the hour", () => {
    // Under half a minute rounds to 0: said as under a minute, not zero.
    expect(written(durationFigure(0))).toBe("<1");
    expect(durationFigure(0).unit).toBe("minute");
    expect(written(durationFigure(54))).toBe("54");
    expect(durationFigure(54).unit).toBe("minutes");
    expect(durationFigure(1).unit).toBe("minute");
    // "1:00 hours" read as one figure in hours.
    expect(written(durationFigure(60))).toBe("1:00");
    expect(durationFigure(60).unit).toBe("hr:min");
    expect(written(durationFigure(65))).toBe("1:05");
  });

  it("writes the work as kg lifted, grouped in thousands", () => {
    const work = workFigure(6155.4, 120, "kg");
    expect(work.unit).toBe("kg lifted");
    expect(written(work)).toBe(Math.round(6155.4).toLocaleString("en-GB"));
  });

  it("gives a session with no load its reps, not 0 kg lifted", () => {
    expect(workFigure(0, 30, "kg").unit).toBe("reps");
    expect(written(workFigure(0, 30, "kg"))).toBe("30");
    expect(workFigure(0, 1, "kg").unit).toBe("rep");
    // Nothing at all is still a weight, not "0 reps".
    expect(workFigure(0, 0, "kg").unit).toBe("kg lifted");
  });

  it("writes the work in lb for a lifter who lifts in lb (Lift18)", () => {
    const work = workFigure(1000, 30, "lbs");
    expect(work.unit).toBe("lb lifted");
    expect(written(work)).toBe(Math.round(2204.62).toLocaleString("en-GB"));
  });

  it("counts the sets", () => {
    expect(setsFigure(12).unit).toBe("sets");
    expect(setsFigure(1).unit).toBe("set");
    expect(written(setsFigure(12))).toBe("12");
  });
});
