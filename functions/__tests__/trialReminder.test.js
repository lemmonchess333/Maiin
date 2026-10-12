/**
 * lib/trialReminder.js — when the reminder before a trial's first payment
 * goes, and the record the server keeps (Sub1, STATUS 2026-10-06).
 *
 * The invariants, most costly first:
 *   - The reminder lands before the last moment to cancel, with time to
 *     act: 38 to 62 hours on a 7-day trial (an hour more or less across a
 *     clock change), in every zone and whatever hour the trial began.
 *   - It goes at 10:00 on the person's own clock, through clock changes.
 *   - The last moment to cancel is a day before the trial ends (Apple).
 *   - A new trial never inherits the last one's "already sent" mark.
 *   - The app's reported price is held to a number, a currency code and a
 *     short display string with nothing that could break the email's HTML.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tr = require("../lib/trialReminder");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MONTHLY = "com.tropos.app.pro.monthly";
const iso = (ms) => new Date(ms).toISOString();

const WALLS = new Map();
/** The wall clock in `zone`, for checking what the person sees. */
function wall(ms, zone) {
  if (!WALLS.has(zone)) {
    WALLS.set(
      zone,
      new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        weekday: "short",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
    );
  }
  return WALLS.get(zone).format(ms);
}

const ZONES = [
  "Europe/London",
  "America/Los_Angeles",
  "Pacific/Auckland",
  "Asia/Kolkata",
  "Pacific/Kiritimati",
  "Pacific/Midway",
];

describe("reminderAtMs", () => {
  it("goes at 10:00 local, two days before the last day to cancel", () => {
    // Trial from Sunday 27 September 13:00 BST to Sunday 4 October.
    const startedAtMs = Date.parse("2026-09-27T12:00:00Z");
    const endsAtMs = startedAtMs + 7 * DAY;
    const at = tr.reminderAtMs({
      endsAtMs,
      startedAtMs,
      timeZone: "Europe/London",
    });
    expect(iso(tr.cancelByMs(endsAtMs))).toBe("2026-10-03T12:00:00.000Z");
    expect(iso(at)).toBe("2026-10-01T09:00:00.000Z");
    expect(wall(at, "Europe/London")).toBe("Thu, 01/10/2026, 10:00");
  });

  it("leaves 38 to 62 hours to act on a 7-day trial, in every zone and from every starting hour", () => {
    const base = Date.parse("2026-03-01T00:00:00Z");
    for (const zone of ZONES) {
      // Every hour of a whole year, so each zone's clock changes are crossed.
      for (let h = 0; h < 365 * 24; h += 7) {
        const startedAtMs = base + h * HOUR + 17 * 60_000;
        const endsAtMs = startedAtMs + 7 * DAY;
        const at = tr.reminderAtMs({ endsAtMs, startedAtMs, timeZone: zone });
        const lead = (tr.cancelByMs(endsAtMs) - at) / HOUR;
        expect(lead, `${zone} ${iso(startedAtMs)}`).toBeGreaterThanOrEqual(37);
        expect(lead, `${zone} ${iso(startedAtMs)}`).toBeLessThanOrEqual(63);
        expect(wall(at, zone).slice(-5), `${zone} ${iso(startedAtMs)}`).toBe(
          "10:00"
        );
      }
    }
  });

  it("stays at 10:00 local on the day the clocks go back", () => {
    // London's clocks go back on Sunday 25 October 2026.
    const endsAtMs = Date.parse("2026-10-28T10:00:00Z");
    const at = tr.reminderAtMs({
      endsAtMs,
      startedAtMs: endsAtMs - 7 * DAY,
      timeZone: "Europe/London",
    });
    expect(wall(at, "Europe/London")).toBe("Sun, 25/10/2026, 10:00");
    expect(iso(at)).toBe("2026-10-25T10:00:00.000Z");
  });

  it("uses the person's date, not UTC's, either side of the date line", () => {
    // Ends 23:30 UTC Tuesday: already Wednesday in Kiritimati, still
    // Tuesday in Midway.
    const endsAtMs = Date.parse("2026-06-09T23:30:00Z");
    const startedAtMs = endsAtMs - 7 * DAY;
    const kiritimati = tr.reminderAtMs({
      endsAtMs,
      startedAtMs,
      timeZone: "Pacific/Kiritimati",
    });
    const midway = tr.reminderAtMs({
      endsAtMs,
      startedAtMs,
      timeZone: "Pacific/Midway",
    });
    expect(wall(kiritimati, "Pacific/Kiritimati")).toBe(
      "Sun, 07/06/2026, 10:00"
    );
    expect(wall(midway, "Pacific/Midway")).toBe("Sat, 06/06/2026, 10:00");
  });

  it("reads a missing or unknown zone as London's", () => {
    const endsAtMs = Date.parse("2026-10-04T12:00:00Z");
    const london = tr.reminderAtMs({ endsAtMs, timeZone: "Europe/London" });
    for (const timeZone of [undefined, null, "", "Mars/Olympus_Mons", 42]) {
      expect(tr.reminderAtMs({ endsAtMs, timeZone }), String(timeZone)).toBe(
        london
      );
    }
  });

  it("is never before 10:00 the day after a short trial began", () => {
    // A 3-day trial bought at 15:00 BST on Monday 5 October.
    const startedAtMs = Date.parse("2026-10-05T14:00:00Z");
    const endsAtMs = startedAtMs + 3 * DAY;
    const at = tr.reminderAtMs({
      endsAtMs,
      startedAtMs,
      timeZone: "Europe/London",
    });
    expect(wall(at, "Europe/London")).toBe("Tue, 06/10/2026, 10:00");
    expect(at).toBeLessThan(tr.cancelByMs(endsAtMs));
  });
});

describe("nextPaymentDateKey", () => {
  it("is one period after the trial ends, on the person's date", () => {
    const endsAtMs = Date.parse("2026-10-04T12:00:00Z");
    expect(tr.nextPaymentDateKey(endsAtMs, "month", "Europe/London")).toBe(
      "2026-11-04"
    );
    expect(tr.nextPaymentDateKey(endsAtMs, "year", "Europe/London")).toBe(
      "2027-10-04"
    );
    // 23:30 UTC on 31 December is already 1 January in Auckland.
    const newYear = Date.parse("2026-12-31T23:30:00Z");
    expect(tr.nextPaymentDateKey(newYear, "month", "Europe/London")).toBe(
      "2027-01-31"
    );
    expect(tr.nextPaymentDateKey(newYear, "month", "Pacific/Auckland")).toBe(
      "2027-02-01"
    );
  });

  it("falls back to the month's last day, as the stores renew", () => {
    const jan31 = Date.parse("2027-01-31T12:00:00Z");
    expect(tr.nextPaymentDateKey(jan31, "month", "Europe/London")).toBe(
      "2027-02-28"
    );
    const leapDay = Date.parse("2028-02-29T12:00:00Z");
    expect(tr.nextPaymentDateKey(leapDay, "year", "Europe/London")).toBe(
      "2029-02-28"
    );
  });

  it("is null for a period it does not know", () => {
    expect(tr.nextPaymentDateKey(Date.now(), null, "Europe/London")).toBeNull();
  });
});

describe("periodFor", () => {
  it("knows each Pro product's period and nothing else", () => {
    expect(tr.periodFor(MONTHLY)).toBe("month");
    expect(tr.periodFor("com.tropos.app.pro.yearly")).toBe("year");
    expect(tr.periodFor("com.other.app")).toBeNull();
    expect(tr.periodFor("toString")).toBeNull();
  });
});

describe("readReportedPrice", () => {
  const GOOD = {
    productId: MONTHLY,
    amount: 3.99,
    currencyCode: "GBP",
    display: "£3.99",
  };

  it("takes the store's price as the app reported it", () => {
    expect(tr.readReportedPrice(GOOD)).toEqual(GOOD);
    expect(
      tr.readReportedPrice({
        ...GOOD,
        display: "  3,99 € ",
        currencyCode: "EUR",
      })
    ).toMatchObject({ display: "3,99 €" });
  });

  it("drops anything that is not a price", () => {
    const bad = [
      null,
      "£3.99",
      { ...GOOD, productId: "" },
      { ...GOOD, productId: undefined },
      { ...GOOD, amount: 0 },
      { ...GOOD, amount: -1 },
      { ...GOOD, amount: Number.NaN },
      { ...GOOD, amount: "3.99" },
      { ...GOOD, amount: 1e6 },
      { ...GOOD, currencyCode: "gbp" },
      { ...GOOD, currencyCode: "POUNDS" },
      { ...GOOD, display: "" },
      { ...GOOD, display: "x".repeat(33) },
      { ...GOOD, display: "<b>£3.99</b>" },
      { ...GOOD, display: '£3.99" onclick="' },
      { ...GOOD, display: "£3.99\n" + "Free" },
    ];
    for (const value of bad) {
      expect(tr.readReportedPrice(value), JSON.stringify(value)).toBeNull();
    }
  });
});

describe("planTrialRecord", () => {
  const endsAtMs = Date.parse("2026-10-04T12:00:00Z");
  const trial = {
    productId: MONTHLY,
    store: "app_store",
    startedAtMs: endsAtMs - 7 * DAY,
    endsAtMs,
    willRenew: true,
  };

  it("writes every key every time, so a merging set cannot keep an old one", () => {
    const record = tr.planTrialRecord({
      stored: null,
      trial,
      timeZone: "Europe/London",
    });
    expect(Object.keys(record).sort()).toEqual(
      [
        "cancelBy",
        "endsAt",
        "period",
        "price",
        "productId",
        "reminderAt",
        "reminderEmailedAt",
        "startedAt",
        "store",
        "willRenew",
      ].sort()
    );
    expect(record.reminderEmailedAt).toBeNull();
  });

  it("is null without a trial", () => {
    expect(tr.planTrialRecord({ stored: null, trial: null })).toBeNull();
  });

  it("starts a new trial without the last one's sent mark", () => {
    const old = {
      ...tr.planTrialRecord({ stored: null, trial, timeZone: "Europe/London" }),
      reminderEmailedAt: "2026-10-01T09:00:00.000Z",
    };
    const next = tr.planTrialRecord({
      stored: old,
      trial: { ...trial, endsAtMs: endsAtMs + 60 * DAY },
      timeZone: "Europe/London",
    });
    expect(next.reminderEmailedAt).toBeNull();
    const same = tr.planTrialRecord({
      stored: old,
      trial,
      timeZone: "Europe/London",
    });
    expect(same.reminderEmailedAt).toBe("2026-10-01T09:00:00.000Z");
  });
});

describe("sameRecord", () => {
  const record = tr.planTrialRecord({
    stored: null,
    trial: {
      productId: MONTHLY,
      store: "app_store",
      startedAtMs: null,
      endsAtMs: Date.parse("2026-10-04T12:00:00Z"),
      willRenew: true,
    },
    timeZone: "Europe/London",
  });

  it("matches only what says the same thing", () => {
    expect(tr.sameRecord(null, null)).toBe(true);
    expect(tr.sameRecord(undefined, null)).toBe(true);
    expect(tr.sameRecord(record, null)).toBe(false);
    expect(tr.sameRecord(null, record)).toBe(false);
    expect(tr.sameRecord(record, { ...record })).toBe(true);
    expect(tr.sameRecord(record, { ...record, willRenew: false })).toBe(false);
    const priced = {
      ...record,
      price: { amount: 3.99, currencyCode: "GBP", display: "£3.99" },
    };
    expect(tr.sameRecord(record, priced)).toBe(false);
    expect(
      tr.sameRecord(priced, { ...priced, price: { ...priced.price } })
    ).toBe(true);
    expect(
      tr.sameRecord(priced, {
        ...priced,
        price: { ...priced.price, amount: 4.99 },
      })
    ).toBe(false);
  });
});

describe("reminderStatus", () => {
  const record = {
    reminderAt: "2026-10-01T09:00:00.000Z",
    cancelBy: "2026-10-03T12:00:00.000Z",
    willRenew: true,
    reminderEmailedAt: null,
  };
  const at = (text) => Date.parse(text);

  it("is due from the reminder's instant until the last moment to cancel", () => {
    expect(tr.reminderStatus(record, at("2026-10-01T08:59:59Z"))).toBe("early");
    expect(tr.reminderStatus(record, at("2026-10-01T09:00:00Z"))).toBe("due");
    expect(tr.reminderStatus(record, at("2026-10-03T11:59:59Z"))).toBe("due");
    expect(tr.reminderStatus(record, at("2026-10-03T12:00:00Z"))).toBe("late");
  });

  it("is never due once sent, once cancelled, or without a readable record", () => {
    const now = at("2026-10-02T09:00:00Z");
    expect(
      tr.reminderStatus(
        { ...record, reminderEmailedAt: "2026-10-01T09:00:01Z" },
        now
      )
    ).toBe("sent");
    expect(tr.reminderStatus({ ...record, willRenew: false }, now)).toBe(
      "cancelled"
    );
    expect(tr.reminderStatus(null, now)).toBe("none");
    expect(tr.reminderStatus({ ...record, cancelBy: "soon" }, now)).toBe(
      "none"
    );
  });
});
