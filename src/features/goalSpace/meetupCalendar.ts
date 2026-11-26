/**
 * RFC 5545 iCalendar (`.ics`) export for Circle meet-ups.
 *
 * Lets any member who is attending a Circle meet-up add it to Apple Calendar,
 * Google Calendar, or Outlook in one tap, including place, pace groups, note,
 * weekly recurrence (`RRULE:FREQ=WEEKLY` when `repeat === "weekly"`), and
 * native 24-hour + 1-hour calendar reminders (`VALARM`).
 */
import type { CircleMeetup } from "./circleMeetups";

const DEFAULT_DURATION_MS = 60 * 60 * 1000;

function formatIcsUtc(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}` +
    `${pad(d.getUTCMonth() + 1)}` +
    `${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}` +
    `${pad(d.getUTCMinutes())}` +
    `${pad(d.getUTCSeconds())}Z`
  );
}

/** RFC 5545 §3.3.11 TEXT escaping. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** RFC 5545 §3.1 line folding at 75 characters. */
function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let offset = 75;
  while (offset < line.length) {
    parts.push(" " + line.slice(offset, offset + 74));
    offset += 74;
  }
  return parts.join("\r\n");
}

/**
 * Generates an RFC 5545 `.ics` string for a Circle meet-up.
 */
export function meetupToIcs(
  meetup: CircleMeetup,
  nowMs: number = Date.now()
): string {
  const safeId = meetup.id.replace(/[^a-zA-Z0-9._-]/g, "_");
  const descriptionParts: string[] = [];
  if (meetup.paceGroups) {
    descriptionParts.push(`Pace groups: ${meetup.paceGroups}`);
  }
  if (meetup.note) {
    descriptionParts.push(meetup.note);
  }
  const description = descriptionParts.join("\n");

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tropos//Circle Meet-up//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:tropos-meetup-${safeId}@troposfit.com`,
    `DTSTAMP:${formatIcsUtc(nowMs)}`,
    `DTSTART:${formatIcsUtc(meetup.startsAt)}`,
    `DTEND:${formatIcsUtc(meetup.startsAt + DEFAULT_DURATION_MS)}`,
    `SUMMARY:${escapeIcsText(meetup.title)}`,
    `LOCATION:${escapeIcsText(meetup.place)}`,
  ];

  if (description) {
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  }
  if (meetup.repeat === "weekly") {
    lines.push("RRULE:FREQ=WEEKLY");
  }

  // 24-hour and 1-hour native calendar reminders.
  lines.push(
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(meetup.title)} starts in 24 hours`,
    "TRIGGER:-PT24H",
    "END:VALARM",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(meetup.title)} starts in 1 hour`,
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  );

  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

/** Builds a safe filename like `tropos-saturday-long-run-2026-10-17.ics`. */
export function meetupIcsFilename(meetup: CircleMeetup): string {
  const slug = meetup.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const datePart = new Date(meetup.startsAt).toISOString().slice(0, 10);
  return `tropos-${slug || "meetup"}-${datePart}.ics`;
}

/** Triggers a browser download of the meet-up's `.ics` calendar file. */
export function downloadMeetupIcs(meetup: CircleMeetup): void {
  const ics = meetupToIcs(meetup);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = meetupIcsFilename(meetup);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
