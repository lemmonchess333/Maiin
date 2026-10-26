/**
 * Each challenge is one edition of a series, joined on its own. The
 * standing paragraph that said so went; these are the moments that say
 * it instead: the join's confirmation, the weekly card's final day, and
 * the one place the month's time left is said.
 *
 * Boundaries are UTC-midnight markers (the server's windows), so fixtures
 * are built with Date.UTC and the instants the app reads them at in local
 * components: that holds at every offset CI runs.
 */
import { describe, expect, it } from "vitest";
import {
  cardsShowingTimeLeft,
  finalDayLine,
  inFinalDay,
  joinedMessage,
} from "../challengeEditions";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

describe("joinedMessage", () => {
  it("names the month joined and when the next month's opens", () => {
    expect(
      joinedMessage({
        type: "monthly",
        startDate: utc(2026, 9, 1),
        endDate: utc(2026, 10, 1),
      })
    ).toBe("You're in for October. November's opens on 1 Nov.");
    expect(
      joinedMessage({
        type: "monthly",
        startDate: utc(2026, 11, 1),
        endDate: utc(2027, 0, 1),
      })
    ).toBe("You're in for December. January's opens on 1 Jan.");
  });

  it("says a week's next edition opens on its weekday", () => {
    expect(
      joinedMessage({
        type: "weekly",
        startDate: utc(2026, 9, 19),
        endDate: utc(2026, 9, 26),
      })
    ).toBe("You're in for this week. Next week's opens on Monday.");
  });

  it("dates a season's next edition", () => {
    expect(
      joinedMessage({
        type: "seasonal",
        startDate: utc(2026, 8, 1),
        endDate: utc(2026, 11, 1),
      })
    ).toBe("You're in for this season. The next one opens on 1 Dec.");
  });

  it("says no more than it knows", () => {
    expect(joinedMessage({ type: "monthly" })).toBe("You're in.");
    expect(
      joinedMessage({ startDate: utc(2026, 9, 1), endDate: utc(2026, 10, 1) })
    ).toBe("You're in.");
  });
});

describe("inFinalDay / finalDayLine", () => {
  // The week of Monday 13 July ends at the person's midnight into Monday
  // 20 July: a week no zone CI runs in changes its clocks.
  const end = utc(2026, 6, 20);

  it("is the last day before the person's own midnight, and only that", () => {
    expect(inFinalDay(end, new Date(2026, 6, 19, 0, 30).getTime())).toBe(true);
    expect(inFinalDay(end, new Date(2026, 6, 19, 23, 59).getTime())).toBe(true);
    expect(inFinalDay(end, new Date(2026, 6, 18, 23, 0).getTime())).toBe(false);
    expect(inFinalDay(end, new Date(2026, 6, 20, 0, 0).getTime())).toBe(false);
    expect(inFinalDay(undefined, Date.now())).toBe(false);
  });

  it("points at the next one", () => {
    expect(finalDayLine(end)).toBe("Ends tonight. The next one starts Monday.");
    expect(finalDayLine(undefined)).toBe("Ends tonight.");
  });
});

describe("cardsShowingTimeLeft", () => {
  const month = { startDate: utc(2026, 9, 1), endDate: utc(2026, 10, 1) };
  const featured = {
    id: "featured-monthly-2026-10-01",
    type: "monthly",
    ...month,
  };
  const mileage = { id: "monthly-2026-10-01", type: "monthly", ...month };
  const strength = {
    id: "strength-monthly-2026-10-01",
    type: "monthly",
    ...month,
  };
  const season = {
    id: "seasonal-2026-09-01",
    type: "seasonal",
    startDate: utc(2026, 8, 1),
    endDate: utc(2026, 11, 1),
  };

  it("says the month's once, on the featured challenge, wherever it sits", () => {
    expect([...cardsShowingTimeLeft([mileage, featured, strength])]).toEqual([
      featured.id,
    ]);
  });

  it("lets a challenge that ends on another day say its own", () => {
    expect(cardsShowingTimeLeft([mileage, featured, season, strength])).toEqual(
      new Set([featured.id, season.id])
    );
  });

  it("falls back to the first monthly card when there is no featured one", () => {
    expect(cardsShowingTimeLeft([season, mileage, strength])).toEqual(
      new Set([season.id, mileage.id])
    );
  });

  it("survives a challenge with no end date", () => {
    const malformed = { id: "malformed" };
    expect(() => cardsShowingTimeLeft([malformed, mileage])).not.toThrow();
    expect(cardsShowingTimeLeft([malformed, mileage]).has(mileage.id)).toBe(
      true
    );
  });
});
