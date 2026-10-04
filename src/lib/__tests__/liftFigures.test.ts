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
  it("writes the time in minutes, and as a clock past the hour", () => {
    expect(written(durationFigure(54))).toBe("54");
    expect(durationFigure(54).unit).toBe("minutes");
    expect(durationFigure(1).unit).toBe("minute");
    // "1:00 hours" read as one figure in hours.
    expect(written(durationFigure(60))).toBe("1:00");
    expect(durationFigure(60).unit).toBe("hr:min");
    expect(written(durationFigure(65))).toBe("1:05");
  });

  it("writes the work as kg lifted, grouped in thousands", () => {
    const work = workFigure(6155.4, 120);
    expect(work.unit).toBe("kg lifted");
    expect(written(work)).toBe(Math.round(6155.4).toLocaleString("en-GB"));
  });

  it("gives a session with no load its reps, not 0 kg lifted", () => {
    expect(workFigure(0, 30).unit).toBe("reps");
    expect(written(workFigure(0, 30))).toBe("30");
    expect(workFigure(0, 1).unit).toBe("rep");
    // Nothing at all is still a weight, not "0 reps".
    expect(workFigure(0, 0).unit).toBe("kg lifted");
  });

  it("counts the sets", () => {
    expect(setsFigure(12).unit).toBe("sets");
    expect(setsFigure(1).unit).toBe("set");
    expect(written(setsFigure(12))).toBe("12");
  });
});
