import { describe, it, expect } from "vitest";
import type { CircleMeetup } from "@/features/goalSpace/circleMeetups";
import {
  meetupIcsFilename,
  meetupToIcs,
} from "@/features/goalSpace/meetupCalendar";

function sampleMeetup(over: Partial<CircleMeetup> = {}): CircleMeetup {
  return {
    id: "m-42",
    organiserUid: "maya",
    sport: "run",
    title: "Saturday long run, river loop",
    place: "Tooting Lido gate; north side",
    note: "Bring water\nEasy chatty pace",
    paceGroups: "5:30 and 6:15 /km",
    repeat: null,
    startsAt: Date.UTC(2026, 9, 17, 8, 30, 0),
    timeZone: "Europe/London",
    going: ["maya", "me"],
    createdAt: 1,
    ...over,
  };
}

describe("meetupToIcs", () => {
  it("generates valid RFC 5545 VEVENT with escaped text, UTC times, and VALARM reminders", () => {
    const ics = meetupToIcs(sampleMeetup(), Date.UTC(2026, 9, 15, 12, 0, 0));

    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("UID:tropos-meetup-m-42@troposfit.com\r\n");
    expect(ics).toContain("DTSTAMP:20261015T120000Z\r\n");
    expect(ics).toContain("DTSTART:20261017T083000Z\r\n");
    expect(ics).toContain("DTEND:20261017T093000Z\r\n");
    expect(ics).toContain("SUMMARY:Saturday long run\\, river loop\r\n");
    expect(ics).toContain("LOCATION:Tooting Lido gate\\; north side\r\n");
    expect(ics).toContain(
      "DESCRIPTION:Pace groups: 5:30 and 6:15 /km\\nBring water\\nEasy chatty pace\r\n"
    );
    expect(ics).toContain("TRIGGER:-PT24H\r\n");
    expect(ics).toContain("TRIGGER:-PT1H\r\n");
    expect(ics).not.toContain("RRULE:FREQ=WEEKLY");
    expect(ics).toMatch(/END:VCALENDAR\r\n$/);
  });

  it("includes RRULE:FREQ=WEEKLY when repeat is weekly", () => {
    const ics = meetupToIcs(sampleMeetup({ repeat: "weekly" }));
    expect(ics).toContain("RRULE:FREQ=WEEKLY\r\n");
  });

  it("folds lines longer than 75 characters per RFC 5545", () => {
    const longNote = "A".repeat(120);
    const ics = meetupToIcs(sampleMeetup({ note: longNote, paceGroups: null }));
    for (const line of ics.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });
});

describe("meetupIcsFilename", () => {
  it("creates a clean slugged .ics filename with the UTC date", () => {
    expect(meetupIcsFilename(sampleMeetup())).toBe(
      "tropos-saturday-long-run-river-loop-2026-10-17.ics"
    );
  });
});
