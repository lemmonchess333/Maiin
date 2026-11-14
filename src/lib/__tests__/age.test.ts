/**
 * The age, worked out from the year of birth (App1, grill Q57 and Q21; the
 * owner chose a year of birth, 13 November 2026).
 */
import { describe, it, expect } from "vitest";
import {
  ageFromBirthYear,
  BIRTH_YEAR_MESSAGES,
  birthYearProblem,
  parseBirthYear,
  profileAge,
} from "../age";
import { localDateString } from "../dateHelpers";

describe("ageFromBirthYear", () => {
  it("is the year's difference less one before 1 July", () => {
    expect(ageFromBirthYear(1990, "2026-01-01")).toBe(35);
    expect(ageFromBirthYear(1990, "2026-06-30")).toBe(35);
  });

  it("is the year's difference from 1 July to the year's end", () => {
    expect(ageFromBirthYear(1990, "2026-07-01")).toBe(36);
    expect(ageFromBirthYear(1990, "2026-12-31")).toBe(36);
  });

  it("goes up once a year, on 1 July", () => {
    expect(ageFromBirthYear(1990, "2025-12-31")).toBe(35);
    expect(ageFromBirthYear(1990, "2026-01-01")).toBe(35);
    expect(ageFromBirthYear(1990, "2026-07-01")).toBe(36);
  });
});

describe("parseBirthYear", () => {
  it.each([
    ["1990", 1990],
    [" 2010 ", 2010],
  ])("reads %j as %i", (text, year) => {
    expect(parseBirthYear(text)).toBe(year);
  });

  it.each(["", "90", "19900", "19.9", "199a", "-990"])("refuses %j", (text) => {
    expect(parseBirthYear(text)).toBeNull();
  });
});

describe("birthYearProblem, in the year's terms", () => {
  const today = "2026-11-13";

  it("takes this year less 16, and refuses the year after", () => {
    expect(birthYearProblem(2010, today)).toBeNull();
    expect(birthYearProblem(2011, today)).toBe("too-young");
  });

  it("takes this year less 120, and refuses the year before", () => {
    expect(birthYearProblem(1906, today)).toBeNull();
    expect(birthYearProblem(1905, today)).toBe("too-old");
  });

  it("calls a year after this one a mistake, not an age", () => {
    expect(birthYearProblem(2027, today)).toBe("invalid");
    expect(birthYearProblem(1990.5, today)).toBe("invalid");
  });

  it("is the same on 1 January and 31 December", () => {
    expect(birthYearProblem(2010, "2026-01-01")).toBeNull();
    expect(birthYearProblem(2011, "2026-12-31")).toBe("too-young");
  });

  it("says the under-16 line setup has always said", () => {
    expect(BIRTH_YEAR_MESSAGES["too-young"]).toBe(
      "You need to be at least 16 to use Tropos."
    );
  });
});

describe("profileAge", () => {
  const today = "2026-11-13";

  it("works the age out from the year of birth", () => {
    expect(profileAge({ birthYear: 1990 }, today)).toBe(36);
  });

  it("prefers the year of birth to the stored age, which never goes up", () => {
    expect(profileAge({ birthYear: 1990, age: 30 }, today)).toBe(36);
  });

  it("reads an older account's age when it has no year of birth", () => {
    expect(profileAge({ age: 30 }, today)).toBe(30);
    expect(profileAge({ age: 30, birthYear: null }, today)).toBe(30);
  });

  it("reads the age when the stored year is not one it can use", () => {
    expect(profileAge({ birthYear: 2030, age: 30 }, today)).toBe(30);
    expect(profileAge({ birthYear: 1990.5, age: 30 }, today)).toBe(30);
  });

  it("is undefined with neither, so each caller keeps its default", () => {
    expect(profileAge({}, today)).toBeUndefined();
    expect(profileAge(null, today)).toBeUndefined();
    expect(profileAge(undefined, today)).toBeUndefined();
  });

  it("reads today's age when no day is given", () => {
    const today = localDateString();
    const year = Number(today.slice(0, 4));
    const expected = today.slice(5) < "07-01" ? 29 : 30;
    expect(profileAge({ birthYear: year - 30 })).toBe(expected);
  });
});
