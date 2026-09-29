import { describe, expect, it } from "vitest";
import { LIFT_DAY_STATUS_LABEL, liftDayStatus } from "../liftDayStatus";

const thisWeek = (cursor: boolean) => ({ pastWeek: false, cursor });
const pastWeek = { pastWeek: true, cursor: false };

describe("liftDayStatus", () => {
  it("calls a past week's day that was neither done nor skipped missed", () => {
    // The week rolled over with the day still open. It cannot come up
    // again, so "Upcoming" and a time estimate misdescribe it.
    const status = liftDayStatus({}, pastWeek);
    expect(status).toBe("missed");
    expect(LIFT_DAY_STATUS_LABEL[status]).toBe("Missed");
  });

  it("keeps what a past week's day recorded", () => {
    expect(liftDayStatus({ completed: true }, pastWeek)).toBe("completed");
    expect(liftDayStatus({ skipped: true }, pastWeek)).toBe("skipped");
  });

  it("reads the current week by the rotation cursor", () => {
    expect(liftDayStatus({}, thisWeek(true))).toBe("today");
    expect(liftDayStatus({}, thisWeek(false))).toBe("upcoming");
    expect(liftDayStatus({ completed: true }, thisWeek(true))).toBe(
      "completed"
    );
    expect(liftDayStatus({ skipped: true }, thisWeek(false))).toBe("skipped");
    expect(LIFT_DAY_STATUS_LABEL.today).toBe("Up next");
    expect(LIFT_DAY_STATUS_LABEL.upcoming).toBe("Upcoming");
  });
});
