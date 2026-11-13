/**
 * The age, worked out from the date of birth (App1, grill Q57 and Q21).
 */
import { describe, it, expect } from "vitest";
import {
  ageOn,
  dateOfBirthBounds,
  dateOfBirthProblem,
  DATE_OF_BIRTH_MESSAGES,
  isCalendarDateKey,
  profileAge,
} from "../age";
import { localDateString } from "../dateHelpers";

describe("ageOn", () => {
  it("goes up on the birthday, not the day before", () => {
    expect(ageOn("1990-06-15", "2026-06-14")).toBe(35);
    expect(ageOn("1990-06-15", "2026-06-15")).toBe(36);
    expect(ageOn("1990-06-15", "2026-06-16")).toBe(36);
  });

  it("goes up across a new year only once the birthday comes", () => {
    expect(ageOn("1990-01-01", "2025-12-31")).toBe(35);
    expect(ageOn("1990-01-01", "2026-01-01")).toBe(36);
    expect(ageOn("1990-12-31", "2026-01-01")).toBe(35);
  });

  it("brings a 29 February birthday on 1 March in a year without one", () => {
    expect(ageOn("2008-02-29", "2025-02-28")).toBe(16);
    expect(ageOn("2008-02-29", "2025-03-01")).toBe(17);
    // A leap year has the day itself.
    expect(ageOn("2008-02-29", "2028-02-28")).toBe(19);
    expect(ageOn("2008-02-29", "2028-02-29")).toBe(20);
  });

  it("is 0 on the day of birth and null before it", () => {
    expect(ageOn("2026-11-13", "2026-11-13")).toBe(0);
    expect(ageOn("2026-11-14", "2026-11-13")).toBeNull();
  });

  it("is null for a day that is not a real one", () => {
    expect(ageOn("1990-02-30", "2026-11-13")).toBeNull();
    expect(ageOn("1990-06-15", "2026-13-01")).toBeNull();
    expect(ageOn("15/06/1990", "2026-11-13")).toBeNull();
  });
});

describe("isCalendarDateKey", () => {
  it.each(["1990-06-15", "2008-02-29", "2026-12-31"])("takes %s", (key) => {
    expect(isCalendarDateKey(key)).toBe(true);
  });

  it.each(["", "1990-6-15", "2007-02-29", "1990-00-10", "0090-01-01", null])(
    "refuses %j",
    (key) => {
      expect(isCalendarDateKey(key)).toBe(false);
    }
  );
});

describe("dateOfBirthProblem", () => {
  const today = "2026-11-13";

  it("takes 16 on the 16th birthday, and not the day before", () => {
    expect(dateOfBirthProblem("2010-11-13", today)).toBeNull();
    expect(dateOfBirthProblem("2010-11-14", today)).toBe("too-young");
  });

  it("takes 120, and not 121", () => {
    expect(dateOfBirthProblem("1906-11-13", today)).toBeNull();
    expect(dateOfBirthProblem("1905-11-14", today)).toBeNull();
    expect(dateOfBirthProblem("1905-11-13", today)).toBe("too-old");
  });

  it("refuses a day in the future, and one that is not a day", () => {
    expect(dateOfBirthProblem("2026-11-14", today)).toBe("future");
    expect(dateOfBirthProblem("", today)).toBe("invalid");
    expect(dateOfBirthProblem("1990-02-30", today)).toBe("invalid");
  });

  it("says the under-16 line setup has always said", () => {
    expect(DATE_OF_BIRTH_MESSAGES["too-young"]).toBe(
      "You need to be at least 16 to use Tropos."
    );
  });
});

describe("dateOfBirthBounds", () => {
  it("offers up to today, and back to the day after someone turns 121", () => {
    expect(dateOfBirthBounds("2026-11-13")).toEqual({
      min: "1905-11-14",
      max: "2026-11-13",
    });
  });

  it("offers only dates a person of 120 could have", () => {
    const { min } = dateOfBirthBounds("2026-11-13");
    expect(dateOfBirthProblem(min, "2026-11-13")).toBeNull();
  });
});

describe("profileAge", () => {
  const today = "2026-11-13";

  it("works the age out from the date of birth", () => {
    expect(profileAge({ dateOfBirth: "1990-06-15" }, today)).toBe(36);
  });

  it("prefers the date of birth to the stored age, which never goes up", () => {
    expect(profileAge({ dateOfBirth: "1990-06-15", age: 30 }, today)).toBe(36);
  });

  it("reads an older account's age when it has no date of birth", () => {
    expect(profileAge({ age: 30 }, today)).toBe(30);
    expect(profileAge({ age: 30, dateOfBirth: undefined }, today)).toBe(30);
  });

  it("reads the age when the stored date is not one it can use", () => {
    expect(profileAge({ dateOfBirth: "1990-02-30", age: 30 }, today)).toBe(30);
    expect(profileAge({ dateOfBirth: "2030-01-01", age: 30 }, today)).toBe(30);
  });

  it("is undefined with neither, so each caller keeps its default", () => {
    expect(profileAge({}, today)).toBeUndefined();
    expect(profileAge(null, today)).toBeUndefined();
    expect(profileAge(undefined, today)).toBeUndefined();
  });

  it("reads today's age when no day is given", () => {
    const year = Number(localDateString().slice(0, 4));
    // 1 January thirty years back is 30 on every day of this year.
    expect(profileAge({ dateOfBirth: `${year - 30}-01-01` })).toBe(30);
  });
});
